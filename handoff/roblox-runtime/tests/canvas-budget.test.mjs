import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {transformText,UPSTREAM} from '../worker/gateway.js';
import {mobileCanvasPixelRatio} from '../worker/graphics.js';

const origin='https://runtime.example';
const hook=readFileSync(new URL('./fixtures/hook.js',import.meta.url),'utf8');
const stub=readFileSync(new URL('./fixtures/stub.js',import.meta.url),'utf8');
const playerPath='/_/c2V0dXAucmJ4Y2RuLmNvbQ/webclient/version-1ef59424f70d4932-RobloxWebClient/WasmPlayer.js';
const player=transformText(readFileSync(new URL('./fixtures/WasmPlayer-1ef.js',import.meta.url),'utf8'),playerPath,origin);
const client=readFileSync(new URL('./fixtures/WebClient-1ef.js',import.meta.url),'utf8');

function setup(source,{mobile=true,width=1366,height=768,ratio=2,query='perf=performance&res=auto&fps=60',login=false,blocked=false}={}){
  const values=new Map();
  const context=vm.createContext({URL,URLSearchParams,atob,btoa,TextEncoder,TextDecoder,performance,
    location:new URL(origin+(login?'/_/d3d3LnJvYmxveC5jb20/login':'/_/cGxheS5yb2Jsb3guY29t/games/start')+'?'+query),
    navigator:{hardwareConcurrency:6,deviceMemory:4,userAgent:'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) Version/27.2 Safari/605.1.15',platform:'MacIntel',maxTouchPoints:mobile?5:0},
    __kkeepRuntime:{mobile},innerWidth:width,innerHeight:height,
    localStorage:{
      getItem(key){if(blocked)throw new Error('Storage unavailable');return values.get(key)??null;},
      setItem(key,value){if(blocked)throw new Error('Storage unavailable');values.set(key,value);},
      removeItem(key){if(blocked)throw new Error('Storage unavailable');values.delete(key);}
    },
    sessionStorage:{getItem:()=>null},document:{cookie:''},WebAssembly:{Memory:class{}},
    addEventListener(){},removeEventListener(){},alert(){},
    console:{log(){},warn(){},error(){},info(){}}
  });
  context.window=context;context.parent=context;
  Object.defineProperty(context,'devicePixelRatio',{configurable:true,enumerable:true,get:()=>ratio});
  const start=source.indexOf('  function setupPerf() {');
  const end=source.indexOf('\n  const NativeWorker = globalThis.Worker;',start);
  assert.ok(start>=0&&end>start);
  // Execute the whole inspected provider function, including its real getter.
  // GPU constructors are absent; no graphics or game engine is simulated here.
  vm.runInContext(source.slice(start,end)+'\nsetupPerf();',context);
  return context;
}

async function resizeActualPlayer(context){
  let observe;
  const canvas={width:300,height:150,style:{width:'100%',height:'100%'},
    get clientWidth(){return context.innerWidth;},get clientHeight(){return context.innerHeight;},
    getBoundingClientRect:()=>({left:24,top:16,width:context.innerWidth,height:context.innerHeight}),
    addEventListener(){},getContext:()=>({getSupportedExtensions:()=>[]})};
  const elements={server:{},proxyenabled:{}};
  Object.assign(context,{document:{getElementById:id=>elements[id]??null},
    ResizeObserver:class{constructor(callback){observe=callback;}observe(element){assert.equal(element,canvas);}},
    mt:()=>false,ut:()=>false,gt:Promise.resolve({}),ee:name=>origin+'/engine/'+name,U:origin+'/engine',
    St:null,Ne(){},De(){},f:{},
    // Capture the actual loader's initialized module configuration without
    // allocating or executing the Wasm engine or joining an authenticated game.
    createWebClient:async module=>module
  });
  const start=player.indexOf('async function Je('),end=player.indexOf('window.__resolveGameExit=',start);
  assert.ok(start>=0&&end>start);
  vm.runInContext(player.slice(start,end),context);
  const module=await context.Je(canvas,'www.roblox.com',origin,'',
    {robloxLocaleId:'en_us',gameLocaleId:'en_us'},{applicationSettings:{}},false,123,new Uint8Array([1]),null);
  return {canvas,module,resize(width,height){context.innerWidth=width;context.innerHeight=height;observe();return module.applyPendingResize();}};
}

function initializeActualPlayer(context,{canvas,module}){
  const updates=[],mediaQueries=[];
  const noop=()=>{};
  // Execute the real initialization callback with only its native exports
  // stubbed. No Wasm engine, GPU device, account or game server is started.
  module.cwrap=name=>name==='rbx_fs_load_index'?()=>0:noop;
  module._malloc=()=>8;module._free=noop;module.HEAPU8=new Uint8Array(1024);
  for(const name of ['set_roblox_base_url','set_channel','set_pretend_platform',
    'set_preloaded_flags','set_account_locales','set_place_id','set_browser_tracker_id'])module[name]=noop;
  const setRatio=ratio=>updates.push({ratio,width:canvas.width,height:canvas.height});
  module.update_pixel_ratio=setRatio;
  context._e=()=>context.__kkeepRuntime.mobile;
  context.document.addEventListener=noop;
  context.matchMedia=query=>({addEventListener(type,listener,options){mediaQueries.push({query,type,listener,options});}});
  module.onRuntimeInitialized();
  return {updates,mediaQueries,setRatio};
}

function touchPosition(canvas,x,y){
  const buffer=new ArrayBuffer(4096),words=new Int32Array(buffer),bytes=new Uint8Array(buffer),doubles=new Float64Array(buffer);
  let handler;
  const context=vm.createContext({_:words,L:bytes,N:doubles,Kn:[],H:()=>64,me:target=>target,$:()=>()=>false,
    S:{getTargetThreadForEventCallback:()=>0,registerOrRemoveHandler:event=>{handler=event.handlerFunc;}}
  });
  const rectStart=client.indexOf('var Mr='),rectEnd=client.indexOf('function et(',rectStart);
  const touchStart=client.indexOf('var sr='),touchEnd=client.indexOf('function St(',touchStart);
  assert.ok(rectStart>=0&&rectEnd>rectStart&&touchStart>=0&&touchEnd>touchStart);
  vm.runInContext(client.slice(rectStart,rectEnd)+client.slice(touchStart,touchEnd),context);
  context.sr(canvas,0,false,1,22,'touchstart',0);
  const touch={identifier:1,screenX:x,screenY:y,clientX:x,clientY:y,pageX:x,pageY:y};
  handler({timeStamp:1,touches:[touch],changedTouches:[touch],targetTouches:[touch],preventDefault(){}});
  return [words[(64+16+32)/4],words[(64+16+36)/4]];
}

test('actual hook and stub cap the mobile drawing buffer while retaining the full CSS viewport',async()=>{
  for(const [source,path] of [[hook,'/hook.js'],[stub,'/stub.js']]){
    const context=setup(transformText(source,path,origin));
    assert.ok(context.devicePixelRatio<1);
    const {module,canvas,resize}=await resizeActualPlayer(context);
    assert.equal(module.getEffectiveDevicePixelRatio(),context.devicePixelRatio);
    assert.equal(module.applyPendingResize(),false);
    for(const [width,height] of [[1366,768],[768,1366],[1194,834],[834,1194],[1600,500],[500,1600],[390,600]]){
      assert.equal(resize(width,height),true);
      assert.equal(module.applyPendingResize(),false);
      assert.deepEqual([canvas.clientWidth,canvas.clientHeight],[width,height]);
      assert.deepEqual(canvas.style,{width:'100%',height:'100%'});
      assert.ok(Math.max(canvas.width,canvas.height)<=1024);
      // The player's actual Math.round operation may add half a pixel per edge.
      assert.ok(canvas.width*canvas.height<=1024*576+(canvas.width+canvas.height)/2+1);
      assert.ok(module.getEffectiveDevicePixelRatio()<=1);
      assert.ok(Math.abs(canvas.width/canvas.height-width/height)<0.005);
      assert.deepEqual(touchPosition(canvas,24+width/2,16+height/2),[width/2,height/2]);
    }
    assert.deepEqual([canvas.width,canvas.height],[390,600]);
  }
});

test('actual initialized player notifies native ratio changes after applying a pending resize',async()=>{
  const context=setup(transformText(hook,'/hook.js',origin),{width:1180,height:734});
  const loaded=await resizeActualPlayer(context),{canvas,module,resize}=loaded;
  const {updates,mediaQueries}=initializeActualPlayer(context,loaded);
  assert.equal(updates.length,0);
  assert.equal(mediaQueries.length,1);
  assert.equal(mediaQueries[0].query,`(resolution: ${context.devicePixelRatio}dppx)`);
  assert.equal(module.applyPendingResize(),false);
  assert.equal(updates.length,0);

  for(const [index,[width,height]] of [[1180,734],[820,1060],[1180,900]].entries()){
    assert.equal(resize(width,height),true);
    assert.equal(updates.length,index+1);
    assert.deepEqual(updates[index],{ratio:module.getEffectiveDevicePixelRatio(),width:canvas.width,height:canvas.height});
    assert.equal(module.applyPendingResize(),false);
    assert.equal(resize(width,height),true);
    assert.equal(updates.length,index+1,'same-ratio resizes must not notify twice');
  }
  assert.notEqual(updates[0].ratio,updates[1].ratio);
  assert.notEqual(updates[1].ratio,updates[2].ratio);
  // Keep the provider's native-resolution listener and its re-registration.
  mediaQueries[0].listener();
  assert.equal(updates.at(-1).ratio,module.getEffectiveDevicePixelRatio());
  assert.equal(mediaQueries.length,2);
});

test('missing native ratio setter keeps resizing and retries on a later consumed resize',async()=>{
  const context=setup(transformText(hook,'/hook.js',origin),{width:1180,height:734});
  const loaded=await resizeActualPlayer(context),{canvas,resize,module}=loaded;
  const {updates,setRatio}=initializeActualPlayer(context,loaded);
  delete module.update_pixel_ratio;
  assert.equal(resize(1180,734),true);
  assert.deepEqual([canvas.width,canvas.height],[974,606]);
  assert.equal(updates.length,0);
  module.update_pixel_ratio=setRatio;
  resize(1180,734);
  assert.equal(updates.length,1);

  module.update_pixel_ratio=0;
  assert.equal(resize(1180,900),true);
  assert.deepEqual([canvas.width,canvas.height],[879,671]);
  assert.equal(updates.length,1);
  module.update_pixel_ratio=setRatio;
  assert.equal(module.applyPendingResize(),false);
  assert.equal(updates.length,1);
  resize(1180,900);
  assert.equal(updates.length,2);
  assert.equal(updates[1].ratio,module.getEffectiveDevicePixelRatio());
});

test('first consumed resize notifies even when the viewport returns to its pre-initialization size',async()=>{
  const context=setup(transformText(hook,'/hook.js',origin),{width:1180,height:734});
  const loaded=await resizeActualPlayer(context),{module,resize}=loaded;
  const ratioBeforeInitialization=module.getEffectiveDevicePixelRatio();
  context.innerHeight=900;
  const {updates}=initializeActualPlayer(context,loaded);
  // Native main reads this getter after the initialization callback. A cache
  // seeded before createWebClient could therefore disagree with native state.
  const ratioAtNativeInitialization=module.getEffectiveDevicePixelRatio();
  assert.notEqual(ratioAtNativeInitialization,ratioBeforeInitialization);
  assert.equal(updates.length,0);
  resize(1180,734);
  assert.equal(updates.length,1);
  assert.equal(updates[0].ratio,ratioBeforeInitialization);
  assert.notEqual(updates[0].ratio,ratioAtNativeInitialization);
});

test('ratio notifications reject invalid values and record only a successful native call',async()=>{
  const context=setup(transformText(hook,'/hook.js',origin),{width:1180,height:734});
  const loaded=await resizeActualPlayer(context),{canvas,module,resize}=loaded;
  const {updates,setRatio}=initializeActualPlayer(context,loaded);
  const getRatio=module.getEffectiveDevicePixelRatio;
  for(const ratio of [0,-1,NaN,Infinity,-Infinity]){
    module.getEffectiveDevicePixelRatio=()=>ratio;
    assert.equal(resize(1180,734),true);
    assert.equal(updates.length,0);
  }
  module.getEffectiveDevicePixelRatio=getRatio;
  const failure=new Error('Native ratio setter failed');
  module.update_pixel_ratio=()=>{throw failure;};
  assert.throws(()=>resize(1180,734),error=>error===failure);
  assert.deepEqual([canvas.width,canvas.height],[974,606]);
  assert.equal(module.applyPendingResize(),false);
  module.update_pixel_ratio=setRatio;
  resize(1180,734);
  assert.equal(updates.length,1);
  assert.equal(updates[0].ratio,getRatio());
});

test('changed or duplicated inspected player resize code is rejected before serving',()=>{
  const original=readFileSync(new URL('./fixtures/WasmPlayer-1ef.js',import.meta.url),'utf8');
  const start=original.indexOf('let O=!1;new ResizeObserver(');
  const end=original.indexOf(',window.onerror=',start);
  assert.ok(start>=0&&end>start);
  const resize=original.slice(start,end);
  assert.throws(()=>transformText(original.replace('e.height=Math.round(e.clientHeight*u)','e.height=Math.ceil(e.clientHeight*u)'),playerPath,origin),/Engine canvas resize handling changed/);
  assert.throws(()=>transformText(original+'\n'+resize,playerPath,origin),/Engine canvas resize handling changed/);
});

test('actual player preserves stdout and forwards only Canvas or exact known lifecycle lines',async()=>{
  const context=setup(transformText(hook,'/hook.js',origin));
  const {module}=await resizeActualPlayer(context);
  const stdout=[],forwarded=[];
  context.console.log=(...args)=>stdout.push(args);
  context.__kkeepRuntime.engineOutput=line=>forwarded.push(line);
  const entries=[
    ['ordinary engine output',17],
    ['Canvas:','974 606 1180 734 0.825 0.825'],
    ['another message with Canvas: inside'],
    ['canvas: lowercase'],
    ['Canvas:'],
    ['[LIFECYCLE] joinGameSucceeded'],
    ['[LIFECYCLE] ugcGameLuaWillStart'],
    ['[LIFECYCLE] ugcGameWillClose'],
    ['[LIFECYCLE] joinGameSucceeded','userId=12345'],
    ['[LIFECYCLE] ugcGameLuaWillStart\nprivateId=12345'],
    ['[LIFECYCLE] ugcGameWillClose '],
    [' [LIFECYCLE] joinGameSucceeded'],
    ['[LIFECYCLE] joinGameFailed'],
    ['[lifecycle] joinGameSucceeded'],
  ];
  for(const args of entries)module.print(...args);
  assert.deepEqual(stdout,entries.map(args=>[args.join(' ')]));
  assert.deepEqual(forwarded,['Canvas: 974 606 1180 734 0.825 0.825',
    '[LIFECYCLE] joinGameSucceeded','[LIFECYCLE] ugcGameLuaWillStart','[LIFECYCLE] ugcGameWillClose']);
  delete context.__kkeepRuntime.engineOutput;
  module.print('Canvas: no optional listener');
  assert.deepEqual(stdout.at(-1),['Canvas: no optional listener']);
  assert.equal(stdout.length,entries.length+1);
  context.__kkeepRuntime.engineOutput=()=>{throw new Error('Optional diagnostics failed');};
  assert.doesNotThrow(()=>module.print('[LIFECYCLE] joinGameSucceeded'));
  assert.deepEqual(stdout.at(-1),['[LIFECYCLE] joinGameSucceeded']);
  assert.equal(stdout.length,entries.length+2);
  const stdoutFailure=new Error('Console failed');
  context.console.log=()=>{throw stdoutFailure;};
  assert.throws(()=>module.print('[LIFECYCLE] joinGameSucceeded'),error=>error===stdoutFailure);
});

test('player output print guard rejects changed sources and leaves unknown versions alone',()=>{
  const original=readFileSync(new URL('./fixtures/WasmPlayer-1ef.js',import.meta.url),'utf8');
  const print='print:(...u)=>{console.log(u.join(" "))}';
  assert.throws(()=>transformText(original.replace(print,'print:(...u)=>{console.info(u.join(" "))}'),playerPath,origin),/Engine canvas print handling changed/);
  assert.throws(()=>transformText(original+'\n'+print,playerPath,origin),/Engine canvas print handling changed/);
  const unknownPath=playerPath.replace('version-1ef59424f70d4932','version-ffffffffffffffff');
  assert.equal(transformText(original,unknownPath,origin),original.replaceAll(UPSTREAM,origin));
});

test('mobile quality also uses the budget, and a lower existing ratio is never increased',()=>{
  for(const query of ['perf=quality&res=auto','perf=balanced&res=low','perf=performance&res=auto']){
    for(const blocked of [false,true]){
      const context=setup(transformText(hook,'/hook.js',origin),{query,blocked});
      assert.ok(context.devicePixelRatio>0&&context.devicePixelRatio<1);
      assert.ok(1366*768*context.devicePixelRatio**2<=1024*576+1e-6);
      assert.ok(1366*context.devicePixelRatio<=1024+1e-6);
    }
  }
  assert.equal(setup(transformText(hook,'/hook.js',origin),{ratio:0.5}).devicePixelRatio,0.5);
});

test('desktop, login and explicit full retain the provider pixel-ratio behavior',async()=>{
  const patched=transformText(hook,'/hook.js',origin);
  const cases=[
    {mobile:false},{mobile:false,query:'perf=quality&res=auto'},
    {login:true},{login:true,query:'perf=quality&res=auto'},
    {query:'perf=performance&res=full'},{query:'perf=balanced&res=full'},{query:'perf=quality&res=full'}
  ];
  for(const options of cases){
    const original=setup(hook,options),updated=setup(patched,options);
    assert.equal(updated.devicePixelRatio,original.devicePixelRatio);
  }
  const {module,canvas,resize}=await resizeActualPlayer(setup(patched,{query:'perf=quality&res=full'}));
  assert.equal(module.getEffectiveDevicePixelRatio(),2);
  resize(1366,768);
  assert.deepEqual([canvas.width,canvas.height],[2732,1536]);
  resize(768,1366);
  assert.deepEqual([canvas.width,canvas.height],[1536,2732]);
});

test('invalid viewport dimensions and ratios retain their existing value without an added cap',()=>{
  for(const invalid of [0,-1,NaN,Infinity,-Infinity,undefined]){
    assert.equal(mobileCanvasPixelRatio(1,invalid,768,true,'auto'),1);
    assert.equal(mobileCanvasPixelRatio(1,1366,invalid,true,'auto'),1);
    assert.equal(mobileCanvasPixelRatio(invalid,1366,768,true,'auto'),invalid);
  }
  assert.equal(mobileCanvasPixelRatio(1,Number.MAX_VALUE,Number.MAX_VALUE,true,'auto'),1);
  assert.equal(mobileCanvasPixelRatio(2,1366,768,undefined,'auto'),2);
  const patched=transformText(hook,'/hook.js',origin);
  for(const [width,height] of [[0,768],[1366,0],[-1,768],[NaN,768],[Infinity,768]]){
    const options={width,height};
    assert.equal(setup(patched,options).devicePixelRatio,setup(hook,options).devicePixelRatio);
  }
});

test('unknown or duplicate provider getter markers fail before serving a partial transform',()=>{
  for(const [source,path] of [[hook,'/hook.js'],[stub,'/stub.js']]){
    for(const marker of ['    if (dprCap !== Infinity || pixels !== Infinity) {','            return Math.round(d * 1000) / 1000;']){
      assert.throws(()=>transformText(source.replace(marker,''),path,origin),/Provider canvas pixel ratio changed/);
      assert.throws(()=>transformText(source+'\n'+marker,path,origin),/Provider canvas pixel ratio changed/);
    }
  }
});
