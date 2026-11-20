import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
test('movie frames keep nested failures inside the player while outer navigation still reports errors',async()=>{
 for(const isolateFrameErrors of [true,false]){
  const errorKey={},errors=[];let onRequestError;
  const ready={state:'activated',scriptURL:'https://example.test/proxy-sw.js?v=9'};
  const iframe={setAttribute(){},addEventListener(){},remove(){}};
  class Controller{constructor(){this.frames=[];}wait(){return Promise.resolve();}createFrame(){const frame={hooks:{fetch:{},error:{request:errorKey},init:{}},go(){}};this.frames.push(frame);return frame;}}
  const context=vm.createContext({window:{addEventListener(){},removeEventListener(){}},navigator:{serviceWorker:{controller:ready}},document:{createElement:()=>iframe},$scramjetController:{Controller},$scramjet:{Plugin:class{tap(key,handler){if(key===errorKey)onRequestError=handler;}}},Headers,URL,TextEncoder,TextDecoder,Uint8Array,ArrayBuffer,ReadableStream,Blob,Map,Set,Promise,setTimeout,clearTimeout,btoa,atob,location:new URL('https://example.test/')});
  vm.runInContext(readFileSync(new URL('../public/engine/kha-runtime.js',import.meta.url),'utf8'),context);
  const handle=await context.window.KHAProxy.mount({appendChild(){}},{onNavigate(){},onError:message=>errors.push(message)},{isolateFrameErrors});
  try{
   handle.go('https://cinera.cfd/');
   const embedded={};onRequestError({rawrequest:{destination:'iframe',rawUrl:'https://example.test/browse/frame/player?$iframe=1'},error:new Error('Blocked by the adult-content and malware filter.')},embedded);
   assert.equal(errors.length,isolateFrameErrors?0:1,'Only the movie session isolates a failed nested player');
   assert.equal(embedded.suppressError,true);assert.equal(embedded.setResponse.status,502);
   if(isolateFrameErrors){assert.match(embedded.setResponse.body,/Retry or choose another server/);assert.match(embedded.setResponse.body,/location.reload/);assert.doesNotMatch(embedded.setResponse.body,/https?:/);}
   const before=errors.length,outer={};onRequestError({rawrequest:{destination:'iframe',rawUrl:'https://example.test/browse/frame/outer'},error:new Error('Outer navigation failed')},outer);
   assert.equal(errors.length,before+1);assert.equal(errors.at(-1),'Outer navigation failed');
   const script={};onRequestError({rawrequest:{destination:'script',rawUrl:'https://example.test/browse/frame/script?$iframe=1'},error:new Error('A script failed')},script);
   assert.equal(errors.length,before+1);assert.equal(script.setResponse,undefined,'Subresources remain request failures');
  }finally{handle.destroy();}
 }
});
test('relay preserves device headers and reports failed social feeds without masking responses',async()=>{
 let transport,metadata,intercept;const interceptKey={};const warnings=[];
 const ready={state:'activated',scriptURL:'https://example.test/proxy-sw.js?v=5'};
 const iframe={setAttribute(){},addEventListener(){},remove(){}};
 class Controller{constructor(options){transport=options.transport;this.frames=[];}wait(){return Promise.resolve();}createFrame(){const frame={hooks:{fetch:{intercept:interceptKey},error:{},init:{}},go(){}};this.frames.push(frame);return frame;}}
 const context=vm.createContext({window:{addEventListener(){},removeEventListener(){}},navigator:{userAgent:'Test Safari',language:'ar-AE',serviceWorker:{controller:ready,register:async()=>({active:ready})}},document:{createElement:()=>iframe},$scramjetController:{Controller},$scramjet:{Plugin:class{tap(key,handler){if(key===interceptKey)intercept=handler;}},ScramjetHeaders:{fromRawHeaders:v=>v}},Headers,URL,TextEncoder,TextDecoder,Uint8Array,ArrayBuffer,ReadableStream,Blob,Map,Set,Promise,setTimeout,clearTimeout,btoa,atob,fetch:async(_url,init)=>{metadata=JSON.parse(atob(init.headers['X-Kha-Meta']));return new Response('blocked',{headers:{'X-Kha-Response':btoa(JSON.stringify({status:403,statusText:'Forbidden',headers:[]}))}});}});
 context.location=new URL('https://example.test/');
 vm.runInContext(readFileSync(new URL('../public/engine/kha-runtime.js',import.meta.url),'utf8'),context);
 const handle=await context.window.KHAProxy.mount({appendChild(){}},{onNavigate(){},onWarning:s=>warnings.push(s),onError(){}});
 try{handle.go('https://kick.com/');const adProps={};intercept({parsed:{url:new URL('https://ads.doubleclick.net/ad'),destination:'script'}},adProps);assert.equal(adProps.response.status,204);context.window.KHAProxy.setAdBlock(false);const unblocked={};intercept({parsed:{url:new URL('https://ads.doubleclick.net/ad'),destination:'script'}},unblocked);assert.equal(unblocked.response,undefined);context.window.KHAProxy.setAdBlock(true);const lookalike={};intercept({parsed:{url:new URL('https://doubleclick.net.example.org/ad'),destination:'script'}},lookalike);assert.equal(lookalike.response,undefined);context.window.KHAProxy.setLite(true);const imageProps={};intercept({parsed:{destination:'image'}},imageProps);assert.equal(imageProps.response,undefined,'Lite mode must preserve photo requests');handle.go('https://example.org/');const videoProps={};intercept({parsed:{destination:'video'}},videoProps);assert.equal(videoProps.response.status,200);handle.go('https://www.tiktok.com/');const tikVideo={};intercept({parsed:{destination:'video'}},tikVideo);assert.equal(tikVideo.response,undefined,'TikTok media must load even with Lite mode on');for(const host of ['www.youtube.com','www.youtube-nocookie.com','kick.com','www.kick.com']){handle.go('https://'+host+'/');const media={};intercept({parsed:{destination:'video'}},media);assert.equal(media.response,undefined,host+' must retain media in Lite mode');}handle.go('https://kick.com/');context.window.KHAProxy.setLite(false);const response=await transport.request(new URL('https://kick.com/api/v1/channels'), 'GET',null,[],undefined);assert.equal(response.status,403);assert.equal(new Headers(metadata.headers).get('user-agent'),'Test Safari');assert.equal(new Headers(metadata.headers).get('accept-language'),'ar-AE');assert.match(warnings.at(-1),/Kick returned HTTP 403/);assert.equal(await new Response(response.body).text(),'blocked');await transport.request(new URL('https://example.org/'),'GET',null,[['User-Agent','Existing UA'],['Accept-Language','en']],undefined);assert.equal(new Headers(metadata.headers).get('user-agent'),'Existing UA');assert.equal(new Headers(metadata.headers).get('accept-language'),'en');}finally{handle.destroy();}
});

test('TikTok reveals its ready document before background media finishes loading',async()=>{
 const post={},hooks=new Map(),events=new Map();let loaded=0;
 const ready={state:'activated',scriptURL:'https://example.test/proxy-sw.js?v=9'};
 const doc={readyState:'loading',head:{},title:'TikTok',addEventListener(){},querySelectorAll:()=>[]};
 const child={document:doc,location:{href:'https://example.test/browse/frame/tiktok'},addEventListener:(name,fn)=>events.set(name,fn)};
 const iframe={contentWindow:child,contentDocument:doc,setAttribute(){},addEventListener(){},remove(){}};
 class Controller{frames=[];wait(){return Promise.resolve();}createFrame(){const frame={hooks:{fetch:{},error:{},init:{post}},go(){}};this.frames.push(frame);return frame;}}
 const context=vm.createContext({window:{addEventListener(){},removeEventListener(){}},navigator:{serviceWorker:{controller:ready}},document:{createElement:()=>iframe},$scramjetController:{Controller},$scramjet:{Plugin:class{tap(key,handler){hooks.set(key,handler);}}},MutationObserver:class{observe(){}disconnect(){}},Headers,URL,TextEncoder,TextDecoder,Uint8Array,ArrayBuffer,ReadableStream,Blob,Map,Set,Promise,setTimeout,clearTimeout,btoa,atob,location:new URL('https://example.test/')});
 vm.runInContext(readFileSync(new URL('../public/engine/kha-runtime.js',import.meta.url),'utf8'),context);
 const handle=await context.window.KHAProxy.mount({appendChild(){}},{onNavigate(){},onTitle(){},onLoaded(){loaded++;},onError(){}});
 try{
  handle.go('https://www.tiktok.com/foryou');
  hooks.get(post)({isTopLevel:true,window:child,client:{url:new URL('https://www.tiktok.com/foryou'),hooks:{lifecycle:{navigate:{}}}}});
  assert.equal(loaded,0);doc.readyState='interactive';events.get('DOMContentLoaded')();assert.equal(loaded,1,'No window load or completed media request was needed');
 }finally{handle.destroy();}
});
