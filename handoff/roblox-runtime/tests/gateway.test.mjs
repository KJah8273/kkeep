import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import worker from '../worker/index.js';
import {responseHeaders,transformText,allowedPath} from '../worker/gateway.js';
const proxyFetch='\tself.addEventListener("fetch", (e) => {\n\t\tconst sj = self.$scramjetController;\n\t\tif (sj && sj.shouldRoute(e)) e.respondWith(sj.route(e));\n\t});';
const sessionFixture=readFileSync(new URL('./fixtures/session-api.js',import.meta.url),'utf8');
const networkFixture=readFileSync(new URL('./fixtures/session-network.js',import.meta.url),'utf8');
const relayFixture=`const CFG = new URL(location.href).searchParams;
const WS_PROTO = location.protocol === "https:" ? "wss" : "ws";
const WISP_MAIN = \`${'${WS_PROTO}'}://${'${location.host}'}/wisp/\`;
const WISP = CFG.get("wisp") || \`${'${WS_PROTO}'}://${'${location.host}'}/_rbx/wisp/\`;
let frontOffUntil = 0;
const wispUrl = () => WISP !== WISP_MAIN && Date.now() < frontOffUntil ? WISP_MAIN : WISP;
async function viaJar(){}
function createData(){}
${networkFixture}
${sessionFixture}
\tself.addEventListener("install", () => self.skipWaiting());\n${proxyFetch}`;
test('current provider worker uses provider relay for primary and fallback even with stale query',()=>{
 const source=transformText(relayFixture,'/_jar/sw.js','https://runtime.example');
 const context=vm.createContext({URL,location:new URL('https://runtime.example/_jar/sw.js?wisp=wss://runtime.example/wisp/'),self:{location:new URL('https://runtime.example/_jar/sw.js'),addEventListener(){}}});
 vm.runInContext(source,context);
 assert.equal(vm.runInContext('wispUrl()',context),'wss://api.spf50krem.com/_rbx/wisp/');
 assert.equal(vm.runInContext('frontOffUntil = Date.now() + 600000; wispUrl()',context),'wss://api.spf50krem.com/wisp/');
});
test('unknown provider relay layout fails explicitly instead of silently pointing at asset host',()=>{
 assert.throws(()=>transformText(relayFixture.replace('CFG.get("wisp")','newConfig()'),'/_jar/sw.js','https://runtime.example'),/relay configuration changed/);
});
test('all injected registrations select the repaired session worker',async()=>{
 const html=transformText('<head><script>navigator.serviceWorker.register("/_jar/sw.js")</script></head>','/_rbx/app/','https://runtime.example');
 assert.ok(html.includes('/_jar/sw.js?kk=join18'));
 const r=await worker.fetch(new Request('https://runtime.example/kkeep-session.js'));
 assert.ok((await r.text()).includes("const VERSION = 'join19'"));
});
test('current sign-in uses the primary relay and bounded startup without automatic reloads',()=>{
 const original=readFileSync(new URL('./fixtures/signin.html',import.meta.url),'utf8');
 const html=transformText(original,'/_rbx/signin','https://runtime.example');
 assert.ok(html.includes('window.__JAR_WISP__="wss://api.spf50krem.com/_rbx/wisp/"'));
 assert.ok(html.includes('await window.__kkeepSignIn.prepare()'));
 assert.ok(html.includes('await window.__kkeepSignIn.connect(controller)'));
 assert.ok(html.includes('window.__kkeepSignIn.navigate(frame);'));
 assert.ok(html.indexOf('/kkeep-signin.js')<html.indexOf('/controller/controller.api.js'));
 assert.ok(!html.includes('navigator.serviceWorker.ready'));
 assert.ok(!html.includes('location.reload()'));
 assert.ok(!html.includes('rbxweb.siroute'));
 assert.ok(!html.includes('setTimeout(() => $("loading").classList.add("done")'));
 assert.throws(()=>transformText(original.replace('await controller.wait();','await changedWait();'),'/_rbx/signin','https://runtime.example'),/startup changed/);
});
test('current app can finish loading before worker control without the stop/reload loop',async()=>{
 const original=readFileSync(new URL('./fixtures/app.html',import.meta.url),'utf8');
 const html=transformText(original,'/_rbx/app/','https://runtime.example');
 let starts=0;
 const pending=new Promise(()=>{});
 for(const script of html.matchAll(/<script>([\s\S]*?)<\/script>/g)){
  vm.runInNewContext(script[1],{window:{__kkeepSessionReady(){starts++;return pending;},top:{}},document:{body:{classList:{add(){}}}}});
 }
 assert.equal(starts,1);
 assert.ok(!html.includes('window.stop()'));
 assert.ok(!html.includes('location.reload()'));
 assert.ok(!html.includes('sw.ready'));
 assert.ok(html.includes('window.__RBX_JAR__=true'));
 assert.ok(html.includes('src="app.js"'));
 assert.ok(html.includes('href="app.css"'));
 const r=await worker.fetch(new Request('https://runtime.example/health'));
 assert.equal((await r.json()).revision,'join19');
});
test('uses Safari-compatible isolation and removes upstream identity headers',()=>{
 const h=responseHeaders({'set-cookie':'secret=x','Cross-Origin-Embedder-Policy':'credentialless','Document-Isolation-Policy':'isolate-and-credentialless','Location':'https://api.spf50krem.com/_rbx/signin'},'https://runtime.example');
 assert.equal(h.get('cross-origin-embedder-policy'),'require-corp');
 assert.equal(h.get('cross-origin-opener-policy'),'same-origin');
 assert.equal(h.get('set-cookie'),null);assert.equal(h.get('document-isolation-policy'),null);
 assert.equal(h.get('location'),'https://runtime.example/_rbx/signin');
});
test('rejects server auth fallback and unrelated routes',async()=>{
 for(const path of ['/_rbx/api/session','/_/YXV0aC5yb2Jsb3guY29t/v2/login','/_/'+btoa('economy.roblox.com')+'/v1/user/currency','/_/'+btoa('clientsettings.roblox.com')+'/v2/user-channel','/api/profile','/https://evil.example']){
  const r=await worker.fetch(new Request('https://runtime.example'+path));assert.ok(r.status>=400);
 }
 assert.equal(allowedPath('/controller/controller.sw.js'),true);
 assert.equal(allowedPath('/_jar/sw.js'),true);
 assert.equal(allowedPath('/admin'),false);
});
test('patches fail closed if provider memory implementation changes',()=>{
 assert.throws(()=>transformText('different hook','/hook.js','https://runtime.example'),/changed/);
});
test('public asset gateway never forwards identity cookies or Authorization',async()=>{
 const original=global.fetch;let options;
 global.fetch=async(url,init)=>{options=init;return new Response('x',{headers:{'content-type':'image/png'}})};
 try{
  await worker.fetch(new Request('https://runtime.example/_rbx/app/icon.png',{headers:{Cookie:'token=private; rbxfps=30',Authorization:'Bearer private'}}));
  assert.equal(options.headers.get('cookie'),'rbxperf=performance; rbxfps=30');
  assert.equal(options.headers.get('authorization'),null);
 }finally{global.fetch=original;}
});
test('adds preflight before game bootstrap and keeps backend transport',()=>{
 const html=transformText('<head><script src="/hook.js"></script></head>','/_/cGxheS5yb2Jsb3guY29t/games/start','https://runtime.example');
 assert.ok(html.indexOf('kkeep-runtime.js')<html.indexOf('hook.js'));
 const sw=transformText('const WISP = new URL(location.href).searchParams.get("wisp") || `x`;\nasync function viaJar(){}\n'+networkFixture+sessionFixture+'\n\tself.addEventListener("install", () => self.skipWaiting());\n'+proxyFetch,'/_jar/sw.js','https://runtime.example');
 assert.ok(sw.includes('wss://api.spf50krem.com/wisp/'));
 assert.ok(sw.includes('sessionWorker'));
 assert.ok(html.includes('/kkeep-session.js'));
});
test('sets the verified engine memory flag consistently for iPad only',()=>{
 const source='function pe(){return navigator.userAgent.includes("Android")} return parseInt(s.applicationSettings.FIntWasmMemoryPages??"32768")';
 const path='/_/c2V0dXAucmJ4Y2RuLmNvbQ/webclient/version-f807b21caba84809-RobloxWebClient/WasmPlayer.js';
 const patched=transformText(source,path,'https://runtime.example');
 const run=new Function('window','s',patched);
 const flags={applicationSettings:{}};
 assert.equal(run({__kkeepRuntime:{mobile:true}},flags),16384);
 assert.equal(flags.applicationSettings.FIntWasmMemoryPages,'16384');
 assert.equal(run({__kkeepRuntime:{mobile:false}},{applicationSettings:{}}),32768);
 assert.equal(transformText(source,path.replace('f807b21caba84809','unverified'),'https://runtime.example'),source);
});
test('each verified engine loader uses its exact memory and mobile contract; unknown builds stay unchanged',()=>{
 const source=readFileSync(new URL('./fixtures/WasmPlayer-1ef.js',import.meta.url),'utf8');
 const path='/_/c2V0dXAucmJ4Y2RuLmNvbQ/webclient/version-1ef59424f70d4932-RobloxWebClient/WasmPlayer.js';
 const output=transformText(source,path,'https://runtime.example');
 const setting=output.match(/parseInt\(\(window\.__kkeepRuntime[\s\S]*?\)\)/)?.[0];
 assert.ok(setting,'read the memory expression from the actual transformed player');
 const run=new Function('window','i','return '+setting);
 const flags={applicationSettings:{}};
 assert.equal(run({__kkeepRuntime:{mobile:true}},flags),16384);
 assert.equal(flags.applicationSettings.FIntWasmMemoryPages,'16384');
 assert.equal(run({__kkeepRuntime:{mobile:false}},{applicationSettings:{}}),32768);
 assert.ok(output.includes('function _e(){return window.__kkeepRuntime?.mobile??'));
 assert.throws(()=>transformText(source.replace('function _e()','function changed()'),path,'https://runtime.example'),/Engine loader changed/);
 assert.equal(transformText(source,path.replace('1ef59424f70d4932','0000000000000000'),'https://runtime.example'),source.replaceAll('https://api.spf50krem.com','https://runtime.example'));
 const worker=transformText(readFileSync(new URL('./fixtures/WebClient-1ef.js',import.meta.url),'utf8'),path.replace('WasmPlayer.js','WebClient.js'),'https://runtime.example');
 assert.ok(worker.includes('function sessionClient('));assert.ok(worker.includes('function transportBootstrap('));
});
