import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {hgolaSave,validHgolaSave,MAX_SAVE_BYTES} from '../worker/hgola-saves.ts';
import {hgolaFile,HGOLA_BUILD,hgolaFiles} from '../worker/hgola-files.ts';
import {validateSave} from '../public/hgola-saves.js';
import {digest} from '../worker/profile.ts';
const snapshot=(text='progress')=>({format:'kkeep-hgola-save',version:1,entries:[{path:'/idbfs/test/PlayerPrefs',mode:33206,time:1700000000000,data:btoa(text)}]});
function database(){const sql=new DatabaseSync(':memory:');sql.exec(readFileSync(new URL('../drizzle/0004_smiling_vector.sql',import.meta.url),'utf8'));return {sql,db:{prepare(query){let args=[];return {bind(...a){args=a;return this;},async all(){return {results:sql.prepare(query).all(...args)};},async run(){return {meta:{changes:Number(sql.prepare(query).run(...args).changes)}};}};}}};}
const req=(cookie,body,origin='https://kkeep.test')=>new Request('https://kkeep.test/api/hgola-save',{method:body?'POST':'GET',headers:{'X-Kkeep-Hgola':'1','Origin':origin,...(cookie?{Cookie:cookie}:{})},...(body?{body:JSON.stringify(body)}:{})});
async function open(db){const r=await hgolaSave(req(),db);assert.equal(r.status,200);return r.headers.get('Set-Cookie').split(';')[0];}
test('each browser owns an isolated durable save, with no client supplied owner',async()=>{const {db}=database();const a=await open(db),b=await open(db);assert.notEqual(a,b);let r=await hgolaSave(req(a,{save:snapshot(),revision:0}),db);assert.equal(r.status,200);assert.deepEqual((await (await hgolaSave(req(a),db)).json()).save,snapshot());assert.equal((await (await hgolaSave(req(b),db)).json()).save,null);});
test('empty, malformed, oversized and cross-origin writes preserve the previous save',async()=>{const {db}=database(),a=await open(db);await hgolaSave(req(a,{save:snapshot(),revision:0}),db);for(const save of [{format:'kkeep-hgola-save',version:1,entries:[]},snapshot('a'.repeat(MAX_SAVE_BYTES)),{...snapshot(),entries:[{path:'/idbfs/../../other',mode:33206,time:1,data:'YQ=='}]}])assert.notEqual((await hgolaSave(req(a,{save,revision:1}),db)).status,200);assert.equal((await hgolaSave(req(a,{save:snapshot('evil'),revision:1},'https://evil.test'),db)).status,403);assert.deepEqual((await (await hgolaSave(req(a),db)).json()).save,snapshot());});
test('newer revisions win and a previous version is retained without an expiry',async()=>{const {db,sql}=database(),a=await open(db);await hgolaSave(req(a,{save:snapshot('one'),revision:0}),db);assert.equal((await hgolaSave(req(a,{save:snapshot('two'),revision:1}),db)).status,200);assert.equal((await hgolaSave(req(a,{save:snapshot('stale'),revision:1}),db)).status,409);const r=sql.prepare('SELECT * FROM hgola_saves').get();assert.deepEqual(JSON.parse(r.data),snapshot('two'));assert.deepEqual(JSON.parse(r.previous),snapshot('one'));assert.equal(r.revision,2);});
test('storage failures are explicit and never report a successful backup',async()=>{assert.equal((await hgolaSave(req(),undefined)).status,503);assert.equal((await hgolaSave(req(undefined,{save:snapshot(),revision:0}),database().db)).status,409);});
test('Hgola Profile backup is available to a second signed-in device and isolated from other accounts',async()=>{
 const {db,sql}=database();sql.exec(readFileSync(new URL('../drizzle/0005_lonely_landau.sql',import.meta.url),'utf8'));
 for(const id of ['player-a','player-b'])sql.prepare('INSERT INTO kkeep_accounts VALUES (?,?,?,?,?)').run(id,id,id,'test-hash',Date.now());
 for(const [token,id] of [['a','player-a'],['b','player-a'],['c','player-b']])sql.prepare('INSERT INTO kkeep_sessions VALUES (?,?,?)').run(await digest(token.repeat(64)),id,Date.now()+60000);
 const a=(await open(db))+'; __Host-kkeep-profile='+'a'.repeat(64),b=(await open(db))+'; __Host-kkeep-profile='+'b'.repeat(64),c=(await open(db))+'; __Host-kkeep-profile='+'c'.repeat(64);
 assert.equal((await hgolaSave(req(a,{save:snapshot('level-8'),revision:0}),db)).status,200);
 assert.deepEqual((await(await hgolaSave(req(b),db)).json()).save,snapshot('level-8'));
 assert.equal((await(await hgolaSave(req(c),db)).json()).save,null);
});
test('browser and server agree on valid files and reject executable or invalid imports',()=>{const good=snapshot();assert.equal(validHgolaSave(good),true);assert.deepEqual(validateSave(good),good);for(const value of [null,{}, {...good,version:2},{...good,entries:[{...good.entries[0],data:'<script>'}]},{...good,entries:[{...good.entries[0],mode:40960}]},{...good,entries:[good.entries[0],good.entries[0]]}]){assert.equal(validHgolaSave(value),false);assert.throws(()=>validateSave(value));}});
test('stable asset cache serves the pinned build without asking Unity again',async()=>{let upstream=0;const file=hgolaFiles['game.wasm'];const env={GAME_ASSETS:{get:async()=>({body:new Response('bytes').body,size:file.bytes,customMetadata:{sha256:file.sha256}})}};const r=await hgolaFile(new Request(`https://kkeep.test/api/hgola-files/${HGOLA_BUILD}/game.wasm`),env,async()=>{upstream++;throw Error();});assert.equal(r.status,200);assert.equal(await r.text(),'bytes');assert.equal(r.headers.get('X-Kkeep-Game-Cache'),'storage');assert.match(r.headers.get('Cache-Control'),/immutable/);assert.equal(r.headers.get('Content-Type'),'application/wasm');assert.equal(upstream,0);});
test('compressed cached response decodes exactly and has no incorrect content length',async()=>{const file=hgolaFiles['game.data'];const env={GAME_ASSETS:{get:async()=>({body:new Response('game bytes').body,size:file.bytes,customMetadata:{sha256:file.sha256}})}};const r=await hgolaFile(new Request(`https://kkeep.test/api/hgola-files/${HGOLA_BUILD}/game.data`,{headers:{'Accept-Encoding':'gzip'}}),env);assert.equal(r.headers.get('Content-Encoding'),'gzip');assert.equal(r.headers.get('Content-Length'),null);assert.equal(await new Response(r.body.pipeThrough(new DecompressionStream('gzip'))).text(),'game bytes');});
test('asset route rejects other games and unknown files before making external requests',async()=>{for(const path of ['other/game.data',HGOLA_BUILD+'/../secret',HGOLA_BUILD+'/other.js'])assert.equal((await hgolaFile(new Request('https://kkeep.test/api/hgola-files/'+path),{},async()=>{throw Error('must not fetch');})).status,404);});
test('completed gzip object streams directly without reading or compressing the huge original',async()=>{
 const file=hgolaFiles['game.data'],keys=[];
 const compressed=await new Response(new Response('game bytes').body.pipeThrough(new CompressionStream('gzip'))).arrayBuffer();
 const env={GAME_ASSETS:{get:async key=>{keys.push(key);return {body:new Response(compressed).body,size:compressed.byteLength,customMetadata:{sourceSha256:file.sha256}};}}};
 const r=await hgolaFile(new Request(`https://kkeep.test/api/hgola-files/${HGOLA_BUILD}/game.data`,{headers:{'Accept-Encoding':'gzip'}}),env);
 assert.equal(keys.length,1);assert.ok(keys[0].endsWith('.gzip-v1'));assert.equal(r.headers.get('X-Kkeep-Game-Cache'),'compressed-storage');
 assert.equal(await new Response(r.body.pipeThrough(new DecompressionStream('gzip'))).text(),'game bytes');
});
test('compression cache failure does not interrupt delivery of the original or touch saves',async()=>{
 const file=hgolaFiles['game.data'],tasks=[],keys=[];
 const env={GAME_ASSETS:{get:async key=>{keys.push(key);return key.endsWith('.gzip-v1')?null:{body:new Response('game bytes').body,size:file.bytes,customMetadata:{sha256:file.sha256}};},put:async(key,body)=>{keys.push(key);await new Response(body).arrayBuffer();throw Error('quota');}}};
 const r=await hgolaFile(new Request(`https://kkeep.test/api/hgola-files/${HGOLA_BUILD}/game.data`,{headers:{'Accept-Encoding':'gzip'}}),env,fetch,{waitUntil:t=>tasks.push(t)});
 assert.equal(await new Response(r.body.pipeThrough(new DecompressionStream('gzip'))).text(),'game bytes');
 await Promise.all(tasks);assert.equal(tasks.length,1);assert.ok(keys.every(key=>key.startsWith('hgola-builds/')));
});
test('cold asset response does not wait for persistent storage to finish',async()=>{
 const tasks=[];let finishWrite,writing=false;
 const pending=new Promise(resolve=>{finishWrite=resolve;});
 const env={GAME_ASSETS:{get:async()=>null,put:async(_key,body)=>{writing=true;await new Response(body).arrayBuffer();await pending;}}};
 const root=`https://cdn.play.unity.com/games/48d6dff8-fc06-4898-af57-aa06155944fe/${HGOLA_BUILD}/`;
 const html=['loader.js','game.data.gz','framework.js.gz','game.wasm.gz'].map(n=>'"'+root+n+'"').join(' ');
 const fetcher=async url=>new Response(String(url).endsWith('/frame')?html:'first game bytes');
 const response=await hgolaFile(new Request(`https://kkeep.test/api/hgola-files/${HGOLA_BUILD}/game.data`),env,fetcher,{waitUntil:t=>tasks.push(t)});
 assert.equal(await response.text(),'first game bytes');assert.equal(response.headers.get('X-Kkeep-Game-Cache'),'upstream');assert.equal(writing,true);
 finishWrite();await Promise.all(tasks);
});
