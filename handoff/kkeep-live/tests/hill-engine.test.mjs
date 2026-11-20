import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {brotliDecompressSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {hillEngine} from '../worker/hill-engine.ts';
import manifest from '../public/games/ipad-imports/assets/hill-compat.json' with {type:'json'};
const request=(path=manifest.wasm.url,method='GET')=>new Request('https://kkeep.test'+path,{method});
test('the published endpoint serves the verified Brotli engine with manual encoding',async t=>{
 const NativeResponse=globalThis.Response;
 globalThis.Response=class extends NativeResponse {constructor(body,init){super(body,init);this.encoding=init?.encodeBody;}};
 t.after(()=>{globalThis.Response=NativeResponse;});
 const bytes=readFileSync(new URL('../public'+manifest.wasm.file,import.meta.url));
 const calls=[];const env={ASSETS:{async fetch(req){calls.push(req);return new Response(req.method==='HEAD'?null:bytes);}}};
 const response=await hillEngine(request(),env);
 assert.equal(response.status,200);assert.equal(response.encoding,'manual');
 assert.equal(response.headers.get('Content-Encoding'),'br');assert.equal(response.headers.get('Content-Type'),'application/wasm');
 assert.equal(response.headers.get('Access-Control-Allow-Origin'),'*');
 const decoded=brotliDecompressSync(Buffer.from(await response.arrayBuffer()));
 assert.equal(createHash('sha256').update(decoded).digest('hex'),manifest.wasm.sha256);
 assert.equal(new URL(calls[0].url).pathname,manifest.wasm.file);assert.equal(calls[0].headers.get('Accept-Encoding'),'identity');
 const head=await hillEngine(request(manifest.wasm.url,'HEAD'),env);assert.equal((await head.arrayBuffer()).byteLength,0);assert.equal(calls[1].method,'HEAD');
});
test('unknown engines, writes and missing assets cannot produce a corrupt successful download',async()=>{
 let calls=0;const env={ASSETS:{async fetch(){calls++;return new Response('<html>not found</html>',{headers:{'Content-Type':'text/html'}});}}};
 assert.equal((await hillEngine(request('/api/hill-engine/other.wasm'),env)).status,404);
 assert.equal((await hillEngine(request(manifest.wasm.url,'POST'),env)).status,405);assert.equal(calls,0);
 assert.equal((await hillEngine(request(),env)).status,503);
});
