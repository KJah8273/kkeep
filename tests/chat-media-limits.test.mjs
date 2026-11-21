import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {crc32,deflateSync} from 'node:zlib';
import {normalizeChatAvatar} from '../worker/chat-avatar.ts';
import {normalizeChatGif} from '../worker/chat-gif.ts';

function chunk(type,payload){
  const bytes=Buffer.alloc(payload.length+12);
  bytes.writeUInt32BE(payload.length);bytes.write(type,4);payload.copy(bytes,8);
  bytes.writeUInt32BE(crc32(bytes.subarray(4,-4)),bytes.length-4);
  return bytes;
}
function png(width,height){
  const header=Buffer.alloc(13);header.writeUInt32BE(width);header.writeUInt32BE(height,4);header[8]=8;header[9]=6;
  const pixels=Buffer.alloc(height*(width*4+1));
  return new Uint8Array(Buffer.concat([
    Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),
    chunk('IDAT',deflateSync(pixels)),chunk('IEND',Buffer.alloc(0)),
  ]));
}

test('PNG banners accept the wider banner canvas while avatars keep their own bound',async()=>{
  const wide=png(1024,512);
  const banner=await normalizeChatAvatar(wide,'image/png','banner');
  assert.equal(banner.width,1024);assert.equal(banner.height,512);
  assert.equal(banner.type,'image/png');
  await assert.rejects(()=>normalizeChatAvatar(wide,'image/png','avatar'));
  const avatar=await normalizeChatAvatar(png(512,512),'image/png','avatar');
  assert.equal(avatar.width,512);assert.equal(avatar.height,512);
});

test('PNG banner width, height and minimum dimensions remain bounded',async()=>{
  for(const [width,height] of [[1025,32],[32,513],[31,64],[64,31]]){
    await assert.rejects(()=>normalizeChatAvatar(png(width,height),'image/png','banner'));
  }
});

const fixture=new Uint8Array(readFileSync(new URL('./fixtures/chat/palette.gif',import.meta.url)));
function beforeRaster(extension){
  const offset=13+(fixture[10]&128?3*(2<<(fixture[10]&7)):0);
  return new Uint8Array(Buffer.concat([fixture.subarray(0,offset),extension,fixture.subarray(offset)]));
}

test('GIF fragmented metadata cannot allocate an unbounded number of sub-block views',()=>{
  // Under 150 KB, but enough tiny blocks to exceed the file-wide work budget.
  const blocks=70000,comment=Buffer.alloc(3+blocks*2);
  comment[0]=0x21;comment[1]=0xfe;
  for(let index=0;index<blocks;index++){comment[2+index*2]=1;comment[3+index*2]=65;}
  assert.throws(()=>normalizeChatGif(beforeRaster(comment),'avatar'));
});

test('GIF work budget includes empty extension terminators across the whole file',()=>{
  const comments=Buffer.alloc(70000*3);
  for(let index=0;index<70000;index++){comments[index*3]=0x21;comments[index*3+1]=0xfe;}
  assert.throws(()=>normalizeChatGif(beforeRaster(comments),'avatar'));
});
