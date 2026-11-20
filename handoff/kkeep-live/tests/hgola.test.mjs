import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {fitGameCanvas} from '../public/hgola-display.js';
import {HGOLA_ID,HGOLA_FRAME,parseHgolaBuild,hgolaBuild,hgolaAsset,allowedHgolaAsset} from '../worker/hgola.ts';
const root=`https://cdn.play.unity.com/games/${HGOLA_ID}/2b6f1ee8-4d7e-4e17-9a9c-4a5c390d703b/`;
const html=['loader.js','game.data.gz','framework.js.gz','game.wasm.gz'].map(f=>'"'+root+f+'?Expires=123&Signature=abc"').join('\n');
test('resolver uses all four files from one official build and no remote HTML execution',()=>{const b=parseHgolaBuild(html);assert.equal(b.loaderUrl,root+'loader.js?Expires=123&Signature=abc');assert.match(b.config.streamingAssetsUrl,/\/streaming$/);assert.throws(()=>parseHgolaBuild(html.replace('game.wasm.gz','other.wasm')));assert.throws(()=>parseHgolaBuild(html.replace('cdn.play.unity.com','evil.test')));});
test('asset route rejects arbitrary hosts, other games and redirects',async()=>{for(const u of ['https://evil.test/a','http://cdn.play.unity.com/a',root+'other.js',root.replace(HGOLA_ID,'other')+'loader.js',root.replace('cdn.play.unity.com','cdn.play.unity.com.evil')+'loader.js'])assert.equal(allowedHgolaAsset(u),false);let called=false;const r=await hgolaAsset(new Request('https://kkeep.test/api/hgola-asset?url=https://evil.test/'),()=>{called=true;});assert.equal(r.status,404);assert.equal(called,false);});
test('download streams bytes with correct media type and no third party CORS dependency',async()=>{const r=await hgolaAsset(new Request('https://kkeep.test/api/hgola-asset?url='+encodeURIComponent(root+'loader.js')),async(url,opts)=>{assert.equal(opts.redirect,'manual');return new Response('game bytes',{headers:{'Content-Type':'application/javascript'}});});assert.equal(r.status,200);assert.equal(await r.text(),'game bytes');assert.equal(r.headers.get('Content-Type'),'application/javascript');});
test('failed build and asset responses are explicit failures',async()=>{assert.equal((await hgolaBuild(new Request('https://kkeep.test/api/hgola-build'),async()=>new Response('',{status:503}))).status,502);assert.equal((await hgolaAsset(new Request('https://kkeep.test/api/hgola-asset?url='+encodeURIComponent(root+'loader.js')),async()=>{throw Error('network');})).status,502);});
const runtime=readFileSync(new URL('../public/hgola-runtime.js',import.meta.url),'utf8');
async function run(fail=false,navigatorInfo={}){const events=[],handlers={};let supplied;const context={createStreamingGameFetch:fetch=>fetch,fitGameCanvas,prepareBackup:async()=>({start(){},save(){},stop(){}}),performance:{now:()=>100},console,navigator:navigatorInfo,parent:{postMessage:v=>events.push(v)},location:{origin:'https://kkeep.test',search:''},window:{fetch:async()=>{},addEventListener:(k,v)=>handlers[k]=v},document:{createElement:()=>({remove(){}}),head:{append:s=>{if(s.onload)s.onload();}},getElementById:()=>({dataset:{},focus(){}})},AbortSignal,URLSearchParams,encodeURIComponent,setTimeout,clearTimeout,matchMedia:()=>({matches:true}),devicePixelRatio:3,createUnityInstance:async(c,opts,p)=>{if(fail)throw Error('engine');supplied=opts;p(.5);return {Quit:async()=>{}};}};vm.runInNewContext(runtime.replace(/^import .*;$/gm,''),context);await new Promise(r=>setImmediate(r));return {events,supplied,handlers};}
test('runtime sends readiness only after engine resolves, forwards progress and caps touch resolution',async()=>{const {events,supplied}=await run();assert.equal(events.at(-1).event,'ready');assert.ok(events.some(e=>e.event==='progress'&&e.message.progress===.5));assert.equal(supplied.devicePixelRatio,1);assert.ok(supplied.codeUrl.startsWith('/api/hgola-files/'));assert.equal(supplied.autoSyncPersistentDataPath,true);assert.equal(supplied.companyName,'play.unity.com');assert.equal(supplied.productName,'Unity Play Project');});
test('runtime reports failed build instead of leaving a spinner forever',async()=>{const {events}=await run(true);assert.equal(events.at(-1).event,'error');assert.equal(events.some(e=>e.event==='ready'),false);});

test('iPad desktop mode and iPhone skip the full response cache clone without disabling progress saves',async()=>{
 for(const nav of [{userAgent:'Mozilla iPad',platform:'iPad',maxTouchPoints:5},{userAgent:'Mozilla Macintosh Safari',platform:'MacIntel',maxTouchPoints:5},{userAgent:'Mozilla iPhone',platform:'iPhone',maxTouchPoints:5}]){
  const {supplied}=await run(false,nav);
  assert.equal(supplied.cacheControl(supplied.dataUrl),'no-store');assert.equal(supplied.webglContextAttributes.antialias,false);assert.equal(supplied.autoSyncPersistentDataPath,true);
 }
 for(const nav of [{platform:'MacIntel',maxTouchPoints:0},{platform:'Win32',maxTouchPoints:0}]){
  const {supplied}=await run(false,nav);assert.equal(supplied.cacheControl(supplied.dataUrl),'immutable');
 }
});

test('Hgola resolves the exact Unity frame requested for the new build',()=>{assert.equal(HGOLA_FRAME,'https://play.unity.com/api/v1/games/game/48d6dff8-fc06-4898-af57-aa06155944fe/build/latest/frame');});
