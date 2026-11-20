import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {transportBootstrap} from '../worker/transport.js';
import {preferencesBootstrap} from '../worker/preferences.js';
import {transformText} from '../worker/gateway.js';
import worker from '../worker/index.js';

const tick=()=>new Promise(resolve=>setImmediate(resolve));
function harness({legacy=false,ready=Promise.resolve(),closed=new Promise(()=>{}),stream=Promise.resolve(new WritableStream())}={}){
 const stages=[],requests=[],writes=[];let created=0,captured;
 const writable=new WritableStream({write:bytes=>writes.push([...bytes])});
 const datagrams=legacy?{writable}:{createWritable(){created++;return writable;}};
 class Native {
  constructor(...args){captured=args;this.ready=ready;this.closed=closed;this.datagrams=datagrams;}
  close(){}
  createUnidirectionalStream(){return stream;}
 }
 const scope={URL,location:new URL('https://runtime.example/games/start'),document:{},WebTransport:Native,__kkeepRuntime:{connection:(...args)=>stages.push(args)},fetch:(...args)=>{requests.push(args);return Promise.resolve();}};
 vm.runInNewContext('('+transportBootstrap.toString()+')()',scope);
 return {scope,Native,datagrams,stages,requests,writes,get created(){return created;},get captured(){return captured;}};
}
test('Safari adapter keeps one native writer and sends the original bytes with old engine flags',async()=>{
 const h=harness(),options={serverCertificateHashes:[{algorithm:'sha-256',value:new Uint8Array([1,2])}]};
 const transport=new h.scope.WebTransport('https://example.invalid/private-session',options);
 await transport.ready;
 const one=transport.datagrams.writable,two=transport.datagrams.writable;
 assert.equal(one,two);assert.equal(h.created,1);
 await one.getWriter().write(new Uint8Array([0,4,255,23]));
 assert.deepEqual(h.writes,[[0,4,255,23]]);
 assert.equal(h.captured[1],options);assert.ok(transport instanceof h.Native);
 const serialized=JSON.stringify(h.requests);
 assert.ok(!serialized.includes('private-session'));assert.ok(!serialized.includes('sha-256'));
});
test('Chrome legacy writable and native stream promises stay unchanged',async()=>{
 const stream=Promise.resolve(new WritableStream()),h=harness({legacy:true,stream});
 const transport=new h.scope.WebTransport('https://example.invalid');
 assert.equal(transport.datagrams.writable,h.datagrams.writable);
 assert.equal(transport.createUnidirectionalStream(),stream);
 await tick();assert.equal(h.created,0);
 assert.ok(h.stages.some(([stage])=>stage==='transport-stream-ready'));
});
test('failed handshakes remain rejected and only enum diagnostics are sent',async()=>{
 const error=Object.assign(new Error('secret session URL must not be recorded'),{name:'WebTransportError'});
 const h=harness({ready:Promise.reject(error)});
 const transport=new h.scope.WebTransport('https://example.invalid');
 await assert.rejects(transport.ready,error);await tick();
 assert.ok(h.stages.some(([stage,name])=>stage==='transport-handshake'&&name==='WebTransportError'));
 assert.ok(!JSON.stringify(h.requests).includes('secret session'));
 assert.ok(h.requests.every(([,options])=>options.credentials==='omit'));
});
test('an intentional close does not become a handshake failure',async()=>{
 let reject;const ready=new Promise((_,r)=>reject=r),h=harness({ready});
 const transport=new h.scope.WebTransport('https://example.invalid');
 transport.close();reject(new Error('closed'));await assert.rejects(ready);await tick();
 assert.ok(!h.stages.some(([stage])=>stage==='transport-handshake'));
});
test('a session closed before ready stays advisory and preserves the original rejected promises',async()=>{
 const error=Object.assign(new Error('private startup detail'),{name:'WebTransportError'});
 const ready=Promise.reject(error),closed=Promise.reject(error),h=harness({ready,closed});
 const transport=new h.scope.WebTransport('https://example.invalid/private-session');
 assert.equal(transport.ready,ready);assert.equal(transport.closed,closed);
 await assert.rejects(transport.ready,error);await assert.rejects(transport.closed,error);await tick();
 assert.ok(h.stages.some(([stage])=>stage==='transport-closed'));
 assert.equal(h.stages.filter(([stage])=>stage==='transport-lost').length,0);
});

// The real pthread entry first installs the provider's RbxWT wrapper. Only
// then does importScripts(WebClient.js) install Kkeep's transport adapter.
// RbxWT exposes a placeholder datagrams object until its ready promise settles.
function engineTransportHarness({workerFirst=true,legacy=false,relay=false}={}) {
 const origin='https://runtime.example',natives=[],sockets=[],writes=[],callbacks=[],requests=[],localStages=[];
 let created=0;
 const writable=new WritableStream({write:bytes=>writes.push([...bytes])});
 const datagrams=legacy?{writable}:{createWritable(){created++;return writable;}};
 class Native {
  constructor(){natives.push(this);this.datagrams=datagrams;this.ready=new Promise((resolve,reject)=>{this.accept=resolve;this.refuse=reject;});this.closed=new Promise((resolve,reject)=>{this.finish=resolve;this.disconnect=reject;});}
  close(){this.finish({});}
  createUnidirectionalStream(){return Promise.resolve(new WritableStream());}
 }
 class Socket {
  constructor(url){this.url=url;this.listeners={};this.readyState=1;this.bufferedAmount=0;sockets.push(this);}
  addEventListener(type,fn){(this.listeners[type]??=[]).push(fn);}
  send(frame){writes.push([...new Uint8Array(frame)]);}
  close(){if(this.readyState===3)return;this.readyState=3;this.onclose?.();for(const fn of this.listeners.close??[])fn();}
 }
 const context=vm.createContext({URL,Request,Response,Headers,DOMException,TextEncoder,TextDecoder,ReadableStream,WritableStream,
  MessageChannel,ArrayBuffer,Uint8Array,DataView,btoa,atob,setTimeout,clearTimeout,setInterval,clearInterval,performance,
  console:{log(){},warn(){},error(){}},WebTransport:relay?undefined:Native,WebSocket:Socket,
  ...(workerFirst?{postMessage:data=>localStages.push([data.stage,data.name])}:{document:{},__kkeepRuntime:{connection:(...args)=>localStages.push(args)}}),
  location:new URL(workerFirst?'blob:'+origin+'/engine-worker':origin+'/games/start'),
  fetch:async(...args)=>{requests.push(args);return new Response('');}});
 const bootstrap='('+transportBootstrap.toString()+')()';
 if(!workerFirst)vm.runInContext(bootstrap,context);
 const fixture=readFileSync(new URL('./fixtures/stub.js',import.meta.url),'utf8');
 const transformed=transformText(fixture,'/277b9a60aa4d6118e89b19fbc8ca6f1e4e5eb81a/assets/webclient/stub.js',origin);
 const start=transformed.indexOf('function install(scope, origin) {');
 const end=transformed.indexOf('  const reroute = install(globalThis, PROXY_ORIGIN);',start);
 assert.ok(start>=0&&end>start);
 vm.runInContext(transformed.slice(start,end)+'\ninstall(globalThis,'+JSON.stringify(origin)+');',context);
 const engine=readFileSync(new URL('./fixtures/WebClient-1ef.js',import.meta.url),'utf8');
 const enginePath='/_/c2V0dXAucmJ4Y2RuLmNvbQ/webclient/version-1ef59424f70d4932-RobloxWebClient/WebClient.js';
 const transformedEngine=transformText(engine,enginePath,origin);
 const prefix=transformedEngine.slice(0,transformedEngine.indexOf(engine.slice(0,40)));
 assert.ok(prefix.includes('function transportBootstrap()'));
 // The real WebClient entry runs this prefix in both startup orders. On the
 // page it is the second call, after hook.js has installed provider RbxWT.
 vm.runInContext(prefix,context);
 const sendStart=engine.indexOf('function Ha('),sendEnd=engine.indexOf('Ha.sig=',sendStart);
 assert.ok(sendStart>=0&&sendEnd>sendStart);
 const connection={transport:null,closed:false,datagramWritableCompatEnabled:false};
 context.f={HEAPU8:new Uint8Array([17,3,255,9]),__rbxWasmRna:{findConn:()=>connection,queueDeferredCallback:event=>callbacks.push(event)}};
 vm.runInContext(engine.slice(sendStart,sendEnd),context);
 const transport=new context.WebTransport('https://game.example/test');connection.transport=transport;
 return {context,prefix,transport,natives,sockets,datagrams,writable,writes,callbacks,requests,localStages,get created(){return created;},send:()=>context.Ha(1,0,4,0,1)};
}

test('actual stub-first Safari transport adapts resolved datagrams before the real engine ready callback',async()=>{
 const h=engineTransportHarness();
 try{
  const sent=h.transport.ready.then(()=>{assert.equal(h.created,0);h.send();h.send();});
  await tick();assert.equal(h.natives.length,1);assert.equal(h.created,0);
  h.natives[0].accept();await sent;await tick();
  assert.deepEqual(h.writes,[[17,3,255,9],[17,3,255,9]]);
  assert.equal(h.created,1);assert.equal(h.transport.datagrams.writable,h.writable);
  assert.deepEqual(h.callbacks.map(event=>event.kind),['datagramAcked','datagramAcked']);
 }finally{h.transport.close();}
});

test('actual page-first and legacy worker transports retain the native writer and engine bytes',async()=>{
 for(const options of [{workerFirst:false},{legacy:true}]){
  const h=engineTransportHarness(options);
  try{
   const sent=h.transport.ready.then(h.send);await tick();h.natives[0].accept();await sent;await tick();
   assert.deepEqual(h.writes,[[17,3,255,9]]);assert.equal(h.created,options.legacy?0:1);
   assert.equal(h.transport.datagrams.writable,h.writable);
  }finally{h.transport.close();}
 }
});

test('actual provider relay retains its writable and wire framing after deferred adoption',async()=>{
 const h=engineTransportHarness({relay:true});
 try{
  const sent=h.transport.ready.then(h.send);await tick();assert.equal(h.sockets.length,1);
  h.sockets[0].onmessage({data:Uint8Array.of(4).buffer});await sent;await tick();
  assert.equal(h.created,0);assert.deepEqual(h.writes,[[0,17,3,255,9]]);
  assert.deepEqual(h.callbacks.map(event=>event.kind),['datagramAcked']);
  const stages=h.requests.filter(([url])=>url==='https://runtime.example/_kkeep/connection').map(([,options])=>JSON.parse(options.body).stage);
  assert.ok(stages.indexOf('transport-relay')>=0&&stages.indexOf('transport-relay')<stages.indexOf('transport-ready'));
 }finally{h.transport.close();}
});
const transportEvents=h=>h.requests.filter(([url])=>url==='https://runtime.example/_kkeep/connection').map(([,options])=>JSON.parse(options.body));
const losses=h=>transportEvents(h).filter(({stage})=>stage==='transport-lost');
async function acceptTransport(h,relay=false,index=0){
 await tick();
 if(relay)h.sockets[index].onmessage({data:Uint8Array.of(4).buffer});
 else h.natives[index].accept();
 await tick();
}

test('actual worker-first and page-first WebClient bootstraps report only ready selected session loss',async()=>{
 for(const workerFirst of [true,false])for(const outcome of ['native-resolved','native-rejected','relay-resolved']){
  const relay=outcome==='relay-resolved',h=engineTransportHarness({workerFirst,relay});
  try{
   const ready=h.transport.ready,closed=h.transport.closed;
   await acceptTransport(h,relay);await ready;
   assert.equal(h.transport.how,relay?'relay':'native');
   assert.equal(h.transport.ready,ready);assert.equal(h.transport.closed,closed);
   assert.equal(losses(h).length,0);
   if(relay){h.sockets[0].close();await closed;}
   else if(outcome==='native-resolved'){h.natives[0].finish({closeCode:0});await closed;}
   else{
    const error=Object.assign(new Error('private endpoint and close detail'),{name:'WebTransportError'});
    h.natives[0].disconnect(error);await assert.rejects(closed,error);
   }
   await tick();
   assert.deepEqual(losses(h),[{stage:'transport-lost',name:outcome==='native-rejected'?'WebTransportError':''}]);
   const stages=transportEvents(h).map(({stage})=>stage);
   assert.ok(stages.indexOf('transport-'+h.transport.how)<stages.indexOf('transport-lost'));
   assert.ok(stages.indexOf('transport-ready')<stages.indexOf('transport-lost'));
   assert.equal(stages.filter(stage=>stage==='transport-connecting').length,1,'the retired inner native candidate cannot replace the outer provider owner');
   assert.equal(/private endpoint|private-session/.test(JSON.stringify(h.requests)),false);
  }finally{h.transport.close();}
 }
});

test('both provider startup orders ignore failed native candidates while the selected relay connects',async()=>{
 for(const workerFirst of [true,false]){
  const h=engineTransportHarness({workerFirst});
  try{
   await tick();
   const error=Object.assign(new Error('synthetic candidate failure'),{name:'WebTransportError'});
   h.natives[0].refuse(error);h.natives[0].disconnect(error);await tick();
   assert.equal(h.sockets.length,1);assert.equal(losses(h).length,0);
   h.sockets[0].onmessage({data:Uint8Array.of(4).buffer});await h.transport.ready;await tick();
   assert.equal(h.transport.how,'relay');assert.equal(losses(h).length,0);
   assert.equal(transportEvents(h).filter(({stage})=>stage==='transport-connecting').length,1);
   h.sockets[0].close();await h.transport.closed;await tick();
   assert.deepEqual(losses(h),[{stage:'transport-lost',name:''}]);
  }finally{h.transport.close();}
 }
});

test('manual close suppresses ready native and relay loss in both provider startup orders',async()=>{
 for(const workerFirst of [true,false])for(const relay of [false,true]){
  const h=engineTransportHarness({workerFirst,relay});
  try{
   await acceptTransport(h,relay);await h.transport.ready;
   h.transport.close();await h.transport.closed;await tick();
   assert.equal(losses(h).length,0);
   assert.equal(transportEvents(h).filter(({stage})=>stage==='transport-closed').length,0);
  }finally{h.transport.close();}
 }
});

test('new current construction retires earlier sessions and each current loss is delivered once',async()=>{
 for(const workerFirst of [true,false]){
  const h=engineTransportHarness({workerFirst});let replacement,third;
  try{
   await acceptTransport(h);await h.transport.ready;
   replacement=new h.context.WebTransport('https://game.example/new-session');await tick();
   h.natives[0].disconnect(Object.assign(new Error('retired session'),{name:'WebTransportError'}));
   await assert.rejects(h.transport.closed);await tick();
   assert.equal(losses(h).length,0,'an old ready transport cannot fail the replacement while it connects');
   h.natives[1].accept();await replacement.ready;
   h.natives[1].finish({});await replacement.closed;await tick();assert.equal(losses(h).length,1);
   third=new h.context.WebTransport('https://game.example/third-session');await tick();
   h.natives[2].accept();await third.ready;h.natives[2].finish({});await third.closed;await tick();
   assert.equal(losses(h).length,2,'a later real loss must not be hidden by realm-wide diagnostic dedupe');
   assert.equal(transportEvents(h).filter(({stage})=>stage==='transport-connecting').length,3);
  }finally{h.transport.close();replacement?.close();third?.close();}
 }
});

test('current native to relay to native selections survive retained realms without late retired mode changes',async()=>{
 for(const workerFirst of [true,false]){
  const h=engineTransportHarness({workerFirst});let second,third,stale;
  try{
   await acceptTransport(h);await h.transport.ready;
   h.context.__kkeepForceRelay=true;
   second=new h.context.WebTransport('https://game.example/relay');
   await acceptTransport(h,true);await second.ready;
   h.context.__kkeepForceRelay=false;
   stale=new h.context.WebTransport('https://game.example/retired-native');await tick();
   third=new h.context.WebTransport('https://game.example/current-native');await tick();
   h.natives[2].accept();await third.ready;await tick();
   const before=h.localStages.length;
   h.natives[1].accept();await stale.ready;await tick();
   assert.equal(h.localStages.length,before,'a late earlier adoption cannot publish mode or readiness directly to the page');
   assert.deepEqual(h.localStages.filter(([stage])=>stage==='transport-native'||stage==='transport-relay').map(([stage])=>stage),['transport-native','transport-relay','transport-native']);
   assert.equal(h.localStages.filter(([stage])=>stage==='transport-ready').length,3);
   h.natives[2].finish({});await third.closed;await tick();assert.equal(losses(h).length,1);
  }finally{h.transport.close();second?.close();third?.close();stale?.close();}
 }
});

test('preferences preserve the selected server without causing navigation',()=>{
 const data=new Map([['rbxweb.fps','30']]),calls=[];
 const original='https://runtime.example/_/play/games/start?placeId=123&job=chosen-server&launchId=keep-me';
 const scope={URL,location:{href:original},document:{},localStorage:{getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v)},history:{state:{kept:true},replaceState:(...args)=>calls.push(args)}};
 vm.runInNewContext('('+preferencesBootstrap.toString()+')()',scope);
 assert.equal(calls.length,1);assert.equal(scope.location.href,original);
 const next=new URL(calls[0][2]);assert.equal(next.searchParams.get('job'),'chosen-server');assert.equal(next.searchParams.get('launchId'),'keep-me');assert.equal(next.searchParams.get('fps'),'30');
});
test('diagnostics reject arbitrary details and enforce a small request limit',async()=>{
 const original=console.error,logged=[];console.error=(...args)=>logged.push(args);
 try{
  const req=body=>new Request('https://runtime.example/_kkeep/connection',{method:'POST',body});
  assert.equal((await worker.fetch(req(JSON.stringify({stage:'transport-handshake',name:'private secret',url:'private'})))).status,204);
  assert.deepEqual(logged,[['[Kkeep Roblox connection]','transport-handshake','']]);
  assert.equal((await worker.fetch(req(JSON.stringify({stage:'private secret'})))).status,400);
  assert.equal((await worker.fetch(req('x'.repeat(257)))).status,413);
 }finally{console.error=original;}
});

// Execute the current provider's actual Worker constructor and the blob source
// it creates, followed by the exact gateway-injected WebClient prefix. The
// native fetch stand-in uses the blob worker's URL as its resolution base,
// reproducing the browser failure for the old relative diagnostic endpoint.
function blobWorkerDiagnosticsHarness(){
 const origin='https://runtime.example',requests=[],stages=[],engineMessages=[],blobs=new Map(),natives=[];
 let blobId=0;
 class BlobSource{constructor(parts){this.source=parts.join('');}}
 class WorkerURL extends URL{static createObjectURL(blob){const url='blob:'+origin+'/worker-'+(++blobId);blobs.set(url,blob.source);return url;}}
 class NativeWorker{
  constructor(url,options){this.url=url;this.options=options;this.listeners=[];}
  addEventListener(type,callback,options){this.listeners.push({type,callback,capture:!!options?.capture});}
  postMessage(data,ports){this.sent={data,ports};}
  terminate(){this.terminated=true;}
  emit(data,ports=[]){
   const event={data,ports,stopped:false,stopImmediatePropagation(){this.stopped=true;}};
   for(const capture of [true,false])for(const listener of this.listeners){
    if(listener.type==='message'&&listener.capture===capture){listener.callback(event);if(event.stopped)return event;}
   }
   this.onmessage?.(event);return event;
  }
 }
 class NativeTransport{
  constructor(){natives.push(this);this.datagrams={writable:new WritableStream()};this.ready=Promise.resolve();this.closed=new Promise((resolve,reject)=>{this.disconnect=reject;this.finish=resolve;});}
  close(){this.finish({});}
  createUnidirectionalStream(){return Promise.resolve(new WritableStream());}
 }
 const shared={URL:WorkerURL,URLSearchParams,Request,Response,Headers,DOMException,TextEncoder,TextDecoder,ReadableStream,WritableStream,
  MessageChannel,ArrayBuffer,Uint8Array,DataView,btoa,atob,setTimeout,clearTimeout,setInterval,clearInterval,performance,
  console:{log(){},warn(){},error(){}},Worker:NativeWorker,WebTransport:NativeTransport,WebSocket:class{},Blob:BlobSource};
 const hook=transformText(readFileSync(new URL('./fixtures/hook.js',import.meta.url),'utf8'),'/hook.js',origin);
 const installStart=hook.indexOf('function install(scope, origin) {'),installEnd=hook.indexOf('  const reroute = install(globalThis, PROXY_ORIGIN);',installStart);
 const wrapStart=hook.indexOf('  const NativeWorker = globalThis.Worker;'),wrapEnd=hook.lastIndexOf('\n})();');
 assert.ok(installStart>=0&&installEnd>installStart&&wrapStart>installEnd&&wrapEnd>wrapStart);
 const page=vm.createContext({...shared,location:new URL(origin+'/games/start?placeId=123'),document:{},
  __kkeepRuntime:{connection:(stage,name)=>stages.push([stage,name])},fetch:async()=>new Response('')});
 vm.runInContext('('+transportBootstrap.toString()+')();\n'+hook.slice(installStart,installEnd)+
  '\nconst PROXY_ORIGIN='+JSON.stringify(origin)+';const reroute=install(globalThis,PROXY_ORIGIN);\n'+hook.slice(wrapStart,wrapEnd),page);
 const enginePath='/_/c2V0dXAucmJ4Y2RuLmNvbQ/webclient/version-1ef59424f70d4932-RobloxWebClient/WebClient.js';
 const engine=readFileSync(new URL('./fixtures/WebClient-1ef.js',import.meta.url),'utf8');
 const transformed=transformText(engine,enginePath,origin),prefix=transformed.slice(0,transformed.indexOf(engine.slice(0,40)));
 assert.ok(prefix.includes('function transportBootstrap()'));
 const WorkerAfterHook=page.Worker;
 vm.runInContext(prefix,page);
 assert.equal(page.Worker,WorkerAfterHook,'the actual second page bootstrap does not wrap the Worker bridge again');
 const owned=new page.Worker(origin+enginePath,{name:'em-pthread'});
 assert.ok(blobs.has(owned.url),'actual provider wraps this same-origin engine in a blob');
 const loadStart=engine.indexOf('loadWasmModuleToWorker:e=>'),loadEnd=engine.indexOf(',async loadWasmModuleToAllWorkers()',loadStart);
 assert.ok(loadStart>=0&&loadEnd>loadStart);
 Object.assign(page,{f:{print:value=>engineMessages.push(value)},De:{},xe:{},X:value=>engineMessages.push(value),he:()=>1,U:{pthreads:{}},nr(){},yn(){},ge:callback=>callback(),xn(){}});
 const attach=vm.runInContext('('+engine.slice(loadStart+'loadWasmModuleToWorker:'.length,loadEnd)+')',page);
 attach(owned);
 const actualHandler=owned.onmessage;let handlerCalls=0;
 owned.onmessage=event=>{handlerCalls++;actualHandler(event);};
 const child=vm.createContext({...shared,location:new URL(owned.url),postMessage:(data,ports)=>owned.emit(data,ports),
  fetch:async(input,options)=>{
   const target=new URL(typeof input==='string'?input:input.url,owned.url);
   requests.push({url:target.href,options});return new Response('');
  }});
 child.self=child;
 child.importScripts=url=>{assert.equal(url,origin+enginePath);vm.runInContext(prefix,child);};
 assert.throws(()=>new URL('/_kkeep/connection',owned.url),TypeError,'relative fetch cannot resolve against a blob worker URL');
 vm.runInContext(blobs.get(owned.url),child);
 return{page,child,owned,natives,requests,stages,engineMessages,get handlerCalls(){return handlerCalls;},NativeWorker,origin};
}

test('actual blob worker startup delivers ready and post-join close to the page and an absolute same-origin endpoint',async()=>{
 const h=blobWorkerDiagnosticsHarness(),privateUrl='https://game.example/private?ticket=secret';
 const transport=new h.child.WebTransport(privateUrl);await transport.ready;await tick();
 h.natives[0].disconnect(Object.assign(new Error('private close detail'),{name:'WebTransportError'}));
 await assert.rejects(transport.closed);await tick();
 assert.ok(h.stages.some(([stage])=>stage==='transport-ready'));
 assert.ok(h.stages.findIndex(([stage])=>stage==='transport-native')>=0&&
  h.stages.findIndex(([stage])=>stage==='transport-native')<h.stages.findIndex(([stage])=>stage==='transport-ready'));
 assert.ok(h.stages.some(([stage,name])=>stage==='transport-closed'&&name==='WebTransportError'));
 assert.equal(h.stages.filter(([stage,name])=>stage==='transport-lost'&&name==='WebTransportError').length,1);
 assert.equal(h.handlerCalls,0,'diagnostic messages never reach the actual engine command handler');
 assert.ok(h.requests.length>=3);
 assert.ok(h.requests.every(({url,options})=>url===h.origin+'/_kkeep/connection'&&options.credentials==='omit'&&options.mode==='same-origin'&&options.redirect==='error'));
 assert.equal(/secret|private close|ticket|game\.example/.test(JSON.stringify(h.requests)),false);
 assert.ok(h.requests.some(({options})=>JSON.parse(options.body).stage==='transport-closed'));
 h.owned.emit({cmd:9,handler:'print',args:['engine-command-kept']});
 assert.equal(h.handlerCalls,1);assert.deepEqual(h.engineMessages,['engine-command-kept']);
 transport.close();
});

test('owned worker bridge retires previous worker owners and explicit termination without intercepting engine commands',()=>{
 const h=blobWorkerDiagnosticsHarness(),replacement=new h.page.Worker(h.origin+'/another-engine.js');
 const message=stage=>({key:'kkeep:transport:v1',stage,name:''});
 assert.equal(h.owned.listeners.filter(listener=>listener.type==='message'&&listener.capture).length,1);
 h.owned.emit(message('transport-connecting'));
 replacement.emit(message('transport-connecting'));
 const modeCount=h.stages.length;
 for(const stage of ['transport-native','transport-relay','transport-ready'])assert.equal(h.owned.emit(message(stage)).stopped,true);
 assert.equal(h.stages.length,modeCount,'a retired worker cannot change selected mode or readiness');
 replacement.emit(message('transport-relay'));replacement.emit(message('transport-ready'));
 assert.equal(h.owned.emit(message('transport-lost')).stopped,true);
 assert.equal(h.stages.filter(([stage])=>stage==='transport-lost').length,0);
 replacement.emit(message('transport-lost'));
 assert.equal(h.stages.filter(([stage])=>stage==='transport-lost').length,1);
 replacement.emit(message('transport-connecting'));replacement.terminate();
 assert.equal(replacement.terminated,true);
 replacement.emit(message('transport-lost'));
 assert.equal(h.stages.filter(([stage])=>stage==='transport-lost').length,1);
 const survivor=new h.page.Worker(h.origin+'/surviving-engine.js');
 survivor.emit(message('transport-connecting'));
 const stageCount=h.stages.length;
 assert.equal(replacement.emit(message('transport-connecting')).stopped,true);
 assert.equal(replacement.emit(message('transport-lost')).stopped,true);
 assert.equal(h.stages.length,stageCount,'queued events from a terminated worker cannot reclaim ownership');
 survivor.emit(message('transport-lost'));
 assert.equal(h.stages.filter(([stage])=>stage==='transport-lost').length,2,'the current surviving worker retains ownership');
 h.owned.emit({cmd:9,handler:'print',args:['engine-message-after-retirement']});
 assert.deepEqual(h.engineMessages,['engine-message-after-retirement']);
});

test('owned-worker channel accepts only exact fixed enums and leaves engine/session messages and ports unchanged',()=>{
 const h=blobWorkerDiagnosticsHarness(),baseline=h.stages.length;
 const valid={key:'kkeep:transport:v1',stage:'transport-closed',name:'NetworkError'};
 assert.equal(h.owned.emit(valid).stopped,true);assert.equal(h.stages.length,baseline+1);
 const invalid=[{...valid,key:'other'},{...valid,stage:'private-server-url'},{...valid,name:'private-error'},
  {...valid,detail:'private'},{key:'kkeep:jar:v4',op:'fetch'}, {cmd:3}];
 for(const data of invalid)assert.equal(h.owned.emit(data).stopped,false);
 assert.equal(h.owned.emit(valid,[{}]).stopped,false);
 assert.equal(h.stages.length,baseline+1);assert.equal(h.handlerCalls,invalid.length+1);
});

test('nested owned workers forward one sanitized hop without duplicate network reports or window listeners',()=>{
 const forwarded=[],network=[],listeners=[];
 class Worker{constructor(){this.listeners=[];}addEventListener(type,fn,options){this.listeners.push({type,fn,options});}}
 const scope={URL,location:new URL('blob:https://runtime.example/nested-owner'),Worker,
  WebTransport:class{},postMessage:data=>forwarded.push(data),fetch:(...args)=>{network.push(args);return Promise.resolve();},
  addEventListener:(...args)=>listeners.push(args)};
 vm.runInNewContext('('+transportBootstrap.toString()+')()',scope);
 const owned=new scope.Worker(),entry=owned.listeners.find(item=>item.type==='message');
 assert.equal(entry.options.capture,true);
 entry.fn({data:{key:'kkeep:transport:v1',stage:'transport-connecting',name:''},ports:[],stopImmediatePropagation(){}});
 const event={data:{key:'kkeep:transport:v1',stage:'transport-ready',name:''},ports:[],stopImmediatePropagation(){this.stopped=true;}};
 entry.fn(event);
 assert.equal(event.stopped,true);assert.equal(forwarded.length,2);
 assert.deepEqual(JSON.parse(JSON.stringify(forwarded[1])),event.data);
 assert.equal(network.length,0);assert.equal(listeners.length,0);
});
