import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {GameDownloads} from '../public/games/downloads.js';
const root=new URL('../public/games/',import.meta.url);
const read=path=>readFileSync(new URL(path,root),'utf8');
const wasm=new Uint8Array([0,97,115,109,1,0,0,0]);

for(const slug of ['stickman-duel','trees-hate-you'])test(slug+' preserves fetch Promises for the pinned Unity loader and WASM startup',async()=>{
 const manifest=JSON.parse(read(slug+'/manifest.json')),calls=[],fallbacks=[];
 let ready=0,compiled=0;
 const ui={display:{ratio:()=>1,preRun(){},setQuality(value){assert.equal(value,'low');}},ready(){ready++;},update(){},fail(error){throw error;}};
 class Downloads extends GameDownloads{
  stream(parts,type,signal){calls.push({parts,type,signal});return new Response(type==='application/wasm'?wasm:'saved game data',{headers:{'Content-Type':type,'Content-Length':type==='application/wasm'?'8':'15'}});}
 }
 const ctx=vm.createContext({GameDownloads:Downloads,playerTools:()=>ui,installForestControls(){},installForestPreferences(){},loadScript:async()=>{},document:{querySelector:()=>({})},location:{origin:'https://kkeep.test',href:'https://kkeep.test/games/'+slug+'/player'},URL,URLSearchParams,Request,Response,WebAssembly,
  fetch:async(resource,options)=>{if(resource==='./manifest.json')return Response.json(manifest);fallbacks.push({resource,options});return new Response('network');},
  async createUnityInstance(_canvas,config){
   // Execute the exact .then() chain from this game's bundled Unity loader.
   const engine=read(slug+'/engine.loader.js'),name=slug==='stickman-duel'?'u':'m';
   const start=engine.indexOf(name+'.readBodyWithProgress=');
   const end=engine.indexOf(slug==='stickman-duel'?';var b=':',m.UnityCache=',start);
   assert(start>=0&&end>start);
   ctx[name]={};vm.runInContext(engine.slice(start,end)+';',ctx);
   const data=await ctx[name].fetchWithProgress(config.dataUrl,{enableStreamingDownload:false});
   assert.equal(new TextDecoder().decode(data.parsedBody),'saved game data');
   const framework=read(slug+'/engine.framework.js'),pos=framework.indexOf('function instantiateAsync(');
   const finish=framework.indexOf(slug==='stickman-duel'?'if(Module["instantiateWasm"])':'function createWasm()',pos);
   assert(pos>=0&&finish>pos);
   Object.assign(ctx,{wasmBinary:undefined,wasmBinaryFile:config.codeUrl,info:{},isDataURI:()=>false,isFileURI:()=>false,err:message=>{throw Error(message);},instantiateArrayBuffer(){throw Error('Streaming compilation should not fall back');},receiveInstantiationResult(result){assert(result.instance instanceof WebAssembly.Instance);compiled++;}});
   vm.runInContext(framework.slice(pos,finish),ctx);
   if(slug==='stickman-duel')await ctx.instantiateAsync();
   else await ctx.instantiateAsync(undefined,config.codeUrl,{},ctx.receiveInstantiationResult);
   return {Module:{}};
  },
 });ctx.window=ctx;
 const source=read(slug+'/loader.js').replace(/^import[^\n]+\n/gm,'').replace(/start\(\)\.catch\(ui\.fail\);\s*$/,'');
 vm.runInContext(source,ctx);await ctx.start();
 assert.equal(ready,1);assert.equal(compiled,1);
 assert.equal(calls.length,2);assert(calls.every(c=>c.parts.length>0));
 for(const c of calls)assert.deepEqual(c.parts.map(p=>p[0]),c.parts.map(p=>p[0]).sort((a,b)=>a.localeCompare(b,undefined,{numeric:true})));
 const controller=new AbortController();
 const request=new Request('https://kkeep.test/games/'+slug+'/runtime/data',{signal:controller.signal});
 assert.equal(typeof ctx.fetch(request).then,'function');await ctx.fetch(request);assert.equal(calls.at(-1).signal,request.signal);
 assert.equal(typeof ctx.fetch(new URL('https://kkeep.test/games/'+slug+'/runtime/wasm')).then,'function');
 assert.equal(await (await ctx.fetch('https://other.test/resource',{cache:'no-store'})).text(),'network');
 assert.equal(fallbacks.at(-1).options.cache,'no-store');
 const invalid=ctx.fetch('https://[');assert.equal(typeof invalid.then,'function');await assert.rejects(invalid);
});

test('a native startup failure remains visible despite late progress or ready callbacks',()=>{
 const nodes=Object.fromEntries(['#status','#status-panel','#progress','#error','#retry'].map(k=>[k,{hidden:false,removeAttribute(){}}]));
 const win=new EventTarget();let announcements=0;win.postMessage=()=>announcements++;
 const canvas=new EventTarget();canvas.focus=()=>{};
 const ctx=vm.createContext({createDisplay:()=>({attach(){}}),document:{querySelector:s=>nodes[s],title:'Stickman Duel · Kkeep'},window:win,parent:win,location:{origin:'https://kkeep.test'},Event,CustomEvent});
 vm.runInContext(read('native-player.js').replace(/^import[^\n]+\n/gm,'').replace(/export /g,''),ctx);
 const ui=ctx.playerTools(canvas,'stickman-duel');ui.update('Loading',.65);ui.fail(new Error('Could not read game data'));ui.update('Loading 99%',.99);ui.ready({});
 assert.equal(nodes['#status'].textContent,'Could not start Stickman Duel');assert.equal(nodes['#status-panel'].hidden,false);assert.equal(nodes['#progress'].hidden,true);assert.equal(nodes['#retry'].hidden,false);assert.equal(nodes['#error'].textContent,'Could not read game data');assert.equal(announcements,0);
});

class Element extends EventTarget{
 constructor(tag){super();this.tag=tag;this.children=[];this.attrs={};this.style={};}
 append(...items){this.children.push(...items);}
 setAttribute(k,v){this.attrs[k]=v;}getAttribute(k){return this.attrs[k];}
 showModal(){this.open=true;}close(){this.open=false;this.dispatchEvent(new Event('close'));}
}
const message=(win,source,data,origin)=>{const e=new Event('message');Object.assign(e,{source,data,origin});win.dispatchEvent(e);};
test('Trees starts on Low despite a saved High setting and K-menu actions preserve the player',()=>{
 const shell=read('trees-hate-you/index.html'),config=JSON.parse(shell.match(/window\.kkeepGame=(.+?);<\/script>/)[1]);
 const origin='https://kkeep.test',parent=new EventTarget(),child=new EventTarget(),nodes=[],frame=new Element('iframe');
 let navigations=0,frameFocus=0,canvasFocus=0,src;
 Object.defineProperty(frame,'src',{set:value=>{src=value;navigations++;},get:()=>src});frame.focus=()=>frameFocus++;frame.contentWindow=child;
 const doc={body:new Element('body'),querySelector:s=>s==='#game-frame'?frame:null,createTextNode:text=>({textContent:text}),createElement:tag=>{const node=new Element(tag);nodes.push(node);return node;}};
 parent.kkeepGame=config;parent.document=doc;parent.location={origin};parent.postMessage=data=>message(parent,child,data,origin);
 const childNodes=Object.fromEntries(['#status','#status-panel','#progress','#error','#retry'].map(k=>[k,new Element('div')]));
 const childDoc={hidden:false,title:'Trees Hate You · Kkeep',querySelector:s=>childNodes[s]},canvas=new Element('canvas');canvas.focus=()=>{canvasFocus++;childDoc.activeElement=canvas;};
 child.document=childDoc;child.location={origin};child.parent=parent;child.postMessage=data=>message(child,parent,data,origin);
 const changes=[];
 const ctx=vm.createContext({window:parent,document:doc,location:{origin,href:origin+'/games/trees-hate-you/'},navigator:{maxTouchPoints:5},localStorage:{getItem:key=>key.endsWith('.quality')?'high':null,setItem(){}},URL,URLSearchParams,Option:class extends Element{constructor(label,value){super('option');this.textContent=label;this.value=value;}},setTimeout,clearTimeout});
 vm.runInContext(read('standalone.js'),ctx);
 const playerCtx=vm.createContext({window:child,parent,document:childDoc,location:{origin},Event,CustomEvent,createDisplay:()=>({setQuality:value=>changes.push(value),attach(){}})});
 vm.runInContext(read('native-player.js').replace(/^import[^\n]+\n/gm,'').replace(/export /g,''),playerCtx);
 const ui=playerCtx.playerTools(canvas,'trees-hate-you');
 assert.equal(new URL(src).origin,origin);assert.equal(new URL(src).pathname,'/games/trees-hate-you/player.html');assert.deepEqual(changes,['low']);
 const toggle=nodes.find(n=>n.className==='menu-toggle');
 for(let i=0;i<20;i++){childDoc.activeElement=null;toggle.onclick();assert.equal(toggle.getAttribute('aria-expanded'),'true');toggle.onclick();assert.equal(toggle.getAttribute('aria-expanded'),'false');assert.equal(childDoc.activeElement,canvas);}
 assert.equal(navigations,1);assert.equal(frameFocus,20);assert.equal(canvasFocus,20);
 const select=nodes.find(n=>n.tag==='select');select.value='balanced';select.onchange();assert.equal(changes.at(-1),'balanced');assert.equal(navigations,1);
 ui.ready({});assert.equal(changes.at(-1),'balanced');assert.equal(navigations,1);
});
