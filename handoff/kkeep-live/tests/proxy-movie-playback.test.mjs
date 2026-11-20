import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const runtime=readFileSync(new URL('../public/engine/kha-runtime.js',import.meta.url),'utf8');
async function viewer(settings){
 const pre={},intercept={},hooks=new Map(),attributes={};
 const iframe={setAttribute:(key,value)=>attributes[key]=value,addEventListener(){},remove(){}};
 const worker={state:'activated',scriptURL:'https://kkeep.test/proxy-sw.js?v=9'};
 class Controller{
  frames=[];
  wait(){return Promise.resolve();}
  createFrame(){const frame={hooks:{fetch:{intercept},error:{},init:{pre}},go(){}};this.frames.push(frame);return frame;}
 }
 const context=vm.createContext({window:{addEventListener(){},removeEventListener(){}},location:new URL('https://kkeep.test/movies'),navigator:{serviceWorker:{controller:worker}},document:{createElement:()=>iframe},$scramjetController:{Controller},$scramjet:{Plugin:class{tap(key,fn){hooks.set(key,fn);}},ScramjetHeaders:{fromRawHeaders:value=>value}},URL,Headers,TextEncoder,TextDecoder,ReadableStream,Blob,Uint8Array,ArrayBuffer,btoa,atob,setTimeout,clearTimeout});
 vm.runInContext(runtime,context);
 const handle=await context.window.KHAProxy.mount({appendChild(){}},{onNavigate(){},onError(){}},settings);
 return {handle,attributes,init:(client,isTopLevel)=>hooks.get(pre)({client,isTopLevel}),intercept:(parsed,props)=>hooks.get(intercept)({parsed},props),lite:()=>context.window.KHAProxy.setLite(true)};
}
function providerWindow(){
 class Navigator{}
 const pdf={name:'Chrome PDF Viewer'};
 Object.defineProperties(Navigator.prototype,{
  plugins:{configurable:true,get:()=>({length:1,namedItem:name=>name===pdf.name?pdf:null})},
  mimeTypes:{configurable:true,get:()=>({length:1,namedItem:()=>({type:'application/pdf'})})},
  pdfViewerEnabled:{configurable:true,get:()=>true},
 });
 const objects=[];
 const document={domain:'www.vidy.st',createElement:tag=>({tag,style:{}}),body:{innerHTML:'<video playsinline></video>',appendChild(object){objects.push(object);object.onerror();}}};
 const win={navigator:new Navigator(),document,frameElement:null,top:{}};win.self=win;
 const client={url:new URL('https://www.vidy.st/movie/603'),Proxy(){},Trap(name,descriptor){Object.defineProperty(Navigator.prototype,name.split('.').at(-1),{configurable:true,get:descriptor.get});}};
 return {win,client,objects};
}
// Reproduce the providers' startup probe. In production its PDF data URL was
// rewritten to /browse/.../data:application/pdf;base64,aG1t and returned 410.
// The error handler then replaced the entire React root, destroying the player.
function playerStartup(win){
 if(win.self===win.top)return;
 const fail=()=>{win.document.body.innerHTML='Iframe Sandbox Detected';};
 try{if(win.frameElement?.hasAttribute('sandbox')){fail();return;}}catch{}
 try{win.document.domain=win.document.domain;}catch(error){if(String(error).toLowerCase().includes('sandbox')){fail();return;}}
 if(!win.navigator.plugins.namedItem('Chrome PDF Viewer'))return;
 const object=win.document.createElement('object');object.data='data:application/pdf;base64,aG1t';object.onerror=fail;
 win.document.body.appendChild(object);
}

test('movie startup no longer destroys the player when native PDF plugins are unavailable through the proxy',async()=>{
 const baseline=providerWindow();playerStartup(baseline.win);
 assert.equal(baseline.objects.length,1);assert.equal(baseline.win.document.body.innerHTML,'Iframe Sandbox Detected');
 const h=await viewer({moviePlayback:true});
 try{
  for(const topLevel of [true,false]){
   const p=providerWindow();h.init(p.client,topLevel);playerStartup(p.win);
   assert.equal(p.objects.length,0,'Do not issue the failing PDF request');
   assert.equal(p.win.document.body.innerHTML,'<video playsinline></video>','The real video interface stays mounted');
   assert.equal(p.win.navigator.pdfViewerEnabled,false);
   assert.equal(p.win.navigator.plugins.length,0);assert.equal(p.win.navigator.plugins.item(0),null);
   assert.equal(p.win.navigator.plugins.namedItem('Chrome PDF Viewer'),null);
   assert.equal(p.win.navigator.mimeTypes.namedItem('application/pdf'),null);
   assert.equal([...p.win.navigator.plugins].length,0);assert.equal([...p.win.navigator.mimeTypes].length,0);
   assert.equal(Object.prototype.toString.call(p.win.navigator.plugins),'[object PluginArray]');
  }
  assert.match(h.attributes.sandbox,/allow-scripts/);assert.match(h.attributes.sandbox,/allow-forms/);
  assert.doesNotMatch(h.attributes.sandbox,/allow-popups|allow-top-navigation/);
  for(const feature of ['autoplay','fullscreen','encrypted-media'])assert.ok(h.attributes.allow.includes(feature));
 }finally{h.handle.destroy();}
});

test('normal browser sessions retain their native plugin capabilities',async()=>{
 const h=await viewer();
 try{const p=providerWindow();h.init(p.client,true);assert.equal(p.win.navigator.pdfViewerEnabled,true);assert.equal(p.win.navigator.plugins.length,1);}finally{h.handle.destroy();}
});

test('movie video and audio remain available with Lite mode on and ad filtering stays active',async()=>{
 const h=await viewer({moviePlayback:true});
 try{
  h.handle.go('https://cinera.cfd/');h.lite();
  for(const destination of ['video','audio']){
   const props={};h.intercept({destination,url:new URL('https://player.videasy.to/clip.mp4')},props);
   assert.equal(props.response,undefined,'Movie media must reach its provider');
  }
  const ad={};h.intercept({destination:'script',url:new URL('https://ads.doubleclick.net/ad')},ad);assert.equal(ad.response.status,204);
 }finally{h.handle.destroy();}
});
