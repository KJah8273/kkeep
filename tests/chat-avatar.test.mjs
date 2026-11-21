import test from 'node:test';
import assert from 'node:assert/strict';
import {crc32,deflateSync,inflateSync} from 'node:zlib';
import {normalizeChatAvatar} from '../worker/chat-avatar.ts';

const signature=Buffer.from([137,80,78,71,13,10,26,10]);
function chunk(type,payload){
  const result=Buffer.alloc(payload.length+12);result.writeUInt32BE(payload.length);result.write(type,4);payload.copy(result,8);
  result.writeUInt32BE(crc32(result.subarray(4,-4)),result.length-4);return result;
}
function header(width=32,height=32,color=6,depth=8){
  const value=Buffer.alloc(13);value.writeUInt32BE(width,0);value.writeUInt32BE(height,4);value[8]=depth;value[9]=color;return chunk('IHDR',value);
}
function png(pixels=Buffer.alloc(32*(32*4+1)),before=[],after=[]){
  return Buffer.concat([signature,header(),...before,chunk('IDAT',deflateSync(pixels)),...after,chunk('IEND',Buffer.alloc(0))]);
}
function chunks(bytes){
  const result=[];let offset=8;
  while(offset+12<=bytes.length){const size=bytes.readUInt32BE(offset);result.push({type:bytes.toString('ascii',offset+4,offset+8),payload:bytes.subarray(offset+8,offset+8+size)});offset+=size+12;}
  return result;
}

test('portable normalizer preserves the raster and emits only clean structural PNG chunks',async()=>{
  const pixels=Buffer.alloc(32*(32*4+1));
  for(let row=0;row<32;row++)for(let column=0;column<32;column++){const i=row*(32*4+1)+1+column*4;pixels[i]=column*8;pixels[i+1]=row*8;pixels[i+2]=123;pixels[i+3]=255;}
  const source=png(pixels,[chunk('tEXt',Buffer.from('Comment\0private photo metadata'))]);
  const result=await normalizeChatAvatar(source,'image/png');
  assert.equal(result.type,'image/png');assert.equal(result.width,32);assert.equal(result.height,32);
  const clean=chunks(Buffer.from(result.bytes));
  assert.deepEqual(clean.map(part=>part.type),['IHDR','IDAT','IEND']);
  assert.deepEqual(inflateSync(Buffer.concat(clean.filter(part=>part.type==='IDAT').map(part=>part.payload))),pixels);
  assert.ok(!Buffer.from(result.bytes).includes(Buffer.from('private photo metadata')));
});

test('CRC damage, invalid filters, truncated rasters and decompression expansion are rejected',async()=>{
  const corrupted=png();corrupted[corrupted.length-1]^=1;
  await assert.rejects(normalizeChatAvatar(corrupted,'image/png'));
  const badFilter=Buffer.alloc(32*(32*4+1));badFilter[0]=5;
  await assert.rejects(normalizeChatAvatar(png(badFilter),'image/png'));
  await assert.rejects(normalizeChatAvatar(png(Buffer.alloc(32*(32*4+1)-1)),'image/png'));
  await assert.rejects(normalizeChatAvatar(png(Buffer.alloc(2*1024*1024)),'image/png'));
  await assert.rejects(normalizeChatAvatar(png(),'image/svg+xml'));
});

test('animation, invalid structure, unsupported pixel formats and excessive dimensions are rejected',async()=>{
  await assert.rejects(normalizeChatAvatar(png(undefined,[chunk('acTL',Buffer.alloc(8))]),'image/png'));
  await assert.rejects(normalizeChatAvatar(png(undefined,[chunk('BOMB',Buffer.alloc(1))]),'image/png'));
  await assert.rejects(normalizeChatAvatar(png(undefined,[header()]),'image/png'));
  await assert.rejects(normalizeChatAvatar(png(undefined,[],[chunk('tEXt',Buffer.from('a\0b')),chunk('IDAT',deflateSync(Buffer.alloc(0)))]),'image/png'));
  for(const h of [header(513,32),header(31,32),header(32,32,3),header(32,32,6,16)]){
    const source=Buffer.concat([signature,h,chunk('IDAT',deflateSync(Buffer.alloc(32*(32*4+1)))),chunk('IEND',Buffer.alloc(0))]);
    await assert.rejects(normalizeChatAvatar(source,'image/png'));
  }
});
