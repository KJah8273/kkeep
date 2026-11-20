import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {transformText} from '../worker/gateway.js';

const origin='https://runtime.example';
const base='/_/c2V0dXAucmJ4Y2RuLmNvbQ/webclient/version-1ef59424f70d4932-RobloxWebClient/';
const player=readFileSync(new URL('./fixtures/WasmPlayer-1ef.js',import.meta.url),'utf8');
const engine=readFileSync(new URL('./fixtures/WebClient-1ef.js',import.meta.url),'utf8');
const pick=(code,start,end)=>{
  const a=code.indexOf(start),b=code.indexOf(end,a);
  assert.ok(a>0&&b>a,`actual provider excerpt: ${start}`);
  return code.slice(a,b);
};

// Run the actual provider loader, native surface configure import, and sole
// presentBrowserFrame import together. Only DOM, GPU objects and clocks are
// stand-ins; the presentation ordering and loader behavior come from fixtures.
function harness({patched=true,configured=true,preinitialized=true,throwsAt='',closeThrows=false,otherSurface=false}={}) {
  const loader=patched?transformText(player,base+'WasmPlayer.js',origin):player;
  const client=patched?transformText(engine,base+'WebClient.js',origin):engine;
  const frames=new Map(),timers=new Map(),calls=[],logs=[],navigation=[];
  let next=0,closed=0;
  class Element {
    constructor(){
      this.hidden=false;this.style={};this.textContent='';this.listeners=new Map();this.attributes=new Map();
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
  const record=(name,...args)=>{
    calls.push({name,args});
    if(throwsAt===name)throw new TypeError('GPU operation failed');
  };
  const sourceTexture={width:800,height:600},canvasTexture={width:1000,height:500};
  const renderBuffer={},copyBuffer={};
  const queue={submit(buffers){record(buffers[0]===renderBuffer?'render-submit':'copy-submit',buffers[0]);},
    onSubmittedWorkDone(){throw new Error('Readiness must not add GPU synchronization calls');}};
  const encoder={copyTextureToTexture(...args){record('copy',...args);},finish(){record('finish');return copyBuffer;}};
  const device={queue,createCommandEncoder(){record('encoder');return encoder;}};
  const canvas={width:0,height:0,getContext(type){record('getContext',type);return context;}};
  const context={canvas:otherSurface?{width:0,height:0}:canvas,configure(config){record('configure',config);},
    getCurrentTexture(){record('getCurrentTexture');return canvasTexture;}};
  const module={canvas,...(preinitialized?{preinitializedWebGPUDevice:device}:{})};
  const objects=new Map([[1,device],[2,sourceTexture],[3,renderBuffer],[4,context]]);
  const heap=new ArrayBuffer(512),m=new Uint32Array(heap),ints=new Int32Array(heap);
  const descriptor=32;
  m[(descriptor+4)>>2]=1;m[(descriptor+8)>>2]=7;m[(descriptor+16)>>2]=18;
  m[(descriptor+24)>>2]=1000;m[(descriptor+28)>>2]=500;m[(descriptor+40)>>2]=1;
  const location=new URL(origin+'/_/cGxheS5yb2Jsb3guY29t/games/start?placeId=123');
  location.replace=value=>navigation.push(value);
  const scope={URL,URLSearchParams,AbortController,location,Module:module,
    document:{getElementById:id=>nodes.get(id)||null,querySelector:s=>s==='.loading-error-panel'?panel:null},
    console:{error:(...args)=>logs.push(args)},
    requestAnimationFrame:callback=>{const id=++next;frames.set(id,callback);return id;},
    cancelAnimationFrame:id=>frames.delete(id),
    setTimeout:(callback,delay)=>{const id=++next;timers.set(id,{callback,delay});return id;},
    clearTimeout:id=>timers.delete(id),close(){closed++;if(closeThrows)throw new Error('intentional leave');},
    s:{setStatus(){}},m,_:ints,
    l:{getJsObject:handle=>objects.get(handle),TextureFormat:{7:'bgra8unorm'},CompositeAlphaMode:{1:'opaque'}}};
  scope.window=scope;vm.createContext(scope);
  const loaded='window.__onDefaultLoadingScreenRemoved=()=>f.dismissAfterRenderedFrame();';
  assert.ok(loader.includes(loaded),'keep the actual native loading-screen callback');
  vm.runInContext(pick(loader,'var be=','function xe(')+pick(loader,'var ae=class','var ve=')+
    ';this.f=new ae();'+pick(loader,'window.onerror=',',window.Module=s;')+';'+
    pick(loader,'window.__onEngineLoadingStatus=',';function _e()')+';'+loaded,scope);
  const native=vm.runInContext('(function(f,l,m,_){'+pick(client,'function y_(e,r){','function C_(e,r){')+
    pick(client,'function Ya(e,r,n){','Ya.sig="viii";')+';return {configure:y_,present:Ya};})(Module,l,m,_)',scope);
  if(configured)native.configure(4,descriptor);
  scope.f.prepare(123);
  const advanceFrames=()=>{const pending=[...frames.values()];frames.clear();pending.forEach(callback=>callback());};
  const finish=()=>{
    for(let i=0;i<5&&frames.size;i++)advanceFrames();
    const pending=[...timers.values()];timers.clear();pending.forEach(({callback})=>callback());
  };
  return {scope,module,native,nodes,panel,calls,logs,navigation,frames,timers,sourceTexture,canvasTexture,renderBuffer,copyBuffer,
    root:nodes.get('loading-overlay'),loaded:()=>scope.__onDefaultLoadingScreenRemoved(),
    present:()=>native.present(1,2,3),configure:()=>native.configure(4,descriptor),advanceFrames,finish,closed:()=>closed,
    failure:()=>scope.__onEngineLoadingStatus({kind:'failure',source:'gui-service',message:'Disconnected',errorCode:277})};
}

test('the original loader hides after page frames without any native presentation',()=>{
  const h=harness({patched:false});h.loaded();h.finish();
  assert.equal(h.root.hidden,true);
  assert.equal(h.calls.some(call=>call.name.endsWith('submit')),false);
});

test('a configured native WebGPU surface waits for a frame after default removal',()=>{
  const h=harness();h.present();h.calls.length=0;h.loaded();
  const waiting=h.module.__kkeepFramePresented;
  assert.equal(typeof waiting,'function');
  assert.equal(h.scope.f.experienceLoaded,true,'retain existing error-priority meaning');
  for(let i=0;i<200;i++)h.finish();
  assert.equal(h.root.hidden,false);assert.equal(h.panel.hidden,true);
  assert.equal(h.frames.size,0);assert.equal(h.timers.size,0);
  assert.equal(h.nodes.get('status').textContent,'Preparing the first game frame…');
  h.loaded();assert.equal(h.module.__kkeepFramePresented,waiting,'repeated native removal does not rearm');
  assert.equal(h.present(),undefined);
  assert.equal(h.module.__kkeepFramePresented,undefined);
  assert.equal(h.frames.size,1);assert.equal(h.timers.size,0);
  h.present();assert.equal(h.frames.size,1,'subsequent frames add no observers, timers or promises');
  h.advanceFrames();assert.equal(h.root.hidden,false);
  h.advanceFrames();assert.equal([...h.timers.values()][0].delay,600);
  h.finish();assert.equal(h.root.hidden,true);
});

test('the actual native bridge retains GPU call order, buffers, copy bounds and return value',()=>{
  const h=harness();h.loaded();h.calls.length=0;h.present();
  assert.deepEqual(h.calls.map(call=>call.name),['getContext','encoder','getCurrentTexture','copy','finish','render-submit','copy-submit']);
  assert.equal(h.calls[0].args[0],'webgpu');
  assert.equal(h.calls[3].args[0].texture,h.sourceTexture);assert.equal(h.calls[3].args[1].texture,h.canvasTexture);
  assert.deepEqual(Array.from(h.calls[3].args[2]),[800,500,1]);
  assert.equal(h.calls[5].args[0],h.renderBuffer);assert.equal(h.calls[6].args[0],h.copyBuffer);
  assert.deepEqual(h.logs,[]);assert.deepEqual(h.navigation,[]);
  h.module.__kkeepFramePresented=()=>{throw new Error('optional UI failed');};
  assert.doesNotThrow(()=>h.present(),'optional UI failure cannot interrupt the native frame');
});

test('failed acquisition, copy, encoding or either submit never signals presentation',()=>{
  for(const throwsAt of ['getCurrentTexture','copy','finish','render-submit','copy-submit']){
    const h=harness({throwsAt});h.loaded();const waiting=h.module.__kkeepFramePresented;
    assert.throws(()=>h.present(),/GPU operation failed/);
    assert.equal(h.module.__kkeepFramePresented,waiting);
    assert.equal(h.frames.size,0);assert.equal(h.timers.size,0);assert.equal(h.root.hidden,false);
  }
});

test('renderer selection uses successful native configure, not preference or a preinitialized device',()=>{
  const fallback=harness({configured:false});fallback.scope.__rbxPerf={gpu:'webgpu'};
  fallback.loaded();fallback.finish();assert.equal(fallback.root.hidden,true);
  assert.equal(fallback.module.__kkeepFramePresented,undefined);
  const native=harness({preinitialized:false});native.scope.__rbxPerf={gpu:'webgl'};
  native.loaded();native.finish();assert.equal(native.root.hidden,false);
  native.present();native.finish();assert.equal(native.root.hidden,true);
  const failed=harness({configured:false,throwsAt:'configure'});
  assert.throws(()=>failed.configure(),/GPU operation failed/);
  assert.equal(failed.module.__kkeepWebGPUPresentConfigured,undefined);
  failed.loaded();failed.finish();assert.equal(failed.root.hidden,true);
  const other=harness({otherSurface:true});
  assert.equal(other.module.__kkeepWebGPUPresentConfigured,undefined);
  other.loaded();other.finish();assert.equal(other.root.hidden,true);
});

test('accepted engine failures cancel the pending native signal and every dismissal stage',()=>{
  for(const submitted of [false,true])for(const browserFrames of [0,1,2]){
    const h=harness();h.loaded();const old=h.module.__kkeepFramePresented;
    if(submitted)h.present();
    for(let i=0;i<browserFrames;i++)h.advanceFrames();
    h.failure();old();h.present();h.finish();
    assert.equal(h.module.__kkeepFramePresented,undefined);
    assert.equal(h.root.hidden,false);assert.equal(h.panel.hidden,false);
    assert.equal(h.nodes.get('loading-error-message').textContent,'Disconnected');
    assert.equal(h.frames.size,0);assert.equal(h.timers.size,0);
  }
});

test('qualified browser failure still cancels loading while unrelated errors retain their existing meaning',()=>{
  const qualified=harness();qualified.loaded();
  qualified.scope.onerror('private',origin+base+'WebClient.js',1,1,new TypeError('private'));
  qualified.present();qualified.finish();
  assert.equal(qualified.module.__kkeepFramePresented,undefined);
  assert.equal(qualified.root.hidden,false);assert.equal(qualified.panel.hidden,false);
  const unrelated=harness();unrelated.loaded();const waiting=unrelated.module.__kkeepFramePresented;
  unrelated.scope.onerror('private',origin+'/analytics.js',1,1,new TypeError('private'));
  assert.equal(unrelated.module.__kkeepFramePresented,waiting);
  unrelated.present();unrelated.finish();assert.equal(unrelated.root.hidden,true);
});

test('prepare cancels an older arm and a stale callback cannot satisfy the new load',()=>{
  const h=harness();h.loaded();const stale=h.module.__kkeepFramePresented;
  h.scope.f.prepare(456);assert.equal(h.module.__kkeepFramePresented,undefined);
  h.loaded();const current=h.module.__kkeepFramePresented;
  assert.notEqual(current,stale);stale();h.finish();
  assert.equal(h.module.__kkeepFramePresented,current);assert.equal(h.root.hidden,false);
  h.present();h.finish();assert.equal(h.root.hidden,true);
});

test('Leave and Cancel cancel the native arm before the provider closes or navigates',()=>{
  for(const id of ['loading-cancel','loading-error-leave'])for(const closeThrows of [false,true]){
    const h=harness({closeThrows});h.loaded();const stale=h.module.__kkeepFramePresented;
    const leave=()=>h.nodes.get(id).listeners.get('click')();
    if(closeThrows)assert.throws(leave,/intentional leave/);else leave();
    assert.equal(h.module.__kkeepFramePresented,undefined);assert.equal(h.closed(),1);
    stale();h.present();h.finish();assert.equal(h.root.hidden,false);
    assert.deepEqual(h.navigation,closeThrows?[]:['about:blank']);
  }
});

test('explicit native-exit dismissal cancels an arm and keeps its original fade',()=>{
  const h=harness();h.loaded();const stale=h.module.__kkeepFramePresented;
  h.scope.f.dismiss();assert.equal(h.module.__kkeepFramePresented,undefined);
  stale();assert.equal(h.frames.size,0);assert.equal([...h.timers.values()][0].delay,600);
  h.finish();assert.equal(h.root.hidden,true);
});

test('the verified source contracts fail closed if either provider boundary changes',()=>{
  for(const marker of ['dismissAfterRenderedFrame(){','cancelPendingDismissal(){',
    'let t=()=>{window.close(),window.location.replace("about:blank")}']){
    assert.throws(()=>transformText(player.replace(marker,'changed-provider-contract'),base+'WasmPlayer.js',origin),
      /Engine presentation loading contract changed/);
  }
  for(const marker of ['function Ya(e,r,n){','}n.configure(a)}function C_(e,r){']){
    assert.throws(()=>transformText(engine.replace(marker,'changed-provider-contract'),base+'WebClient.js',origin),
      /Engine native presentation contract changed/);
  }
  const duplicate=engine+pick(engine,'function Ya(e,r,n){','Ya.sig="viii";');
  assert.throws(()=>transformText(duplicate,base+'WebClient.js',origin),/Engine native presentation contract changed/);
});
