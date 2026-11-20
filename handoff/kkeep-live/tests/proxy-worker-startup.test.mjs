import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const runtime=readFileSync(process.env.KKEEP_TEST_RUNTIME||new URL('../public/engine/kha-runtime.js',import.meta.url),'utf8');
const gamingRuntime=readFileSync(new URL('../public/gfn/runtime.js',import.meta.url),'utf8');
const xboxRuntime=readFileSync(new URL('../public/xbox/runtime.js',import.meta.url),'utf8');
const active=()=>({state:'activated',scriptURL:'https://kkeep.test/proxy-sw.js?v=8'});
function harness(workers,{fast=false,wait=()=>Promise.resolve(),profile}={}){
  let options;const timers=new Set(),attributes={},hooks=new Map(),pre={},responseHook={},navigations=[];
  const timeout=(fn,ms)=>{const id=setTimeout(()=>{timers.delete(id);fn();},fast?Math.min(ms,15):ms);timers.add(id);return id;};
  const clear=id=>{clearTimeout(id);timers.delete(id);};
  class Controller{
    frames=[];
    constructor(value){options=value;}
    wait(){return wait();}
    createFrame(){const iface={codecEncode:encodeURIComponent,codecDecode:decodeURIComponent,getInjectScripts:()=>[]};const frame={context:{prefix:new URL('https://kkeep.test/xbox/browse/controller/frame/'),interface:iface},fetchHandler:{context:{interface:iface}},hooks:{fetch:{response:responseHook},error:{},init:{pre}},go(){}};this.frames.push(frame);return frame;}
  }
  const context=vm.createContext({window:{KKEEP_ENGINE_PROFILE:profile,addEventListener(){},removeEventListener(){}},location:new URL('https://kkeep.test/tiktok'),navigator:{serviceWorker:workers},document:{createElement:()=>({setAttribute(name,value){attributes[name]=value;},addEventListener(){},remove(){}})},$scramjetController:{Controller},$scramjet:{Plugin:class{tap(key,fn){hooks.set(key,fn);}}},URL,Headers,TextEncoder,TextDecoder,ReadableStream,Blob,Uint8Array,ArrayBuffer,btoa,atob,setTimeout:timeout,clearTimeout:clear,setInterval,clearInterval});
  if(profile==='xbox')for(const name of ['signin-window.js','signin-status.js','signin-compat.js'])vm.runInContext(readFileSync(new URL('../public/xbox/'+name,import.meta.url),'utf8'),context);
  vm.runInContext(profile==='xbox'?xboxRuntime:profile==='geforce'?gamingRuntime:runtime,context);
  return {mount:settings=>context.window.KHAProxy.mount({appendChild(){}},{onNavigate(url){navigations.push(url);},onError(){}},settings),options:()=>options,attributes,navigations,receiveDocument:(url,isIframe=false)=>hooks.get(responseHook)({parsed:{url:new URL(url),destination:"iframe",isIframe}},{response:{status:200}}),beforeInit:client=>hooks.get(pre)({isTopLevel:true,client}),close(){for(const id of timers)clearTimeout(id);}};
}
async function within(promise){let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Startup remained pending')),150);})]);}finally{clearTimeout(timer);}}

test('a returning TikTok tab uses its active worker even when update requests stall',async()=>{
  let registrations=0;
  const worker=active();
  const h=harness({controller:worker,getRegistration:()=>new Promise(()=>{}),register(){registrations++;return new Promise(()=>{});}});
  try{const handle=await within(h.mount());assert.equal(h.options().serviceworker,worker);assert.equal(registrations,0);handle.destroy();}finally{h.close();}
});

test('a stalled first registration times out and Retry can start a new attempt',async()=>{
  const workers={controller:null,getRegistration:async()=>undefined,register:()=>new Promise(()=>{})};
  const h=harness(workers,{fast:true});
  try{await assert.rejects(within(h.mount()),/Tap Retry/);workers.controller=active();const handle=await within(h.mount());handle.destroy();}finally{h.close();}
});

test('a stale worker for another script at the root scope is replaced before TikTok starts',async()=>{
 const wrong={state:'activated',scriptURL:'https://kkeep.test/retired-sw.js'},worker=active(),registrations=[];
 const workers={controller:wrong,getRegistration:async()=>({scope:'https://kkeep.test/',active:wrong}),register:async(url,options)=>{registrations.push({url,options});workers.controller=worker;return {scope:'https://kkeep.test/',active:worker};}};
 const h=harness(workers);
 try{
  const handle=await within(h.mount());assert.equal(h.options().serviceworker,worker);
  assert.equal(registrations.length,1);assert.equal(registrations[0].url,'/proxy-sw.js?v=9');assert.equal(registrations[0].options.scope,'/');
  handle.destroy();
 }finally{h.close();}
});

test('a correct first-install worker is allowed to activate without duplicate registration',async()=>{
 const listeners=new Map(),worker={state:'installing',scriptURL:'https://kkeep.test/proxy-sw.js?v=9',addEventListener(name,fn){listeners.set(name,fn);queueMicrotask(()=>{worker.state='activated';registration.active=worker;registration.installing=null;workers.controller=worker;fn();});},removeEventListener(name){listeners.delete(name);}};
 const registration={scope:'https://kkeep.test/',active:null,installing:worker};
 const workers={controller:null,getRegistration:async()=>registration,register(){throw Error('Duplicate registration');}};
 const h=harness(workers);
 try{const handle=await within(h.mount());assert.equal(h.options().serviceworker,worker);assert.equal(listeners.size,0);handle.destroy();}finally{h.close();}
});

test('an existing active worker wins over an update stuck installing',async()=>{
  const worker=active(),listeners=new Map();let registrations=0;
  const workers={controller:null,getRegistration:async()=>({scope:'https://kkeep.test/',active:worker,installing:{state:'installing'}}),register(){registrations++;return new Promise(()=>{});},addEventListener(name,fn){listeners.set(name,fn);queueMicrotask(()=>{workers.controller=worker;fn();});},removeEventListener(name){listeners.delete(name);}};
  const h=harness(workers);
  try{const handle=await within(h.mount());assert.equal(h.options().serviceworker,worker);assert.equal(registrations,0);assert.equal(listeners.size,0);handle.destroy();}finally{h.close();}
});

test('activation timeouts clean up listeners and leave startup retryable',async()=>{
  const events=new Map(),updates=new Map();
  const installing={state:'installing',addEventListener:(n,f)=>events.set(n,f),removeEventListener:n=>events.delete(n)};
  const registration={scope:'https://kkeep.test/',installing,addEventListener:(n,f)=>updates.set(n,f),removeEventListener:n=>updates.delete(n)};
  const workers={controller:null,getRegistration:async()=>registration};
  const h=harness(workers,{fast:true});
  try{await assert.rejects(within(h.mount()),/activation timed out/);assert.equal(events.size,0);assert.equal(updates.size,0);workers.controller=active();const handle=await within(h.mount());handle.destroy();}finally{h.close();}
});

test('an engine handshake failure is not reused by Retry',async()=>{
  let attempts=0;const h=harness({controller:active()},{wait:()=>++attempts===1?Promise.reject(new Error('Handshake failed')):Promise.resolve()});
  try{await assert.rejects(within(h.mount()),/Handshake failed/);const handle=await within(h.mount());assert.equal(attempts,2);handle.destroy();}finally{h.close();}
});

test('GeForce registers its own V2 worker instead of reusing the normal app worker',async()=>{
  const registrations=[],gamingWorker={state:'activated',scriptURL:'https://kkeep.test/gfn/proxy-sw.js?v=3'};
  const workers={controller:active(),getRegistration:async()=>({scope:'https://kkeep.test/',active:active()}),register:async(url,options)=>{registrations.push({url,options});workers.controller=gamingWorker;return {scope:'https://kkeep.test/gfn/',active:gamingWorker};}};
  const h=harness(workers,{profile:'geforce'});
  try{
    const handle=await within(h.mount());
    assert.equal(registrations.length,1);
    assert.equal(registrations[0].url,'/gfn/proxy-sw.js?v=3');
    assert.equal(registrations[0].options.scope,'/gfn/');
    assert.equal(h.options().serviceworker,gamingWorker);
    assert.equal(h.options().config.prefix,'/gfn/browse/');
    assert.equal(h.options().config.scramjetPath,'/gfn/engine/scramjet.js?v=3');
    let overrides=0;h.beforeInit({Proxy(){overrides++;}});
    assert.equal(overrides,0,'the shell must not discard native OAuth popup WindowProxy/opener');
    assert.match(h.attributes.sandbox,/allow-popups(?: |$)/);
    assert.match(h.attributes.allow,/gamepad/);
    handle.destroy();
  }finally{h.close();}
});

test('GeForce automatically replaces its older worker without touching the main app registration',async()=>{
  const old={state:'activated',scriptURL:'https://kkeep.test/gfn/proxy-sw.js?v=2'};
  const current={state:'activated',scriptURL:'https://kkeep.test/gfn/proxy-sw.js?v=3'};
  const registrations=[];
  const workers={controller:old,getRegistration:async()=>({scope:'https://kkeep.test/gfn/',active:old}),register:async(url,options)=>{registrations.push({url,options});workers.controller=current;return {scope:'https://kkeep.test/gfn/',active:current};}};
  const h=harness(workers,{profile:'geforce'});
  try{const handle=await within(h.mount());assert.equal(h.options().serviceworker,current);assert.deepEqual(registrations.map(r=>r.url),['/gfn/proxy-sw.js?v=3']);assert.equal(registrations[0].options.scope,'/gfn/');handle.destroy();}finally{h.close();}
});

test('returning GeForce sessions reuse the repaired worker without a blocking registration',async()=>{
  const current={state:'activated',scriptURL:'https://kkeep.test/gfn/proxy-sw.js?v=3'};
  let registrations=0;
  const h=harness({controller:current,getRegistration:()=>new Promise(()=>{}),register(){registrations++;return new Promise(()=>{});}},{profile:'geforce'});
  try{const handle=await within(h.mount());assert.equal(h.options().serviceworker,current);assert.equal(registrations,0);handle.destroy();}finally{h.close();}
});

test('Xbox registers its own worker, keeps native sign-in windows and gamepad access',async()=>{
  const registrations=[],xboxWorker={state:'activated',scriptURL:'https://kkeep.test/xbox/proxy-sw.js?v=5'};
  const gfnWorker={state:'activated',scriptURL:'https://kkeep.test/gfn/proxy-sw.js?v=3'};
  const workers={controller:gfnWorker,getRegistration:async()=>({scope:'https://kkeep.test/gfn/',active:gfnWorker}),register:async(url,options)=>{registrations.push({url,options});workers.controller=xboxWorker;return {scope:'https://kkeep.test/xbox/',active:xboxWorker};}};
  const h=harness(workers,{profile:'xbox'});
  try{
    const handle=await within(h.mount());
    assert.deepEqual(registrations.map(item=>item.url),['/xbox/proxy-sw.js?v=5']);
    assert.equal(registrations[0].options.scope,'/xbox/');
    assert.equal(h.options().serviceworker,xboxWorker);
    assert.equal(h.options().config.prefix,'/xbox/browse/');
    assert.equal(h.options().config.scramjetPath,'/xbox/engine/scramjet.js?v=3');
    let overrides=0;h.beforeInit({Proxy(){overrides++;}});assert.equal(overrides,0);
    assert.match(h.attributes.sandbox,/allow-popups(?: |$)/);
    for(const permission of ['gamepad','fullscreen','autoplay','encrypted-media'])assert.ok(h.attributes.allow.includes(permission));
    handle.destroy();
  }finally{h.close();}
});
test('returning Xbox sessions reuse their own worker without clearing or touching GeForce',async()=>{
  const current={state:'activated',scriptURL:'https://kkeep.test/xbox/proxy-sw.js?v=5'};let registrations=0;
  const h=harness({controller:current,getRegistration:()=>new Promise(()=>{}),register(){registrations++;throw Error('Unexpected register');}},{profile:'xbox'});
  try{const handle=await within(h.mount());assert.equal(h.options().serviceworker,current);assert.equal(registrations,0);handle.destroy();}finally{h.close();}
});

test('Xbox updates its old worker to the sign-in fix without deleting other registrations',async()=>{
  const old={state:'activated',scriptURL:'https://kkeep.test/xbox/proxy-sw.js?v=4'};
  const current={state:'activated',scriptURL:'https://kkeep.test/xbox/proxy-sw.js?v=5'};
  const calls=[];
  const workers={controller:old,getRegistration:async()=>({scope:'https://kkeep.test/xbox/',active:old}),register:async(url,options)=>{calls.push({url,options});workers.controller=current;return {scope:'https://kkeep.test/xbox/',active:current};}};
  const h=harness(workers,{profile:'xbox'});
  try{const handle=await within(h.mount());assert.equal(calls.length,1);assert.equal(calls[0].url,'/xbox/proxy-sw.js?v=5');assert.equal(calls[0].options.scope,'/xbox/');assert.equal(h.options().config.injectPath,'/xbox/engine/controller.inject.js?v=4');handle.destroy();}finally{h.close();}
});

test('Snapchat permits account windows and media while retaining the normal engine',async()=>{
  const h=harness({controller:active()});
  try{
    const handle=await within(h.mount({nativePopups:true,mediaPermissions:true}));
    assert.equal(h.options().config.prefix,'/browse/');
    assert.equal(h.options().config.scramjetPath,'/engine/scramjet.js?v=9');
    let overrides=0;h.beforeInit({Proxy(){overrides++;}});assert.equal(overrides,0);
    assert.match(h.attributes.allow,/camera/);assert.match(h.attributes.allow,/microphone/);
    handle.destroy();
  }finally{h.close();}
});

test('other app tabs keep their existing new-window behavior',async()=>{
  const h=harness({controller:active()});
  try{const handle=await within(h.mount());let overrides=0;h.beforeInit({Proxy(){overrides++;}});assert.equal(overrides,1);assert.doesNotMatch(h.attributes.sandbox,/allow-popups/);handle.destroy();}finally{h.close();}
});


test('Microsoft redirect is retained for the window fallback before its page scripts initialize',async()=>{
  const current={state:'activated',scriptURL:'https://kkeep.test/xbox/proxy-sw.js?v=5'};
  const h=harness({controller:current,getRegistration:async()=>({scope:'https://kkeep.test/xbox/',active:current})},{profile:'xbox'});
  try{
    const handle=await within(h.mount());
    const url='https://login.live.com/oauth20_authorize.srf?state=fixture-state&code_challenge=fixture';
    h.receiveDocument(url,true);assert.equal(h.navigations.length,0,'A nested silent iframe cannot replace the main destination');
    h.receiveDocument(url);assert.deepEqual(h.navigations,[url]);handle.destroy();
  }finally{h.close();}
});

test('TikTok sign-in preserves engine-managed popup handles without adding camera permissions',async()=>{
 const h=harness({controller:active()});
 try{
  const handle=await within(h.mount({nativePopups:true}));
  let overrides=0;h.beforeInit({Proxy(){overrides++;}});assert.equal(overrides,0,'Keep the rewritten window handle and opener used by sign-in callbacks');
  assert.match(h.attributes.sandbox,/allow-popups(?: |$)/);assert.match(h.attributes.sandbox,/allow-popups-to-escape-sandbox/);
  assert.doesNotMatch(h.attributes.allow,/camera|microphone/);assert.equal(h.options().config.prefix,'/browse/');handle.destroy();
 }finally{h.close();}
});
