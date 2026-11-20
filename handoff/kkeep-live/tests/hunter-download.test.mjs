import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync('public/games/hunter-assassin/download.js','utf8');
const CHUNK=4*1024*1024;
const sizes={'engine.wasm':49381689,'assets.bin':105433919,'images.json':10366914,'libAssassin.so.bin':17810248,'libc++_shared.so.bin':1331536};
const total=Object.values(sizes).reduce((a,b)=>a+b,0);
function setup(fetch,extra={}){
 const context={fetch,URL,Map,Set,Uint8Array,ReadableStream,Response,AbortController,setTimeout,clearTimeout,WebAssembly,...extra,KKEEP_ASSETS:Object.fromEntries(Object.keys(sizes).map(name=>[name,'https://kkeep.test/'+name]))};
 vm.runInNewContext(source,context);return context.HunterDownload;
}
function response(name,index,{short=false}={}){
 const size=Math.min(CHUNK,sizes[name]-index*CHUNK);
 return new Response(new Uint8Array(size-(short?1:0)).fill(index+1),{headers:{'X-Kkeep-Decoded-Length':String(size)}});
}
test('Hunter streams two parts at a time in order and reports real bytes',async()=>{
 let active=0,peak=0;const calls=[],progress=[];
 const loader=setup(async url=>{
  const u=new URL(url),index=Number(u.searchParams.get('part')),name=u.pathname.slice(1);
  calls.push(index);active++;peak=Math.max(peak,active);
  await new Promise(resolve=>setTimeout(resolve,index%2?1:4));active--;
  return response(name,index);
 });
 loader.onProgress(p=>progress.push(p));
 const bytes=new Uint8Array(await loader.read('images.json'));
 assert.deepEqual(calls,[0,1,2]);assert.equal(peak,2);assert.equal(bytes.length,sizes['images.json']);
 for(let i=0;i<bytes.length;i+=CHUNK){assert.equal(bytes[i],Math.floor(i/CHUNK)+1);assert.equal(bytes[Math.min(i+CHUNK,bytes.length)-1],Math.floor(i/CHUNK)+1);}
 assert.equal(progress[0].percent,0);assert.equal(progress.at(-1).loaded,bytes.length);
 assert.equal(progress.at(-1).percent,Math.floor(bytes.length/total*100));
 assert.ok(progress.every((p,i)=>p.total===total&&p.loaded<total&&(i===0||p.loaded>=progress[i-1].loaded)));
});
test('Hunter retries incomplete parts without double-counting progress',async()=>{
 let calls=0;const progress=[];
 const loader=setup(async()=>response('libc++_shared.so.bin',0,{short:++calls===1}));
 loader.onProgress(p=>progress.push(p));
 const bytes=await loader.read('libc++_shared.so.bin');
 assert.equal(calls,2);assert.equal(bytes.byteLength,sizes['libc++_shared.so.bin']);
 assert.equal(progress.at(-1).loaded,bytes.byteLength);assert.ok(progress.every(p=>p.loaded<=bytes.byteLength));
});
test('Hunter rejects incomplete and wrong-length responses after bounded retries',async()=>{
 for(const bad of ['incomplete','header','oversized','http']){
  let calls=0;const loader=setup(async()=>{
   calls++;
   if(bad==='incomplete')return response('libc++_shared.so.bin',0,{short:true});
   if(bad==='http')return new Response('error',{status:502});
   return new Response(new Uint8Array(bad==='oversized'?sizes['libc++_shared.so.bin']+1:1),{headers:{'X-Kkeep-Decoded-Length':String(bad==='header'?1:sizes['libc++_shared.so.bin'])}});
  });
  await assert.rejects(loader.read('libc++_shared.so.bin'),/libc\+\+_shared.so.bin:/);assert.equal(calls,3,bad);
 }
});
test('Hunter engine receives the complete ordered stream before readiness',async()=>{
 let compiled=0,received=false;const loader=setup(async url=>{
  const u=new URL(url);return response(u.pathname.slice(1),Number(u.searchParams.get('part')));
 },{
  WebAssembly:{async instantiateStreaming(response){
   assert.equal(response.headers.get('Content-Type'),'application/wasm');const reader=response.body.getReader();
   for(let i=0;;i++){const {done,value}=await reader.read();if(done)break;assert.equal(value[0],i+1);compiled+=value.length;}
   return {instance:{exports:{}},module:{}};
  }},
  PortEngine(options){return new Promise(resolve=>options.instantiateWasm({},()=>{received=true;resolve('ready');}));}
 });
 assert.equal(await loader.engine({}),'ready');assert.equal(received,true);assert.equal(compiled,sizes['engine.wasm']);
});
