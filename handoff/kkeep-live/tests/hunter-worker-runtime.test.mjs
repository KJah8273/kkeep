import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {Miniflare} from 'miniflare';
import {HUNTER_ID,HUNTER_BUILD} from '../worker/hunter-file.ts';
const {outputFiles}=await build({stdin:{contents:"import {hunterFile} from './worker/hunter-file.ts';export default {fetch:request=>hunterFile(request)}",resolveDir:process.cwd()},bundle:true,write:false,format:'esm',platform:'browser'});
test('Hunter downloads byte ranges in the actual Worker runtime and rejects redirects',async()=>{
 let mode='ok',requests=[];
 const mf=new Miniflare({modules:true,script:outputFiles[0].text,compatibilityDate:'2026-03-01',outboundService:async request=>{
  requests.push(new URL(request.url).hostname);
  if(request.url.includes('/frame'))return mode==='frame-redirect'?new Response(null,{status:302,headers:{Location:'https://untrusted.test/archive'}}):new Response(`"https://cdn.play.unity.com/games/${HUNTER_ID}/${HUNTER_BUILD}/game.data?Signature=test"`);
  assert.equal(request.headers.get('Range'),'bytes=108688380-108688383');
  if(mode==='data-redirect')return new Response(null,{status:302,headers:{Location:'https://untrusted.test/archive'}});
  return new Response(request.method==='HEAD'?null:new Uint8Array([0,97,115,109]),{status:206,headers:{'Content-Range':'bytes 108688380-108688383/189056865','Content-Length':'4'}});
 }});
 try{
  const url=`https://kkeep.test/api/hunter-file/${HUNTER_BUILD}/engine.wasm`;
  for(const method of ['GET','HEAD']){
   const r=await mf.dispatchFetch(url,{method,headers:{Range:'bytes=0-3'}});assert.equal(r.status,206);assert.equal(r.headers.get('Content-Range'),'bytes 0-3/49381689');assert.equal(r.headers.get('Content-Type'),'application/wasm');assert.equal((await r.arrayBuffer()).byteLength,method==='HEAD'?0:4);
  }
  for(const next of ['frame-redirect','data-redirect']){mode=next;requests=[];const r=await mf.dispatchFetch(url,{headers:{Range:'bytes=0-3'}});assert.equal(r.status,502);assert.ok(!requests.includes('untrusted.test'));}
 }finally{await mf.dispose();}
});
