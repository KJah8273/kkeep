// Keep large Asyncify functions out of Safari's memory-intensive OMG compiler.
// WebKit bug 304810: https://bugs.webkit.org/show_bug.cgi?id=304810#c11
// The baseline compiler still executes the original body. A closed block at
// the beginning skips unreachable nops; no existing instruction or label moves
// into a different nesting scope. Function indices, data and exports are intact.
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
export const GUARD = {minimumBodyBytes:40000,targetBodyBytes:160000};
export function u32(bytes,offset) {
  let value=0,shift=0;
  for(let i=0;i<5;i++) {
    if(offset>=bytes.length)throw Error('Truncated Wasm integer');
    const byte=bytes[offset++];value+=(byte&127)*2**shift;
    if(!(byte&128)) {if(value>0xffffffff)throw Error('Invalid Wasm integer');return [value,offset];}
    shift+=7;
  }
  throw Error('Invalid Wasm integer');
}
export function encodeU32(value) {
  const bytes=[];
  do {let byte=value&127;value=Math.floor(value/128);bytes.push(byte|(value?128:0));}while(value);
  return Buffer.from(bytes);
}
export function localEnd(body) {
  let [groups,offset]=u32(body,0);
  for(let i=0;i<groups;i++) {
    const [,next]=u32(body,offset);offset=next;
    if(![0x7f,0x7e,0x7d,0x7c,0x7b,0x70,0x6f].includes(body[offset++]))throw Error('Unexpected local type in pinned engine');
  }
  return offset;
}
export function guardWasm(input,{minimumBodyBytes,targetBodyBytes}=GUARD) {
  if(!Number.isSafeInteger(minimumBodyBytes)||minimumBodyBytes<1||!Number.isSafeInteger(targetBodyBytes)||targetBodyBytes<minimumBodyBytes+5)throw Error('Invalid compiler guard sizes');
  const bytes=Buffer.from(input);
  if(!bytes.subarray(0,8).equals(Buffer.from([0,97,115,109,1,0,0,0])))throw Error('Invalid Wasm header');
  const sections=[bytes.subarray(0,8)],changed=[];
  let offset=8,foundCode=false;
  while(offset<bytes.length) {
    const sectionStart=offset,id=bytes[offset++];
    const [size,start]=u32(bytes,offset),end=start+size;
    if(end>bytes.length)throw Error('Truncated Wasm section');
    offset=end;
    if(id!==10){sections.push(bytes.subarray(sectionStart,end));continue;}
    if(foundCode)throw Error('Duplicate Wasm code section');foundCode=true;
    let [count,pos]=u32(bytes,start);
    const bodies=[encodeU32(count)];
    for(let index=0;index<count;index++) {
      const [length,bodyStart]=u32(bytes,pos),bodyEnd=bodyStart+length;
      if(bodyEnd>end)throw Error('Truncated Wasm function');
      let body=bytes.subarray(bodyStart,bodyEnd);pos=bodyEnd;
      if(length>=minimumBodyBytes&&length<targetBodyBytes) {
        const locals=localEnd(body),added=Math.max(5,targetBodyBytes-length);
        const padding=Buffer.alloc(added,0x01);
        padding.set([0x02,0x40,0x0c,0x00]);padding[added-1]=0x0b;
        body=Buffer.concat([body.subarray(0,locals),padding,body.subarray(locals)]);
        changed.push({index,before:length,after:body.length});
      }
      bodies.push(encodeU32(body.length),body);
    }
    if(pos!==end)throw Error('Unexpected bytes after Wasm code');
    const payload=Buffer.concat(bodies);
    sections.push(Buffer.from([id]),encodeU32(payload.length),payload);
  }
  if(!foundCode)throw Error('Missing Wasm code section');
  return {bytes:Buffer.concat(sections),changed};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  if(process.argv.length!==4)throw Error('Usage: node guard-hill-wasm.mjs input.wasm output.wasm');
  const {bytes,changed}=guardWasm(readFileSync(process.argv[2]));
  if(!WebAssembly.validate(bytes))throw Error('Compiler guard produced invalid Wasm');
  writeFileSync(process.argv[3],bytes);
  console.log(JSON.stringify({bytes:bytes.length,functions:changed.length,sha256:createHash('sha256').update(bytes).digest('hex')}));
}
