import test from 'node:test';
import assert from 'node:assert/strict';
import {gzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {gameAsset} from '../worker/game-assets.ts';
import {GameDownloads} from '../public/games/downloads.js';
const id='1234567890abcdef12345678.bin',path='/api/game-assets/'+id;
const bytes=new TextEncoder().encode('actual pinned game data'),compressed=gzipSync(bytes);
const hash=b=>createHash('sha256').update(b).digest('hex');
const asset={bytes:compressed.length,size:bytes.length,sha256:hash(bytes),compressedSha256:hash(compressed),repo:'owner/game',revision:'abc',path:'Build/game.part1'};
const options={assets:{[id]:asset}};
const req=(suffix='',init)=>new Request('https://kkeep.test'+path+suffix,init);
const ctx={waitUntil(promise){return promise;}};
function storage(){const data=new Map();return {data,async head(key){const b=data.get(key);return b?{size:b.length,customMetadata:{sha256:hash(b)},httpEtag:'"checksum"'}:null;},async get(key){const h=await this.head(key);return h?{...h,body:new Blob([data.get(key)]).stream()}:null;},async put(key,body,opts){const b=new Uint8Array(await new Response(body).arrayBuffer());if(hash(b)!==opts.sha256)throw Error('Checksum mismatch');data.set(key,b);}};}
const put=(body=compressed,token='secret')=>req('',{method:'PUT',headers:{Authorization:'Bearer '+token,'Content-Length':String(body.length)},body});
test('only an authenticated upload of the exact pinned object can enter storage',async()=>{
 const bucket=storage(),env={GAME_ASSETS:bucket,GAME_ASSET_UPLOAD_TOKEN:'secret'};
 assert.equal((await gameAsset(put(compressed,'wrong'),env,ctx,options)).status,403);assert.equal(bucket.data.size,0);
 assert.equal((await gameAsset(put(new Uint8Array(compressed.length)),env,ctx,options)).status,400);assert.equal(bucket.data.size,0);
 assert.equal((await gameAsset(put(new Uint8Array(2)),env,ctx,options)).status,400);
 assert.equal((await gameAsset(put(),env,ctx,options)).status,201);
 assert.equal((await gameAsset(put(),env,ctx,options)).status,204);assert.equal(bucket.data.size,1);
});
test('compressed and raw downloads contain the exact original bytes with persistent caching',async()=>{
 const bucket=storage(),env={GAME_ASSETS:bucket,GAME_ASSET_UPLOAD_TOKEN:'secret'};await gameAsset(put(),env,ctx,options);
 const packed=await gameAsset(req(),env,ctx,options);assert.deepEqual(new Uint8Array(await packed.arrayBuffer()),new Uint8Array(compressed));assert.equal(packed.headers.get('Content-Length'),String(compressed.length));assert.match(packed.headers.get('Cache-Control'),/immutable/);
 const raw=await gameAsset(req('?raw=1'),env,ctx,options);assert.deepEqual(new Uint8Array(await raw.arrayBuffer()),bytes);assert.equal(raw.headers.get('Content-Length'),String(bytes.length));
 const head=await gameAsset(req('',{method:'HEAD'}),env,ctx,options);assert.equal((await head.arrayBuffer()).byteLength,0);assert.equal(head.status,200);
});
test('missing objects fail fast and raw fallback tries only the pinned mirrors',async()=>{
 const calls=[],opts={...options,fetcher:async url=>{calls.push(url);return calls.length===1?new Response('blocked',{status:403}):new Response(bytes);}};
 assert.equal((await gameAsset(req(),{},ctx,opts)).status,503);assert.equal(calls.length,0);
 const raw=await gameAsset(req('?raw=1'),{},ctx,opts);assert.deepEqual(new Uint8Array(await raw.arrayBuffer()),bytes);
 assert.deepEqual(calls,['https://cdn.jsdelivr.net/gh/owner/game@abc/Build/game.part1','https://raw.githubusercontent.com/owner/game/abc/Build/game.part1']);
});
test('an HTML response or partial data cannot be delivered as a completed game file',async()=>{
 let calls=0;const response=await gameAsset(req('?raw=1'),{},ctx,{...options,fetcher:async()=>++calls===1?new Response('error page',{headers:{'Content-Type':'text/html'}}):new Response('short')});
 await assert.rejects(response.arrayBuffer(),/Incomplete game file/);
});
test('unlisted file paths and arbitrary external sources are not accepted',async()=>{
 let fetched=false;const opts={...options,fetcher:async()=>{fetched=true;throw Error('Not allowed');}};
 assert.equal((await gameAsset(new Request('https://kkeep.test/api/game-assets/unknown?url=https://example.org'),{},ctx,opts)).status,404);
 assert.equal((await gameAsset(req('',{method:'POST'}),{},ctx,opts)).status,405);assert.equal(fetched,false);
});
test('managed hosting without access to the default cache can still serve stored files',async t=>{
 const previous=Object.getOwnPropertyDescriptor(globalThis,'caches');
 Object.defineProperty(globalThis,'caches',{configurable:true,get(){throw Error('Default cache access denied');}});
 t.after(()=>{if(previous)Object.defineProperty(globalThis,'caches',previous);else delete globalThis.caches;});
 const bucket=storage(),env={GAME_ASSETS:bucket,GAME_ASSET_UPLOAD_TOKEN:'secret'};
 await gameAsset(put(),env,ctx,options);
 const response=await gameAsset(req(),env,ctx,options);
 assert.equal(response.status,200);assert.deepEqual(new Uint8Array(await response.arrayBuffer()),new Uint8Array(compressed));
});
test('browser loader uses the first-party raw fallback before external hosts',async()=>{
 const calls=[];const d=new GameDownloads({repo:'owner/game',revision:'abc',cacheKey:'test',packed:{'Build/game':{url:path,rawUrl:path+'?raw=1',bytes:compressed.length,size:bytes.length}},fetcher:async url=>{calls.push(url);return url===path?new Response('not ready',{status:503}):new Response(bytes);}});d.cache=async()=>null;
 assert.deepEqual(new Uint8Array(await (await d.file('Build/game',bytes.length)).arrayBuffer()),bytes);assert.deepEqual(calls,[path,path+'?raw=1']);
});
