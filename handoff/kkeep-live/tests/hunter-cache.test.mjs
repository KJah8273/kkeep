import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
import {Miniflare} from 'miniflare';
import {hunterFile,verifiedHunterChunk,HUNTER_ID,HUNTER_BUILD} from '../worker/hunter-file.ts';

const url=`https://kkeep.test/api/hunter-file/${HUNTER_BUILD}/engine.wasm`;
const fixture=new Uint8Array([0,97,115,109,1,0,0,0]);
const sha=createHash('sha256').update(fixture).digest('hex');
test('Hunter validates complete bytes and rejects corrupt or oversized chunks',async()=>{
 assert.deepEqual(await verifiedHunterChunk(new Response(fixture),fixture.length,sha),fixture);
 for(const bytes of [fixture.slice(1),new Uint8Array(9),new Uint8Array(8)])await assert.rejects(verifiedHunterChunk(new Response(bytes),8,sha),/Incomplete|Oversized|checksum/);
});
test('Hunter rejects invalid part requests before storage or network access',async()=>{
 for(const query of ['part=-1','part=12','part=NaN','part=0&part=1','part=0&url=x']){
  const r=await hunterFile(new Request(url+'?'+query),()=>{throw Error('must not fetch');});assert.ok([404,416].includes(r.status));
 }
 assert.equal((await hunterFile(new Request(url+'?part=0',{headers:{Range:'bytes=0-3'}}),()=>{throw Error('must not fetch');})).status,416);
});
test('Hunter verifies and stores parts, serves cached gzip, and never stores upstream errors in Workers',async()=>{
 // Tiny known bytes exercise the production path and R2 without committing a
 // large native engine fixture. Archive offset/size checks remain unchanged.
 const {outputFiles}=await build({stdin:{contents:"import {hunterFile} from './worker/hunter-file.ts';export default {async fetch(request,env,ctx){request=new Request(request);if(request.headers.has('X-Test-Accept-Encoding'))request.headers.set('Accept-Encoding',request.headers.get('X-Test-Accept-Encoding'));const response=await hunterFile(request,fetch,env,ctx);response.headers.set('X-Test-Encoded',response.headers.get('Content-Encoding')||'identity');return response;}}",resolveDir:process.cwd()},bundle:true,write:false,format:'esm',platform:'browser',plugins:[{name:'small-test-build',setup(build){build.onLoad({filter:/hunter-(files|chunks)\.json$/},args=>({loader:'json',contents:JSON.stringify(args.path.endsWith('hunter-files.json')?{'engine.wasm':{offset:108688380,size:8}}:{'engine.wasm':[sha]})}));}}]});
 let network=0,mode='ok';
 const mf=new Miniflare({modules:true,script:outputFiles[0].text,compatibilityDate:'2026-03-01',r2Buckets:['GAME_ASSETS'],outboundService:async request=>{
  network++;
  if(request.url.includes('/frame'))return new Response(`"https://cdn.play.unity.com/games/${HUNTER_ID}/${HUNTER_BUILD}/game.data?Signature=test"`);
  assert.equal(request.headers.get('Range'),'bytes=108688380-108688387');
  if(mode==='unavailable')return new Response('unavailable',{status:502});
  return new Response(mode==='corrupt'?new Uint8Array(8):fixture,{status:206,headers:{'Content-Range':'bytes 108688380-108688387/189056865','Content-Length':'8'}});
 }});
 const key=`hunter-builds/${HUNTER_BUILD}/engine.wasm/part-0`;
 try{
  const bucket=await mf.getR2Bucket('GAME_ASSETS');
  for(const failure of ['unavailable','corrupt']){
   mode=failure;const r=await mf.dispatchFetch(url+'?part=0');assert.equal(r.status,502);assert.equal(r.headers.get('Cache-Control'),'no-store');await r.text();assert.equal(await bucket.head(key),null);
  }
  mode='ok';const r=await mf.dispatchFetch(url+'?part=0',{headers:{'Accept-Encoding':'identity'}});
  assert.equal(r.status,200);assert.equal(r.headers.get('X-Kkeep-Game-Cache'),'upstream');assert.equal(r.headers.get('X-Kkeep-Decoded-Length'),'8');assert.deepEqual(new Uint8Array(await r.arrayBuffer()),fixture);
  // R2 fill is a waitUntil task; observe its completion before checking the hit.
  let stored;for(let i=0;i<20;i++){stored=await bucket.head(key);if(stored)break;await new Promise(resolve=>setTimeout(resolve,25));}
  assert.equal(stored?.customMetadata?.sha256,sha);assert.equal(stored?.size,8);
  const before=network;
  for(const encoding of ['gzip','gzip;q=0']){
   const hit=await mf.dispatchFetch(url+'?part=0',{headers:{'Accept-Encoding':encoding,'X-Test-Accept-Encoding':encoding}});assert.equal(hit.status,200);assert.equal(hit.headers.get('X-Kkeep-Game-Cache'),'storage');assert.equal(hit.headers.get('X-Test-Encoded'),encoding==='gzip'?'gzip':'identity');
   // Miniflare dispatchFetch transparently decodes HTTP content encoding.
   assert.deepEqual(new Uint8Array(await hit.arrayBuffer()),fixture);
  }
  const head=await mf.dispatchFetch(url+'?part=0',{method:'HEAD'});assert.equal(head.status,200);assert.equal(head.headers.get('X-Kkeep-Decoded-Length'),'8');assert.equal((await head.arrayBuffer()).byteLength,0);assert.equal(network,before);
 }finally{await mf.dispose();}
});
