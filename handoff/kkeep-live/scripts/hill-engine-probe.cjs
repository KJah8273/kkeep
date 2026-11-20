// Engine integration probe; the graphics driver is a stub, not a browser test.
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const {createHash} = require('node:crypto');
const { indexedDB } = require('fake-indexeddb');
const compat = process.argv.includes('--compat');
const baseline = process.argv.includes('--baseline');
const duration = Number(process.argv.find(a => a.startsWith('--duration='))?.split('=')[1] || 5);
const vsync = process.argv.includes('--vsync') || (compat && !baseline);
const cap = process.argv.find(a=>a.startsWith('--cap='))?.split('=')[1] || '60';
const convertedName = baseline ? 'hcr-asyncify-optimized.wasm' : 'hcr-asyncify-stable.wasm';
if (!Number.isFinite(duration) || duration < 1) throw Error('Invalid probe duration');
const assetDirectory=process.env.HCR_PROBE_ASSETS;
if(!assetDirectory)throw Error('Set HCR_PROBE_ASSETS to the directory containing the pinned original game assets and converted engine.');
globalThis.WebGLRenderingContext = class {};
globalThis.WebGL2RenderingContext = class {};
const observed = { draws: 0, programs: 0, statuses: [], inputs: 0, frames: 0 };
const gl = new Proxy({
  getSupportedExtensions: () => ['EXT_color_buffer_float', 'EXT_texture_filter_anisotropic'],
  getExtension: name => name === 'EXT_texture_filter_anisotropic' ? { MAX_TEXTURE_MAX_ANISOTROPY_EXT: 34047 } : null,
  getError: () => 0,
  getParameter: name => ({
    7936: 'Integration test', 7937: 'Stub WebGL driver', 7938: 'WebGL 2.0', 35724: 'WebGL GLSL ES 3.00',
    3379: 16384, 34076: 16384, 34921: 16, 34930: 16, 35661: 32, 35660: 16, 36347: 1024,
    36348: 30, 36349: 1024, 34024: 16384, 34852: 8, 36063: 8, 34047: 16,
    34467: [], 2978: [0,0,1280,720], 33902:[1,1], 33901:[1,1024], 3386:[16384,16384],
    36006: null, 32873: null, 34964: null, 34965:null, 35725:null, 34016:33984
  }[name] ?? 0),
  getShaderParameter: (shader, name) => name === 35713,
  getShaderInfoLog: () => '',
  getProgramInfoLog: () => '',
  getProgramParameter: (program, name) => name === 35714 || name === 35715,
  getShaderPrecisionFormat: () => ({ rangeMin:127, rangeMax:127, precision:23 }),
  checkFramebufferStatus: () => 36053,
  getUniformLocation: () => null,
  getAttribLocation: () => -1,
  getActiveUniform: () => null,
  getActiveAttrib: () => null,
  createProgram: () => { observed.programs++; return {}; },
  createShader: () => ({}),
  getQueryParameter: (query, name) => name === 34919 ? true : 0,
  isContextLost: () => false,
}, {
  get(target, name) {
    if (name in target) return target[name];
    if (typeof name !== 'string') return undefined;
    if (/^[A-Z0-9_]+$/.test(name)) return 0;
    if (name.startsWith('create')) return () => ({});
    if (name.startsWith('draw')) return () => { observed.draws++; };
    return () => {};
  }
});
const canvas = Object.assign(new EventTarget(), { width:1280, height:720, style:{}, getContext:() => gl,
  focus(){}, getBoundingClientRect:()=>({left:0,top:0,width:1280,height:720}) });
gl.canvas = canvas;
Object.setPrototypeOf(gl, WebGL2RenderingContext.prototype);
globalThis.window = globalThis;
globalThis.document = Object.assign(new EventTarget(), { currentScript:{src:'https://test.invalid/hcr.js'}, getElementById:()=>canvas,
  querySelector:()=>canvas, createElement:()=>canvas, documentElement:{}, body:{}, defaultView:globalThis, hidden:false });
canvas.ownerDocument=document;
globalThis.location = { search:'', href:'https://test.invalid/' };
globalThis.navigator = { language:'en-US', userAgent:'EngineIntegrationProbe' };
const windowEvents = new EventTarget();
globalThis.addEventListener = windowEvents.addEventListener.bind(windowEvents);
globalThis.removeEventListener = windowEvents.removeEventListener.bind(windowEvents);
globalThis.ontouchstart = null;
globalThis.requestAnimationFrame = callback => setTimeout(() => callback(performance.now()), 16);
globalThis.cancelAnimationFrame = clearTimeout;
globalThis.indexedDB = indexedDB;
globalThis.createImageBitmap = async blob => {
  const data=new DataView(await blob.arrayBuffer());
  return {width:data.getUint32(16),height:data.getUint32(20),close(){}};
};
globalThis.localStorage = {getItem:()=>null,setItem(){},removeItem(){}};
const assets = new Map();
globalThis.__hcrLoaderAssets = {};
for (const name of ['hcr.wasm','hcr.data','image.bin']) Object.defineProperty(globalThis.__hcrLoaderAssets,name,{configurable:true,get:()=>assets.get(name==='hcr.wasm'&&compat?convertedName:name)});
globalThis.fetch = async (input, options={}) => {
  const url = new URL(String(input), 'https://test.invalid/');
  let name = path.basename(url.pathname);
  if (name === 'hcr.wasm' && compat) name = convertedName;
  if (!['hcr.wasm',convertedName,'hcr.data','image.bin'].includes(name)) throw Error('Unexpected request '+url.href);
  if (!assets.has(name)) {
    const bytes=fs.readFileSync(name===convertedName && process.env.HCR_PROBE_WASM || path.join(assetDirectory,name));
    if(name.endsWith('.wasm')) {
      const manifest=JSON.parse(fs.readFileSync(path.join(__dirname,'../public/games/ipad-imports/assets/hill-compat.json')));
      const expected=compat?(baseline?manifest.compiler.guard.inputSha256:manifest.wasm.sha256):manifest.source.sha256;
      if(createHash('sha256').update(bytes).digest('hex')!==expected)throw Error('Probe engine does not match the production manifest');
    }
    assets.set(name,bytes);
  }
  let body = assets.get(name);
  const range = new Headers(options.headers).get('Range');
  const headers = {'Content-Type':name.endsWith('.wasm')?'application/wasm':'application/octet-stream'};
  let status = 200;
  if (range) {
    const match = /^bytes=(\d+)-(\d*)$/.exec(range);
    const start=Number(match[1]), end=match[2]?Math.min(Number(match[2]),body.length-1):body.length-1;
    headers['Content-Range']=`bytes ${start}-${end}/${body.length}`;
    body=body.subarray(start,end+1); status=206;
  }
  headers['Content-Length']=String(body.length);
  return new Response(body,{status,headers});
};
let code=fs.readFileSync(path.join(assetDirectory,'hcr.js'),'utf8');
if(code!==fs.readFileSync(path.join(__dirname,'../tests/fixtures/hill-compat/hcr.js'),'utf8'))throw Error('Probe glue does not match the pinned original');
if (compat) {
  vm.runInThisContext(fs.readFileSync(path.join(__dirname,'../public/games/ipad-imports/assets/hill-asyncify.js'),'utf8'));
  vm.runInThisContext(fs.readFileSync(path.join(__dirname,'../public/games/ipad-imports/assets/hill-compat.js'),'utf8'));
  const create=globalThis.KkeepHcrAsyncify;
  globalThis.KkeepHcrAsyncify=()=>create({onReady:s=>globalThis.__asyncStats=s});
  code=globalThis.KkeepHcrCompatibility.patchScript(code);
  WebAssembly.Suspending=undefined; WebAssembly.promising=undefined;
}
if (!baseline && fs.existsSync(path.join(__dirname,'../public/games/ipad-imports/assets/hill-runtime.js'))) {
  vm.runInThisContext(fs.readFileSync(path.join(__dirname,'../public/games/ipad-imports/assets/hill-runtime.js'),'utf8'));
  code=globalThis.KkeepHcrRuntime.patchScript(code);
  const release=globalThis.KkeepHcrRuntime.release;
  globalThis.KkeepHcrRuntime.release=name=>{release(name);assets.delete(name==='hcr.wasm'&&compat?convertedName:name);};
}
// Test-only observability of the actual game closure. No replacement engine.
code=code.replace('var HCRT = {', 'Module.probeState = () => ({cacheBytes:HCR.cacheBytes,cacheBlocks:HCR.cache.size,openFiles:HCR.files.filter(Boolean).length,overlayBytes:[...HCR.overlay.values()].reduce((n,v)=>n+v.data.length,0),threads:HCRT.th.filter(Boolean).length,textureKB:HCR.fst?.prev?.texkb,bufferKB:HCR.fst?.prev?.bufkb});\nvar HCRT = {');
code=code.replace('function _hcr_js_present(frames, w, h, progs, texkb, bufkb, glns) {', 'function _hcr_js_present(frames, w, h, progs, texkb, bufkb, glns) { Module.probeFrame();');
vm.runInThisContext(code,{filename:'hcr-engine.js'});
let firstFrame=0, lastFrame=0;
const intervals=[];
const M={canvas, vsync, programList:'',
  probeFrame:()=>{const now=performance.now();if(firstFrame&&now-firstFrame>5000)intervals.push(now-lastFrame);observed.frames++;lastFrame=now;},
  preRun:[m=>{m.ENV.HCR_FPS=cap;}],
  onStatus:s=>{observed.statuses.push(s);console.log('STATUS',s);},
  onGameSize:(w,h)=>console.log('GAME_SIZE',w,h),
  onFirstFrame:()=>{firstFrame=performance.now();console.log('FIRST_FRAME');},
  onRuntimeInitialized:()=>console.log('MEMORY',M.HEAPU8.length),
  onAbort:reason=>{console.error('ABORT',reason);process.exit(1);},
};
const started=performance.now();
const originalError=console.error;
console.error=(...args)=>{
  originalError(...args);
  if(args.some(value=>/guest thread .* died:|guest thread .* crashed:/.test(String(value))))process.exit(1);
};
const timing=()=>{const sorted=intervals.slice().sort((a,b)=>a-b),n=sorted.length;return {samples:n,p50:sorted[Math.floor(n*.5)],p95:sorted[Math.floor(n*.95)],p99:sorted[Math.floor(n*.99)],over40ms:sorted.filter(t=>t>40).length};};
const summary=()=>({...observed,milliseconds:Math.round(performance.now()-started),playMilliseconds:firstFrame?Math.round(performance.now()-firstFrame):0,timing:timing(),stats:globalThis.__asyncStats,game:M.probeState?.(),memory:process.memoryUsage()});
vm.runInThisContext(fs.readFileSync(path.join(__dirname,'../public/games/ipad-imports/assets/hill-input.js'),'utf8'));
globalThis.KkeepHcrInput.attach(canvas, {position:e=>[e.clientX,e.clientY],ready:()=>!!M._hcr_ev_touch,
  emit:(name,...args)=>{M['_'+name]?.(...args);if(name==='hcr_ev_touch')observed.inputs++;}});
let held=false, inputStep=0;
setInterval(()=>{
  if(observed.frames>15) {
    // Exercise production touch delivery into the real Wasm exports. The
    // graphics stub cannot establish whether the rendered pedal acts correctly.
    held=!held;
    const e=new Event(held?'touchstart':'touchend',{cancelable:true});
    e.changedTouches=[{identifier:50,clientX:1100,clientY:620},{identifier:51,clientX:180,clientY:620}];
    (held?canvas:windowEvents).dispatchEvent(e);
    M._hcr_ev_key(held?1:0,39,77,2);
    if(++inputStep%19===0) {windowEvents.dispatchEvent(new Event('blur'));windowEvents.dispatchEvent(new Event('focus'));}
  }
  if(firstFrame && performance.now()-lastFrame>10000) {console.error('PROBE_STALLED',JSON.stringify(summary()));process.exit(1);}
  if(firstFrame && performance.now()-firstFrame>=duration*1000 && observed.frames>=120) {
    console.log('PROBE_PASS',JSON.stringify(summary()));
    process.exit(0);
  }
},500);
setInterval(()=>console.log('PROBE_SAMPLE',JSON.stringify(summary())),30000);
setTimeout(()=>{console.error('PROBE_TIMEOUT',JSON.stringify(summary()));process.exit(1);},duration*1000+60000);
HCRWasm(M).then(()=>{console.log('MAIN_EXIT');process.exit(1);}).catch(error=>{console.error('PROBE_FAIL',error);process.exit(1);});
