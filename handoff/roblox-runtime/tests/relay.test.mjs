import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {execFileSync} from 'node:child_process';
import {RbxWT} from '../worker/relay.js';

const tick=()=>new Promise(resolve=>setImmediate(resolve));
function harness({missingNative=false,forceRelay,preferRelay,choice,saved,blockedDb=false}={}){
 const native=[],relays=[],timers=new Map(),stored=[],dbCalls=[];let id=0;
 function transport(list){return class {
  constructor(url,opts){this.url=url;this.opts=opts;list.push(this);this.ready=new Promise((resolve,reject)=>{this.resolve=resolve;this.reject=reject;});this.closed=new Promise((resolve,reject)=>{this.resolveClosed=resolve;this.rejectClosed=reject;});this.datagrams={writable:'original'};}
  close(){this.didClose=true;this.reject(new Error('closed'));}
  createUnidirectionalStream(){return Promise.resolve('original-stream');}
 };}
 const scope={Native:missingNative?undefined:transport(native),RelayWT:transport(relays),__kkeepForceRelay:forceRelay,__kkeepPreferRelay:preferRelay,__kkeepTransportChoice:choice,
 modeDb:async(op,v)=>{dbCalls.push(op);if(op==='put')stored.push(v);if(blockedDb)return new Promise(()=>{});if(op==='get')return saved;},REMEMBER_MS:1800000,NATIVE_MS:5000,
 setTimeout:(fn,ms)=>{timers.set(++id,{fn,ms});return id;},clearTimeout:id=>timers.delete(id)};
 vm.runInNewContext('this.Transport='+RbxWT.toString(),scope);
 return {scope,native,relays,timers,stored,dbCalls};
}
test('native timeout followed by rejection opens one relay and preserves session/certificate options',async()=>{
 const h=harness(),options={serverCertificateHashes:[{algorithm:'sha-256',value:new Uint8Array([1,2,3])}]};
 const t=new h.scope.Transport('https://server.example/session?ticket=private',options);await tick();
 [...h.timers.values()].find(t=>t.ms===5000).fn();await tick();
 assert.equal(h.relays.length,1);assert.equal(h.relays[0].opts,options);assert.equal(h.relays[0].url,'https://server.example/session?ticket=private');
 h.relays[0].resolve();await t.ready;assert.equal(t.how,'relay');assert.equal(await t.createUnidirectionalStream(),'original-stream');
 assert.equal(h.stored.length,1);t.close();
});
test('a browser without native WebTransport can use the provider relay',async()=>{
 const h=harness({missingNative:true}),t=new h.scope.Transport('https://server.example');await tick();
 assert.equal(h.native.length,0);assert.equal(h.relays.length,1);
 h.relays[0].resolve();await t.ready;assert.equal(t.how,'relay');t.close();
});
test('explicit relay recovery bypasses native and a stalled preference database for this launch',async()=>{
 const h=harness({forceRelay:true,blockedDb:true}),options={serverCertificateHashes:[{algorithm:'sha-256',value:new Uint8Array([1,2])}]};
 const url='https://game.example/placeholder',t=new h.scope.Transport(url,options);
 assert.equal(h.relays.length,1);assert.equal(h.native.length,0);assert.deepEqual(h.dbCalls,[]);
 assert.equal(h.relays[0].url,url);assert.equal(h.relays[0].opts,options);
 assert.deepEqual([...h.timers.values()].map(t=>t.ms),[15000]);
 h.relays[0].resolve();await t.ready;assert.equal(t.how,'relay');assert.deepEqual(h.dbCalls,['put']);t.close();
});
test('only an explicit boolean relay choice bypasses normal selection and relay failure is not retried',async()=>{
 for(const forceRelay of [undefined,false,'true']){
  const h=harness({forceRelay}),t=new h.scope.Transport('https://game.example/placeholder');await tick();
  assert.equal(h.native.length,1);assert.equal(h.relays.length,0);t.close();await assert.rejects(t.ready);
 }
 const h=harness({forceRelay:true}),t=new h.scope.Transport('https://game.example/placeholder');
 const error=new Error('synthetic relay failure'),ready=assert.rejects(t.ready,e=>e===error),closed=assert.rejects(t.closed,e=>e===error);
 h.relays[0].reject(error);await Promise.all([ready,closed]);await tick();
 assert.equal(h.relays.length,1);assert.equal(h.native.length,0);assert.deepEqual(h.dbCalls,[]);assert.equal(h.timers.size,0);
});
test('iPad default uses relay after the bounded preference check without changing ordinary desktop selection',async()=>{
 for(const preferRelay of [true,false,undefined,'true']){
  const h=harness({preferRelay}),t=new h.scope.Transport('https://game.example/placeholder');await tick();
  assert.equal(h.relays.length,preferRelay===true?1:0);assert.equal(h.native.length,preferRelay===true?0:1);
  const selected=(preferRelay===true?h.relays:h.native)[0];selected.resolve();await t.ready;t.close();
 }
 const h=harness({preferRelay:true,blockedDb:true}),t=new h.scope.Transport('https://game.example/placeholder');
 assert.equal(h.relays.length,0);assert.equal(h.native.length,0);
 const deadline=[...h.timers.values()].find(timer=>timer.ms===750);assert.ok(deadline);deadline.fn();await tick();
 assert.equal(h.relays.length,1);assert.equal(h.native.length,0);
 h.relays[0].resolve();await t.ready;t.close();
});
test('explicit native and auto launches override the iPad default and an older saved relay',async()=>{
 for(const choice of ['native','auto']){
  const h=harness({preferRelay:true,choice,saved:{mode:'relay',at:Date.now()}}),t=new h.scope.Transport('https://game.example/placeholder');await tick();
  assert.equal(h.native.length,1);assert.equal(h.relays.length,0);
  const error=new Error('synthetic native failure');h.native[0].reject(error);await tick();
  if(choice==='native'){
   await assert.rejects(t.ready,value=>value===error);assert.equal(h.relays.length,0);
  }else{
   assert.equal(h.relays.length,1);h.relays[0].resolve();await t.ready;assert.equal(t.how,'relay');
  }
  t.close();
 }
});
test('only a fresh stored forced-native preference opts an ordinary iPad launch out of its relay default',async()=>{
 for(const saved of [{mode:'native',forced:true,at:Date.now()},{mode:'native',at:Date.now()},{mode:'native',forced:true,at:Date.now()-1800001},{mode:'auto'},{mode:'relay',at:Date.now()}]){
  const forced=saved.mode==='native'&&saved.forced&&Date.now()-saved.at<1800000;
  const h=harness({preferRelay:true,saved}),t=new h.scope.Transport('https://game.example/placeholder');await tick();
  assert.equal(h.native.length,forced?1:0);assert.equal(h.relays.length,forced?0:1);
  if(forced){
   h.native[0].reject(new Error('synthetic native failure'));await assert.rejects(t.ready);await tick();assert.equal(h.relays.length,0);
  }else{h.relays[0].resolve();await t.ready;}
  t.close();
 }
});
test('an explicit auto launch clears the effect of a saved forced-native choice for that launch',async()=>{
 const h=harness({preferRelay:true,choice:'auto',saved:{mode:'native',forced:true,at:Date.now()}}),t=new h.scope.Transport('https://game.example/placeholder');await tick();
 h.native[0].reject(new Error('synthetic native failure'));await tick();
 assert.equal(h.relays.length,1);h.relays[0].resolve();await t.ready;t.close();
});
test('leaving during connection closes the pending transport without a late fallback',async()=>{
 const h=harness(),t=new h.scope.Transport('https://server.example');await tick();t.close();
 await assert.rejects(t.ready);await tick();assert.equal(h.native[0].didClose,true);assert.equal(h.relays.length,0);
});
test('native success keeps native transport; failed relay stays an error with no reconnect loop',async()=>{
 const h=harness(),t=new h.scope.Transport('https://server.example');await tick();h.native[0].resolve();await t.ready;
 assert.equal(t.how,'native');assert.equal(h.relays.length,0);t.close();
 const f=harness(),failed=new f.scope.Transport('https://server.example');await tick();f.native[0].reject(new Error('blocked'));await tick();f.relays[0].reject(new Error('unavailable'));
 await assert.rejects(failed.ready);await tick();assert.equal(f.relays.length,1);assert.equal(f.stored.length,0);
});

test('selected native and relay failures keep the original closed rejection',async()=>{
 for(const missingNative of [false,true]){
  const h=harness({missingNative}),t=new h.scope.Transport('https://game.example/placeholder');await tick();
  const selected=(missingNative?h.relays:h.native)[0];selected.resolve();await t.ready;
  const error=Object.assign(new Error('synthetic session failure'),{name:'WebTransportError'});
  const failed=assert.rejects(t.closed,value=>value===error);selected.rejectClosed(error);await failed;
  assert.equal(h.relays.length,missingNative?1:0);t.close();
 }
});

test('actual provider fallback handles candidate cancellation before the engine worker rejection handler',()=>{
 // Run real promises in a separate process: the old implementation produces a
 // genuine unhandledRejection for this modeled candidate, which node:test
 // otherwise treats as a suite failure. This verifies the adapter contract;
 // it does not establish how a particular browser marks native promises.
 const source=String.raw`
  import vm from 'node:vm';
  import {readFileSync} from 'node:fs';
  import {transformText} from './worker/gateway.js';
  const origin='https://runtime.example',natives=[],sockets=[],timers=new Map();let timerId=0,fatalThrows=0;
  class Native {
   constructor(){natives.push(this);this.ready=new Promise((r,j)=>this.rejectReady=j);this.closed=new Promise((r,j)=>this.rejectClosed=j);}
   close(){this.wasClosed=true;const e=Object.assign(new Error('synthetic cancellation'),{name:'WebTransportError'});this.rejectReady(e);this.rejectClosed(e);}
  }
  class Socket {
   constructor(){this.listeners={};this.readyState=1;this.bufferedAmount=0;sockets.push(this);}
   addEventListener(type,fn){(this.listeners[type]??=[]).push(fn);}
   send(){}
   close(){this.onclose?.();for(const fn of this.listeners.close??[])fn();}
  }
  const scope=vm.createContext({URL,Request,Response,Headers,DOMException,TextEncoder,TextDecoder,ReadableStream,WritableStream,
   MessageChannel,ArrayBuffer,Uint8Array,DataView,btoa,atob,performance,WebTransport:Native,WebSocket:Socket,self:{},
   setTimeout:(fn,ms)=>{timers.set(++timerId,{fn,ms});return timerId;},clearTimeout:id=>timers.delete(id),setInterval:()=>0,clearInterval(){},
   console:{log(){},warn(){},error(){}},fetch:async()=>new Response('')});
  const original=readFileSync('./tests/fixtures/stub.js','utf8');
  const stub=transformText(original,'/277b9a60aa4d6118e89b19fbc8ca6f1e4e5eb81a/assets/webclient/stub.js',origin);
  const start=stub.indexOf('function install(scope, origin) {'),end=stub.indexOf('  const reroute = install(globalThis, PROXY_ORIGIN);',start);
  if(start<0||end<0)throw new Error('Provider fixture layout changed');
  vm.runInContext(stub.slice(start,end)+'\ninstall(globalThis,'+JSON.stringify(origin)+');',scope);
  const engine=readFileSync('./tests/fixtures/WebClient-1ef.js','utf8');
  const handlerStart=engine.indexOf('self.onunhandledrejection='),handlerEnd=engine.indexOf(';',handlerStart);
  if(handlerStart<0||handlerEnd<0)throw new Error('Engine worker handler changed');
  vm.runInContext(engine.slice(handlerStart,handlerEnd+1),scope);
  process.on('unhandledRejection',reason=>{try{scope.self.onunhandledrejection({reason});}catch{fatalThrows++;}});
  const t=new scope.WebTransport('https://game.example/placeholder');await new Promise(setImmediate);
  [...timers.values()].find(t=>t.ms===5000).fn();
  sockets[0].onmessage({data:Uint8Array.of(4).buffer});await t.ready;
  await new Promise(setImmediate);await new Promise(setImmediate);
  console.log(JSON.stringify({mode:t.how,nativeClosed:natives[0].wasClosed,relayCount:sockets.length,fatalThrows}));t.close();
 `;
 const actual=JSON.parse(execFileSync(process.execPath,['--input-type=module','-e',source],{cwd:new URL('..',import.meta.url),encoding:'utf8'}));
 assert.deepEqual(actual,{mode:'relay',nativeClosed:true,relayCount:1,fatalThrows:0});
});
