import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createHash,webcrypto} from 'node:crypto';
import {brotliDecompressSync} from 'node:zlib';
const root=new URL('../',import.meta.url);
const source=readFileSync(new URL('public/games/ipad-imports/assets/hill-compat.js',root),'utf8');
function setup(extra={}) {const ctx=vm.createContext({Blob,Response,DecompressionStream,crypto:webcrypto,...extra});vm.runInContext(source,ctx);return ctx.KkeepHcrCompatibility;}
const hash=b=>createHash('sha256').update(b).digest('hex');
test('the compressed engine preserves the tested binary and validates without JSPI',()=>{
 const manifest=JSON.parse(readFileSync(new URL('public/games/ipad-imports/assets/hill-compat.json',root)));
 const packed=readFileSync(new URL('public'+manifest.wasm.file,root));
 assert.equal(packed.length,manifest.wasm.bytes);assert.equal(hash(packed),manifest.wasm.compressedSha256);
 const wasm=brotliDecompressSync(packed);assert.equal(wasm.length,manifest.wasm.size);assert.equal(hash(wasm),manifest.wasm.sha256);
 assert.equal(WebAssembly.validate(wasm),true);
 const exports=WebAssembly.Module.exports(new WebAssembly.Module(wasm));
 for(const name of ['asyncify_start_unwind','asyncify_stop_unwind','asyncify_start_rewind','asyncify_stop_rewind','hcr_ev_touch','hcr_thread_start'])assert(exports.some(e=>e.name===name));
 assert.equal(manifest.source.revision,'7467bb544dff9871a1a6dfd15407ecd48bd06bb9');
});
test('native JSPI stays native; missing either native function selects the adapter',()=>{
 const c=setup();assert.equal(c.needed({Suspending(){},promising(){}}),false);
 assert.equal(c.needed({Suspending(){}}),true);assert.equal(c.needed({}),true);
});
test('the original page and runtime change only their suspension adapter and capability gate',()=>{
 const c=setup();const script=readFileSync(new URL('tests/fixtures/hill-compat/hcr.js',root),'utf8');
 const html=readFileSync(new URL('tests/fixtures/hill-compat/index.html',root),'utf8');
 const patched=c.patchScript(script);new vm.Script(patched);
 assert(!patched.includes('new WebAssembly.Suspending'));assert(patched.includes('var Asyncify = globalThis.KkeepHcrAsyncify();'));
 const start=script.indexOf('var Asyncify = {'),end=script.indexOf('\nFS.createPreloadedFile',start);
 assert(patched.startsWith(script.slice(0,start)));assert(patched.endsWith(script.slice(end)));
 assert.equal(c.patchPage(html).replace('const supported = true; // The converted engine uses KkeepHcrAsyncify.',"const supported = 'Suspending' in WebAssembly;"),html);
 assert.throws(()=>c.patchScript('unrelated engine'),/does not match/);
});
test('engine download verifies decoded bytes without requiring decompression streams',async()=>{
 const bytes=readFileSync(new URL('tests/fixtures/hill-compat/continuation.wasm',root));
 const digest=hash(bytes),manifest={version:2,wasm:{size:bytes.length,sha256:digest,url:'/api/hill-engine/'+digest.slice(0,16)+'.wasm'}};
 const calls=[];const c=setup({DecompressionStream:undefined});
 const file=await c.loadEngine(manifest,{download:async o=>{calls.push(o.urls[0]);o.onReset();o.onChunk(bytes.subarray(0,10),0);o.onChunk(bytes.subarray(10),10);}});
 assert.deepEqual(Buffer.from(await file.arrayBuffer()),bytes);
 assert.equal(calls[0],'https://kkeep.fun'+manifest.wasm.url);
 await assert.rejects(c.loadEngine(manifest,{download:async o=>{o.onReset();o.onChunk(new Uint8Array(bytes.length),0);}}),/checksum mismatch/);
});
