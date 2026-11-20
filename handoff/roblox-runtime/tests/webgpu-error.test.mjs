import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {transformText} from '../worker/gateway.js';

const origin='https://runtime.example';
const hook=readFileSync(new URL('./fixtures/hook.js',import.meta.url),'utf8');
const stub=readFileSync(new URL('./fixtures/stub.js',import.meta.url),'utf8');
const marker='d.addEventListener("uncapturederror", (e) => { if (n++ < 3) diag("gpu", "error: " + ((e.error && e.error.message) || e.error)); });';

async function harness({patched=true,source=hook,path='/hook.js',consoleThrows=false}={}) {
  const code=patched?transformText(source,path,origin):source;
  const start=code.indexOf('    function setupWebGPU() {'),end=code.indexOf('\n    // A site that puts Roblox',start);
  assert.ok(start>=0&&end>start);
  const logs=[],requests=[],listeners=new Map(),calls=[];
  const device={addEventListener:(type,handler)=>listeners.set(type,handler),lost:new Promise(()=>{})};
  class Adapter {
    async requestDevice(...args){calls.push({thisValue:this,args});return device;}
  }
  const scope={GPUAdapter:Adapter,PROXY_ORIGIN:origin,
    ls:{set(){}},GPU_BAD_KEY:'gpuBad',LOST_KEY:'lost',showLostOverlay(){},
    fetch:(...args)=>{requests.push(args);return Promise.resolve();},
    console:{error:(...args)=>{if(consoleThrows)throw new Error('console unavailable');logs.push(args);}},
  };
  scope.window=scope;
  vm.runInNewContext(code.slice(start,end)+'\nsetupWebGPU();',scope);
  const adapter=new Adapter(),options={requiredFeatures:['texture-compression-bc']};
  assert.equal(await adapter.requestDevice(options),device);
  assert.equal(calls.length,1);assert.equal(calls[0].thisValue,adapter);assert.equal(calls[0].args[0],options);
  return {logs,requests,calls,emit:error=>listeners.get('uncapturederror')({error})};
}

test('the actual provider listener previously sent three diagnostics without a local error',async()=>{
  const h=await harness({patched:false});
  for(let i=0;i<4;i++)h.emit({name:'GPUValidationError',message:'copyTextureToTexture source lacks COPY_SRC usage'});
  assert.deepEqual(h.logs,[]);assert.equal(h.requests.length,3);assert.equal(h.calls.length,1);
});

test('both actual hook copies reveal only the first GPU validation error locally and preserve the original listener',async()=>{
  for(const [source,path] of [[hook,'/hook.js'],[stub,'/assets/webclient/stub.js']]){
    const h=await harness({source,path});
    const message='copyTextureToTexture source size 1298x807 does not match destination format "bgra8unorm"; expected "rgba8unorm".';
    for(let i=0;i<4;i++)h.emit({name:'GPUValidationError',message});
    assert.equal(h.logs.length,1);
    assert.deepEqual(h.logs[0],['[Kkeep WebGPU]','GPUValidationError',
      'copyTextureToTexture source size 1298x807 does not match destination format bgra8unorm; expected rgba8unorm.']);
    assert.equal(h.requests.length,3,'only the provider original diagnostics are requested');
    assert.equal(h.calls.length,1,'the observer makes no additional GPU calls');
  }
});

test('the first local GPU error redacts labels, URLs, paths, and opaque values while retaining the graphics rule',async()=>{
  const h=await harness();
  h.emit({constructor:{name:'GPUValidationError'},message:
    'copyTextureToTexture [Texture "PrivatePlayer"] from https://private.invalid/scene to /private/user.png, id abcdef0123456789abcdef0123456789, opaque AbCdEfGhIjKlMnOpQrStUvWxYz0123456789AB, label "AnotherPrivateName": COPY_DST missing for size 1299x807.'});
  const text=h.logs[0][2];
  for(const privateText of ['PrivatePlayer','private.invalid','/private','abcdef0123','AbCdEfGh','AnotherPrivateName'])assert.equal(text.includes(privateText),false);
  for(const clue of ['copyTextureToTexture','[Texture]','COPY_DST','1299x807'])assert.ok(text.includes(clue));
});

test('credential or account keywords omit GPU message details entirely',async()=>{
  for(const sensitive of ['Authorization: Bearer private','cookie=private','.ROBLOSECURITY=private',
    'token=private','ticket=private','password=private','accountId=private','username=private','sessionId=private','api_key=private']){
    const h=await harness();h.emit({name:'GPUValidationError',message:'copyTextureToTexture '+sensitive});
    assert.deepEqual(h.logs[0],['[Kkeep WebGPU]','GPUValidationError','Details omitted because the message contains sensitive fields.']);
  }
});

test('the local detail is bounded and optional console failure does not break the existing listener',async()=>{
  const h=await harness();h.emit({name:'GPUOutOfMemoryError',message:'GPU allocation failed. '.repeat(500)});
  assert.equal(h.logs[0][1],'GPUOutOfMemoryError');assert.equal(h.logs[0][2].length,1600);
  const broken=await harness({consoleThrows:true});
  assert.doesNotThrow(()=>broken.emit({name:'GPUInternalError',message:'device operation failed'}));
  assert.equal(broken.requests.length,1);assert.equal(broken.calls.length,1);
});

test('the WebGPU listener transform rejects changed or duplicate provider source',()=>{
  assert.throws(()=>transformText(hook.replace(marker,marker.replace('n++ < 3','n++ < 5')),'/hook.js',origin),/Provider WebGPU error handling changed/);
  assert.throws(()=>transformText(hook+'\n'+marker,'/hook.js',origin),/Provider WebGPU error handling changed/);
});
