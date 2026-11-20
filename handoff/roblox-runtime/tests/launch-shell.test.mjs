import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
import worker from '../worker/index.js';
import {transformText,UPSTREAM} from '../worker/gateway.js';
import {resolvePublicEngine,engineProfiles} from '../worker/engine.js';
import {pinnedLaunchResource,pinnedLaunchResponse,verifyPinnedLaunchBody} from '../worker/launch-shell.js';
import data from '../worker/launch-data.json' with {type:'json'};

const origin='https://runtime.example';
const launch='/_/cGxheS5yb2Jsb3guY29t/games/start';
const build='/277b9a60aa4d6118e89b19fbc8ca6f1e4e5eb81a';
const loader=build+'/assets/webclient/WasmLoader.js';
const stub=build+'/assets/webclient/stub.js';
const gameChunk=build+'/_next/static/chunks/918-0935162cc5291a5b.js';
const fixture=name=>readFileSync(new URL('./fixtures/'+name,import.meta.url),'utf8');
const bytes=record=>record.encoding==='utf8'?Buffer.from(record.body):Buffer.from(record.body,'base64');
const text=path=>bytes(data.resources[path]).toString('utf8');
const select=(path,method='GET')=>pinnedLaunchResource(new URL(origin+path),method);
function prohibitNetwork(t){
  let calls=0;
  t.mock.method(globalThis,'fetch',()=>{calls++;throw new Error('Bundled bootstrap contacted a network source');});
  return ()=>calls;
}

test('the bundle retains the exact inspected static shell and every normal bootstrap dependency',()=>{
  const html=text(launch),css=build+'/_next/static/css/d038dea27efea813.css';
  assert.equal(html,fixture('launch-shell-277b.html'));
  const metadata=JSON.parse(html.match(/<script id="__NEXT_DATA__" type="application\/json">([^<]+)<\/script>/)[1]);
  assert.equal(metadata.buildId,'DCgUIV5YV31_w_sF9lwt2');assert.equal(metadata.assetPrefix,build);
  assert.deepEqual(metadata.props,{pageProps:{}});assert.deepEqual(metadata.query,{});
  assert.equal(metadata.page,'/games/start');assert.equal(metadata.nextExport,true);assert.equal(metadata.autoExport,true);
  const htmlPaths=[...html.matchAll(/(?:src|href)="([^"]+)"/g)].map(match=>match[1]);
  const cssPaths=[...text(css).matchAll(/url\(["']?([^\)"']+)/g)].map(match=>match[1]);
  for(const path of [...htmlPaths,...cssPaths,loader,stub,'/_rbx/engine'])assert.ok(data.resources[path],'bundled dependency: '+path);
  assert.equal(new Set(cssPaths.filter(path=>path.includes('/assets/loading/'))).size,7);
  assert.equal(text(gameChunk),fixture('play-page-chunk.js'));
  assert.equal(text(loader),fixture('WasmLoader.js'));
  assert.equal(text(stub),fixture('stub.js'));
  assert.equal(text('/hook.js'),fixture('hook.js'));
  assert.ok(text(gameChunk).includes('"'+build+'/assets","/webclient/WasmLoader.js"'));
  assert.ok(text(gameChunk).includes('"'+build+'/assets","/webclient/stub.js"'));
  assert.equal(Object.keys(data.resources).length,24);
  assert.equal(Object.keys(data.resources).some(path=>path.includes('/6536749aa05e452da9c4d6ed4b464613ff9ba84a/')),false);
});

test('every pinned body matches its recorded byte length and SHA256 before delivery',async()=>{
  for(const [path,record] of Object.entries(data.resources)){
    const body=bytes(record);
    assert.equal(body.length,record.bytes,path);
    assert.equal(createHash('sha256').update(body).digest('hex'),record.sha256,path);
    assert.deepEqual(Buffer.from(await verifyPinnedLaunchBody(record)),body,path);
    if(record.type.startsWith('text/javascript'))assert.doesNotThrow(()=>new vm.Script(body.toString('utf8')),path);
  }
});

test('launch requests preserve live query choices without forwarding or embedding them in the static response',async t=>{
  const networkCalls=prohibitNetwork(t);
  const expected=transformText(fixture('launch-shell-277b.html'),launch,origin);
  for(const query of ['?placeId=123&gpu=webgl&fps=30&wt=relay',
    '?placeId=456&gpu=webgpu&fps=60&res=auto&job=fixture-job&privateFixture=do-not-copy']){
    const request=new Request(origin+launch+query,{headers:{cookie:'synthetic=private',authorization:'Bearer synthetic'}});
    const response=await worker.fetch(request);
    assert.equal(response.status,200);assert.equal(await response.text(),expected);
    assert.equal(request.url,origin+launch+query);
    assert.equal(expected.includes('do-not-copy'),false);assert.equal(expected.includes('fixture-job'),false);
    assert.equal(response.headers.get('set-cookie'),null);assert.equal(response.headers.get('cache-control'),'no-store');
  }
  assert.equal(networkCalls(),0,'the document is available even when the public provider is unavailable');
});

test('the delivered document preserves runtime/session/hook ordering ahead of the same-build Next bootstrap',async t=>{
  const networkCalls=prohibitNetwork(t);
  const html=await (await worker.fetch(new Request(origin+launch+'?placeId=123'))).text();
  const ordered=['src="/kkeep-runtime.js"','src="/kkeep-session.js"','src="/kkeep-preferences.js"',
    'var base="/_jar/sw.js?kk=join18"','src="/hook.js"',build+'/_next/static/chunks/webpack-'];
  let previous=-1;
  for(const marker of ordered){const at=html.indexOf(marker);assert.ok(at>previous,marker+' keeps its bootstrap order');previous=at;}
  assert.ok(html.includes('"query":{}'));
  assert.equal(networkCalls(),0);
});

test('all bundled static assets retain their existing transforms and binary bytes without any public fetch',async t=>{
  const networkCalls=prohibitNetwork(t);
  for(const [path,record] of Object.entries(data.resources)){
    if(path===launch)continue;
    const response=await worker.fetch(new Request(origin+path,{headers:{cookie:'synthetic=private',authorization:'Bearer synthetic'}}));
    assert.equal(response.status,200,path);
    const actual=Buffer.from(await response.arrayBuffer());
    const expected=/text\/html|javascript|text\/css/.test(record.type)?Buffer.from(transformText(text(path),path,origin)):bytes(record);
    assert.deepEqual(actual,expected,path);
    assert.equal(response.headers.get('set-cookie'),null,path);
    if(record.type.includes('javascript'))assert.doesNotThrow(()=>new vm.Script(actual.toString('utf8')),path);
  }
  assert.equal(networkCalls(),0);
});

test('the worker stub retains the provider hook and validates the live engine source after transformation',async t=>{
  prohibitNetwork(t);
  const source=await (await worker.fetch(new Request(origin+stub+'?src=fixture-engine&wt=relay'))).text();
  assert.equal(source,transformText(fixture('stub.js'),stub,origin));
  const install=source.indexOf('function install(scope, origin)');
  const validate=source.indexOf('var ALLOWED_ENGINE_PREFIXES');
  const execute=source.indexOf('importScripts(engineScriptUrl)');
  assert.ok(install>=0&&validate>install&&execute>validate);
  assert.ok(source.includes('new URLSearchParams(self.location.search).get("src")'));
  assert.ok(source.includes('ALLOWED_ENGINE_PREFIXES.some'));
  assert.ok(source.includes('function sessionClient('));
  assert.ok(source.includes('__kkeepForceRelay'));
  assert.equal(source.includes('fixture-engine'),false,'the worker query is read at runtime, never baked into another visitor’s source');
});

test('HEAD verifies bundled resources but returns no body, and byte-range input cannot produce partial scripts',async t=>{
  const networkCalls=prohibitNetwork(t);
  for(const path of [launch+'?placeId=123',gameChunk,stub+'?src=fixture-engine',build+'/assets/loading/BuilderSans-Regular.otf']){
    const response=await worker.fetch(new Request(origin+path,{method:'HEAD',headers:{range:'bytes=0-20','if-range':'fixture'}}));
    assert.equal(response.status,200);assert.equal(await response.text(),'');assert.equal(response.headers.get('content-range'),null);
  }
  const response=await worker.fetch(new Request(origin+gameChunk,{headers:{range:'bytes=0-20'}}));
  assert.equal(response.status,200);assert.equal(await response.text(),transformText(fixture('play-page-chunk.js'),gameChunk,origin));
  assert.equal(networkCalls(),0);
});

test('asset selection stays exact and does not replace session, account, settings or another build',()=>{
  for(const path of ['/_rbx/api/session','/_rbx/api/launch','/_jar/sw.js?kk=join18','/_rbx/app/',
    '/_/Y2xpZW50c2V0dGluZ3NjZG4ucm9ibG94LmNvbQ/v2/settings/application/WebClientApp',
    build+'/assets/webclient/unknown.js',gameChunk+'?v=other',loader+'?src=other','/_rbx/engine?version=other',
    gameChunk.replace('277b9a60aa4d6118e89b19fbc8ca6f1e4e5eb81a','6536749aa05e452da9c4d6ed4b464613ff9ba84a'),
    launch.replace('cGxheS5yb2Jsb3guY29t','cGxheS5yb2Jsb3guY29t.evil'),launch+'#fragment'])assert.equal(select(path),null,path);
  for(const method of ['POST','DELETE','PUT','OPTIONS'])assert.equal(select(launch,method),null);
  assert.ok(select(launch+'?placeId=123&gpu=webgpu'));assert.ok(select(stub+'?src=fixture-engine&wt=relay'));
});

test('public metadata stays pinned to the inspected binary while the delivered loader retains live channel selection',async t=>{
  const networkCalls=prohibitNetwork(t);
  const metadata=await (await worker.fetch(new Request(origin+'/_rbx/engine'))).json();
  assert.equal(metadata.version,'version-1ef59424f70d4932');assert.ok(engineProfiles[metadata.version]);
  assert.equal(resolvePublicEngine(metadata).wasmPath,'/_/c2V0dXAucmJ4Y2RuLmNvbQ/webclient/version-1ef59424f70d4932-RobloxWebClient/WebClient.wasm');
  const source=await (await worker.fetch(new Request(origin+loader))).text();
  assert.equal(source,transformText(fixture('WasmLoader.js'),loader,origin));
  assert.ok(source.includes('await prepareBrowserSession();'));
  assert.ok(source.includes('const userChannel = await resolveUserChannel(server, cdnProxy);'));
  assert.ok(source.includes('!clientVersionUpload && server === "prod" && isProductionChannel(channelName)'));
  assert.equal(networkCalls(),0);
});

test('public platform settings still use the existing provider and preference transform',async t=>{
  const calls=[];
  t.mock.method(globalThis,'fetch',async(url,options)=>{calls.push({url,options});return new Response('{"applicationSettings":{"fixtureProfile":"keep"}}',{headers:{'content-type':'application/json'}});});
  const path='/_/'+btoa('clientsettingscdn.roblox.com').replace(/=+$/,'')+'/v2/settings/application/WebClientApp?rbxgpu=webgpu';
  const response=await worker.fetch(new Request(origin+path));
  assert.equal(response.status,200);assert.equal(calls.length,1);assert.equal(calls[0].url,UPSTREAM+path);
  assert.equal((await response.json()).applicationSettings.fixtureProfile,'keep');
});

test('corrupt bundled bytes fail closed and never fall back to an unchecked external source',async t=>{
  const networkCalls=prohibitNetwork(t),original=data.resources[launch];
  const altered={...original,body:original.body.replace('<html','<fail')};
  await assert.rejects(verifyPinnedLaunchBody(altered),/Pinned launch resource changed/);
  await assert.rejects(pinnedLaunchResponse(altered),/Pinned launch resource changed/);
  data.resources[launch]=altered;
  try{
    const response=await worker.fetch(new Request(origin+launch+'?placeId=123'));
    assert.equal(response.status,502);assert.equal((await response.text()).includes('<fail'),false);
    assert.equal(networkCalls(),0);
  }finally{data.resources[launch]=original;}
});

test('health identifies bundled launch delivery without changing the session protocol',async()=>{
  const health=await (await worker.fetch(new Request(origin+'/health'))).json();
  assert.equal(health.revision,'join19');assert.equal(health.launchDelivery,'bundled-inspected-build');
  assert.equal(health.assetDelivery,'verified-public-cdn');assert.equal(health.sharedAccount,false);
});
