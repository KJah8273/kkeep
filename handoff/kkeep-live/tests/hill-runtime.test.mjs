import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const upstream=read('tests/fixtures/hill-compat/hcr.js');
const page=read('tests/fixtures/hill-compat/index.html');
function setup(extra={}) {
  const context=vm.createContext({Blob,Response,URLSearchParams,Uint8Array,performance,console,...extra});
  vm.runInContext(read('public/games/ipad-imports/assets/hill-runtime.js'),context);
  return {context,runtime:context.KkeepHcrRuntime,script:context.KkeepHcrRuntime.patchScript(upstream)};
}
test('both runtimes retain original saves and keyboard controls; native touch delivery is installed',()=>{
  const {runtime,script}=setup();new vm.Script(script);
  for(const [start,end] of [['function _hcr_js_file_close','async function _hcr_js_load_image'],['var HCRT = {','var _hcr_js_yield = function()']]) {
    assert.equal(script.slice(script.indexOf(start),script.indexOf(end)),upstream.slice(upstream.indexOf(start),upstream.indexOf(end)));
  }
  for (const compatible of [false,true]) {
    const patched=runtime.patchPage(page,compatible);
    assert(patched.includes('KkeepHcrInput.attach(canvas,'));
    assert.equal(patched.slice(patched.indexOf('  const pos ='),patched.indexOf('  globalThis.KkeepHcrInput')),page.slice(page.indexOf('  const pos ='),page.indexOf("  // the mouse is the game's pointer 1;")));
    assert(patched.includes("preRun: [m => { m.ENV.HCR_FPS = String(cap);"));
    assert(!patched.includes('configureModule'));
    for(const match of patched.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g))new vm.Script(match[1]);
  }
  assert(runtime.patchPage(page,false).includes("canvas, vsync: localStorage.getItem('hcrVsync') === '1' || q.has('vsync'),"));
  assert.throws(()=>runtime.patchPage('another page',false),/input does not match/);
  assert(runtime.patchPage(page,true).includes('canvas, vsync: true,'));
  assert.throws(()=>runtime.patchScript('another engine'),/does not match/);
});
test('range cache stays bounded and evicted game data can be read again',async()=>{
  let calls=0;
  const {context,script}=setup({Module:{},fetch:async(url,options)=>{
    calls++;const [,lo,hi]=/bytes=(\d+)-(\d+)/.exec(options.headers.Range);
    const bytes=new Uint8Array(Number(hi)-Number(lo)+1);bytes.fill(Number(lo)/1048576);
    return new Response(bytes,{status:206});
  }});
  vm.runInContext(script.slice(script.indexOf('var HCR = {'),script.indexOf('function _hcr_js_file_close')),context);
  const h=context.HCR;h.dataSize=64*1048576;h.dataUrl='hcr.data';
  for(let block=0;block<48;block++) {
    const data=await h.fetchBlock('',block);
    assert.equal(data[0],block);assert(h.cacheBytes<=16*1048576);
  }
  assert(!h.cache.has('#0'));const before=calls;
  const first=await h.fetchBlock('',0);assert.equal(first[0],0);assert.equal(calls,before+1);
  const cross=await h.readBlocks('',1048576-2,4,h.dataSize);
  assert.deepEqual([...cross],[0,0,1,1]);assert(h.cacheBytes<=16*1048576);
});
test('successful image load releases the startup Blob but failed reads preserve it',async()=>{
  const assets={'hcr.wasm':new Blob(['wasm']),'hcr.data':new Blob(['data']),'image.bin':new Blob([new Uint8Array([1,2,3])])};
  const {context,runtime,script}=setup({__hcrLoaderAssets:assets,HEAPU8:new Uint8Array(16),HCR:{status(){}},fetch:async()=>new Response(assets['image.bin'])});
  vm.runInContext(script.slice(script.indexOf('async function _hcr_js_load_image'),script.indexOf('_hcr_js_load_image.isAsync')),context);
  assert.equal(await context._hcr_js_load_image(4,2),0);assert(assets['image.bin']);
  assert.equal(await context._hcr_js_load_image(4,3),1);assert(!assets['image.bin']);
  assert.deepEqual([...context.HEAPU8.slice(4,7)],[1,2,3]);
  runtime.release('hcr.wasm');runtime.release('hcr.wasm');assert.deepEqual(Object.keys(assets),['hcr.data']);
});
test('foreground frames and background timeouts cancel each other without queued callbacks',async()=>{
  let id=0;const frames=new Map(),timers=new Map();
  const {context,script}=setup({Module:{},HCR:{vsync:true},location:{search:''},
    requestAnimationFrame:f=>{frames.set(++id,f);return id;},cancelAnimationFrame:id=>frames.delete(id),
    setTimeout:f=>{timers.set(++id,f);return id;},clearTimeout:id=>timers.delete(id)});
  vm.runInContext(script.slice(script.indexOf('var _hcr_js_yield = function()'),script.indexOf('_hcr_js_yield.isAsync')),context);
  for(let i=0;i<200;i++) {
    const promise=context._hcr_js_yield();assert.equal(frames.size,1);assert.equal(timers.size,1);
    const callback=[...(i%2?frames:timers).values()][0];callback();await promise;
    assert.equal(frames.size,0);assert.equal(timers.size,0);
  }
});
test('independent guest yields resume on the same display frame without a shared delay',async()=>{
  let id=0;const frames=new Map(),timers=new Map();
  const {context,script}=setup({Module:{},HCR:{vsync:true},location:{search:''},
    requestAnimationFrame:f=>{frames.set(++id,f);return id;},cancelAnimationFrame:id=>frames.delete(id),
    setTimeout:f=>{timers.set(++id,f);return id;},clearTimeout:id=>timers.delete(id)});
  vm.runInContext(script.slice(script.indexOf('var _hcr_js_yield = function()'),script.indexOf('_hcr_js_yield.isAsync')),context);
  let resumed=0;
  const first=context._hcr_js_yield().then(()=>resumed++);
  const second=context._hcr_js_yield().then(()=>resumed++);
  assert.equal(frames.size,2);
  [...frames.values()].forEach(callback=>callback(100));
  await Promise.all([first,second]);
  assert.equal(resumed,2);assert.equal(frames.size,0);assert.equal(timers.size,0);
  assert(!script.includes('kkeepFrameWait'));
});
test('decoded texture bitmaps close after upload, including an upload failure',async()=>{
  for(const failure of [false,true]) {
    let closed=0,uploads=0;
    const gl=new Proxy({getParameter:()=>0,texImage2D:()=>{assert.equal(closed,0);uploads++;if(failure)throw Error('lost graphics context');}},{get:(g,key)=>g[key]||(()=>{})});
    const {context,script}=setup({GLctx:gl,GL:{textures:[{}]},HEAPU8:new Uint8Array(4),console:{error(){}},createImageBitmap:async()=>({close(){closed++;}})});
    vm.runInContext(script.slice(script.indexOf('async function _hcr_js_tex_png'),script.indexOf('_hcr_js_tex_png.isAsync')),context);
    assert.equal(await context._hcr_js_tex_png(0,0,4),failure?0:1);assert.equal(uploads,1);assert.equal(closed,1);
  }
});
