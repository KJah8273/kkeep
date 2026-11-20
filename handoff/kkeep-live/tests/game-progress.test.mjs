import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {IDBFactory} from 'fake-indexeddb';
import {gameSaveApi,validGameSave,MAX_GAME_SAVE} from '../worker/game-saves.ts';
import {gameResourceTarget,gameContent} from '../worker/game-content.ts';
import {digest} from '../worker/profile.ts';
import {savedGames} from '../lib/games/save-catalog.ts';
import {claimGuestProgress,readProgress,writeProgress} from '../lib/games/progress-client.ts';
import {memoryStorage,storageEntries,encodeValue,decodeValue,exportDatabase,restoreDatabases} from '../lib/games/save-codec.mjs';

const origin='https://kkeep.test',save={version:1,local:[['STICKMANHOOK_currentLevel','9']],databases:[]};
function store(){const sql=new DatabaseSync(':memory:');for(const f of ['0005_lonely_landau.sql','0007_productive_skullbuster.sql'])sql.exec(readFileSync(new URL('../drizzle/'+f,import.meta.url),'utf8'));return {sql,prepare(query){let args=[];const st={bind(...values){args=values;return st;},async all(){return {results:sql.prepare(query).all(...args)};},async run(){return {meta:sql.prepare(query).run(...args)};}};return st;},batch:items=>Promise.all(items.map(i=>i.run()))};}
async function account(db,id,token){db.sql.prepare('INSERT INTO kkeep_accounts VALUES (?,?,?,?,?)').run(id,id,id,'test-hash',Date.now());db.sql.prepare('INSERT INTO kkeep_sessions VALUES (?,?,?)').run(await digest(token),id,Date.now()+60000);return '__Host-kkeep-profile='+token;}
function request(cookie='',input,game='stickman-hook',headers={}){return new Request(origin+'/api/game-save?game='+game,{method:input?'POST':'GET',headers:{'X-Kkeep-Game-Save':'1',Origin:origin,Cookie:cookie,...headers},body:input?JSON.stringify(input):undefined});}
test('device progress is claimed by a single Profile in one transaction',async()=>{
 globalThis.indexedDB=new IDBFactory();
 const slug='stickman-hook',key='guest:'+slug;
 await writeProgress({key,save,revision:0,dirty:false,updated:Date.now()});
 const [first,second]=await Promise.all([claimGuestProgress(slug,'a'),claimGuestProgress(slug,'b')]);
 assert.equal([first,second].filter(Boolean).length,1);
 const claimed=await readProgress(key);
 const row=await readProgress(claimed.claimed+':'+slug);
 assert.deepEqual(row.save,save);
 assert.equal(row.dirty,true);
 assert.equal(await readProgress((claimed.claimed==='a'?'b':'a')+':'+slug),null);
});
test('game levels restore in a separate session, remain private per profile and per game',async()=>{
 const db=store(),a=await account(db,'player-a','a'.repeat(64)),b=await account(db,'player-b','b'.repeat(64));
 const guest=await(await gameSaveApi(request(),db)).json();assert.equal(guest.account,null);
 assert.equal((await gameSaveApi(request(a,{scope:'player-a',revision:0,save}),db)).status,200);
 db.sql.prepare('INSERT INTO kkeep_sessions VALUES (?,?,?)').run(await digest('c'.repeat(64)),'player-a',Date.now()+60000);
 const device=await(await gameSaveApi(request('__Host-kkeep-profile='+'c'.repeat(64)),db)).json();assert.deepEqual(device.save,save);assert.equal(device.revision,1);
 assert.equal((await(await gameSaveApi(request(b),db)).json()).save,null);
 assert.equal((await(await gameSaveApi(request(a,undefined,'geometry-dash'),db)).json()).save,null);
 assert.equal((await gameSaveApi(request(b,{scope:'player-a',revision:0,save}),db)).status,409);
 assert.equal((await gameSaveApi(request('',{scope:'player-a',revision:0,save}),db)).status,401);
});
test('stale devices cannot overwrite progress and a previous revision is retained',async()=>{
 const db=store(),cookie=await account(db,'player','a'.repeat(64));
 await gameSaveApi(request(cookie,{scope:'player',revision:0,save}),db);
 const next={...save,local:[['STICKMANHOOK_currentLevel','10']]};
 assert.equal((await gameSaveApi(request(cookie,{scope:'player',revision:1,save:next}),db)).status,200);
 assert.equal((await gameSaveApi(request(cookie,{scope:'player',revision:1,save}),db)).status,409);
 const row=db.sql.prepare('SELECT * FROM kkeep_game_saves').get();assert.deepEqual(JSON.parse(row.previous),save);assert.deepEqual(JSON.parse(row.data),next);
});
test('save requests are bounded, fail closed across origins, and never accept unsupported games',async()=>{
 const db=store(),cookie=await account(db,'player','a'.repeat(64));
 assert.equal((await gameSaveApi(request(cookie,undefined,'stickman-hook',{Origin:'null'}),db)).status,403);
 assert.equal((await gameSaveApi(request(cookie,undefined,'stickman-hook',{'Sec-Fetch-Site':'cross-site'}),db)).status,403);
 assert.equal((await gameSaveApi(request(cookie,undefined,'roblox'),db)).status,400);
 assert.equal((await gameSaveApi(request(cookie,{scope:'player',revision:0,save:{...save,local:[['x','x'.repeat(MAX_GAME_SAVE+10)]]}}),db)).status,400);
 assert.equal((await gameSaveApi(request(cookie,{scope:'player',revision:0,save:{...save,local:[['x','x'.repeat(MAX_GAME_SAVE+2000)]]}}),db)).status,413);
 assert.equal(validGameSave({version:1,local:{x:1},databases:[]}),false);
 assert.equal(validGameSave({...save,databases:[{name:'foo',version:-1,stores:[]}]}),false);
 assert.equal(db.sql.prepare('SELECT count(*) AS n FROM kkeep_game_saves').get().n,0);
});
test('game resource relay has fixed hosts, strips credentials and does not follow redirects',async()=>{
 assert.equal(gameResourceTarget(new URL(origin+'/api/game-resource/turbo-stars/1/gh/bubbls/youtube-playables@f86d947cd3a8c7271fc251ae687bb8c9ffd2a170/turbo-stars/Build/engine.js')).href,'https://cdn.jsdelivr.net/gh/bubbls/youtube-playables@f86d947cd3a8c7271fc251ae687bb8c9ffd2a170/turbo-stars/Build/engine.js');
 for(const path of ['/api/game-resource/roblox/0/','/api/game-resource/turbo-stars/2/a','/api/game-resource/turbo-stars/1//evil.test/x'])assert.equal(gameResourceTarget(new URL(origin+path)),null);
 let options;const result=await gameContent(new Request(origin+'/api/game-resource/turbo-stars/1/gh/bubbls/youtube-playables@f86d947cd3a8c7271fc251ae687bb8c9ffd2a170/turbo-stars/Build/engine.js',{headers:{Cookie:'secret',Authorization:'secret'}}),{}, {waitUntil(){}},async(u,o)=>{options=o;return new Response('js',{headers:{'Content-Type':'text/javascript'}});});
 assert.equal(result.status,200);assert.equal(result.headers.get('Access-Control-Allow-Origin'),'*');assert.deepEqual(options.headers,{});assert.equal(options.credentials,'omit');assert.equal(options.redirect,'manual');
 const rejected=await gameContent(new Request(origin+'/api/game-resource/turbo-stars/1/game/'),{}, {waitUntil(){}},async()=>new Response(null,{status:302,headers:{Location:'https://evil.test'}}));assert.equal(rejected.status,502);
});
test('storage preserves string coercion, direct properties, enumeration and per-game separation',()=>{
 let changes=0;const first=memoryStorage([],()=>changes++),second=memoryStorage();first.setItem('level',4);first.coins=50;assert.equal(first.getItem('level'),'4');assert.equal(first.coins,'50');assert.deepEqual(Object.keys(first),['level','coins']);assert.equal(first.length,2);assert.equal(second.getItem('level'),null);delete first.coins;first.removeItem('level');assert.equal(first.length,0);assert.equal(changes,4);
 first.setItem('authToken','private');first.setItem('level','5');assert.deepEqual(storageEntries(first),[['level','5']]);
});
test('structured save codec round-trips Unity bytes, dates, maps and nested records',async()=>{
 const source={path:'/idbfs/a/PlayerPrefs',timestamp:new Date(1720000000000),mode:32768,contents:new Uint8Array([0,5,255]),metadata:new Map([['level',7]]),levels:[1,2],authToken:'never-upload'};
 const output=decodeValue(await encodeValue(source));assert.deepEqual(output.contents,source.contents);assert.equal(output.timestamp.getTime(),source.timestamp.getTime());assert.deepEqual(output.metadata,source.metadata);assert.equal(output.authToken,undefined);
 const blob=decodeValue(await encodeValue(new Blob(['save'],{type:'application/octet-stream'})));assert.equal(await blob.text(),'save');
 await assert.rejects(()=>encodeValue(()=>{}));assert.throws(()=>decodeValue(['bytes','Function','']));
});
const open=(factory,name,upgrade)=>new Promise((resolve,reject)=>{const r=factory.open(name,1);r.onupgradeneeded=()=>upgrade?.(r.result);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
for(const slug of savedGames.filter(game=>!game.external).map(game=>game.slug))test(slug+' save survives Profile sync and restores on a second device',async()=>{
 const db=store(),cookie=await account(db,'epic-player','e'.repeat(64));
 const first=new IDBFactory(),files=await open(first,'/idbfs',d=>d.createObjectStore('FILE_DATA'));
 const path='/idbfs/epic/PlayerPrefs',contents=new Uint8Array([69,80,73,67,0,12,255]);
 await new Promise((resolve,reject)=>{const tx=files.transaction('FILE_DATA','readwrite');tx.objectStore('FILE_DATA').put({mode:32768,timestamp:new Date(123456),contents},path);tx.oncomplete=resolve;tx.onerror=reject;});
 const progress={version:1,local:[],databases:[await exportDatabase(files)]};files.close();
 assert.equal((await gameSaveApi(request(cookie,{scope:'epic-player',revision:0,save:progress},slug),db)).status,200);
 const backup=await(await gameSaveApi(request(cookie,undefined,slug),db)).json();
 const second=new IDBFactory();await restoreDatabases(second,backup.save.databases);const restored=await open(second,'/idbfs');
 assert.deepEqual(await exportDatabase(restored),progress.databases[0]);restored.close();
 assert.equal((await(await gameSaveApi(request('',undefined,slug),db)).json()).save,null);
 assert.equal(gameResourceTarget(new URL(origin+'/api/game-resource/angry-birds-epic/0/EpicWeb/Build/EpicWeb.wasm')).href,'https://darkterrayt.github.io/EpicWeb/Build/EpicWeb.wasm');
});
test('Among Us assets resolve both explicit hosts without accepting a third host',()=>{
 assert.equal(gameResourceTarget(new URL(origin+'/api/game-resource/among-us-old/0/player.js')).href,'https://amongus-ipad-khaled-1028.testerqrr1.chatgpt.site/player.js');
 assert.equal(gameResourceTarget(new URL(origin+'/api/game-resource/among-us-old/1/files/amongus/legacy/Build/UnityLoader.js')).href,'https://wasm.rip/files/amongus/legacy/Build/UnityLoader.js');
 assert.equal(gameResourceTarget(new URL(origin+'/api/game-resource/among-us-old/2/player.js')),null);
});
test('IndexedDB game files and indexes restore into a fresh device before game startup',async()=>{
 const first=new IDBFactory(),db=await open(first,'/idbfs',db=>{db.createObjectStore('FILE_DATA');db.createObjectStore('stats',{keyPath:'id'}).createIndex('score','score');});
 await new Promise((resolve,reject)=>{const tx=db.transaction(['FILE_DATA','stats'],'readwrite');tx.objectStore('FILE_DATA').put({mode:32768,timestamp:new Date(123456),contents:new Uint8Array([10,20,30])},'/idbfs/abc/PlayerPrefs');tx.objectStore('stats').put({id:'level',score:12});tx.oncomplete=resolve;tx.onerror=reject;});
 const snapshot=await exportDatabase(db);db.close();assert.equal(validGameSave({...save,databases:[snapshot]}),true);
 const second=new IDBFactory();await restoreDatabases(second,[snapshot]);const restored=await open(second,'/idbfs');assert.deepEqual(await exportDatabase(restored),snapshot);restored.close();
});

test('Legacy Brawlhalla AIR save files and settings restore through Profile on a second device',async()=>{
 const db=store(),cookie=await account(db,'brawl-player','b'.repeat(64));
 const first=new IDBFactory(),files=await open(first,'ruffleAir',d=>d.createObjectStore('data'));
 await new Promise((resolve,reject)=>{const tx=files.transaction('data','readwrite');tx.objectStore('data').put(new Uint8Array([1,4,9]),'/storage/settings.dat');tx.oncomplete=resolve;tx.onerror=reject;});
 const snapshot={version:1,local:[['kkeep.brawlhalla.graphics','smooth']],databases:[await exportDatabase(files)]};files.close();
 assert.equal((await gameSaveApi(request(cookie,{scope:'brawl-player',revision:0,save:snapshot},'brawlhalla-offline'),db)).status,200);
 const result=await(await gameSaveApi(request(cookie,undefined,'brawlhalla-offline'),db)).json();
 assert.deepEqual(result.save.local,snapshot.local);
 const second=new IDBFactory();await restoreDatabases(second,result.save.databases);const restored=await open(second,'ruffleAir');
 assert.deepEqual(await exportDatabase(restored),snapshot.databases[0]);restored.close();
 assert.equal(gameResourceTarget(new URL(origin+'/api/game-resource/brawlhalla-offline/2/games/build/game.wasm')).href,'https://cdn.play.unity.com/games/build/game.wasm');
});

test('Brawlhalla range downloads expose chunk metadata to the sandbox and bypass whole-file cache',async()=>{
 const old=Object.getOwnPropertyDescriptor(globalThis,'caches');let cacheReads=0,cacheWrites=0;
 Object.defineProperty(globalThis,'caches',{configurable:true,value:{default:{async match(){cacheReads++;return new Response('wrong whole file');},async put(){cacheWrites++;}}}});
 try{
  let forwarded;
  const response=await gameContent(new Request(origin+'/api/game-resource/brawlhalla-offline/0/assets/startup.pack',{headers:{Origin:'null',Range:'bytes=0-3'}}),{}, {waitUntil(){}},async(url,options)=>{
   forwarded=options;
   return new Response(new Uint8Array([0,0,1,42]),{status:206,headers:{'Content-Range':'bytes 0-3/391696449','Content-Length':'4','Accept-Ranges':'bytes',ETag:'"pack-v1"'}});
  });
  assert.equal(cacheReads,0);assert.equal(cacheWrites,0);assert.equal(forwarded.headers.Range,'bytes=0-3');
  assert.equal(response.status,206);assert.deepEqual([...new Uint8Array(await response.arrayBuffer())],[0,0,1,42]);
  const exposed=response.headers.get('Access-Control-Expose-Headers').toLowerCase().split(/,\s*/);
  for(const name of ['content-range','etag','accept-ranges'])assert.ok(exposed.includes(name));
  assert.equal(response.headers.get('Content-Range'),'bytes 0-3/391696449');assert.equal(response.headers.get('ETag'),'"pack-v1"');
 }finally{if(old)Object.defineProperty(globalThis,'caches',old);else delete globalThis.caches;}
});
test('Space Waves stays direct and the replacement State.io uses isolated profile storage',()=>{
 const space=savedGames.find(game=>game.slug==='space-waves');
 assert.equal(space?.external,true);
 assert.equal(space?.entry,'https://lolygames.github.io/geodash-space-waves/');
 const state=savedGames.find(game=>game.slug==='state-io');
 assert.equal(state?.entry,'/games/state-io/index.html');
 assert.equal(state?.external,false);
 assert.deepEqual(state?.origins,[]);
});

test('State.io announces engine readiness separately from the first frame and retains saves',async()=>{
 const localStorage=memoryStorage();
 const events=[];
 const window={localStorage,KkeepGameLoader:{ready:()=>events.push('ready')}};
 const code=readFileSync(new URL('../public/games/state-io/sdk.js',import.meta.url),'utf8');
 runInNewContext(code,{window,document:{addEventListener(){}},Blob});
 window.ytgame.game.firstFrameReady();
 assert.deepEqual(events,[]);
 window.ytgame.game.gameReady();
 assert.deepEqual(events,['ready']);
 await window.ytgame.game.saveData('{"level":3}');
 assert.equal(await window.ytgame.game.loadData(),'{"level":3}');
 assert.equal(localStorage.getItem('state-io.savedata'),'{"level":3}');
 assert.equal(savedGames.find(game=>game.slug==='state-io')?.startup,'signal');
});

test('Monkey Mart passes a string to Defold and waits for the game main function',async()=>{
 const html=readFileSync(new URL('../public/games/monkey-mart/index.html',import.meta.url),'utf8');
 const setup=html.match(/<script id="engine-setup"[^>]*>([\s\S]*?)<\/script>/)[1];
 const PokiSDK={getURLParam:name=>name==='lang'?'en':null,init:()=>Promise.resolve(),logError(){}};
 const events=[];
 const Module={runApp:()=>events.push('archive'),callMain:()=>events.push('main')};
 const window={innerWidth:820,innerHeight:1180,scrollTo(){},addEventListener(){},KkeepGameLoader:{ready:()=>events.push('ready')}};
 const elements=new Map();
 let supportedVersion='webgl2';
 const document={
  createElement:()=>({getContext:version=>version===supportedVersion?{getExtension:()=>null}:null}),
  getElementById(id){
   if(!elements.has(id))elements.set(id,{style:{},width:0,height:0});
   return elements.get(id);
  }
 };
 runInNewContext(setup,{PokiSDK,Module,window,document,navigator:{userAgent:'Macintosh',maxTouchPoints:5},requestAnimationFrame:callback=>callback()});
 assert.equal(PokiSDK.getURLParam('lang'),'en');
 assert.equal(PokiSDK.getURLParam('missing'),'');
 assert.equal(typeof PokiSDK.captureError,'function');
 assert.equal(Module.hasWebGLSupport(),true);
 supportedVersion='webgl';
 assert.equal(Module.hasWebGLSupport(),true);
 supportedVersion=null;
 assert.equal(Module.hasWebGLSupport(),false);
 await Module.onRuntimeInitialized();
 assert.deepEqual(events,['archive']);
 Module.callMain([]);
 assert.deepEqual(events,['archive','main','ready']);
 assert.equal(elements.get('canvas').width,820);
 assert.equal(elements.get('canvas').height,1180);
 assert.equal(savedGames.find(game=>game.slug==='monkey-mart')?.startup,'signal');
});
