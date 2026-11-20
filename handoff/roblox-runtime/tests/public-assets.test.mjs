import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {setImmediate as nextTurn} from 'node:timers/promises';
import worker from '../worker/index.js';
import {transformText, UPSTREAM} from '../worker/gateway.js';
import {publicEngineAsset, verifyPublicEngineScript, fetchEngineAssetResponse, fetchPublicEngineAsset} from '../worker/public-assets.js';

const origin='https://runtime.example';
const prefix='/_/c2V0dXAucmJ4Y2RuLmNvbQ/webclient/version-1ef59424f70d4932-RobloxWebClient/';
const cdn='https://setup.rbxcdn.com/webclient/version-1ef59424f70d4932-RobloxWebClient/';
const scripts=[
  ['WasmPlayer.js','WasmPlayer-1ef.js'],
  ['WebClient.js','WebClient-1ef.js'],
  ['audio-processor-fast.js','audio-processor-fast-1ef.js'],
].map(([file,fixture])=>{
  const provider=readFileSync(new URL('./fixtures/'+fixture,import.meta.url),'utf8');
  const direct=file==='WasmPlayer.js'?provider.replace(UPSTREAM+'/_/c2V0dXAucmJ4Y2RuLmNvbQ','https://setup.rbxcdn.com'):provider;
  return {file,provider,direct};
});
const textEncoder=new TextEncoder();
const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};};
const request=(file,options={})=>new Request(origin+prefix+file,options);
const asset=file=>publicEngineAsset(new URL(origin+prefix+file));
function intercept(t,reply){
  const calls=[];
  t.mock.method(globalThis,'fetch',(url,options)=>{
    calls.push({url:String(url),options});
    return Promise.resolve(reply(String(url),options,calls.length));
  });
  return calls;
}

test('public engine selection pins the exact CDN namespace and accepts only canonical static paths',()=>{
  const files=[...scripts.map(({file})=>file),'WebClient.wasm','WebClient.fsindex.txt',
    'content/fonts/families/SourceSansPro.json','content/fonts/Arimo.ttf',
    'content/configs/UniversalAppPatchConfig/UniversalAppPatchConfig.json',
    'ExtraContent/textures/fixture.png','PlatformContent/pc/textures/fixture.dds','shaders/fixture.bin'];
  for(const file of files){
    for(const method of ['GET','HEAD']){
      const selected=publicEngineAsset(new URL(origin+prefix+file),method);
      assert.equal(selected?.url,cdn+file);assert.equal(selected.file,file);
      assert.equal(selected.script,scripts.some(script=>script.file===file));
    }
  }
  for(const suffix of ['','Other.js','WebClient.wasm?version=1','WebClient.wasm#fragment',
    'content/unknown.js','content/unknown.JS','content/unknown.mjs','content/unknown.cjs',
    'content/unknown.html','content/unknown.htm','content/unknown.css',
    'content/.hidden','content/fixture%2Fother.json','content/fixture%5Cother.json',
    'content/a%20b.json','content/a;param.json','content//fixture.json']){
    assert.equal(publicEngineAsset(new URL(origin+prefix+suffix)),null,suffix);
  }
  for(const path of [prefix.replace('1ef59424f70d4932','0000000000000000')+'WebClient.wasm',
    prefix.replace('c2V0dXAucmJ4Y2RuLmNvbQ',btoa('auth.roblox.com'))+'WebClient.wasm',
    prefix.replace('c2V0dXAucmJ4Y2RuLmNvbQ',btoa('setup.rbxcdn.com.evil.example'))+'WebClient.wasm',
    prefix+'../../outside.json','/_rbx/api/session'])assert.equal(publicEngineAsset(new URL(origin+path)),null,path);
  for(const method of ['POST','PUT','DELETE','OPTIONS'])assert.equal(publicEngineAsset(new URL(origin+prefix+'WebClient.wasm'),method),null);
  assert.equal(publicEngineAsset(new URL('https://another-runtime.example'+prefix+'WebClient.wasm')).url,cdn+'WebClient.wasm',
    'the incoming origin cannot select an external destination');
});

test('all public script hashes verify actual fixtures and reject any changed bytes or normalization contract',async()=>{
  for(const {file,provider,direct} of scripts){
    assert.equal(await verifyPublicEngineScript(direct,file),provider);
    assert.equal(await verifyPublicEngineScript(direct+'\n// unexpected source',file),null);
    assert.equal(await verifyPublicEngineScript(direct.replace(/./,'x'),file),null);
  }
  const player=scripts[0];
  assert.equal(player.direct.split('https://setup.rbxcdn.com').length,2);
  assert.equal(await verifyPublicEngineScript(player.provider,player.file),null,'provider-normalized input is not a direct CDN script');
  assert.equal(await verifyPublicEngineScript(player.direct+'https://setup.rbxcdn.com',player.file),null);
  assert.equal(await verifyPublicEngineScript(scripts[1].direct,'Unknown.js'),null);
});

test('verified CDN scripts receive the complete existing transforms and safe response headers',async t=>{
  const calls=intercept(t,url=>{
    const script=scripts.find(script=>url===cdn+script.file);assert.ok(script,'only the pinned CDN is contacted');
    return new Response(script.direct,{headers:{'content-type':'application/octet-stream','content-length':'10',
      'content-encoding':'gzip',etag:'old','last-modified':'yesterday','set-cookie':'synthetic=discard'}});
  });
  for(const {file,provider} of scripts){
    const response=await worker.fetch(request(file,{headers:{accept:'text/javascript',cookie:'synthetic=private',authorization:'Bearer synthetic'}}));
    assert.equal(response.status,200);
    assert.equal(await response.text(),transformText(provider,prefix+file,origin));
    for(const name of ['set-cookie','content-length','content-encoding','etag','last-modified'])assert.equal(response.headers.get(name),null,name);
    assert.equal(response.headers.get('content-type'),'text/javascript; charset=utf-8');
    assert.equal(response.headers.get('cross-origin-embedder-policy'),'require-corp');
  }
  assert.equal(calls.length,scripts.length);
  for(const {options} of calls){
    assert.equal(options.method,'GET');assert.equal(options.redirect,'manual');assert.equal(options.credentials,'omit');
    assert.deepEqual([...options.headers],[['accept','text/javascript']]);
  }
});

test('script ranges and HEAD are validated as complete source without exposing partial executable bytes',async t=>{
  const script=scripts[0],calls=intercept(t,()=>new Response(script.direct));
  for(const method of ['GET','HEAD']){
    const response=await worker.fetch(request(script.file,{method,headers:{range:'bytes=0-40','if-range':'old'}}));
    assert.equal(response.status,200);
    assert.equal(await response.text(),method==='HEAD'?'':transformText(script.provider,prefix+script.file,origin));
    assert.equal(calls.at(-1).options.method,'GET');
    assert.equal(calls.at(-1).options.headers.has('range'),false);
    assert.equal(calls.at(-1).options.headers.has('if-range'),false);
  }
});

test('static data preserves range responses and HEAD while omitting all incoming identity headers',async t=>{
  const file='content/fonts/families/SourceSansPro.json';
  const calls=intercept(t,(_url,options)=>new Response(options.method==='HEAD'?null:'part',{status:options.method==='HEAD'?200:206,
    headers:{'content-type':'application/json','content-range':'bytes 0-3/100','content-length':'4','set-cookie':'synthetic=discard'}}));
  for(const method of ['GET','HEAD']){
    const response=await worker.fetch(request(file,{method,headers:{accept:'application/json',range:'bytes=0-3','if-range':'fixture-etag',
      cookie:'synthetic=private',authorization:'Bearer synthetic','x-private-fixture':'discard'}}));
    assert.equal(response.status,method==='HEAD'?200:206);assert.equal(await response.text(),method==='HEAD'?'':'part');
    assert.equal(response.headers.get('set-cookie'),null);
    assert.equal(response.headers.get('content-range'),'bytes 0-3/100');
    const {url,options}=calls.at(-1);assert.equal(url,cdn+file);assert.equal(options.method,method);
    assert.deepEqual([...options.headers],[['accept','application/json'],['if-range','fixture-etag'],['range','bytes=0-3']]);
    assert.equal(options.credentials,'omit');assert.equal(options.redirect,'manual');
  }
});

test('direct redirects, HTTP failures and partial scripts use the existing provider once without following Location',async t=>{
  const script=scripts[0];let status=302;
  const calls=intercept(t,url=>url===cdn+script.file?
    new Response(status===206?'partial':null,{status,headers:{location:'https://unrelated.example/never-follow'}}):
    new Response(script.provider,{headers:{'content-type':'text/javascript'}}));
  for(status of [206,301,302,307,308,401,404,429,500,524]){
    const before=calls.length,response=await worker.fetch(request(script.file));
    assert.equal(response.status,200);assert.equal(await response.text(),transformText(script.provider,prefix+script.file,origin));
    assert.deepEqual(calls.slice(before).map(call=>call.url),[cdn+script.file,UPSTREAM+prefix+script.file]);
    assert.equal(calls.at(-1).options.headers.get('authorization'),null);
    assert.equal(calls.at(-1).options.headers.get('cookie'),'rbxperf=performance; rbxfps=60');
  }
});

test('changed, invalid UTF-8 and oversized direct scripts fail over without executing unchecked bytes',async t=>{
  const script=scripts[1];let direct;
  const calls=intercept(t,url=>new Response(url===cdn+script.file?direct:script.provider,{headers:{'content-type':'text/javascript'}}));
  for(direct of [script.direct+'\n// changed',new Uint8Array([255,254,253]),new Uint8Array(1024*1024+1)]){
    const before=calls.length,response=await worker.fetch(request(script.file));
    assert.equal(response.status,200);assert.equal(await response.text(),transformText(script.provider,prefix+script.file,origin));
    assert.equal(calls.length-before,2);
  }
});

test('unexpected executable MIME on a data filename is never served directly',async t=>{
  const file='content/fonts/fixture.ttf';let mime;
  const calls=intercept(t,url=>new Response(url===cdn+file?'unverified executable':'verified fallback data',
    {headers:{'content-type':url===cdn+file?mime:'application/octet-stream'}}));
  for(mime of ['text/html','TEXT/HTML; charset=utf-8','application/xhtml+xml','application/javascript','text/javascript',
    'text/ecmascript','application/ecmascript','application/x-javascript','text/jscript','text/livescript','text/css']){
    const before=calls.length,response=await worker.fetch(request(file));
    assert.equal(await response.text(),'verified fallback data',mime);
    assert.equal(response.headers.get('content-type'),'application/octet-stream');
    assert.equal(calls.length-before,2,mime);
  }
});

test('account APIs and unrelated hosts never reach either public delivery fetch',async t=>{
  const calls=intercept(t,()=>{throw new Error('account route reached public asset transport');});
  for(const path of ['/_rbx/api/session','/_rbx/api/launch','/_/'+btoa('auth.roblox.com')+'/v2/logout',
    '/_/'+btoa('users.roblox.com')+'/v1/users/authenticated']){
    assert.ok((await worker.fetch(new Request(origin+path))).status>=400);
  }
  assert.equal((await worker.fetch(request('WebClient.wasm',{method:'POST',body:'synthetic'}))).status,404);
  assert.equal(calls.length,0);
});

test('a stalled direct response falls back after the header deadline and disposes any late response',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const late=deferred(),file='content/fonts/families/Arimo.json';let canceled=0,directSignal;
  const calls=intercept(t,(url,options)=>{
    if(url===cdn+file){directSignal=options.signal;return late.promise;}
    return new Response('{"family":"fixture"}',{headers:{'content-type':'application/json'}});
  });
  const pending=worker.fetch(request(file));
  t.mock.timers.tick(12000);
  const response=await pending;
  assert.equal(response.status,200);assert.equal(await response.text(),'{"family":"fixture"}');
  assert.equal(directSignal.aborted,true);assert.equal(calls.length,2);
  late.resolve(new Response(new ReadableStream({cancel(){canceled++;}})));
  await nextTurn();assert.equal(canceled,1,'a late body is closed even if fetch ignored its abort signal');
});

test('the provider fallback also has a bounded header wait',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const begun=deferred(),file='content/fonts/families/Arimo.json';let fallbackSignal;
  const calls=intercept(t,(url,options)=>{
    if(url===cdn+file)return new Response(null,{status:503});
    fallbackSignal=options.signal;begun.resolve();return new Promise(()=>{});
  });
  const pending=worker.fetch(request(file));await begun.promise;t.mock.timers.tick(12000);
  assert.equal((await pending).status,502);assert.equal(fallbackSignal.aborted,true);assert.equal(calls.length,2);
});

test('a stalled script body is bounded before fallback and cannot pass as truncated verified source',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const script=scripts[0];let canceled=0;
  const calls=intercept(t,url=>url===cdn+script.file?
    new Response(new ReadableStream({start(output){output.enqueue(textEncoder.encode(script.direct.slice(0,40)));},cancel(){canceled++;}})):
    new Response(script.provider,{headers:{'content-type':'text/javascript'}}));
  const pending=worker.fetch(request(script.file));await nextTurn();t.mock.timers.tick(12000);
  const response=await pending;
  assert.equal(response.status,200);assert.equal(await response.text(),transformText(script.provider,prefix+script.file,origin));
  assert.equal(canceled,1);assert.equal(calls.length,2);
});

test('partial data followed by an idle timeout rejects instead of reporting a successful truncated file',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  let canceled=0,signal;
  intercept(t,(_url,options)=>{
    signal=options.signal;
    return new Response(new ReadableStream({start(output){output.enqueue(textEncoder.encode('first chunk'));},cancel(){canceled++;}}));
  });
  const response=await fetchEngineAssetResponse(cdn+'WebClient.wasm',{method:'GET'});
  const reader=response.body.getReader();
  assert.equal(new TextDecoder().decode((await reader.read()).value),'first chunk');
  const pending=reader.read(),rejected=assert.rejects(pending,/timed out/);
  await nextTurn();t.mock.timers.tick(20000);await rejected;
  assert.equal(canceled,1);assert.equal(signal.aborted,true);
});

test('large data streams incrementally and consumer cancellation does not wait on a stuck upstream cancel',async t=>{
  let output,canceled=0,signal;
  intercept(t,(_url,options)=>{
    signal=options.signal;
    return new Response(new ReadableStream({start(controller){output=controller;},cancel(){canceled++;return new Promise(()=>{});}}));
  });
  const file='WebClient.wasm',response=await fetchPublicEngineAsset(asset(file),request(file));
  const reader=response.body.getReader(),first=reader.read();
  output.enqueue(new Uint8Array(1024*1024+1));
  assert.equal((await first).value.byteLength,1024*1024+1,'the script buffering cap does not apply to streamed Wasm');
  await reader.cancel();
  assert.equal(canceled,1);assert.equal(signal.aborted,true);
});

test('an already canceled request never starts a CDN or provider fetch',async t=>{
  const calls=intercept(t,()=>{throw new Error('canceled request started a fetch');});
  const controller=new AbortController();controller.abort();
  assert.equal((await worker.fetch(request('WebClient.wasm',{signal:controller.signal}))).status,502);
  assert.equal(calls.length,0);
});
