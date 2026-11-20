import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {ROOM_ID,ROOM_FRAME,parseRoomBuild,roomBuild,roomAsset,allowedRoomAsset} from '../worker/room.ts';
const root=`https://cdn.play.unity.com/games/${ROOM_ID}/2b6f1ee8-4d7e-4e17-9a9c-4a5c390d703b/`;
const html=['loader.js','game.data','framework.js','game.wasm'].map(f=>'"'+root+f+'?Expires=123&Signature=abc"').join('\n');
test('resolver uses all four files from one official build and no remote HTML execution',()=>{const b=parseRoomBuild(html);assert.equal(b.loaderUrl,root+'loader.js?Expires=123&Signature=abc');assert.match(b.config.streamingAssetsUrl,/\/streaming$/);assert.throws(()=>parseRoomBuild(html.replace('game.wasm','other.wasm')));assert.throws(()=>parseRoomBuild(html.replace('cdn.play.unity.com','evil.test')));});
test('asset route rejects arbitrary hosts, other games and redirects',async()=>{for(const u of ['https://evil.test/a','http://cdn.play.unity.com/a',root+'other.js',root.replace(ROOM_ID,'other')+'loader.js',root.replace('cdn.play.unity.com','cdn.play.unity.com.evil')+'loader.js'])assert.equal(allowedRoomAsset(u),false);let called=false;const r=await roomAsset(new Request('https://kkeep.test/api/room-asset?url=https://evil.test/'),()=>{called=true;});assert.equal(r.status,404);assert.equal(called,false);});
test('download streams bytes with correct media type and no third party CORS dependency',async()=>{const r=await roomAsset(new Request('https://kkeep.test/api/room-asset?url='+encodeURIComponent(root+'loader.js')),async(url,opts)=>{assert.equal(opts.redirect,'manual');return new Response('game bytes',{headers:{'Content-Type':'application/javascript'}});});assert.equal(r.status,200);assert.equal(await r.text(),'game bytes');assert.equal(r.headers.get('Content-Type'),'application/javascript');});
test('failed build and asset responses are explicit failures',async()=>{assert.equal((await roomBuild(new Request('https://kkeep.test/api/room-build'),async()=>new Response('',{status:503}))).status,502);assert.equal((await roomAsset(new Request('https://kkeep.test/api/room-asset?url='+encodeURIComponent(root+'loader.js')),async()=>{throw Error('network');})).status,502);});

const {roomPlay,roomContent,roomContentSource,roomContentType,adaptRoomPage}=await import('../worker/room.ts');
const build='b3bb29c3-4193-48ad-b9a7-1931de600cf6';
const path='/api/room-content/'+build+'/';
test('direct launcher uses the current build and preserves retry without loading Unity',async()=>{
 const r=await roomPlay(new Request('https://kkeep.test/api/room-play?retry=1'),async()=>new Response(html));
 assert.equal(r.status,302);assert.match(r.headers.get('Location'),/\/api\/room-content\/2b6f1ee8-4d7e-4e17-9a9c-4a5c390d703b\/play.html\?retry=1$/);
});
test('content paths stay inside this game and include the native game data',()=>{
 for(const p of ['play.html','engine-asyncify.bin','libyoyo.so.bin','assets/game.droid','assets/options.ini','assets/sndbuttonprs.ogg'])assert.ok(roomContentSource(path+p));
 for(const p of ['../other/game.js','%2e%2e/game.js','https://evil.test/game.js','other.html','assets/evil.svg','bad%2ffile.js'])assert.equal(roomContentSource(path+p),null);
 assert.equal(roomContentSource('/api/room-content/invalid/game.js'),null);
 assert.equal(roomContentType('engine-asyncify.bin'),'application/wasm');assert.equal(roomContentType('libyoyo.so.bin'),'application/octet-stream');
});
test('signed redirects are followed only for the exact game, build and file',async()=>{
 const endpoint='https://kkeep.test'+path+'engine-asyncify.bin';let calls=0;
 const r=await roomContent(new Request(endpoint),async(url,opts)=>{
  assert.equal(opts.redirect,'manual');calls++;
  if(calls===1)return new Response(null,{status:302,headers:{Location:`https://cdn.play.unity.com/games/${ROOM_ID}/${build}/StreamingAssets/Game/engine-asyncify.bin?Signature=test`}});
  return new Response(new Uint8Array([0,97,115,109]),{headers:{'Content-Type':'application/octet-stream','Content-Length':'4'}});
 });
 assert.equal(calls,2);assert.equal(r.status,200);assert.equal(r.headers.get('Content-Type'),'application/wasm');assert.equal(r.headers.get('X-Uncompressed-Length'),'4');assert.deepEqual([...new Uint8Array(await r.arrayBuffer())],[0,97,115,109]);
 for(const location of ['https://evil.test/game.js',`https://cdn.play.unity.com/games/other/${build}/StreamingAssets/Game/engine-asyncify.bin`,`https://cdn.play.unity.com/games/${ROOM_ID}/${build}/StreamingAssets/Game/game.js`]){
  let requests=0;const bad=await roomContent(new Request(endpoint),async()=>{requests++;return new Response(null,{status:302,headers:{Location:location}});});
  assert.equal(bad.status,502);assert.equal(requests,1);
 }
});
test('game HTML has Kkeep feedback before scripts and preserves native start and relative assets',async()=>{
 const html='<head></head><body><canvas id="canvas"></canvas><h1>غرفه و نص</h1><p dir="ltr">port by kkeep.fun</p><button id="start">ابدأ</button><script src="game.js"></script></body>';
 const r=await roomContent(new Request('https://kkeep.test'+path+'play.html'),async()=>new Response(html));
 const body=await r.text();assert.match(r.headers.get('Content-Type'),/text\/html/);assert.ok(body.indexOf('/room-bridge.js')<body.indexOf('src="game.js"'));assert.match(body,/<h1>Kkeep<\/h1>/);assert.match(body,/id="start"/);assert.throws(()=>adaptRoomPage('<html>Unavailable</html>'));
});
test('bridge waits for the actual game, surfaces errors after readiness, and stops on pagehide',()=>{
 const listeners={},messages=[];let poll,stopped=false,contextLost;
 const state={phase:'loading',loadingStep:'Downloading',download:{loaded:20,total:100}};
 const context={window:{gameState:state,addEventListener:(n,f)=>listeners[n]=f},document:{addEventListener:(n,f)=>listeners[n]=f,querySelector:()=>({addEventListener:(n,f)=>contextLost=f})},parent:{postMessage:m=>messages.push(m)},location:{origin:'https://kkeep.test'},setInterval:f=>(poll=f,1),clearInterval:()=>stopped=true};
 vm.runInNewContext(readFileSync(new URL('../public/room-bridge.js',import.meta.url),'utf8'),context);
 poll();assert.equal(messages.some(m=>m.event==='ready'),false);assert.equal(messages.find(m=>m.event==='progress').message.progress,.2);
 state.phase='ready';poll();poll();assert.equal(messages.filter(m=>m.event==='ready').length,1);
 state.phase='error';state.error='Native startup failed';poll();assert.equal(messages.at(-1).event,'error');assert.equal(messages.at(-1).message.text,'Native startup failed');assert.equal(stopped,true);
 listeners.pagehide();
});
test('bridge catches a failed script and a lost graphics context instead of leaving black output',()=>{
 for(const scenario of ['script','graphics']){
  const listeners={},messages=[];let lost;
  vm.runInNewContext(readFileSync(new URL('../public/room-bridge.js',import.meta.url),'utf8'),{window:{addEventListener:(n,f)=>listeners[n]=f},document:{addEventListener:(n,f)=>listeners[n]=f,querySelector:()=>({addEventListener:(n,f)=>lost=f})},parent:{postMessage:m=>messages.push(m)},location:{origin:'https://kkeep.test'},setInterval:()=>1,clearInterval:()=>{}});
  if(scenario==='script')listeners.error({target:{tagName:'SCRIPT'}});else{listeners.DOMContentLoaded();lost({preventDefault(){}});}
  assert.equal(messages.at(-1).event,'error');
 }
});
