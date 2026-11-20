import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {brotliDecompressSync} from 'node:zlib';
import {guardWasm,u32,encodeU32,localEnd} from '../scripts/guard-hill-wasm.mjs';
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
test('the shipped compiler guard preserves every original instruction and every other Wasm section',()=>{
  const manifest=JSON.parse(readFileSync(new URL('../public/games/ipad-imports/assets/hill-compat.json',import.meta.url)));
  const guard=manifest.compiler.guard;assert(guard);
  const wasm=brotliDecompressSync(readFileSync(new URL('../public'+manifest.wasm.file,import.meta.url)));
  const restored=[wasm.subarray(0,8)];let offset=8,removed=0;
  while(offset<wasm.length) {
    const begin=offset,id=wasm[offset++];const [size,start]=u32(wasm,offset),end=start+size;offset=end;
    if(id!==10){restored.push(wasm.subarray(begin,end));continue;}
    let [count,pos]=u32(wasm,start);const bodies=[encodeU32(count)];
    for(let index=0;index<count;index++) {
      const [length,from]=u32(wasm,pos);pos=from+length;let body=wasm.subarray(from,pos);
      if(length===guard.targetBodyBytes) {
        const locals=localEnd(body);assert.deepEqual([...body.subarray(locals,locals+4)],[0x02,0x40,0x0c,0x00]);
        let endPadding=locals+4;while(body[endPadding]===0x01)endPadding++;
        assert.equal(body[endPadding++],0x0b);
        body=Buffer.concat([body.subarray(0,locals),body.subarray(endPadding)]);removed++;
        assert(body.length>=guard.minimumBodyBytes&&body.length<guard.targetBodyBytes);
      }
      bodies.push(encodeU32(body.length),body);
    }
    assert.equal(pos,end);const payload=Buffer.concat(bodies);restored.push(Buffer.from([id]),encodeU32(payload.length),payload);
  }
  const original=Buffer.concat(restored);
  assert.equal(removed,guard.functions);assert.equal(digest(original),guard.inputSha256);
  assert.equal(WebAssembly.validate(original),true);
  // Reproducible byte-for-byte, without changing game data or compiled logic.
  assert.equal(digest(guardWasm(original).bytes),manifest.wasm.sha256);
  assert.equal(guardWasm(wasm).changed.length,0);
});
