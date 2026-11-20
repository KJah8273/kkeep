import test from 'node:test';
import assert from 'node:assert/strict';
import {createGameFetch,HGOLA_BUILD} from '../public/hgola-download.js';
import {hgolaFile,hgolaFiles} from '../worker/hgola-files.ts';
import {hgolaStreaming} from '../worker/hgola-streaming.ts';
const origin='https://kkeep.test',path=`/api/hgola-files/${HGOLA_BUILD}/game.data`;
const opts={files:{'game.data':6},partBytes:3,delay:async()=>{}};
test('changing networks mid-file retries only the incomplete section',async()=>{
 const calls=[];let interrupted=false;
 const fetcher=async url=>{calls.push(url);if(new URL(url).searchParams.get('part')==='1'&&!interrupted){interrupted=true;return new Response(new ReadableStream({start(c){c.enqueue(new Uint8Array([4]));c.error(Error('network changed'));}}));}return new Response(new Uint8Array(new URL(url).searchParams.get('part')==='0'?[1,2,3]:[4,5,6]));};
 const r=await createGameFetch(fetcher,origin,opts)(path);assert.deepEqual([...new Uint8Array(await r.arrayBuffer())],[1,2,3,4,5,6]);assert.deepEqual(calls.map(u=>new URL(u).searchParams.get('part')),['0','1','1']);assert.equal(r.headers.get('Content-Length'),'6');
});
test('silent transfer stall times out and resumes, rather than waiting forever at 90%',async()=>{
 let calls=0;
 const fetcher=async(_u,{signal})=>{if(++calls===1)return new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(Error('timeout'))));return new Response(new Uint8Array([1,2,3]));};
 const r=await createGameFetch(fetcher,origin,{...opts,files:{'game.data':3},idleMs:5})(path);assert.equal((await r.arrayBuffer()).byteLength,3);assert.equal(calls,2);
});
test('HTML/error/truncated replies cannot become game bytes; exhausted retries report failure',async()=>{
 for(const response of [()=>new Response('login',{headers:{'Content-Type':'text/html'}}),()=>new Response('',{status:503}),()=>new Response(new Uint8Array([1]))]){let failures=0,calls=0;const r=await createGameFetch(async()=>{calls++;return response();},origin,{...opts,attempts:2,onFailure:()=>failures++})(path);await assert.rejects(r.arrayBuffer());assert.equal(calls,4);assert.equal(failures,1);}
});
test('unrelated requests and save writes are not intercepted',async()=>{
 const calls=[];const original=async(...args)=>{calls.push(args);return new Response('ok');};const f=createGameFetch(original,origin,opts);
 for(const u of ['/api/hgola-save','https://other.test'+path,path+'?part=1'])await f(u);
 await f(path,{method:'POST',body:'save'});assert.equal(calls.length,4);assert.equal(calls.at(-1)[1].body,'save');
});
test('part endpoint reads a bounded R2 range and retains stable pinned object identity',async()=>{
 const file=hgolaFiles['game.data'];let range;
 const r=await hgolaFile(new Request(origin+path+'?part=1'),{GAME_ASSETS:{get:async(_k,o)=>{range=o.range;return {size:file.bytes,customMetadata:{sha256:file.sha256},body:new Response('bytes').body};}}});
 assert.equal(r.status,200);assert.deepEqual(range,{offset:2097152,length:2097152});assert.equal(r.headers.get('X-Kkeep-Game-Cache'),'storage-part');assert.equal(r.headers.get('Content-Length'),'2097152');
 for(const part of ['-1','x','99999999999'])assert.equal((await hgolaFile(new Request(origin+path+'?part='+part),{})).status,416);
});
test('streaming resources are restricted to the original game with no redirect or arbitrary destination',async()=>{
 let fetched='';const fetcher=async(u,init)=>{fetched=u;assert.equal(init.redirect,'manual');return new Response('bundle');};
 const base=origin+`/api/hgola-streaming/${HGOLA_BUILD}/`;
 const r=await hgolaStreaming(new Request(base+'aa/settings.json'),fetcher);assert.equal(await r.text(),'bundle');assert.match(fetched,/play-prod.struckd.com\/api\/v1\/games\/game\/48d6dff8-fc06-4898-af57-aa06155944fe\/build\//);
 for(const path of ['%2e%2e%2fsecret','https%3A%2F%2Fevil.test','aa/settings.json?url=evil'])assert.equal((await hgolaStreaming(new Request(base+path),fetcher)).status,404);
 assert.equal((await hgolaStreaming(new Request(base+'aa/settings.json'),async()=>new Response(null,{status:302,headers:{Location:'https://evil.test'}}))).status,502);
});
test('a stall after response headers is also bounded and retried',async()=>{
 let calls=0;
 const fetcher=async(_u,{signal})=>{if(++calls===1)return new Response(new ReadableStream({start(c){c.enqueue(new Uint8Array([1]));signal.addEventListener('abort',()=>c.error(Error('lost Wi-Fi')));}}));return new Response(new Uint8Array([1,2,3]));};
 const r=await createGameFetch(fetcher,origin,{...opts,files:{'game.data':3},idleMs:5})(path);assert.deepEqual([...new Uint8Array(await r.arrayBuffer())],[1,2,3]);assert.equal(calls,2);
});
test('caller cancellation stops retries without reporting a startup failure',async()=>{
 const ac=new AbortController();let failure=0,calls=0;
 const r=await createGameFetch(async(_u,{signal})=>{calls++;return new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(Error('cancelled'))));},origin,{...opts,onFailure:()=>failure++})(path,{signal:ac.signal});
 const body=r.arrayBuffer();ac.abort();await assert.rejects(body);assert.equal(calls,2);assert.equal(failure,0);
});

test('a newly published build streams its first download before R2 has the full object',async()=>{
 const calls=[];const bytes=new Uint8Array([1,2,3]);
 const f=createGameFetch(async(u,o)=>{calls.push([u,o?.method]);return o?.method==='HEAD'?new Response(null,{status:503}):new Response(bytes);},origin,{...opts,files:{'game.data':3},checkStorage:true});
 const r=await f(path);assert.deepEqual([...new Uint8Array(await r.arrayBuffer())],[1,2,3]);assert.equal(r.headers.get('Content-Length'),'3');assert.deepEqual(calls.map(c=>c[1]),['HEAD',undefined]);assert.ok(calls.every(c=>!c[0].includes('?part=')));
});
test('a complete R2 object uses retryable sections after the readiness check',async()=>{
 const calls=[];const f=createGameFetch(async(u,o)=>{calls.push(u);return o?.method==='HEAD'?new Response(null):new Response(new Uint8Array([1,2,3]));},origin,{...opts,files:{'game.data':3},checkStorage:true});
 assert.equal((await (await f(path)).arrayBuffer()).byteLength,3);assert.equal(new URL(calls.at(-1)).searchParams.get('part'),'0');
});
test('truncated first downloads report failure and never masquerade as complete assets',async()=>{
 let failed=0;const f=createGameFetch(async(_u,o)=>o?.method==='HEAD'?new Response(null,{status:503}):new Response(new Uint8Array([1])),origin,{...opts,checkStorage:true,onFailure:()=>failed++});
 await assert.rejects((await f(path)).arrayBuffer(),/Incomplete/);assert.equal(failed,1);
});


test('two bounded sections download concurrently but reach Unity in byte order',async()=>{
 const starts=[],pending=new Map();let active=0,maximum=0;
 const fetcher=async url=>{const i=Number(new URL(url).searchParams.get('part'));starts.push(i);maximum=Math.max(maximum,++active);return new Promise(resolve=>pending.set(i,()=>{active--;resolve(new Response(new Uint8Array([i*3+1,i*3+2,i*3+3])));}));};
 const response=await createGameFetch(fetcher,origin,{...opts,files:{'game.data':9}})(path);
 const read=response.arrayBuffer();await new Promise(r=>setImmediate(r));
 assert.deepEqual(starts,[0,1]);pending.get(1)();pending.get(0)();
 await new Promise(r=>setImmediate(r));assert.deepEqual(starts,[0,1,2]);pending.get(2)();
 assert.deepEqual([...new Uint8Array(await read)],[1,2,3,4,5,6,7,8,9]);assert.equal(maximum,2);
});
