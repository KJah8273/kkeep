import test from 'node:test';
import assert from 'node:assert/strict';
import {gzipSync} from 'node:zlib';
import {createGameFetch,HGOLA_BUILD} from '../public/hgola-download.js';
import {hgolaFile,hgolaFiles} from '../worker/hgola-files.ts';
const origin='https://kkeep.test',path=`/api/hgola-files/${HGOLA_BUILD}/game.data`;
const options={files:{'game.data':6},partBytes:3,delay:async()=>{}};
const raw=i=>new Uint8Array(i?[4,5,6]:[1,2,3]);
test('explicit gzip decodes once, including Safari-style undecoded response and split gzip magic',async()=>{
 for(const decoded of [false,true]){
  const progress=[];
  const f=createGameFetch(async url=>{const i=Number(new URL(url).searchParams.get('part'));assert.equal(new URL(url).searchParams.get('v'),'2');const bytes=decoded?raw(i):gzipSync(raw(i));return new Response(new ReadableStream({start(c){c.enqueue(bytes.subarray(0,1));c.enqueue(bytes.subarray(1));c.close();}}),{headers:{'X-Kkeep-Part-Encoding':'gzip'}});},origin,{...options,onProgress:p=>progress.push(p.loaded)});
  assert.deepEqual([...new Uint8Array(await (await f(path)).arrayBuffer())],[1,2,3,4,5,6]);assert.deepEqual(progress,[3,6]);
 }
});
test('failed compressed section switches to uncached identity without repeating completed section',async()=>{
 const calls=[];let failures=0;
 const f=createGameFetch(async(url,init)=>{const q=new URL(url).searchParams;calls.push([q.get('part'),q.get('encoding'),init.cache]);if(q.get('part')==='1'&&q.get('encoding')==='gzip')return new Response(new Uint8Array([31,139,0]),{headers:{'X-Kkeep-Part-Encoding':'gzip'}});return new Response(raw(Number(q.get('part'))));},origin,{...options,onFailure:()=>failures++});
 assert.deepEqual([...new Uint8Array(await (await f(path)).arrayBuffer())],[1,2,3,4,5,6]);assert.deepEqual(calls,[['0','gzip',undefined],['1','gzip',undefined],['1','identity','reload']]);assert.equal(failures,0);
});
test('v2 sections are bounded and compressed as a file, never HTTP Content-Encoding',async()=>{
 const file=hgolaFiles['game.data'];let range;
 const env={GAME_ASSETS:{get:async(_key,opts)=>{range=opts.range;return {size:file.bytes,customMetadata:{sha256:file.sha256},body:new Response('original bytes').body};}}};
 const r=await hgolaFile(new Request(origin+path+'?part=1&v=2&encoding=gzip',{headers:{'Accept-Encoding':'gzip, br'}}),env);
 assert.deepEqual(range,{offset:1048576,length:1048576});assert.equal(r.headers.get('Content-Encoding'),null);assert.equal(r.headers.get('X-Kkeep-Part-Encoding'),'gzip');assert.match(r.headers.get('Cache-Control'),/no-transform/);
 assert.equal(await new Response(r.body.pipeThrough(new DecompressionStream('gzip'))).text(),'original bytes');
 const plain=await hgolaFile(new Request(origin+path+'?part=1&v=2&encoding=identity'),env);assert.equal(await plain.text(),'original bytes');assert.equal(plain.headers.get('Content-Length'),'1048576');assert.equal(plain.headers.get('X-Kkeep-Part-Encoding'),'identity');
 assert.equal((await hgolaFile(new Request(origin+path+'?part=0&v=2&encoding=invalid'),env)).status,400);
});
test('an oversized decoded gzip is rejected and never passed to Unity',async()=>{
 let failures=0;
 const f=createGameFetch(async()=>new Response(gzipSync(new Uint8Array(50)),{headers:{'X-Kkeep-Part-Encoding':'gzip'}}),origin,{...options,attempts:1,onFailure:()=>failures++});
 await assert.rejects((await f(path)).arrayBuffer(),/Incorrect game file length/);assert.equal(failures,1);
});
