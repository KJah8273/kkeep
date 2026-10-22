import test from 'node:test';
import assert from 'node:assert/strict';
import {GameDownloads,installUnityStreaming} from '../public/games/downloads.js';
import {isIPad,renderScale} from '../public/games/unity-display.js';
function store(fetcher,onProgress){const d=new GameDownloads({repo:'owner/game',revision:'abc',cacheKey:'test',fetcher,onProgress});const cache=new Map();d.cache=async(path,blob)=>blob?cache.set(path,blob):cache.get(path);return d;}
test('a 403 switches mirrors and a valid file is reused on retry',async()=>{
 const requests=[],events=[];const d=store(async url=>{requests.push(url);return requests.length===1?new Response('Forbidden',{status:403}):new Response('game');},e=>events.push(e));
 assert.equal(await (await d.file('Build/data.part6',4)).text(),'game');assert.match(requests[0],/raw.githubusercontent/);assert.match(requests[1],/cdn.jsdelivr/);
 assert.equal(await (await d.file('Build/data.part6',4)).text(),'game');assert.equal(requests.length,2);assert.equal(d.bytes,4);assert(events.some(e=>e.retrying));
});
test('a partial 200 response is rejected before caching and retries another source',async()=>{
 let calls=0;const d=store(async()=>new Response(++calls===1?'ga':'game'));
 assert.equal(await (await d.file('Build/data',4)).text(),'game');assert.equal(calls,2);assert.equal(d.bytes,4);
});
test('a terminal download failure remains an error and does not count bytes',async()=>{
 let calls=0;const d=store(async()=>{calls++;return new Response('blocked',{status:403});});
 await assert.rejects(d.file('Build/data',4),/Could not download data/);assert.equal(calls,4);assert.equal(d.bytes,0);
});
test('split bundle streaming preserves exact byte order and total length',async()=>{
 const d=store(async url=>new Response(url.endsWith('part1')?'ABCD':'EF'));const response=d.stream([['bundle.part1',4],['bundle.part2',2]]);
 assert.equal(response.headers.get('Content-Length'),'6');assert.equal(await response.text(),'ABCDEF');
});
test('Unity streaming delivers chunks without retaining a second complete body',async()=>{
 const module={readBodyWithProgress(){throw new Error('old full-buffer path used');}};installUnityStreaming(module);
 const chunks=[],response=new Response(new Uint8Array([1,2,3,4]),{headers:{'Content-Length':'4'}});
 const result=await module.readBodyWithProgress(response,e=>{if(e.chunk)chunks.push(...e.chunk);},true);
 assert.deepEqual(chunks,[1,2,3,4]);assert.equal(result.parsedBody.length,4);assert.equal(ArrayBuffer.isView(result.parsedBody),false);
});
test('non-streaming Unity downloads still receive their original complete body',async()=>{
 let originalCalled=false;const module={readBodyWithProgress(response){originalCalled=true;return response;}};installUnityStreaming(module);
 const response=new Response('data');assert.equal(await module.readBodyWithProgress(response,()=>{},false),response);assert(originalCalled);
});
test('desktop-mode iPads are mobile and low quality limits pixel cost',()=>{
 assert(isIPad({userAgent:'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',platform:'MacIntel',maxTouchPoints:5}));
 assert(!isIPad({userAgent:'Macintosh',platform:'MacIntel',maxTouchPoints:0}));
 assert.equal(Math.round(renderScale(1180,820,'low')*1180),960);assert.equal(Math.round(renderScale(2360,1640,'balanced')*2360),1280);
 assert.equal(renderScale(820,1180,'low'),renderScale(1180,820,'low'));
});

test('compressed local files decode to the original bytes and stay cached',async()=>{
 const {gzipSync}=await import('node:zlib');const raw=new TextEncoder().encode('original game bytes '.repeat(1000));const gzip=gzipSync(raw);const calls=[];const events=[];
 const d=store(async url=>{calls.push(url);return new Response(gzip);},event=>events.push(event));d.packed={'Build/test':{url:'/games/packed/test.bin',bytes:gzip.length,size:raw.length}};
 const result=await d.file('Build/test',raw.length);assert.deepEqual(new Uint8Array(await result.arrayBuffer()),raw);assert.equal(calls[0],'/games/packed/test.bin');
 await d.file('Build/test',raw.length);assert.equal(calls.length,1);assert.equal(d.networkBytes,gzip.length);assert(events.some(e=>e.loadedBytes>0));
});
test('a damaged compressed file falls back to the pinned original without caching damage',async()=>{
 const calls=[];const d=store(async url=>{calls.push(url);return new Response(url.startsWith('/')?'not gzip':'game');});d.packed={'Build/test':{url:'/games/packed/test.bin',bytes:8,size:4}};
 assert.equal(await (await d.file('Build/test',4)).text(),'game');assert.equal(calls.length,2);assert.match(calls[1],/raw.githubusercontent/);
});
test('parallel downloads overlap with a maximum of three active requests and preserve part order',async()=>{
 let active=0,peak=0;const finish=[];
 const d=store(async url=>{active++;peak=Math.max(peak,active);await new Promise(resolve=>finish.push(resolve));active--;return new Response(url.split('/').pop());});
 const pending=d.combine([['a',1],['b',1],['c',1],['d',1],['e',1]],'application/octet-stream');
 while(finish.length<3)await new Promise(resolve=>setImmediate(resolve));assert.equal(peak,3);
 finish.splice(0).forEach(resolve=>resolve());
 while(finish.length<2)await new Promise(resolve=>setImmediate(resolve));finish.splice(0).forEach(resolve=>resolve());
 assert.equal(await (await pending).text(),'abcde');assert.equal(peak,3);
});
test('download progress arrives before a complete file finishes',async()=>{
 const events=[];let output;
 const d=store(async()=>new Response(new ReadableStream({start(controller){output=controller;controller.enqueue(new TextEncoder().encode('ga'));}})),event=>events.push(event));
 const pending=d.file('Build/test',4);while(!events.length)await new Promise(resolve=>setImmediate(resolve));
 assert.equal(events[0].loadedBytes,2);assert.equal(events[0].bytes,0);output.enqueue(new TextEncoder().encode('me'));output.close();assert.equal(await (await pending).text(),'game');
});
