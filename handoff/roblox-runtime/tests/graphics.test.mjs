import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import worker from '../worker/index.js';
import {transformText} from '../worker/gateway.js';

const origin='https://runtime.example';
const settingsHost='clientsettingscdn.roblox.com';
const applications=['WebClientApp','iOSWebClientApp','AndroidWebClientApp','MacWebClientApp','WindowsWebClientApp'];
const settingsUrl=(application,query='',host=settingsHost)=>origin+'/_/'+btoa(host).replace(/=+$/,'')+'/v2/settings/application/'+application+query;
const hook=readFileSync(new URL('./fixtures/hook.js',import.meta.url),'utf8');
const playerPath='/_/c2V0dXAucmJ4Y2RuLmNvbQ/webclient/version-1ef59424f70d4932-RobloxWebClient/WasmPlayer.js';
const player=transformText(readFileSync(new URL('./fixtures/WasmPlayer-1ef.js',import.meta.url),'utf8'),playerPath,origin);

function actualPlayerContext({gpu,fps='60',platform='MacIntel',touch=5,userAgent='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) Version/26.4 Safari/605.1.15'}={}){
  const transformed=transformText(hook,'/hook.js',origin);
  const start=transformed.indexOf('function install(scope, origin) {');
  const end=transformed.indexOf('  const reroute = install(globalThis, PROXY_ORIGIN);',start);
  const context=vm.createContext({URL,URLSearchParams,Request,Response,Headers,DOMException,TextEncoder,TextDecoder,ReadableStream,WritableStream,
    MessageChannel,ArrayBuffer,Uint8Array,DataView,btoa,atob,setTimeout,clearTimeout,performance,
    navigator:{userAgent,platform,maxTouchPoints:touch},console:{log(){},warn(){},error(){},info(){}},
    __rbxPerf:{tier:'performance',fps,gpu},fetch:(input,init)=>worker.fetch(new Request(input,init))});
  context.window=context;
  context.location=new URL(origin+'/_/cGxheS5yb2Jsb3guY29t/games/start?placeId=123');
  vm.runInContext(transformed.slice(start,end)+'\ninstall(globalThis,'+JSON.stringify(origin)+');',context);
  // Execute the provider's actual platform selection and public settings fetch.
  vm.runInContext(player.slice(player.indexOf('var L='),player.indexOf('var Xe='))+
    player.slice(player.indexOf('function Me('),player.indexOf('function Ze('))+
    player.slice(player.indexOf('var it='),player.indexOf('var He=')),context);
  return context;
}

async function startActualPlayer(context,flags){
  const contexts=[],engineFlags=[];let gpuRequests=0;
  const canvas={addEventListener(){},getContext(name){contexts.push(name);return {getSupportedExtensions:()=>[]};}};
  const elements={server:{},proxyenabled:{}};
  Object.assign(context,{document:{getElementById:id=>elements[id]??null,addEventListener(){}},
    addEventListener(){},removeEventListener(){},matchMedia:()=>({addEventListener(){}}),
    ResizeObserver:class{observe(){}},WebAssembly:{Memory:class{}},
    __kkeepRuntime:{mobile:true},gt:Promise.resolve({}),U:'https://public.example/engine',St:null,
    ee:name=>origin+'/engine/'+name,Ne(){},De(){},f:{},
    $e:async()=>{gpuRequests++;return {fixture:true};},
    createWebClient:async module=>{
      Object.assign(module,{HEAPU8:new Uint8Array(128),cwrap:name=>()=>name==='rbx_fs_load_index'?1:0,_malloc:()=>8,_free(){},
        set_roblox_base_url(){},set_pretend_platform(){},set_preloaded_flags:value=>engineFlags.push(JSON.parse(value)),
        set_account_locales(){},set_place_id(){},set_browser_tracker_id(){}});
      module.onRuntimeInitialized();return module;
    }});
  const renderQuery=player.slice(player.indexOf('function Ge('),player.indexOf('var be='));
  const mobile=player.match(/function _e\(\)\{[^}]+\}/)?.[0];
  const launch=player.slice(player.indexOf('async function Je('),player.indexOf('window.__resolveGameExit='));
  vm.runInContext(renderQuery+mobile+'var ut=he("WasmPreferWebGPU"),mt=he("WebClientRenderQueryParams");'+launch,context);
  context.Oe(flags);
  await context.Je(canvas,'www.roblox.com',origin,'',{robloxLocaleId:'en_us',gameLocaleId:'en_us'},flags,false,123,new Uint8Array([1,2,3]),null);
  return {contexts,engineFlags,gpuRequests};
}

test('actual iPad settings, frontend renderer and engine honor explicit WebGL despite provider WebGPU defaults',async()=>{
  const requests=[],original=global.fetch;
  const provider={applicationSettings:{FFlagWasmPreferWebGPU:'True',UnrelatedFlag:'keep',FIntOther:17},version:'unchanged'};
  global.fetch=async(url,options)=>{requests.push({url:new URL(url),options});return Response.json(provider);};
  try{
    const context=actualPlayerContext({gpu:'webgl'}),flags=await context.Ue('prod','');
    assert.ok(requests[0].url.pathname.endsWith('/iOSWebClientApp'));
    assert.equal(requests[0].url.searchParams.get('rbxgpu'),'webgl');
    assert.equal(requests[0].url.searchParams.get('rbxfps'),'60');
    assert.deepEqual(flags,{...provider,applicationSettings:{...provider.applicationSettings,FFlagWasmPreferWebGPU:'False',DFIntTaskSchedulerTargetFps:'60'}});
    const launched=await startActualPlayer(context,flags);
    assert.deepEqual(launched.contexts,['webgl2']);assert.equal(launched.gpuRequests,0);
    assert.equal(launched.engineFlags[0].applicationSettings.FFlagWasmPreferWebGPU,'False');
    assert.equal(launched.engineFlags[0].applicationSettings.UnrelatedFlag,'keep');
  }finally{global.fetch=original;}
});

test('explicit WebGPU remains available and matches the actual engine setting',async()=>{
  const original=global.fetch;
  global.fetch=async()=>Response.json({applicationSettings:{FFlagWasmPreferWebGPU:'False'}});
  try{
    const context=actualPlayerContext({gpu:'webgpu'}),flags=await context.Ue('prod','');
    const launched=await startActualPlayer(context,flags);
    assert.deepEqual(launched.contexts,[]);assert.equal(launched.gpuRequests,1);
    assert.equal(launched.engineFlags[0].applicationSettings.FFlagWasmPreferWebGPU,'True');
  }finally{global.fetch=original;}
});

test('the actual iPad settings request delivers the selected 30 or 60 FPS cap to the native engine',async()=>{
  const original=global.fetch,requests=[];
  const provider={applicationSettings:{FFlagWasmPreferWebGPU:'False',IOSOnlyFlag:'keep',DFIntTaskSchedulerTargetFps:'120'},version:'unchanged'};
  global.fetch=async url=>{requests.push(new URL(url));return Response.json(provider);};
  try{
    for(const fps of ['30','60']){
      const context=actualPlayerContext({fps}),flags=await context.Ue('prod','');
      assert.ok(requests.at(-1).pathname.endsWith('/iOSWebClientApp'));
      assert.equal(requests.at(-1).searchParams.get('rbxfps'),fps);
      assert.equal(requests.at(-1).searchParams.has('rbxgpu'),false);
      assert.deepEqual(flags,{...provider,applicationSettings:{...provider.applicationSettings,DFIntTaskSchedulerTargetFps:fps}});
      const launched=await startActualPlayer(context,flags);
      assert.equal(launched.engineFlags[0].applicationSettings.DFIntTaskSchedulerTargetFps,fps);
      assert.equal(launched.engineFlags[0].applicationSettings.IOSOnlyFlag,'keep');
    }
  }finally{global.fetch=original;}
});

test('the iOS FPS repair does not change other platform settings or unvalidated requests',async()=>{
  const original=global.fetch;
  const body='{"applicationSettings":{"DFIntTaskSchedulerTargetFps":"120","platform":"keep"},"version":42}';
  global.fetch=async()=>new Response(body,{headers:{'content-type':'application/json'}});
  try{
    for(const app of applications.filter(app=>app!=='iOSWebClientApp')){
      const response=await worker.fetch(new Request(settingsUrl(app,'?rbxperf=performance&rbxfps=30')));
      assert.equal(await response.text(),body,app+' must retain its original settings');
    }
    for(const query of ['?rbxfps=30','?rbxperf=performance','?rbxperf=balanced&rbxfps=30',
      '?rbxperf=performance&rbxfps=45','?rbxperf=performance&rbxfps=0',
      '?rbxperf=performance&rbxfps=30&rbxfps=60',
      '?rbxperf=performance&rbxfps=30&rbxfps=30',
      '?rbxperf=performance&rbxperf=performance&rbxfps=30']){
      const response=await worker.fetch(new Request(settingsUrl('iOSWebClientApp',query)));
      assert.equal(await response.text(),body,query);
    }
    for(const [app,host] of [['iOSWebClientApp/extra',settingsHost],['iOSWebClientApp','setup.rbxcdn.com']]){
      const response=await worker.fetch(new Request(settingsUrl(app,'?rbxperf=performance&rbxfps=30',host)));
      assert.equal(await response.text(),body);
    }
    const post=await worker.fetch(new Request(settingsUrl('iOSWebClientApp','?rbxperf=performance&rbxfps=30'),{method:'POST'}));
    assert.equal(post.status,404);
    assert.equal(await post.text(),'Not found');
  }finally{global.fetch=original;}
});

test('iOS bucket settings honor FPS without a renderer override and invalidate representation headers',async()=>{
  const original=global.fetch;
  global.fetch=async()=>new Response('{"applicationSettings":{"IOSOnlyFlag":"keep"},"other":9}',{
    headers:{'content-type':'application/json; charset=utf-8','content-length':'99',etag:'old','last-modified':'yesterday','x-fixture':'keep'}});
  try{
    const response=await worker.fetch(new Request(settingsUrl('iOSWebClientApp/bucket/test-channel','?rbxperf=performance&rbxfps=30')));
    assert.deepEqual(await response.json(),{applicationSettings:{IOSOnlyFlag:'keep',DFIntTaskSchedulerTargetFps:'30'},other:9});
    for(const key of ['content-length','content-encoding','etag','last-modified'])assert.equal(response.headers.get(key),null);
    assert.equal(response.headers.get('x-fixture'),'keep');
    assert.equal(response.headers.get('cache-control'),'no-store');
  }finally{global.fetch=original;}
});

test('only the five known public settings applications and their bucket routes receive a graphics override',async()=>{
  const original=global.fetch;
  global.fetch=async()=>Response.json({applicationSettings:{FFlagWasmPreferWebGPU:'True',keep:'yes'}});
  try{
    for(const app of applications)for(const suffix of ['','/bucket/test-channel']){
      const response=await worker.fetch(new Request(settingsUrl(app+suffix,'?rbxgpu=webgl')));
      assert.deepEqual(await response.json(),{applicationSettings:{FFlagWasmPreferWebGPU:'False',keep:'yes'}});
    }
    for(const [app,host] of [['NotWebClientApp',settingsHost],['iOSWebClientApp/extra',settingsHost],['iOSWebClientApp','setup.rbxcdn.com']]){
      const response=await worker.fetch(new Request(settingsUrl(app,'?rbxgpu=webgl',host)));
      assert.equal((await response.json()).applicationSettings.FFlagWasmPreferWebGPU,'True');
    }
  }finally{global.fetch=original;}
});

test('missing, invalid and duplicate preferences preserve provider flags and invalid values are not forwarded',async()=>{
  const original=global.fetch,requests=[];
  const body=JSON.stringify({applicationSettings:{FFlagWasmPreferWebGPU:'True',Other:false},unchanged:[1,2,3]});
  global.fetch=async url=>{requests.push(new URL(url));return new Response(body,{headers:{'content-type':'application/json'}});};
  try{
    for(const query of ['', '?rbxgpu=auto','?rbxgpu=WEBGL','?rbxgpu=webgl&rbxgpu=webgpu','?rbxgpu=webgl&rbxgpu=webgl']){
      const response=await worker.fetch(new Request(settingsUrl('iOSWebClientApp',query)));
      assert.equal(await response.text(),body);
      assert.equal(requests.at(-1).searchParams.has('rbxgpu'),false);
    }
  }finally{global.fetch=original;}
});

test('rewritten JSON drops stale representation headers while preserving unrelated response data',async()=>{
  const original=global.fetch;
  global.fetch=async()=>new Response('{"applicationSettings":{"FFlagWasmPreferWebGPU":"True"},"extra":{"value":9}}',{
    headers:{'content-type':'application/json; charset=utf-8','content-length':'99','content-encoding':'gzip',etag:'old','last-modified':'yesterday','x-fixture':'keep'}});
  try{
    const response=await worker.fetch(new Request(settingsUrl('iOSWebClientApp','?rbxgpu=webgl')));
    assert.equal(response.headers.get('x-fixture'),'keep');
    for(const key of ['content-length','content-encoding','etag','last-modified'])assert.equal(response.headers.get(key),null);
    assert.equal(response.headers.get('cache-control'),'no-store');
    assert.deepEqual(await response.json(),{applicationSettings:{FFlagWasmPreferWebGPU:'False'},extra:{value:9}});
  }finally{global.fetch=original;}
});

test('malformed or unexpected settings and unsuccessful responses are not replaced with invented flags',async()=>{
  const original=global.fetch;
  try{
    for(const [body,status] of [['invalid JSON',200],['{"applicationSettings":null,"keep":1}',200],['{"applicationSettings":[],"keep":1}',200],['{"applicationSettings":{"FFlagWasmPreferWebGPU":"True"}}',503]]){
      global.fetch=async()=>new Response(body,{status,headers:{'content-type':'application/json'}});
      const response=await worker.fetch(new Request(settingsUrl('iOSWebClientApp','?rbxgpu=webgl&rbxperf=performance&rbxfps=30')));
      assert.equal(response.status,status);assert.equal(await response.text(),body);
    }
  }finally{global.fetch=original;}
});
