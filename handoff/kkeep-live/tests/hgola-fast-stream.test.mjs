import test from 'node:test';
import assert from 'node:assert/strict';
import {gzipSync} from 'node:zlib';
import {createStreamingGameFetch,HGOLA_BUILD} from '../public/hgola-download.js';
import {hgolaFile,hgolaFiles} from '../worker/hgola-files.ts';
const origin='https://kkeep.test',path=`/api/hgola-files/${HGOLA_BUILD}/game.data`,bytes=new Uint8Array([1,2,3,4,5,6]);
const opts={files:{'game.data':6},partBytes:3,delay:async()=>{}};
const envelope=(data,encoding='identity')=>new Response(data,{headers:{'X-Kkeep-Decoded-Length':'6','X-Kkeep-Part-Encoding':encoding}});
test('normal transfer needs one request, decodes gzip once and preserves progress',async()=>{
 for(const decoded of [true,false]){
  let calls=0;const progress=[];
  const f=createStreamingGameFetch(async url=>{calls++;assert.equal(new URL(url).searchParams.get('stream'),'1');return envelope(decoded?bytes:gzipSync(bytes),'gzip');},origin,{...opts,onProgress:p=>progress.push(p.loaded)});
  assert.deepEqual(new Uint8Array(await (await f(path)).arrayBuffer()),bytes);assert.equal(calls,1);assert.equal(progress.at(-1),6);
 }
});
test('interrupted nonaligned stream resumes without duplicating already-delivered bytes',async()=>{
 const calls=[],progress=[];
 const f=createStreamingGameFetch(async url=>{const q=new URL(url).searchParams;calls.push(q.get('part'));if(q.has('stream'))return envelope(bytes.subarray(0,4));const part=Number(q.get('part'));return new Response(bytes.subarray(part*3,part*3+3));},origin,{...opts,onProgress:p=>progress.push(p.loaded)});
 assert.deepEqual(new Uint8Array(await (await f(path)).arrayBuffer()),bytes);assert.deepEqual(calls,[null,'1']);assert.deepEqual(progress,[4,6]);
});
test('headers and body stalls switch to section recovery',async()=>{
 for(const body of [false,true]){
  let requests=0;
  const f=createStreamingGameFetch(async(url,{signal})=>{requests++;const q=new URL(url).searchParams;if(q.has('stream')){
   if(!body)return new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(Error('stalled'))));
   return envelope(new ReadableStream({start(c){c.enqueue(bytes.subarray(0,2));signal.addEventListener('abort',()=>c.error(Error('stalled')));}}));
  }const i=Number(q.get('part'));return new Response(bytes.subarray(i*3,i*3+3));},origin,{...opts,idleMs:10});
  assert.deepEqual(new Uint8Array(await (await f(path)).arrayBuffer()),bytes);assert.equal(requests,3);
 }
});
test('caller cancellation stops the transfer without starting recovery',async()=>{
 const controller=new AbortController();let calls=0,retries=0;
 const f=createStreamingGameFetch(async(_u,{signal})=>{calls++;return new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(Error('aborted'))));},origin,{...opts,onRetry:()=>retries++});
 const r=await f(path,{signal:controller.signal});const result=r.arrayBuffer();controller.abort();await assert.rejects(result);assert.equal(calls,1);assert.equal(retries,0);
});
test('invalid full response falls back, but oversized bytes fail closed',async()=>{
 let failures=0;
 const f=createStreamingGameFetch(async url=>{const q=new URL(url).searchParams;if(q.has('stream'))return new Response('<html>error</html>',{headers:{'Content-Type':'text/html'}});return new Response(bytes.subarray(Number(q.get('part'))*3,Number(q.get('part'))*3+3));},origin,opts);
 assert.deepEqual(new Uint8Array(await (await f(path)).arrayBuffer()),bytes);
 const bad=createStreamingGameFetch(async()=>envelope(new Uint8Array(7)),origin,{...opts,onFailure:()=>failures++});
 await assert.rejects((await bad(path)).arrayBuffer(),/Incorrect/);assert.equal(failures,1);
});
test('complete compressed storage is reused without HTTP decoding or recompression',async()=>{
 const file=hgolaFiles['game.data'];let calls=0;
 const r=await hgolaFile(new Request(origin+path+'?stream=1&encoding=gzip'),{GAME_ASSETS:{get:async key=>{calls++;assert.match(key,/gzip-v1$/);return {size:26,customMetadata:{sourceSha256:file.sha256},body:new Response(gzipSync(bytes)).body};}}});
 assert.equal(calls,1);assert.equal(r.headers.get('Content-Encoding'),null);assert.equal(r.headers.get('X-Kkeep-Decoded-Length'),String(file.bytes));assert.equal(r.headers.get('X-Kkeep-Part-Encoding'),'gzip');assert.match(r.headers.get('Cache-Control'),/no-transform/);
 assert.deepEqual(new Uint8Array(await new Response(r.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer()),bytes);
});
test('uncached compression streams the stored object with an explicit envelope',async()=>{
 const file=hgolaFiles['game.data'];
 const r=await hgolaFile(new Request(origin+path+'?stream=1&encoding=gzip'),{GAME_ASSETS:{get:async key=>key.endsWith('gzip-v1')?null:{size:file.bytes,customMetadata:{sha256:file.sha256},body:new Response(bytes).body}}});
 assert.equal(r.headers.get('Content-Encoding'),null);assert.equal(r.headers.get('X-Kkeep-Part-Encoding'),'gzip');
 assert.deepEqual(new Uint8Array(await new Response(r.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer()),bytes);
});
test('cancelling the response reader never starts recovery downloads',async()=>{
 let calls=0,failures=0,retries=0;
 const f=createStreamingGameFetch(async(_u,{signal})=>{calls++;return new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(Error('aborted'))));},origin,{...opts,onRetry:()=>retries++,onFailure:()=>failures++});
 const response=await f(path);await response.body.cancel();await new Promise(r=>setImmediate(r));
 assert.equal(calls,1);assert.equal(retries,0);assert.equal(failures,0);
});
