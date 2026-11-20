import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {transformText} from '../worker/gateway.js';

const origin='https://runtime.example';
const hook=readFileSync(new URL('./fixtures/hook.js',import.meta.url),'utf8');
const patched=transformText(hook,'/hook.js',origin);
const saved={'rbxweb.perf':'performance','rbxweb.fps':'60','rbxweb.res':'full','rbxweb.gpu':'webgl'};

function profile(source,query,{storage='blocked',initial=saved,webgpu=true,staging=false}={}){
  const values=new Map(Object.entries(initial)),paced=[];
  const localStorage={
    getItem(key){if(storage==='blocked')throw new Error('Storage unavailable');return values.get(key)??null;},
    setItem(key,value){if(storage!=='available')throw new Error('Storage unavailable');values.set(key,value);},
    removeItem(key){if(storage!=='available')throw new Error('Storage unavailable');values.delete(key);}
  };
  const context=vm.createContext({URLSearchParams,location:new URL(origin+'/games/start?'+query),
    navigator:{hardwareConcurrency:6,...(webgpu?{gpu:{}}:{})},document:{},localStorage,
    sessionStorage:{getItem:()=>staging?'/_rbx/app-staging/':null},setupPacer:mode=>paced.push(mode)});
  context.window=context;
  const start=source.indexOf('  function setupPerf() {');
  const end=source.indexOf('    // Only the game page gets the engine tweaks;',start);
  assert.ok(start>=0&&end>start);
  // Execute the provider's preference calculation and public profile directly.
  // Stop before unrelated engine/GPU event and DOM setup.
  vm.runInContext(source.slice(start,end)+'\n};setupPerf();',context);
  const p=context.__rbxPerf;
  return {tier:p.tier,auto:p.auto,fps:p.fps,pixels:p.pixels,dprCap:p.dprCap,gpu:p.gpu,gpuWhy:p.gpuWhy,pace:p.pace,paced};
}

test('actual provider reproduces storage-denied graphics regression and patched explicit choices work immediately',()=>{
  const query='gpu=webgl&fps=30&perf=performance&res=low';
  const broken=profile(hook,query);
  assert.equal(broken.gpu,'webgpu');
  assert.equal(broken.fps,null);
  assert.equal(broken.tier,'balanced');
  assert.equal(broken.pixels,1920*1080);
  for(const storage of ['blocked','readonly','available']){
    const fixed=profile(patched,query,{storage});
    assert.equal(fixed.gpu,'webgl');
    assert.equal(fixed.gpuWhy,'picked');
    assert.equal(fixed.fps,'30');
    assert.equal(fixed.tier,'performance');
    assert.equal(fixed.auto,false);
    assert.equal(fixed.pixels,1024*576);
  }
});

test('auto and off override stale readable preferences when writes fail',()=>{
  const p=profile(patched,'gpu=auto&fps=off&perf=auto&res=auto',{storage:'readonly'});
  assert.equal(p.gpu,'webgpu');
  assert.equal(p.gpuWhy,'default');
  assert.equal(p.fps,null);
  assert.equal(p.tier,'balanced');
  assert.equal(p.auto,true);
  assert.equal(p.pixels,1920*1080);
});

test('explicit WebGPU still requires browser capability and existing frame pacer precedence is preserved',()=>{
  assert.equal(profile(patched,'gpu=webgpu',{webgpu:false}).gpu,'webgl');
  const p=profile(patched,'gpu=webgl&fps=45&perf=quality&res=full',{staging:true});
  assert.equal(p.gpu,'webgl');assert.equal(p.fps,'45');
  assert.equal(p.tier,'quality');assert.equal(p.pixels,Infinity);
  assert.equal(p.pace,'auto');assert.deepEqual(p.paced,['auto']);
});

test('missing and invalid preferences retain existing defaults, storage and staging behavior',()=>{
  for(const storage of ['blocked','readonly','available'])for(const staging of [false,true]){
    for(const query of ['', 'gpu=invalid&fps=90&perf=maximum&res=tiny']){
      assert.deepEqual(profile(patched,query,{storage,staging}),profile(hook,query,{storage,staging}));
    }
  }
});

test('working storage retains provider behavior for every valid immediate preference',()=>{
  for(const query of ['gpu=webgl&fps=30&perf=performance&res=low','gpu=webgpu&fps=45&perf=balanced&res=full',
    'gpu=auto&fps=off&perf=auto&res=auto','fps=60&perf=quality','gpu=webgl&gpu=webgpu&fps=30&fps=60']){
    assert.deepEqual(profile(patched,query,{storage:'available'}),profile(hook,query,{storage:'available'}));
  }
});

test('unknown provider preference statements fail closed',()=>{
  for(const marker of ['const chosen = ls.get(KEY);','const savedFps = ls.get(FPS_KEY);',
    'const pixels = ls.get(RES_KEY)','const gpuPick = /^(webgpu|webgl)$/.test(ls.get(GPU_KEY) || "")']){
    assert.throws(()=>transformText(hook.replace(marker,marker.replace('ls.get','storage.read')),'/hook.js',origin),/launch performance preferences changed/);
  }
});
