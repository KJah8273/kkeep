import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../public/engine/stream-compat.js',import.meta.url),'utf8');
const NativeChannel=MessageChannel;
function load(fallback){delete globalThis.__kkeepStreams;if(fallback){globalThis.MessageChannel=class{constructor(){const c=new NativeChannel();const post=c.port1.postMessage.bind(c.port1);c.port1.postMessage=(data,transfer)=>{if(transfer?.some(x=>x instanceof ReadableStream))throw new DOMException('Cannot transfer stream','DataCloneError');post(data,transfer);};return c;}};}try{vm.runInThisContext(source);}finally{globalThis.MessageChannel=NativeChannel;}return globalThis.__kkeepStreams;}
function transmit(compat,data,transfer=[]){const [packed,list]=compat.pack(data,transfer);return compat.unpack(structuredClone(packed,{transfer:list}));}
test('WebKit fallback carries JSON POST bodies and streamed responses without native stream transfer',async()=>{const c=load(true);assert.equal(c.native,false);const data=new TextEncoder().encode('{"search":"hello"}');const request=new ReadableStream({start(x){x.enqueue(data);x.close();}});const received=transmit(c,{$args:{body:request}},[request]);assert.equal(await new Response(received.$args.body).text(),'{"search":"hello"}');let pulls=0;const response=new ReadableStream({pull(x){if(pulls===3){x.close();return;}x.enqueue(new Uint8Array([++pulls]));}});const result=transmit(c,{$data:{body:response}},[response]);assert.deepEqual([...new Uint8Array(await new Response(result.$data.body).arrayBuffer())],[1,2,3]);});
test('stream bridge propagates errors and cancellation',async()=>{const c=load(true);const failed=new ReadableStream({pull(x){x.error(new Error('upstream failed'));}});await assert.rejects(()=>new Response(transmit(c,{body:failed}).body).text(),/upstream failed/);let cancel;const canceled=new Promise(r=>cancel=r);const stream=new ReadableStream({cancel(){cancel();}});await transmit(c,{body:stream}).body.cancel();await canceled;});
test('native support adds missing stream transfer lists for remote requests',async()=>{const c=load(false);assert.equal(c.native,true);const s=new ReadableStream({start(x){x.enqueue(new Uint8Array([42]));x.close();}});const received=transmit(c,{body:s});assert.deepEqual([...new Uint8Array(await new Response(received.body).arrayBuffer())],[42]);});

test('WebKit streams the first bytes immediately and bounds read-ahead for slow consumers',async()=>{
 const c=load(true);let source,pulls=0;
 const stream=new ReadableStream({start(x){source=x;x.enqueue(new Uint8Array([9]));},pull(){pulls++;}});
 const reader=transmit(c,{body:stream}).body.getReader();
 assert.deepEqual([...((await reader.read()).value)],[9]);
 source.enqueue(new Uint8Array([8]));source.close();
 assert.deepEqual([...((await reader.read()).value)],[8]);assert.equal((await reader.read()).done,true);
 let generated=0,canceled=false;
 const fast=new ReadableStream({pull(x){generated++;x.enqueue(new Uint8Array(16384));},cancel(){canceled=true;}});
 const slow=transmit(c,{body:fast}).body.getReader();await slow.read();
 await new Promise(r=>setTimeout(r,40));
 assert.ok(generated<=10,`read-ahead must be bounded, got ${generated} chunks`);
 await slow.cancel();await new Promise(r=>setTimeout(r,20));assert.equal(canceled,true);
});

test('WebKit batches small chunks without detaching shared source buffers',async()=>{
 const c=load(true);const bytes=new Uint8Array(4096).fill(7);let count=0;
 const stream=new ReadableStream({pull(x){if(count++===64){x.close();return;}x.enqueue(bytes);}});
 const output=new Uint8Array(await new Response(transmit(c,{body:stream}).body).arrayBuffer());
 assert.equal(output.length,64*4096);assert.ok(output.every(n=>n===7));assert.equal(bytes.byteLength,4096);
});
