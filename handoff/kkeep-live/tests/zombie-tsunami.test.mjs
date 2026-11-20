import test from 'node:test';
import assert from 'node:assert/strict';
import {parseZombieBuild,zombieBuild,zombieAsset,allowedZombieAsset,ZOMBIE_ID} from '../worker/zombie.ts';
import {findSavedGame} from '../lib/games/save-catalog.ts';
import {zombieStreaming,ZOMBIE_BUILD} from '../worker/zombie-streaming.ts';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const build='0b5c4574-1b88-46c4-8df1-ca32b7472c95';
const base=`https://cdn.play.unity.com/games/${ZOMBIE_ID}/${build}/`;
const html=['loader.js','game.data','framework.js','game.wasm'].map(f=>`"${base}${f}?Expires=123&Signature=test"`).join('\n');
test('build resolution uses fresh signed URLs and rejects mixed or missing builds',async()=>{
 const parsed=parseZombieBuild(html);assert.equal(parsed.config.productVersion,build);assert.ok(parsed.loaderUrl.endsWith('Signature=test'));
 assert.throws(()=>parseZombieBuild(html.replace('/game.wasm','/missing.wasm')));
 assert.throws(()=>parseZombieBuild(html.replace(`${build}/game.wasm`,'aaaaaaaa-1111-2222-3333-bbbbbbbbbbbb/game.wasm')));
 const response=await zombieBuild(new Request('https://kkeep.test/api/zombie-build'),async()=>new Response(html));
 assert.equal(response.status,200);assert.equal(response.headers.get('Access-Control-Allow-Origin'),'*');assert.equal(response.headers.get('Cache-Control'),'no-store');
});
test('game asset relay accepts only this game, streams bytes, and does not follow redirects',async()=>{
 assert.equal(allowedZombieAsset(base+'game.wasm'),true);
 for(const url of ['https://example.com/game.wasm',base+'../secret',base+'other.js',base.replace(ZOMBIE_ID,build)+'game.wasm'])assert.equal(allowedZombieAsset(url),false);
 const req=new Request('https://kkeep.test/api/zombie-asset?url='+encodeURIComponent(base+'game.wasm'));
 const bytes=new Uint8Array([0,97,115,109]);
 const response=await zombieAsset(req,async(url,options)=>{assert.equal(options.redirect,'manual');return new Response(bytes,{headers:{'Content-Type':'application/wasm','Content-Length':'4'}});});
 assert.deepEqual(new Uint8Array(await response.arrayBuffer()),bytes);assert.equal(response.headers.get('Access-Control-Allow-Origin'),'*');
 assert.equal((await zombieAsset(req,async()=>new Response(null,{status:302,headers:{Location:'https://example.com'}}))).status,502);
});
test('Zombie Tsunami uses the isolated Profile-save player with game-only presentation',()=>{
 const game=findSavedGame('zombie-tsunami');assert.ok(game);assert.equal(game.gameOnly,true);assert.equal(game.entry,'/games/zombie-tsunami/index.html');assert.notEqual(game.external,true);
});
const streamingRequest=(path,init)=>new Request(`https://kkeep.test/api/zombie-streaming/${ZOMBIE_BUILD}/${path}`,init);
test('streaming follows the real Unity 302 to the same game file and preserves signed parameters',async()=>{
 const signed=base+'StreamingAssets/game/index.html?Expires=123&Signature=test';let calls=0;
 const response=await zombieStreaming(streamingRequest('game/index.html'),async(url,options)=>{
  assert.equal(options.redirect,'manual');assert.equal(options.credentials,'omit');calls++;
  if(calls===1)return new Response(null,{status:302,headers:{Location:signed}});
  assert.equal(url,signed);return new Response('<canvas></canvas>',{headers:{'Content-Type':'text/html'}});
 });
 assert.equal(response.status,200);assert.equal(calls,2);assert.equal(await response.text(),'<canvas></canvas>');assert.equal(response.headers.get('Access-Control-Allow-Origin'),'*');
});
test('every published Zombie file can pass the relay, including the C++ runtime',async()=>{
 const files=JSON.parse(readFileSync(new URL('./fixtures/zombie/files.json',import.meta.url),'utf8'));
 assert.ok(files.includes('libc++_shared.so.bin'));
 for(const file of files){
  let calls=0;
  const response=await zombieStreaming(streamingRequest('game/'+file),async url=>{
   calls++;if(calls===1)return new Response(null,{status:302,headers:{Location:base+'StreamingAssets/game/'+file.replaceAll('+','%2B')+'?Signature=test'}});
   return new Response('game bytes');
  });
  assert.equal(response.status,200,file);assert.equal(calls,2,file);
 }
});
test('streaming refuses redirects to unrelated hosts, builds, files, and credentials',async()=>{
 for(const target of ['https://example.com/game/index.html',base.replace(ZOMBIE_ID,build)+'StreamingAssets/game/index.html',base+'StreamingAssets/game/other.html',base.replace('https://','https://user:secret@')+'StreamingAssets/game/index.html']){
  let calls=0;const result=await zombieStreaming(streamingRequest('game/index.html'),async()=>{calls++;return new Response(null,{status:302,headers:{Location:target}});});assert.equal(result.status,502);assert.equal(calls,1);
 }
 for(const path of ['game/%2e%2e%2fsecret','game/%5csecret','game/index.html?url=https://example.com','other/index.html']){
  const result=await zombieStreaming(streamingRequest(path),async()=>{throw Error('Must not fetch');});assert.equal(result.status,404);
 }
});
test('streaming preserves partial downloads and drops encoded upstream lengths',async()=>{
 const result=await zombieStreaming(streamingRequest('game/engine.bin',{headers:{Range:'bytes=0-3'}}),async(url,options)=>{assert.equal(options.headers.Range,'bytes=0-3');return new Response(new Uint8Array([0,97,115,109]),{status:206,headers:{'Content-Range':'bytes 0-3/100','Content-Length':'20','Content-Encoding':'gzip'}});});
 assert.equal(result.status,206);assert.equal(result.headers.get('Content-Range'),'bytes 0-3/100');assert.equal(result.headers.has('Content-Length'),false);assert.deepEqual([...new Uint8Array(await result.arrayBuffer())],[0,97,115,109]);
});
test('Unity octet-stream files get executable script, stylesheet, and Wasm MIME types',async()=>{
 for(const [file,type] of [['engine.js','application/javascript'],['style.css','text/css'],['assets.json','application/json'],['engine.bin','application/wasm'],['fmod/fmodstudio.bin','application/wasm'],['libcgame.so.bin','application/octet-stream']]){
  const response=await zombieStreaming(streamingRequest('game/'+file),async()=>new Response('bytes',{headers:{'Content-Type':'application/octet-stream'}}));
  assert.equal(response.headers.get('Content-Type'),type);assert.equal(response.headers.get('X-Content-Type-Options'),'nosniff');
 }
});
test('native game opens directly, without a second Unity player or bottom toolbar',()=>{
 const html=readFileSync(new URL('../public/games/zombie-tsunami/index.html',import.meta.url),'utf8');
 assert.ok(html.includes(`/api/zombie-streaming/v2/${ZOMBIE_BUILD}/game/`));assert.ok(html.includes('<nav hidden'));assert.ok(html.includes('/games/zombie-tsunami/app.js'));assert.ok(!html.includes('player.js'));
});
test('actual game save files round-trip through Kkeep-compatible localStorage',()=>{
 const source=readFileSync(new URL('../public/games/zombie-tsunami/saves.js',import.meta.url),'utf8'),storage=new Map();
 function create(files){const ctx={Uint8Array,atob,btoa,localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)}};vm.createContext(ctx);vm.runInContext(source,ctx);
  const FS={mkdirTree(){},readdir:dir=>['.','..',...Object.keys(files).filter(p=>p.startsWith(dir+'/')).map(p=>p.slice(dir.length+1))],stat:()=>({mode:1}),isDir:()=>false,readFile:p=>files[p],writeFile:(p,bytes)=>files[p]=bytes};return new ctx.BrowserSaves({FS},()=>{});}
 const first=create({'/save/progress.dat':new Uint8Array([1,2,255,7])});first.flush();assert.ok(storage.has('zombie-tsunami-4.7.4-save-v1'));
 const restored={};create(restored).restore();assert.deepEqual([...restored['/save/progress.dat']],[1,2,255,7]);
});
