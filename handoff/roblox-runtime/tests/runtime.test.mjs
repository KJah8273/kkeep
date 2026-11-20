import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {runtimeBootstrap} from '../worker/runtime.js';

const GENERIC='Roblox encountered a problem. Check the console and reload.';
const engine=readFileSync(new URL('./fixtures/WebClient-1ef.js',import.meta.url),'utf8');

function harness({gpu,desktop=false,href='https://runtime.example/_/cGxheS5yb2Jsb3guY29t/games/start?placeId=123',workerConstructionError}={}){
  const handlers=new Map(),observers=[],logs=[],messages=[],navigations=[],timers=new Map(),requests=[];
  let timerId=0,now=1000,leaveCount=0;
  class Element {
    constructor(tag='div'){this.tagName=tag.toUpperCase();this.childNodes=[];this.style={};this.hidden=false;this.id='';}
    set textContent(value){for(const child of this.childNodes)child.parentElement=null;this.childNodes=value?[{textContent:String(value)}]:[];}
    get textContent(){return this.childNodes.map(node=>node.textContent||'').join('');}
    append(...nodes){for(const node of nodes){node.parentElement=this;this.childNodes.push(node);}}
    contains(node){for(let current=node;current;current=current.parentElement)if(current===this)return true;return false;}
    remove(){if(this.parentElement)this.parentElement.childNodes=this.parentElement.childNodes.filter(node=>node!==this);this.parentElement=null;}
    setAttribute(){}
  }
  const body=new Element('body'),loading=new Element(),panel=new Element(),message=new Element('p'),code=new Element(),leave=new Element('button');
  loading.id='loading-overlay';message.id='loading-error-message';code.id='loading-error-code';leave.id='loading-error-leave';
  leave.textContent='Leave';leave.onclick=()=>leaveCount++;
  panel.hidden=true;panel.append(message,code,leave);loading.append(panel);body.append(loading);
  const byId=(node,id)=>node.id===id?node:node.childNodes?.map(child=>byId(child,id)).find(Boolean);
  const countId=(node,id)=>(node.id===id?1:0)+(node.childNodes||[]).reduce((sum,child)=>sum+countId(child,id),0);
  class BrowserErrorEvent {
    constructor({message='',filename='',error=null,lineno=0,colno=0}={}){Object.assign(this,{type:'error',message,filename,error,lineno,colno});}
    preventDefault(){this.defaultPrevented=true;}
  }
  class NativeWorker {
    static capability='native';
    constructor(url,options){if(workerConstructionError)throw workerConstructionError;this.arguments=[url,options];this.listeners=new Map();}
    addEventListener(type,listener){const list=this.listeners.get(type)||[];list.push(listener);this.listeners.set(type,list);}
    emitError(event){for(const listener of this.listeners.get('error')||[])listener(event);if(this.onerror)return this.onerror(event);}
    postMessage(value,transfer){this.sent=[value,transfer];}
    terminate(){this.terminated=true;}
  }
  const scope={navigator:desktop?{userAgent:'test Desktop',platform:'Linux',maxTouchPoints:0}:{userAgent:'test Safari',platform:'MacIntel',maxTouchPoints:5},
    crossOriginIsolated:true,SharedArrayBuffer,ErrorEvent:BrowserErrorEvent,Worker:NativeWorker,URL,
    WebAssembly:{Memory:class{},Suspending(){},promising(){},Exception:WebAssembly.Exception,instantiate:async()=>({})},
    console:{error:(...args)=>logs.push(args)},
    fetch:(...args)=>{requests.push(args);return Promise.resolve();},
    document:{body,createElement:tag=>new Element(tag),getElementById:id=>byId(body,id),querySelector:selector=>selector==='.loading-error-panel'?panel:null},
    getComputedStyle:element=>({display:element.style.display||'block',visibility:element.style.visibility||'visible'}),
    addEventListener:(type,listener)=>{const list=handlers.get(type)||[];list.push(listener);handlers.set(type,list);},
    MutationObserver:class{constructor(callback){observers.push(callback);}observe(){}},
    parent:{postMessage:(...args)=>messages.push(args)},
    setTimeout:callback=>{const id=++timerId;timers.set(id,callback);return id;},clearTimeout:id=>timers.delete(id),
    Date:class extends Date{static now(){return now;}},
    location:{href,replace:value=>navigations.push(value)},
    ...(gpu?{__rbxPerf:{gpu}}:{}),
  };
  scope.window=scope;
  vm.runInNewContext('('+runtimeBootstrap.toString()+')()',scope);
  for(const callback of handlers.get('DOMContentLoaded')||[])callback();
  return {scope,panel,message,code,loading,logs,messages,navigations,requests,BrowserErrorEvent,NativeWorker,leave,
    detail:()=>byId(body,'kkeep-engine-error-detail'),
    compatibility:()=>byId(body,'kkeep-engine-compatibility'),
    retry:()=>byId(body,'kkeep-engine-compatibility-retry'),
    count:id=>countId(body,id),
    error:event=>{for(const callback of handlers.get('error')||[])callback(event);},
    reject:reason=>{for(const callback of handlers.get('unhandledrejection')||[])callback({reason});},
    dispatch:(type,event={})=>{for(const callback of handlers.get(type)||[])callback(event);},
    render(text=GENERIC){message.textContent=text;panel.hidden=false;this.observe();},
    observe:()=>{for(const callback of observers)callback();},
    flushTask(){const callbacks=[...timers.values()];timers.clear();for(const callback of callbacks)callback();},
    advance:ms=>{now+=ms;},leaveCount:()=>leaveCount,
  };
}

test('generic fatal diagnostics retain only allowlisted error category and source coordinates',()=>{
  const h=harness(),secret='https://private.example/join?auth=must-not-appear';
  h.error({error:new TypeError(secret),message:'TypeError: '+secret,
    filename:'https://private.example/engine/WebClient.js?auth=must-not-appear',lineno:412,colno:157940});h.render();
  assert.equal(h.detail().textContent,'Details: JavaScript / TypeError at WebClient.js:412:157940 · join19');
  assert.ok(h.message.textContent.startsWith(GENERIC));
  assert.equal(/private|must-not-appear|https:/.test(h.message.textContent),false);
  assert.deepEqual(h.logs,[]);
  assert.equal(JSON.stringify(h.messages).includes(secret),false);
  h.observe();assert.equal(h.count('kkeep-engine-error-detail'),1);
});

test('only a visible fatal panel reports bounded metadata once, including post-load failures',()=>{
  const h=harness({gpu:'webgl',href:'https://runtime.example/games/start?placeId=123&ticket=private-ticket'});
  h.loading.hidden=true;h.observe();
  h.error({error:new TypeError('private-message'),filename:'https://runtime.example/engine/WebClient.js?token=private-token',lineno:432,colno:110});
  assert.equal(h.requests.length,0,'an exception alone is not a confirmed fatal state');
  h.loading.hidden=false;h.render();h.observe();
  assert.equal(h.requests.length,1);
  const [url,options]=h.requests[0];
  assert.equal(url,'https://runtime.example/_kkeep/failure');
  assert.equal(options.credentials,'omit');assert.equal(options.mode,'same-origin');
  assert.equal(options.redirect,'error');assert.equal(options.referrerPolicy,'no-referrer');
  assert.deepEqual(JSON.parse(options.body),{phase:'after-load',kind:'JavaScript',name:'TypeError',source:'WebClient.js',line:432,column:110,gpu:'webgl'});
  assert.equal(JSON.stringify(h.requests).includes('private'),false);
  assert.equal(h.detail().textContent.includes('TypeError'),true);
});

test('fatal diagnostic delivery failure cannot hide or replace the engine error',()=>{
  const h=harness();h.scope.fetch=()=>{throw new TypeError('network unavailable');};
  h.error({error:new RangeError('private')});h.render();
  assert.equal(h.panel.hidden,false);
  assert.ok(h.detail().textContent.includes('RangeError'));
  assert.deepEqual(h.navigations,[]);
  assert.deepEqual(h.logs,[]);
});

test('caught engine-loop failures retain a bounded descriptor without retaining error text',()=>{
  const h=harness({gpu:'webgpu'});
  h.loading.hidden=true;h.observe();
  h.scope.__kkeepRuntime.engineError(new TypeError('private-engine-error'));
  assert.equal(h.requests.length,0);
  h.loading.hidden=false;h.render();
  assert.ok(h.detail().textContent.includes('JavaScript / TypeError at WebClient.js'));
  assert.equal(JSON.parse(h.requests[0][1].body).phase,'after-load');
  assert.equal(JSON.stringify(h.requests).includes('private'),false);
  assert.deepEqual(h.logs,[]);
});

test('owned-worker listener captures the actual engine rethrow before the browser loses its details',()=>{
  const h=harness();
  const rethrow=engine.match(/e\.onerror=(i=>\{var o="worker sent an error!";throw X\(`[^`]+`\),i\})/)?.[1];
  assert.ok(rethrow,'use the actual current engine worker handler');
  const worker=new h.scope.Worker('blob:https://runtime.example/private-worker-id',{name:'em-pthread'});
  const event=new h.BrowserErrorEvent({filename:'https://runtime.example/engine/WebClient.js?ticket=private',lineno:432,colno:100,
    message:"TypeError: undefined is not an object (evaluating 'transport.datagrams.writable.getWriter')"});
  worker.onerror=vm.runInNewContext('('+rethrow+')',{X(){}});
  assert.throws(()=>worker.emitError(event),error=>error===event,'the original worker event must still propagate');
  assert.equal(event.defaultPrevented,undefined);
  h.error({error:null,message:'Script error.'});h.render();
  assert.equal(h.detail().textContent,'Details: engine worker / TypeError at WebClient.js:432:100 · join19');
  assert.equal(/private|ticket|getWriter|https:/.test(h.message.textContent),false);
});

test('worker observation preserves construction, inheritance, messaging, and failures',()=>{
  const h=harness(),options={name:'em-pthread'},worker=new h.scope.Worker('/assets/webclient/stub.js',options);
  assert.ok(worker instanceof h.NativeWorker);assert.ok(worker instanceof h.scope.Worker);
  assert.equal(h.scope.Worker.capability,'native');assert.equal(worker.arguments[1],options);
  const payload={value:1},transfer=[];worker.postMessage(payload,transfer);
  assert.equal(worker.sent[0],payload);assert.equal(worker.sent[1],transfer);
  worker.terminate();assert.equal(worker.terminated,true);
  const failure=new Error('native construction failure'),blocked=harness({workerConstructionError:failure});
  assert.throws(()=>new blocked.scope.Worker('/assets/webclient/stub.js'),error=>error===failure);
});

test('actual provider Worker wrapper preserves observation for both stub and blob engine entry',()=>{
  const hook=readFileSync(new URL('./fixtures/hook.js',import.meta.url),'utf8');
  const start=hook.indexOf('  const NativeWorker = globalThis.Worker;'),end=hook.lastIndexOf('\n})();');
  assert.ok(start>0&&end>start);
  for(const url of ['/assets/webclient/stub.js?src=private','/engine/WebClient.js']){
    const h=harness(),blob='blob:https://runtime.example/private-worker-id';
    Object.assign(h.scope,{install(){},reroute:value=>value,PROXY_ORIGIN:'https://runtime.example',Blob,
      URL:class extends URL{static createObjectURL(){return blob;}}});
    vm.runInNewContext(hook.slice(start,end),h.scope);
    const options={name:'em-pthread'},worker=new h.scope.Worker(url,options);
    assert.equal(worker.arguments[0],url.includes('stub.js')?url:blob);assert.equal(worker.arguments[1],options);
    worker.emitError(new h.BrowserErrorEvent({message:'TypeError: private',filename:'https://runtime.example/WebClient.js',lineno:432,colno:100}));
    h.error({message:'Script error.',error:null});h.render();
    assert.equal(h.detail().textContent,'Details: engine worker / TypeError at WebClient.js:432:100 · join19');
    assert.equal(h.message.textContent.includes('private'),false);
  }
});

test('actual engine BindingError and InternalError constructors keep their fixed names',()=>{
  for(const [name,pattern,call] of [
    ['BindingError',/class go extends Error\{[^}]+\}\}var ce=e=>\{throw new go\(e\)\}/,'ce'],
    ['InternalError',/class Do extends Error\{[^}]+\}\}var Un=e=>\{throw new Do\(e\)\}/,'Un']
  ]){
    const source=engine.match(pattern)?.[0];assert.ok(source,'actual '+name+' constructor is present');
    const error=vm.runInNewContext(source+';try{'+call+'("private-details")}catch(error){error}');
    const h=harness();h.error({error});h.render();
    assert.equal(h.detail().textContent,'Details: JavaScript / '+name+' · join19');
    assert.equal(h.message.textContent.includes('private-details'),false);
  }
});

test('native WebAssembly suspension failure is identified as SuspendError',{
  skip:typeof WebAssembly.Suspending!=='function'||typeof WebAssembly.promising!=='function'
},async()=>{
  // A real suspending Wasm import called without a promising export wrapper.
  const bytes=new Uint8Array([0,97,115,109,1,0,0,0,1,4,1,96,0,0,2,13,1,3,101,110,118,5,121,105,101,108,100,0,0,3,2,1,0,7,7,1,3,114,117,110,0,1,10,6,1,4,0,16,0,11]);
  const {instance}=await WebAssembly.instantiate(bytes,{env:{yield:new WebAssembly.Suspending(()=>Promise.resolve())}});
  let error;try{instance.exports.run();}catch(caught){error=caught;}
  assert.equal(error?.name,'SuspendError');
  const h=harness();h.error({error});h.render();
  assert.equal(h.detail().textContent,'Details: JavaScript / SuspendError · join19');
  await WebAssembly.promising(instance.exports.run)();
});

test('a rethrown error event from another realm is recognized without raw details',()=>{
  const nested=vm.runInNewContext('({type:"error",filename:"https://private.example/stub.js?auth=secret",message:"ReferenceError: private",lineno:901,colno:12,error:null})');
  const h=harness();h.error({error:nested,message:'Uncaught ErrorEvent'});h.render();
  assert.equal(h.detail().textContent,'Details: engine worker / ReferenceError at stub.js:901:12 · join19');
  assert.equal(/secret|private|https:/.test(h.message.textContent),false);
});

test('no captured event, opaque error, and named Error remain distinct',()=>{
  const noEvent=harness();noEvent.render();
  assert.equal(noEvent.detail().textContent,'Details: no error event captured · join19');
  const opaque=harness();opaque.error({error:null,message:'Script error.',filename:'',lineno:0,colno:0});opaque.render();
  assert.equal(opaque.detail().textContent,'Details: JavaScript / details unavailable · join19');
  const known=harness();known.error({error:new Error('private')});known.render();
  assert.equal(known.detail().textContent,'Details: JavaScript / Error · join19');
  const worker=harness(),instance=new worker.scope.Worker('blob:https://runtime.example/private',{name:'em-pthread'});
  instance.emitError({type:'error'});worker.render();
  assert.equal(worker.detail().textContent,'Details: engine worker / details unavailable · join19');
});

test('unknown names, arbitrary filenames, invalid coordinates and exception getters cannot leak',()=>{
  const h=harness();h.error({error:{name:'private-user',stack:'private-stack'},message:'secret TypeError: value',filename:'https://private.example/account.js',lineno:12,colno:34});h.render();
  assert.equal(h.detail().textContent,'Details: JavaScript / details unavailable · join19');
  const badCoordinates=harness();badCoordinates.error({error:new TypeError('private'),filename:'https://private.example/WebClient.js?auth=private',lineno:10000001,colno:'private-column'});badCoordinates.render();
  assert.equal(badCoordinates.detail().textContent,'Details: JavaScript / TypeError at WebClient.js · join19');
  const badGetter=harness();badGetter.error({get error(){throw new Error('private-getter');}});badGetter.render();
  assert.equal(badGetter.detail().textContent,'Details: JavaScript / details unavailable · join19');
  assert.deepEqual(badGetter.logs,[]);
});

test('first useful fatal cause survives opaque follow-up errors and old nonfatal errors expire',()=>{
  const h=harness();h.error({error:null,message:'Script error.'});
  h.error({error:new TypeError('private')});h.render();
  assert.equal(h.detail().textContent,'Details: JavaScript / TypeError · join19');
  h.error({error:null,message:'Script error.'});h.error({error:new RangeError('secondary')});h.observe();
  assert.equal(h.detail().textContent,'Details: JavaScript / TypeError · join19');
  const later=harness();later.error({error:new TypeError('old nonfatal')});later.flushTask();
  later.error({error:new RangeError('current fatal')});later.render();
  assert.equal(later.detail().textContent,'Details: JavaScript / RangeError · join19');
});

test('recent promise rejection is separate context and only sanitized source coordinates survive',()=>{
  const h=harness(),error=new Error('private message');error.name='SuspendError';
  error.stack='SuspendError: private\nfunctionWithPrivateName@https://private.example/engine/WebClient.js?auth=private-token:432:100';
  h.reject(error);h.observe();assert.equal(h.panel.hidden,true);assert.equal(h.detail(),undefined);
  h.error({error:new TypeError('secondary reporting error')});h.render();
  assert.equal(h.detail().textContent,'Details: JavaScript / TypeError; earlier promise rejection / SuspendError at WebClient.js:432:100 · join19');
  assert.equal(/private|https:|functionWith/.test(h.message.textContent),false);
  assert.deepEqual(h.logs,[]);
  const noEvent=harness();noEvent.reject(new Error('private'));noEvent.render();
  assert.equal(noEvent.detail().textContent,'Details: no error event captured; earlier promise rejection / Error · join19');
  const stale=harness();stale.reject(new TypeError('old'));stale.advance(60000);stale.render();
  assert.equal(stale.detail().textContent,'Details: no error event captured · join19');
});

test('incidental exceptions do not create fatal UI and a confirmed provider failure opens help without replacing it',()=>{
  const h=harness({gpu:'webgpu'});h.error({error:new RangeError('private')});h.reject(new Error('private'));h.observe();
  assert.equal(h.panel.hidden,true);assert.equal(h.detail(),undefined);assert.equal(h.retry(),undefined);
  assert.equal(h.messages.some(([message])=>message.stage==='failed'||message.stage==='running'),false);
  for(const text of ['Preparing experience…','Failed to load engine. Please reload the page.','A Http error has occurred. (Error Code: 529)']){
    h.render(text);assert.equal(h.message.textContent,text);assert.equal(h.detail(),undefined);assert.equal(h.retry(),undefined);
  }
  assert.equal(h.messages.filter(([message])=>message.stage==='failed'&&message.detail==='engine').length,2,'one report to each approved parent origin');
  assert.deepEqual(h.navigations,[]);
});

test('visible provider error codes open help once while 277 retains its specific recovery cause',()=>{
  const h=harness();h.code.textContent='(Error Code: 529)';h.render('A Http error has occurred.');h.observe();
  assert.equal(h.messages.filter(([message])=>message.stage==='failed'&&message.detail==='engine').length,2);
  assert.equal(h.message.textContent,'A Http error has occurred.');
  const disconnected=harness();disconnected.code.textContent='(Error Code: 277)';disconnected.render('Lost connection');
  assert.equal(disconnected.messages.filter(([message])=>message.stage==='failed'&&message.detail==='connection').length,2);
  assert.equal(disconnected.messages.some(([message])=>message.detail==='engine'),false);
  const hidden=harness();hidden.code.textContent='(Error Code: 529)';hidden.observe();
  assert.equal(hidden.messages.some(([message])=>message.stage==='failed'),false);
});

test('confirmed generic engine failure opens host help once without claiming it is a graphics failure',()=>{
  const h=harness({gpu:'webgpu'});h.render();h.observe();h.observe();
  assert.equal(h.messages.filter(([message])=>message.stage==='failed'&&message.detail==='engine').length,2);
  assert.equal(h.messages.some(([message])=>message.detail==='graphics-init'||message.detail==='graphics-device-lost'),false);
  assert.deepEqual(h.navigations,[]);
});

test('a lost adopted ready transport opens recovery after gameplay without relying on a loading panel',()=>{
  const h=harness({gpu:'webgl'});
  h.loading.hidden=true;h.observe();
  assert.equal(h.messages.filter(([message])=>message.stage==='running').length,2);
  assert.equal(h.panel.hidden,true);
  h.scope.__kkeepRuntime.connection('transport-lost','WebTransportError');
  const failures=h.messages.filter(([message])=>message.stage==='failed');
  assert.equal(failures.length,2,'one failure notification per approved parent');
  for(const [message] of failures)assert.deepEqual(JSON.parse(JSON.stringify(message)),{
    type:'kkeep:roblox-runtime',stage:'failed',detail:'transport-lost',gpu:'webgl',
  });
  assert.equal(h.messages.filter(([message])=>message.stage==='transport-lost'&&message.detail==='WebTransportError').length,2);
  const visible=h.scope.document.getElementById('kkeep-runtime-message').textContent;
  assert.match(visible,/game connection ended unexpectedly/);
  assert.doesNotMatch(visible,/277/,'a transport event does not invent a native error code');
  assert.deepEqual(h.navigations,[],'the host owns bounded fresh-game recovery');
  assert.deepEqual(h.requests,[]);
});

test('transport startup, candidate, stream and close advisories remain nonfatal',()=>{
  for(const stage of ['transport-unavailable','transport-constructor','transport-connecting','transport-native',
    'transport-relay','transport-ready','transport-handshake','transport-closed','transport-stream',
    'transport-stream-ready','transport-datagram','transport-lost-extra']){
    const h=harness();h.loading.hidden=true;h.observe();
    h.scope.__kkeepRuntime.connection(stage,'WebTransportError');
    assert.equal(h.messages.some(([message])=>message.stage==='failed'),false,stage);
    assert.equal(h.count('kkeep-runtime-error'),0,stage);
  }
});

test('transport loss is terminal once and a later loading observation cannot claim running',()=>{
  const h=harness();
  h.scope.__kkeepRuntime.connection('transport-lost','NetworkError');
  h.scope.__kkeepRuntime.connection('transport-lost','WebTransportError');
  h.loading.hidden=true;h.observe();h.observe();
  assert.equal(h.messages.filter(([message])=>message.stage==='failed').length,2);
  assert.equal(h.count('kkeep-runtime-error'),1);
  assert.equal(h.messages.some(([message])=>message.stage==='running'),false);
});

test('intentional game exit and discarded pages cannot trigger transport recovery',()=>{
  for(const reason of ['game-closed','pagehide']){
    const h=harness();
    if(reason==='game-closed')h.scope.__kkeepRuntime.engineOutput('[LIFECYCLE] ugcGameWillClose');
    else h.dispatch('pagehide',{persisted:false});
    h.scope.__kkeepRuntime.connection('transport-lost','WebTransportError');
    h.dispatch('pageshow',{persisted:true});
    assert.equal(h.messages.some(([message])=>message.stage==='failed'),false,reason);
    assert.equal(h.count('kkeep-runtime-error'),0,reason);
  }
});

test('BFCache defers an observed transport loss until restoration and reports it only once',()=>{
  for(const whileHidden of [false,true]){
    const h=harness();h.dispatch('pagehide',{persisted:true});
    if(whileHidden)h.scope.__kkeepRuntime.connection('transport-lost','WebTransportError');
    assert.equal(h.messages.some(([message])=>message.stage==='failed'),false);
    h.dispatch('pageshow',{persisted:true});
    if(!whileHidden)h.scope.__kkeepRuntime.connection('transport-lost','WebTransportError');
    h.dispatch('pageshow',{persisted:true});
    assert.equal(h.messages.filter(([message])=>message.stage==='failed'&&message.detail==='transport-lost').length,2);
  }
  const suspended=harness();suspended.dispatch('pagehide',{persisted:true});suspended.dispatch('pageshow',{persisted:true});
  assert.equal(suspended.messages.some(([message])=>message.stage==='failed'),false,'suspension by itself is not a failure');
});

test('BFCache restoration drops a pending loss when the game closes or document is discarded',()=>{
  for(const reason of ['game-closed','discarded']){
    const h=harness();h.dispatch('pagehide',{persisted:true});
    h.scope.__kkeepRuntime.connection('transport-lost','WebTransportError');
    if(reason==='game-closed')h.scope.__kkeepRuntime.engineOutput('[LIFECYCLE] ugcGameWillClose');
    else h.dispatch('pagehide',{persisted:false});
    h.dispatch('pageshow',{persisted:true});
    assert.equal(h.messages.some(([message])=>message.stage==='failed'),false,reason);
  }
});

test('a replacement transport invalidates an older deferred BFCache loss without resetting terminal failures',()=>{
  for(const replacementFails of [false,true]){
    const h=harness();h.dispatch('pagehide',{persisted:true});
    h.scope.__kkeepRuntime.connection('transport-lost','WebTransportError');
    h.scope.__kkeepRuntime.connection('transport-connecting','');
    if(replacementFails){
      h.scope.__kkeepRuntime.connection('transport-lost','NetworkError');
      h.scope.__kkeepRuntime.connection('transport-lost','NetworkError');
    }
    h.dispatch('pageshow',{persisted:true});h.dispatch('pageshow',{persisted:true});
    assert.equal(h.messages.filter(([message])=>message.stage==='failed').length,replacementFails?2:0);
    assert.deepEqual(h.navigations,[]);
  }
  const reported=harness();
  reported.scope.__kkeepRuntime.connection('transport-lost','WebTransportError');
  reported.scope.__kkeepRuntime.connection('transport-connecting','');
  reported.scope.__kkeepRuntime.connection('transport-ready','');
  reported.scope.__kkeepRuntime.connection('transport-lost','NetworkError');
  reported.loading.hidden=true;reported.observe();
  assert.equal(reported.messages.filter(([message])=>message.stage==='failed').length,2);
  assert.equal(reported.messages.some(([message])=>message.stage==='running'),false);
  assert.equal(reported.count('kkeep-runtime-error'),1);
});

test('a transport loss preserves definitive failures but can clarify a generic engine failure',()=>{
  for(const prior of ['connection','download','memory','jspi','isolation','compile','instantiate','graphics-init','graphics-device-lost']){
    const h=harness();h.scope.__kkeepRuntime.fail(prior);
    const original=h.scope.document.getElementById('kkeep-runtime-message').textContent;
    h.scope.__kkeepRuntime.connection('transport-lost','WebTransportError');
    assert.equal(h.messages.filter(([message])=>message.stage==='failed').length,2,prior);
    assert.equal(h.scope.document.getElementById('kkeep-runtime-message').textContent,original,prior);
  }
  const generic=harness();generic.render();
  generic.scope.__kkeepRuntime.connection('transport-lost','WebTransportError');
  generic.scope.__kkeepRuntime.connection('transport-lost','WebTransportError');
  assert.equal(generic.messages.filter(([message])=>message.stage==='failed'&&message.detail==='engine').length,2);
  assert.equal(generic.messages.filter(([message])=>message.stage==='failed'&&message.detail==='transport-lost').length,2);
});

test('a definitive graphics loss wins over a pending transport loss on BFCache restoration',async()=>{
  const h=harness({gpu:'webgpu'});let lose;
  h.scope.__kkeepRuntime.graphicsDevice({lost:new Promise(resolve=>{lose=resolve;})});
  h.dispatch('pagehide',{persisted:true});
  h.scope.__kkeepRuntime.connection('transport-lost','WebTransportError');
  lose({reason:'unknown'});await Promise.resolve();
  h.dispatch('pageshow',{persisted:true});
  const failures=h.messages.filter(([message])=>message.stage==='failed');
  assert.equal(failures.length,2);assert.equal(failures[0][0].detail,'graphics-device-lost');
});

test('actual WebGPU startup failure reports a bounded authoritative graphics cause once',()=>{
  const h=harness({gpu:'webgl'});
  h.scope.__kkeepRuntime.graphicsFailure('untrusted-private-value');
  assert.equal(h.messages.some(([message])=>message.stage==='failed'),false);
  h.scope.__kkeepRuntime.graphicsFailure('graphics-init');
  h.scope.__kkeepRuntime.graphicsFailure('graphics-init');h.render();
  const failures=h.messages.filter(([message])=>message.stage==='failed');
  assert.equal(failures.length,2);
  for(const [message] of failures)assert.deepEqual(JSON.parse(JSON.stringify(message)),{type:'kkeep:roblox-runtime',stage:'failed',detail:'graphics-init',gpu:'webgpu'});
  assert.equal(JSON.stringify(h.messages).includes('private'),false);
  assert.deepEqual(h.navigations,[],'the host owns bounded fresh-launch recovery');
});

test('unexpected loss of the selected graphics device reports once and preserves raw device info locally',async()=>{
  const h=harness({gpu:'webgpu'});let lose;
  const device={lost:new Promise(resolve=>{lose=resolve;})};
  h.scope.__kkeepRuntime.graphicsDevice(device);h.scope.__kkeepRuntime.graphicsDevice(device);
  lose({reason:'unknown',message:'private device message'});await Promise.resolve();
  const failures=h.messages.filter(([message])=>message.stage==='failed');
  assert.equal(failures.length,2);assert.equal(failures[0][0].detail,'graphics-device-lost');
  assert.equal(failures[0][0].gpu,'webgpu');
  assert.equal(JSON.stringify(h.messages).includes('private'),false);
});

test('intentional destruction, leaving and a replaced device cannot trigger graphics recovery',async()=>{
  for(const reason of ['destroyed','pagehide','game-closed','replaced']){
    const h=harness({gpu:'webgpu'});let lose;
    h.scope.__kkeepRuntime.graphicsDevice({lost:new Promise(resolve=>{lose=resolve;})});
    if(reason==='pagehide')h.dispatch('pagehide',{persisted:false});
    if(reason==='game-closed')h.scope.__kkeepRuntime.engineOutput('[LIFECYCLE] ugcGameWillClose');
    if(reason==='replaced')h.scope.__kkeepRuntime.graphicsDevice({lost:new Promise(()=>{})});
    lose({reason:reason==='destroyed'?'destroyed':'unknown'});await Promise.resolve();
    assert.equal(h.messages.some(([message])=>message.stage==='failed'),false,reason);
  }
});

test('BFCache restoration resumes graphics recovery and reports a hidden loss only after restoration',async()=>{
  for(const lossWhileHidden of [false,true]){
    const h=harness({gpu:'webgpu'});let lose;
    h.scope.__kkeepRuntime.graphicsDevice({lost:new Promise(resolve=>{lose=resolve;})});
    h.dispatch('pagehide',{persisted:true});
    if(lossWhileHidden){lose({reason:'unknown'});await Promise.resolve();}
    assert.equal(h.messages.some(([message])=>message.stage==='failed'),false,'hidden pages do not start host recovery');
    h.dispatch('pageshow',{persisted:true});
    if(!lossWhileHidden){lose({reason:'unknown'});await Promise.resolve();}
    h.dispatch('pageshow',{persisted:true});
    assert.equal(h.messages.filter(([message])=>message.stage==='failed'&&message.detail==='graphics-device-lost').length,2,'one loss report per target');
  }
});

test('BFCache restoration does not revive a closed game, discarded page or obsolete lost device',async()=>{
  for(const ended of ['native-exit','discarded','replaced']){
    const h=harness({gpu:'webgpu'});let lose;
    h.scope.__kkeepRuntime.graphicsDevice({lost:new Promise(resolve=>{lose=resolve;})});
    h.dispatch('pagehide',{persisted:ended!=='discarded'});
    lose({reason:'unknown'});await Promise.resolve();
    if(ended==='native-exit')h.scope.__kkeepRuntime.engineOutput('[LIFECYCLE] ugcGameWillClose');
    if(ended==='replaced')h.scope.__kkeepRuntime.graphicsDevice({lost:new Promise(()=>{})});
    h.dispatch('pageshow',{persisted:true});
    assert.equal(h.messages.some(([message])=>message.stage==='failed'),false,ended);
  }
});

test('a concrete graphics failure upgrades a generic fatal cause once but preserves definitive failures',async()=>{
  for(const graphicsCause of ['graphics-init','graphics-device-lost']){
    const h=harness({gpu:'webgpu'});let lose;
    h.scope.__kkeepRuntime.graphicsDevice({lost:new Promise(resolve=>{lose=resolve;})});
    h.render();
    if(graphicsCause==='graphics-init')h.scope.__kkeepRuntime.graphicsFailure(graphicsCause);
    else{lose({reason:'unknown'});await Promise.resolve();}
    h.scope.__kkeepRuntime.graphicsFailure(graphicsCause);h.observe();
    const failures=h.messages.filter(([message])=>message.stage==='failed');
    assert.equal(failures.filter(([message])=>message.detail==='engine').length,2);
    assert.equal(failures.filter(([message])=>message.detail===graphicsCause).length,2);
  }
  for(const prior of ['connection','download','memory','jspi']){
    const h=harness({gpu:'webgpu'});
    h.scope.__kkeepRuntime.fail(prior);
    h.scope.__kkeepRuntime.graphicsFailure('graphics-init');
    assert.equal(h.messages.filter(([message])=>message.stage==='failed').length,2,prior);
    assert.equal(h.messages.some(([message])=>message.detail==='graphics-init'),false,prior);
  }
});

test('compatibility retry is manual, preserves the experience and removes credentials and old joins',()=>{
  const href='https://runtime.example/_/cGxheS5yb2Jsb3guY29t/games/start?placeId=123&perf=balanced&fps=45&res=low&gpu=webgpu&jobId=private-job&ticket=private-ticket&auth=private-auth&session=private-session#private-hash';
  const h=harness({gpu:'webgpu',href});h.error({error:new TypeError('private')});h.render();
  assert.equal(h.retry().textContent,'Try compatibility mode');
  assert.ok(h.compatibility().textContent.includes('Restart this experience using compatibility graphics.'));
  assert.deepEqual(h.navigations,[]);
  h.observe();assert.equal(h.count('kkeep-engine-compatibility'),1);assert.equal(h.count('kkeep-engine-compatibility-retry'),1);
  assert.ok(h.panel.contains(h.leave));h.leave.onclick();assert.equal(h.leaveCount(),1);
  h.retry().onclick();assert.equal(h.navigations.length,1);
  const next=new URL(h.navigations[0]);
  assert.equal(next.origin,new URL(href).origin);assert.equal(next.pathname,new URL(href).pathname);assert.equal(next.hash,'');
  assert.deepEqual([...next.searchParams],[['placeId','123'],['perf','balanced'],['fps','45'],['res','low'],['gpu','webgl']]);
  assert.equal(h.retry().disabled,true);
  assert.equal(/private/.test(next.href),false);
});

test('compatibility retry offers only a valid mobile WebGPU experience and preserves valid preferences',()=>{
  for(const options of [{gpu:'webgl'},{gpu:'webgpu',desktop:true},{gpu:'unknown'},{},
    {gpu:'webgpu',href:'https://runtime.example/_rbx/app/?placeId=123'},
    {gpu:'webgpu',href:'https://runtime.example/games/start?placeId=not-a-game'},
    {gpu:'webgpu',href:'https://runtime.example/games/start?placeId=9007199254740993'}]){
    const h=harness(options);h.render();assert.equal(h.retry(),undefined);assert.deepEqual(h.navigations,[]);
  }
  const invalid=harness({gpu:'webgpu',href:'https://runtime.example/games/start?placeId=456&perf=private&fps=999&res=private&token=private'});
  invalid.render();invalid.retry().onclick();
  assert.deepEqual([...new URL(invalid.navigations[0]).searchParams],[['placeId','456'],['gpu','webgl']]);
});

test('graphics recovery retains an explicit relay launch and reports only a validated graphics enum',()=>{
  const h=harness({gpu:'webgpu',href:'https://runtime.example/games/start?placeId=123&wt=relay&ticket=private'});
  h.render();h.retry().onclick();
  const url=new URL(h.navigations[0]);
  assert.equal(url.searchParams.get('gpu'),'webgl');
  assert.equal(url.searchParams.get('wt'),'relay');
  assert.equal(url.searchParams.has('ticket'),false);
  h.scope.__rbxPerf.gpu='webgl';
  h.scope.__kkeepRuntime.connection('transport-relay','');
  for(const [message] of h.messages.filter(([message])=>message.stage==='transport-relay')){
    assert.equal(message.gpu,'webgl');
    assert.deepEqual(Object.keys(message).sort(),['detail','gpu','stage','type']);
  }
  h.scope.__rbxPerf.gpu='private-unknown';
  h.scope.__kkeepRuntime.connection('transport-closed','NetworkError');
  assert.equal(h.messages.at(-1)[0].gpu,undefined);
});

test('diagnostic and compatibility controls are removed when the provider hides or replaces its fatal panel',()=>{
  const h=harness({gpu:'webgpu'});h.error({error:new TypeError('private')});h.render();assert.ok(h.detail());assert.ok(h.retry());
  h.scope.__rbxPerf.gpu='webgl';h.observe();assert.equal(h.retry(),undefined);assert.ok(h.detail());
  h.scope.__rbxPerf.gpu='webgpu';h.observe();assert.ok(h.retry());
  h.panel.hidden=true;h.observe();assert.equal(h.detail(),undefined);assert.equal(h.retry(),undefined);
  h.render();assert.ok(h.detail());assert.ok(h.retry());
  h.loading.hidden=true;h.observe();assert.equal(h.detail(),undefined);assert.equal(h.retry(),undefined);
  h.loading.hidden=false;h.render();assert.ok(h.detail());
  h.message.textContent='Preparing experience…';h.observe();assert.equal(h.detail(),undefined);assert.equal(h.retry(),undefined);
  assert.equal(h.message.textContent,'Preparing experience…');assert.ok(h.panel.contains(h.leave));
});
