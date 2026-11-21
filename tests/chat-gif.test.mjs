import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {normalizeChatGif} from '../worker/chat-gif.ts';

// Independent Pillow encoders produced these raster fixtures; the animated
// fixture includes twelve frames, transparency/disposal and private metadata.
const animated = new Uint8Array(readFileSync(new URL('./fixtures/chat/animated.gif', import.meta.url)));
const palette = new Uint8Array(readFileSync(new URL('./fixtures/chat/palette.gif', import.meta.url)));
function imageOffset(bytes) {
  let offset=13+(bytes[10]&128?3*(2<<(bytes[10]&7)):0);
  while(offset<bytes.length){
    if(bytes[offset]===0x2c)return offset;
    assert.equal(bytes[offset++],0x21);offset++;
    for(;;){const size=bytes[offset++];if(!size)break;offset+=size;}
  }
  throw new Error('Fixture has no image');
}

test('GIF sanitation preserves all frames and loop settings while removing metadata',()=>{
  const result=normalizeChatGif(animated,'avatar'),text=Buffer.from(result.bytes);
  assert.equal(result.type,'image/gif');assert.equal(result.frames,12);
  assert.equal(result.width,256);assert.equal(result.height,256);
  assert.equal(text.subarray(0,6).toString(),'GIF89a');
  assert.ok(text.includes(Buffer.from('NETSCAPE2.0')));
  assert.ok(!text.includes(Buffer.from('private camera test metadata')));
  assert.equal(result.bytes.at(-1),0x3b);
  assert.deepEqual(normalizeChatGif(result.bytes,'banner').bytes,result.bytes);
  assert.equal(normalizeChatGif(palette,'avatar').frames,1);
});

test('GIF parser strips application payloads and bytes following the raster trailer',()=>{
  const offset=13+3*(2<<(animated[10]&7));
  const secret=Buffer.from('private application data');
  const application=Buffer.concat([Buffer.from([0x21,0xff,11]),Buffer.from('PRIVATE0001'),Buffer.from([secret.length]),secret,Buffer.from([0])]);
  const source=new Uint8Array(Buffer.concat([animated.subarray(0,offset),application,animated.subarray(offset),Buffer.from('<script>trailing payload</script>')]));
  const safe=normalizeChatGif(source,'banner');
  assert.deepEqual(safe.bytes,normalizeChatGif(animated,'banner').bytes);
});

test('GIF dimensions, frame boundaries and truncated subblocks cannot escape bounds',()=>{
  for(const length of [0,6,13,animated.length-1])assert.throws(()=>normalizeChatGif(animated.slice(0,length),'avatar'));
  const huge=new Uint8Array(animated);huge[6]=255;huge[7]=255;
  assert.throws(()=>normalizeChatGif(huge,'avatar'));
  const outside=new Uint8Array(animated),offset=imageOffset(outside);outside[offset+1]=255;outside[offset+2]=255;
  assert.throws(()=>normalizeChatGif(outside,'banner'));
  const wrong=new Uint8Array(animated);wrong[0]=60;
  assert.throws(()=>normalizeChatGif(wrong,'avatar'));
  assert.throws(()=>normalizeChatGif(new Uint8Array(8*1024*1024+1),'avatar'));
});

test('invalid LZW streams and declared pixel counts are rejected before storage',()=>{
  const offset=imageOffset(animated);
  const fewerPixels=new Uint8Array(animated);fewerPixels[offset+5]=1;fewerPixels[offset+6]=0;fewerPixels[offset+7]=1;fewerPixels[offset+8]=0;
  assert.throws(()=>normalizeChatGif(fewerPixels,'avatar'));
  const imageData=offset+10+((animated[offset+9]&128)?3*(2<<(animated[offset+9]&7)):0);
  const badSize=new Uint8Array(animated);badSize[imageData]=12;
  assert.throws(()=>normalizeChatGif(badSize,'avatar'));
  const badCode=new Uint8Array(animated);badCode[imageData+2]=255;badCode[imageData+3]=255;
  assert.throws(()=>normalizeChatGif(badCode,'avatar'));
});
