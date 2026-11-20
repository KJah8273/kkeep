import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {transformText} from '../worker/gateway.js';

const origin='https://runtime.example';
const base='/_/c2V0dXAucmJ4Y2RuLmNvbQ/webclient/version-1ef59424f70d4932-RobloxWebClient/';
const path=base+'WasmPlayer.js';
const original=readFileSync(new URL('./fixtures/WasmPlayer-1ef.js',import.meta.url),'utf8');
const engine=readFileSync(new URL('./fixtures/WebClient-1ef.js',import.meta.url),'utf8');
const generic='Roblox encountered a problem. Check the console and reload.';

// Execute the actual provider loading-screen class and its engine callbacks.
// The DOM and frame clock are small stand-ins; no copied loading logic.
function harness({patched=true}={}) {
  const code=patched?transformText(original,path,origin):original;
  const frames=new Map(),timers=new Map(),logs=[],navigations=[],messages=[];
  let nextId=0,closed=0;
  class Element {
    constructor() {
      this.hidden=false;this.style={};this.textContent='';this.attributes=new Map();this.listeners=new Map();
      const classes=new Set();
      this.classList={add:(...names)=>names.forEach(name=>classes.add(name)),
        remove:(...names)=>names.forEach(name=>classes.delete(name)),contains:name=>classes.has(name),
        toggle:(name,on)=>on?classes.add(name):classes.delete(name)};
    }
    addEventListener(type,listener){this.listeners.set(type,listener);}
    setAttribute(name,value){this.attributes.set(name,value);}
    removeAttribute(name){this.attributes.delete(name);}
  }
  const nodes=new Map(['loading-overlay','loading-experience-title','status','loading-error-title',
    'loading-error-message','loading-error-code','loading-error-leave','loading-cancel'].map(id=>[id,new Element()]));
  const panel=new Element();panel.hidden=true;
  const location=new URL(origin+'/_/cGxheS5yb2Jsb3guY29t/games/start?placeId=123');
  location.replace=url=>navigations.push(url);
  const scope={URL,URLSearchParams,AbortController,location,
    document:{getElementById:id=>nodes.get(id)||null,querySelector:selector=>selector==='.loading-error-panel'?panel:null},
    console:{error:(...args)=>logs.push(args)},
    requestAnimationFrame:callback=>{const id=++nextId;frames.set(id,callback);return id;},
    cancelAnimationFrame:id=>frames.delete(id),
    setTimeout:(callback,delay)=>{const id=++nextId;timers.set(id,{callback,delay});return id;},
    clearTimeout:id=>timers.delete(id),close:()=>closed++,parent:{postMessage:value=>messages.push(value)},
    s:{setStatus(){}}};
  scope.window=scope;
  const classStart=code.indexOf('var ae=class'),classEnd=code.indexOf('var ve=',classStart);
  const constantsStart=code.indexOf('var be='),constantsEnd=code.indexOf('function xe(',constantsStart);
  const handlerStart=code.indexOf('window.onerror='),handlerEnd=code.indexOf(',window.Module=s;',handlerStart);
  const statusStart=code.indexOf('window.__onEngineLoadingStatus='),statusEnd=code.indexOf(';function _e()',statusStart);
  const loaded='window.__onDefaultLoadingScreenRemoved=()=>f.dismissAfterRenderedFrame();';
  assert.ok(classStart>0&&classEnd>classStart&&constantsStart>0&&constantsEnd>constantsStart);
  assert.ok(handlerStart>0&&handlerEnd>handlerStart&&statusStart>0&&statusEnd>statusStart&&code.includes(loaded));
  vm.createContext(scope);
  vm.runInContext(code.slice(constantsStart,constantsEnd)+code.slice(classStart,classEnd)+
    ';this.f=new ae();'+code.slice(handlerStart,handlerEnd)+';'+code.slice(statusStart,statusEnd)+';'+loaded,scope);
  const root=nodes.get('loading-overlay');
  scope.f.prepare(123);
  const advanceFrames=()=>{const queued=[...frames.values()];frames.clear();queued.forEach(callback=>callback());};
  const finish=()=>{
    for(let i=0;frames.size&&i<5;i++)advanceFrames();
    assert.equal(frames.size,0);
    const queued=[...timers.values()];timers.clear();queued.forEach(({callback})=>callback());
  };
  return {scope,root,panel,nodes,frames,timers,logs,navigations,messages,advanceFrames,finish,
    loaded:()=>scope.__onDefaultLoadingScreenRemoved(),
    failure:value=>scope.__onEngineLoadingStatus({kind:'failure',...value}),
    error:(source,error)=>scope.onerror('private exception details',source,42,7,error),
    closed:()=>closed};
}

function assertVisibleFailure(h,message) {
  assert.equal(h.root.hidden,false);
  assert.equal(h.root.style.display,'');
  assert.equal(h.root.classList.contains('loading-exiting'),false);
  assert.equal(h.root.classList.contains('loading-failed'),true);
  assert.equal(h.panel.hidden,false);
  assert.equal(h.nodes.get('loading-error-message').textContent,message);
  assert.equal(h.scope.f.hiddenAfterSuccess,false);
  assert.equal(h.frames.size,0);
  assert.equal(h.timers.size,0);
  assert.deepEqual(h.navigations,[]);
}

function installFrameLoop(h,iteration,{patched=true}={}) {
  const code=patched?transformText(engine,base+'WebClient.js',origin):engine;
  const start=code.indexOf('function la(){'),end=code.indexOf('la.sig="v";',start);
  assert.ok(start>0&&end>start,'execute the actual current main-loop function');
  const recorded=[],reported=[],events=[];let sent=0,clock=10;
  const module={_main_loop_iteration:iteration,reportEngineError:error=>reported.push(error)};
  const loadingStatus=h.scope.__onEngineLoadingStatus;
  h.scope.__onEngineLoadingStatus=value=>{events.push(value);loadingStatus(value);};
  Object.assign(h.scope,{Module:module,__kkeepRuntime:{engineError:error=>recorded.push(error)},
    performance:{now:()=>clock+=2},MessageChannel:class {
      constructor(){this.port1={onmessage:null};this.port2={postMessage:()=>sent++};}
    }});
  vm.runInContext('(function(f){'+code.slice(start,end)+';la();})(Module);',h.scope);
  return {module,recorded,reported,events,sent:()=>sent,run:()=>module._mainLoopChan.port1.onmessage()};
}

test('actual provider reproduces the hidden post-join failure before transformation',()=>{
  const h=harness({patched:false});h.loaded();h.finish();
  assert.equal(h.root.hidden,true);assert.equal(h.scope.f.hiddenAfterSuccess,true);
  h.error(origin+base+'WebClient.js',new TypeError('private'));
  h.failure({source:'gui-service',message:'Disconnected',errorCode:277});
  assert.equal(h.root.hidden,true);assert.equal(h.root.style.display,'none');
  assert.equal(h.panel.hidden,true);assert.equal(h.nodes.get('loading-error-message').textContent,'');
});

test('an actual engine-reported failure reopens its panel after successful loading',()=>{
  const h=harness();h.loaded();h.finish();
  assert.equal(h.root.hidden,true);
  h.failure({source:'gui-service',message:'Disconnected',errorCode:277});
  assertVisibleFailure(h,'Disconnected');
  assert.equal(h.nodes.get('loading-error-code').textContent,'(Error Code: 277)');
  h.finish();assertVisibleFailure(h,'Disconnected');
});

test('qualified post-join engine exceptions reveal the existing panel without private details',()=>{
  for(const source of [origin+base+'WebClient.js?ticket=private#private',origin+base+'WasmPlayer.js',
    origin+'/assets/webclient/stub.js?src=private',origin+'/'+('a'.repeat(40))+'/assets/webclient/stub.js#private']){
    const h=harness();h.loaded();h.finish();
    h.error(source,new TypeError('private account or join details'));
    assertVisibleFailure(h,generic);
    assert.equal(h.nodes.get('loading-error-title').textContent,'Error');
    assert.equal(h.nodes.get('loading-error-code').textContent,'');
    assert.deepEqual(h.logs,[]);assert.deepEqual(h.messages,[]);
  }
});

test('the actual engine worker ErrorEvent rethrow retains its qualified nested source',()=>{
  const source=engine.match(/e\.onerror=(i=>\{var o="worker sent an error!";throw X\(`[^`]+`\),i\})/)?.[1];
  assert.ok(source);
  const rethrow=vm.runInNewContext('('+source+')',{X(){}});
  const nested=vm.runInNewContext('({type:"error",message:"private",filename:'+JSON.stringify(origin+base+'WebClient.js?ticket=private')+'})');
  let thrown;try{rethrow(nested);}catch(error){thrown=error;}
  assert.equal(thrown,nested);
  const h=harness();h.loaded();h.finish();h.error('',thrown);
  assertVisibleFailure(h,generic);assert.deepEqual(h.logs,[]);assert.deepEqual(h.messages,[]);
});

test('the actual original frame-loop catch leaves a completed scene hidden after a rejected frame',async()=>{
  const h=harness();h.loaded();h.finish();
  const error=new TypeError('private frame details');
  const loop=installFrameLoop(h,async()=>{throw error;},{patched:false});
  await loop.run();
  assert.equal(h.root.hidden,true);assert.equal(h.panel.hidden,true);
  assert.deepEqual(loop.reported,[error]);assert.deepEqual(loop.recorded,[]);
  assert.equal(loop.sent(),2,'the original loop keeps scheduling despite its error');
});

test('the actual caught frame failure surfaces once without changing engine reporting or scheduling',async()=>{
  const h=harness();h.loaded();h.finish();
  const error=new WebAssembly.RuntimeError('private join and account details');
  const loop=installFrameLoop(h,async()=>{throw error;});
  await loop.run();assertVisibleFailure(h,generic);
  assert.deepEqual(loop.recorded,[error],'only the local sanitizer receives the Error object');
  assert.deepEqual(loop.reported,[error],'preserve the existing engine crash reporter');
  assert.equal(loop.sent(),2);
  await loop.run();assertVisibleFailure(h,generic);
  assert.equal(loop.recorded.length,1);assert.equal(loop.events.length,1);
  assert.deepEqual(JSON.parse(JSON.stringify(loop.events)),[{kind:'failure',source:'browser',message:generic,errorCode:null,statusCode:null}]);
  assert.equal(loop.reported.length,2);assert.equal(loop.sent(),3);
  assert.deepEqual(h.messages,[]);assert.deepEqual(h.navigations,[]);
});

test('a normally suspended iteration is awaited and resumes its existing frame schedule',async()=>{
  const h=harness();h.loaded();h.finish();
  let resume;const pending=new Promise(resolve=>{resume=resolve;});
  const loop=installFrameLoop(h,()=>pending),running=loop.run();
  await Promise.resolve();assert.equal(loop.sent(),1);
  assert.equal(h.root.hidden,true);assert.deepEqual(loop.recorded,[]);
  resume();await running;
  assert.equal(loop.sent(),2);assert.equal(h.root.hidden,true);
  assert.deepEqual(loop.recorded,[]);assert.deepEqual(loop.reported,[]);
});

test('normal native JSPI suspension is not promoted to a frame failure',{
  skip:typeof WebAssembly.Suspending!=='function'||typeof WebAssembly.promising!=='function'
},async()=>{
  const bytes=new Uint8Array([0,97,115,109,1,0,0,0,1,4,1,96,0,0,2,13,1,3,101,110,118,5,121,105,101,108,100,0,0,3,2,1,0,7,7,1,3,114,117,110,0,1,10,6,1,4,0,16,0,11]);
  let resume;const pending=new Promise(resolve=>{resume=resolve;});
  const {instance}=await WebAssembly.instantiate(bytes,{env:{yield:new WebAssembly.Suspending(()=>pending)}});
  const h=harness();h.loaded();h.finish();
  const loop=installFrameLoop(h,WebAssembly.promising(instance.exports.run)),running=loop.run();
  await Promise.resolve();assert.equal(loop.sent(),1);assert.deepEqual(loop.recorded,[]);
  resume();await running;assert.equal(loop.sent(),2);assert.equal(h.root.hidden,true);
  assert.deepEqual(loop.recorded,[]);assert.deepEqual(loop.reported,[]);
});

test('actual Emscripten unwind and ExitStatus plus intentional cancellation keep their existing behavior',async()=>{
  const declaration=engine.match(/class hn\{constructor\(r\)\{gr\(this,"name","ExitStatus"\);[\s\S]*?\}\}/)?.[0];
  assert.ok(declaration,'use the actual engine ExitStatus class');
  const exit=vm.runInNewContext('const gr=(object,key,value)=>object[key]=value;'+declaration+';new hn(0)');
  for(const value of ['unwind',exit,new DOMException('Cancelled','AbortError')]){
    const h=harness();h.loaded();h.finish();
    const loop=installFrameLoop(h,async()=>{throw value;});await loop.run();
    assert.equal(h.root.hidden,true);assert.equal(h.panel.hidden,true);
    assert.deepEqual(loop.recorded,[]);assert.deepEqual(loop.events,[]);
    assert.deepEqual(loop.reported,[value]);assert.equal(loop.sent(),2);
    assert.equal(loop.module.__kkeepFrameFailureReported,undefined);
  }
});

test('qualified failures cancel both pending rendered-frame callbacks and the dismissal timeout',()=>{
  for(const frames of [0,1,2])for(const kind of ['exception','engine']){
    const h=harness();h.loaded();
    for(let i=0;i<frames;i++)h.advanceFrames();
    assert.ok(h.frames.size||h.timers.size,'a real provider dismissal is pending');
    if(kind==='exception')h.error(origin+base+'WebClient.js',new TypeError('private'));
    else h.failure({source:'gui-service',message:'Disconnected',errorCode:277});
    const message=kind==='exception'?generic:'Disconnected';
    assertVisibleFailure(h,message);h.finish();assertVisibleFailure(h,message);
  }
});

test('unrelated, cross-origin, uninspected and opaque browser errors remain nonfatal after first scene',()=>{
  const cases=[
    [origin+'/analytics.js',new Error('private')],
    [origin+'/hook.js',new Error('private')],
    [origin+'/unrelated/WebClient.js',new Error('private')],
    ['https://other.example'+base+'WebClient.js?ticket=private',new Error('private')],
    [origin+base.replace('1ef59424f70d4932','0000000000000000')+'WebClient.js',new Error('private')],
    ['',null],['blob:'+origin+'/private',new Error('private')],
    ['',{type:'error',message:'private',filename:'https://other.example'+base+'WebClient.js'}],
    ['',{get type(){throw new Error('private getter');}}]
  ];
  for(const [source,error] of cases)for(const finishBeforeError of [false,true]){
    const h=harness();h.loaded();if(finishBeforeError)h.finish();
    const status=h.scope.s.setStatus;h.error(source,error);
    assert.equal(h.scope.s.setStatus,status,'ignored errors must not disrupt engine status');
    h.finish();assert.equal(h.root.hidden,true);assert.equal(h.panel.hidden,true);
    assert.deepEqual(h.logs,[]);assert.deepEqual(h.messages,[]);assert.deepEqual(h.navigations,[]);
  }
});

test('specific engine errors keep their priority over later browser errors and lower-priority engine failures',()=>{
  const h=harness();h.loaded();h.finish();
  h.failure({source:'gui-service',message:'Specific disconnect',errorCode:277});
  const status=h.scope.s.setStatus;
  h.error(origin+base+'WebClient.js',new TypeError('private'));
  h.failure({source:'network',message:'Lower priority',errorCode:529});
  assertVisibleFailure(h,'Specific disconnect');assert.equal(h.scope.s.setStatus,status);
  assert.equal(h.scope.f.failureSourcePriority,3);
});

test('initial browser failures, successful dismissal and the existing Leave action keep their behavior',()=>{
  const startup=harness();startup.error(origin+'/page.js',new Error('private'));
  assertVisibleFailure(startup,generic);
  const success=harness();success.loaded();success.advanceFrames();success.advanceFrames();
  assert.equal(success.root.hidden,false);
  assert.equal([...success.timers.values()][0].delay,600);
  success.finish();assert.equal(success.root.hidden,true);assert.equal(success.root.style.display,'none');
  assert.deepEqual(success.navigations,[]);
  const leaving=harness();leaving.nodes.get('loading-error-leave').listeners.get('click')();
  assert.equal(leaving.closed(),1);assert.deepEqual(leaving.navigations,['about:blank']);
});

test('the verified failure patch refuses changed provider guards or error handlers',()=>{
  for(const marker of ['this.hiddenAfterSuccess||r<this.failureSourcePriority',
    'this.failureSourcePriority=r,this.statusPriority=2,this.dismissed=!1,this.cancelPendingDismissal();',
    'window.onerror=()=>{f.showFailure']){
    assert.throws(()=>transformText(original.replace(marker,'provider-contract-changed'),path,origin),/Engine failure handling changed/);
  }
  assert.throws(()=>transformText(engine.replace('"main_loop_iteration threw"','"changed frame layout"'),base+'WebClient.js',origin),/Engine frame failure handling changed/);
});
