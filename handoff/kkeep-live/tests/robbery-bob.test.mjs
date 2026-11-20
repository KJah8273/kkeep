import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {bobStreaming,bobEngineUrl,BOB_BUILD,BOB_ID} from '../worker/bob-streaming.ts';
import {findSavedGame} from '../lib/games/save-catalog.ts';
const cdn=`https://cdn.play.unity.com/game-builds/${BOB_BUILD}/`;
const request=(file,init)=>new Request(`https://kkeep.test/api/bob-streaming/${BOB_BUILD}/RobberyBob/${file}`,init);
const fixture=JSON.parse(readFileSync(new URL('./fixtures/robbery-bob/files.json',import.meta.url),'utf8'));
test('engine resolves from Unity main build, never the missing StreamingAssets engine',async()=>{
 const signed=cdn+'game.wasm?Expires=123&Signature=test';let calls=0;
 const result=await bobStreaming(request('engine.wasm'),async(url,options)=>{
  assert.equal(options.redirect,'manual');assert.equal(options.credentials,'omit');calls++;
  if(calls===1){assert.equal(url,`https://play-prod.struckd.com/api/v1/games/game/${BOB_ID}/build/${BOB_BUILD}/frame`);return new Response(`<script>const wasm="${signed}"</script>`);}
  assert.equal(url,signed);return new Response(new Uint8Array([0,97,115,109]));
 });
 assert.equal(calls,2);assert.equal(result.status,200);assert.equal(result.headers.get('Content-Type'),'application/wasm');assert.deepEqual([...new Uint8Array(await result.arrayBuffer())],[0,97,115,109]);
 for(const invalid of [cdn.replace(BOB_BUILD,'other')+'game.wasm',cdn+'StreamingAssets/RobberyBob/engine.wasm','https://other.test/game.wasm'])assert.throws(()=>bobEngineUrl(`"${invalid}"`));
});
test('every real Robbery Bob resource and encoded C++ filename survives the exact-file relay',async()=>{
 assert.ok(fixture.includes('libc++_shared.so.bin'));assert.ok(fixture.includes('game.apk'));
 for(const file of fixture.filter(n=>n!=='engine.wasm')){
  let calls=0;const response=await bobStreaming(request(file),async()=>{
   calls++;if(calls===1)return new Response(null,{status:302,headers:{Location:cdn+'StreamingAssets/RobberyBob/'+file.replaceAll('+','%2B')+'?Signature=test'}});
   return new Response('bytes',{headers:{'Content-Type':'application/octet-stream'}});
  });assert.equal(response.status,200,file);assert.equal(calls,2,file);
  if(file.endsWith('.js'))assert.equal(response.headers.get('Content-Type'),'application/javascript');
  if(file.endsWith('.m4a'))assert.equal(response.headers.get('Content-Type'),'audio/mp4');
 }
});
test('relay rejects unrelated files and hosts, preserves ranges, and never forwards credentials',async()=>{
 for(const target of ['https://example.test/a',cdn+'StreamingAssets/RobberyBob/other.js',cdn.replace('https://','https://user:secret@')+'StreamingAssets/RobberyBob/app.js']){
  let calls=0;const result=await bobStreaming(request('app.js'),async()=>{calls++;return new Response(null,{status:302,headers:{Location:target}});});assert.equal(result.status,502);assert.equal(calls,1);
 }
 for(const file of ['%2e%2e%2fsecret','%5csecret','app.js?url=https://example.test'])assert.equal((await bobStreaming(request(file),()=>{throw Error('Must not fetch');})).status,404);
 const partial=await bobStreaming(request('game.apk',{headers:{Range:'bytes=0-3',Cookie:'private'}}),async(url,options)=>{
  assert.deepEqual(options.headers,{Range:'bytes=0-3'});return new Response(new Uint8Array([80,75,3,4]),{status:206,headers:{'Content-Range':'bytes 0-3/52202547','Content-Length':'20','Content-Encoding':'gzip'}});
 });assert.equal(partial.status,206);assert.equal(partial.headers.get('Content-Range'),'bytes 0-3/52202547');assert.equal(partial.headers.has('Content-Length'),false);
});
test('native save bytes round-trip through the Profile-compatible localStorage keys',()=>{
 const data=new Map(),source=readFileSync(new URL('../public/games/robbery-bob/port.js',import.meta.url),'utf8');
 const ctx={RobberyPort:class{},Uint8Array,TextEncoder,atob,btoa,localStorage:{getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v)}};vm.createContext(ctx);vm.runInContext(source,ctx);
 const first=new ctx.BobPort();first.M={HEAPU8:new Uint8Array(100),_free(){}};first.M.HEAPU8.set([0,12,255,20],8);first.objects=new Map([[1,{ptr:8,length:4}]]);first.entry=()=>1;first.gameInitialized=true;first.progressRestored=false;
 first.saveProgress();assert.equal(data.size,0,'never overwrite progress before restoration');first.progressRestored=true;first.saveProgress();assert.equal(data.get('robbery-bob:kkeep:progress'),'AAz/FA==');
 const second=new ctx.BobPort();second.M={HEAPU8:new Uint8Array(100),_free(){}};second.alloc=()=>16;second.objects=new Map();second.object=value=>{second.objects.set(2,value);return 2;};second.log=()=>{};
 let restored;second.entry=(name,[id])=>{assert.equal(name,'LoadSavedGame');const a=second.objects.get(id);restored=[...second.M.HEAPU8.subarray(a.ptr,a.ptr+a.length)];};second.restoreProgress();assert.deepEqual(restored,[0,12,255,20]);assert.equal(second.progressRestored,true);
});
test('Robbery Bob opens through the saved-game player without a Unity page or extra toolbar',()=>{
 const game=findSavedGame('robbery-bob');assert.equal(game.gameOnly,true);assert.equal(game.entry,'/games/robbery-bob/index.html');assert.notEqual(game.external,true);
 const html=readFileSync(new URL('../public/games/robbery-bob/index.html',import.meta.url),'utf8');assert.ok(html.includes(`/api/bob-streaming/${BOB_BUILD}/RobberyBob/`));assert.ok(!html.includes('<iframe'));assert.ok(!html.includes('<nav'));
});
