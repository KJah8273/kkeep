import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {brotliCompressSync,brotliDecompressSync} from 'node:zlib';
import {memoryStorage,storageEntries} from '../lib/games/save-codec.mjs';
import {gameContent,gameBrotliType} from '../worker/game-content.ts';
import {findSavedGame} from '../lib/games/save-catalog.ts';
import {gameAssetUrl} from '../lib/games/asset-url.ts';
import {IDBFactory} from 'fake-indexeddb';
import {exportDatabase,restoreDatabases} from '../lib/games/save-codec.mjs';

const adapter=readFileSync(new URL('../public/games/playables-profile.js',import.meta.url),'utf8');
function device(entries=[],unityReady){
 const localStorage=memoryStorage(entries),document=new EventTarget();document.hidden=false;
 const window=new EventTarget();if(unityReady)window.kkeepUnityReady=unityReady;
 const context=vm.createContext({window,document,localStorage,Event,console,navigator:{language:'en-US'}});
 vm.runInContext(adapter,context);return {window,document,localStorage,api:window.ytgame};
}
for(const slug of ['turbo-stars','bridge-race','bowmasters'])test(slug+' native Playables save is restored byte-for-byte before the next session starts',async()=>{
 const first=device();const progress=JSON.stringify({level:12,coins:425,unlocked:['default','blue'],settings:{sound:false}});
 await first.api.game.saveData(progress);
 const snapshot=storageEntries(first.localStorage);
 assert.equal(snapshot.length,1);
 const second=device(snapshot);assert.equal(await second.api.game.loadData(),progress);
 assert.equal(await device().api.game.loadData(),'');
 assert.equal(findSavedGame(slug).external,false);
 await assert.rejects(()=>second.api.game.saveData('x'.repeat(750001)));
 assert.equal(await second.api.game.loadData(),progress);
});
test('Bridge Race waits for its Unity receiver instead of dropping the restored save during boot',async()=>{
 let ready;const gate=new Promise(resolve=>ready=resolve);
 const player=device([['kkeep.playables.progress.v1','level-9']],gate);
 let delivered=false;const load=player.api.game.loadData().then(data=>{delivered=true;return data;});
 await Promise.resolve();assert.equal(delivered,false);ready();assert.equal(await load,'level-9');
});
test('native pause/resume subscriptions follow page visibility and can unsubscribe',()=>{
 const p=device();let paused=0,resumed=0;
 const off=p.api.system.onPause(()=>paused++);p.api.system.onResume(()=>resumed++);
 p.document.hidden=true;p.document.dispatchEvent(new Event('visibilitychange'));
 p.document.hidden=false;p.document.dispatchEvent(new Event('visibilitychange'));off();
 p.document.hidden=true;p.document.dispatchEvent(new Event('visibilitychange'));
 assert.equal(paused,1);assert.equal(resumed,1);
});
test('the pinned compressed engine is delivered with Brotli metadata and WebAssembly MIME',async()=>{
 const path='/gh/bubbls/youtube-playables@f86d947cd3a8c7271fc251ae687bb8c9ffd2a170/turbo-stars/Build/b8d7ec9f26d230dd840bc9156037ef05.wasm.br';
 const wasm=Uint8Array.from([0,97,115,109,1,0,0,0]),compressed=brotliCompressSync(wasm);
 const response=await gameContent(new Request('https://kkeep.test/api/game-resource/turbo-stars/1'+path),{}, {waitUntil(){}},async()=>new Response(compressed,{headers:{'Content-Length':String(compressed.length)}}));
 assert.equal(response.headers.get('Content-Encoding'),'br');assert.equal(response.headers.get('Content-Type'),'application/wasm');
 assert.deepEqual(new Uint8Array(brotliDecompressSync(Buffer.from(await response.arrayBuffer()))),wasm);
 assert.equal(gameBrotliType(new URL('https://evil.test'+path)),null);
 assert.equal(gameBrotliType(new URL('https://cdn.jsdelivr.net/unknown.wasm.br')),null);
});
test('Tomb of the Mask unwraps only its configured player and retains a verified source fallback',async()=>{
 const game=findSavedGame('tomb-of-the-mask');let calls=[];
 const invoke=fn=>gameContent(new Request('https://kkeep.test/api/game-entry/tomb-of-the-mask'),{}, {waitUntil(){}},async(u,opts)=>{calls.push(u);assert.equal(opts.credentials,'omit');assert.equal(opts.redirect,'manual');return fn(u);});
 let response=await invoke(u=>new Response(u===game.entry?'<html><iframe src="'+game.frameEntry+'"></iframe></html>':'<html><canvas>game</canvas></html>'));
 assert.equal((await response.json()).base,game.frameEntry);assert.deepEqual(calls,[game.entry,game.frameEntry]);
 calls=[];response=await invoke(u=>u===game.entry?new Response('Denied',{status:403}):new Response('<html><canvas>backup</canvas></html>'));
 const fallback=await response.json();assert.equal(fallback.base,game.fallbackEntry);assert.equal(fallback.fallback,true);
 calls=[];response=await invoke(u=>u===game.entry?new Response('<html><iframe src="https://evil.test/"></iframe></html>'):new Response('<html>backup</html>'));
 assert.equal((await response.json()).fallback,true);assert.ok(!calls.includes('https://evil.test/'));
 response=await invoke(()=>new Response('Denied',{status:403}));assert.equal(response.status,502);
});
test('Stickman Hook loads the requested CDN directly while retaining Kkeep storage isolation',()=>{
 const game=findSavedGame('stickman-hook');
 assert.equal(gameAssetUrl('bundle.js',game.entry,'https://learn-now.b-cdn.net/cdn/projects/stickman-hook/','https://kkeep.test',game),'https://learn-now.b-cdn.net/cdn/projects/stickman-hook/bundle.js');
 assert.equal(gameAssetUrl('/games/profile-launcher.css',game.entry,'https://learn-now.b-cdn.net/cdn/projects/stickman-hook/','https://kkeep.test',game),'https://kkeep.test/api/game-public/games/profile-launcher.css');
 const html=readFileSync(new URL('../public/games/stickman-hook/index.html',import.meta.url),'utf8');
 assert.doesNotMatch(html,/poki[23]\.js|prebid|\/js\/main\.js/);
});
test('Stack Bounce cookie levels, scores and skins restore together without dirty-save loops',()=>{
 const source=readFileSync(new URL('../public/games/stack-bounce/save.js',import.meta.url),'utf8');
 function create(entries=[]){let writes=0;class Document{};const document=new Document(),localStorage=memoryStorage(entries,()=>writes++);
  vm.runInNewContext(source,{Document,document,localStorage,Date});return {document,localStorage,writes:()=>writes};}
 const first=create();for(const [key,value] of [['levelCurrent','14'],['bestScore','5432'],['chosenSkinId','2'],['level.ringScaling','0.8']])first.document.cookie='GameSave'+key+'='+value+'; path=/; max-age=86400';
 assert.equal(first.writes(),4);first.document.cookie='GameSavelevelCurrent=14; path=/';assert.equal(first.writes(),4);
 const second=create(storageEntries(first.localStorage));assert.match(second.document.cookie,/GameSavelevelCurrent=14/);assert.match(second.document.cookie,/GameSavechosenSkinId=2/);assert.match(second.document.cookie,/GameSavelevel.ringScaling=0.8/);
 second.document.cookie='sessionToken=private';assert.doesNotMatch(second.document.cookie,/sessionToken/);
 second.document.cookie='GameSavebestScore=; max-age=0';assert.doesNotMatch(second.document.cookie,/GameSavebestScore/);
});
test('Stack checkpoints the incremented level and never overwrites a save during initialization',async()=>{
 const window=new EventTarget(),document=new EventTarget(),events=new Map();const progress={},status={};let saved=[];
 document.documentElement={dataset:{game:'stack-bounce'}};document.getElementById=id=>id==='loading'?{querySelector:()=>progress}:status;
 const app={on:(event,fn)=>events.set(event,fn)};
 window.Uishop={};window.Game={firstLaunch:true,instance:{levelCurrent:8,level:{ringTypeID:2,ringsCount:12,ringScaling:1},saveAll(){saved.push(this.levelCurrent);}}};
 vm.runInNewContext(readFileSync(new URL('../public/games/playcanvas-loading.js',import.meta.url),'utf8'),{window,document,queueMicrotask,pc:{script:{createLoadingScreen:fn=>fn(app)}}});
 window.dispatchEvent(new Event('kkeep-before-save'));assert.deepEqual(saved,[]);
 window.Game.firstLaunch=false;events.get('game:levelcompleted')();window.Game.instance.levelCurrent++;
 await Promise.resolve();assert.deepEqual(saved,[9]);
});
test('iPad render cap is applied after PlayCanvas configure has set the retina ratio',()=>{
 function Application(){this.graphicsDevice={maxPixelRatio:3};}
 Application.prototype.configure=function(url,callback){this.graphicsDevice.maxPixelRatio=3;callback(null);};
 const context={navigator:{maxTouchPoints:5,userAgent:'Macintosh'},window:{devicePixelRatio:2},CONTEXT_OPTIONS:{antialias:true},pc:{Application}};
 vm.runInNewContext(readFileSync(new URL('../public/games/playcanvas-performance.js',import.meta.url),'utf8'),context);
 const app=new Application();app.configure('config.json',error=>{assert.equal(error,null);assert.equal(app.graphicsDevice.maxPixelRatio,1);});assert.equal(context.CONTEXT_OPTIONS.antialias,false);
});
test('Sausage Flip retains the initialization flag, selected skin and level deck',()=>{
 const data=[['FirstConncection','true'],['LevelId','11'],['lastLevelId','10'],['currentLevelDeck','[11,12,13]'],['Skins','["Basic","Yellow"]'],['CurrentSkin','"Yellow"']];
 assert.deepEqual(storageEntries(memoryStorage(data)),data);
});
test('Blumgi Construct dictionary restores under the native database name and schema',async()=>{
 const open=factory=>new Promise((resolve,reject)=>{const r=factory.open('c3-localstorage-ggzr9d1ra01',2);r.onupgradeneeded=()=>r.result.createObjectStore('keyvaluepairs');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
 const first=new IDBFactory(),db=await open(first),value=JSON.stringify({c2dictionary:true,data:{Level:14,Coins:432}});
 await new Promise((resolve,reject)=>{const tx=db.transaction('keyvaluepairs','readwrite');tx.objectStore('keyvaluepairs').put(value,'Locals');tx.oncomplete=resolve;tx.onerror=reject;});
 const snapshot=await exportDatabase(db);db.close();const second=new IDBFactory();await restoreDatabases(second,[snapshot]);const restored=await open(second);assert.deepEqual(await exportDatabase(restored),snapshot);restored.close();
});
