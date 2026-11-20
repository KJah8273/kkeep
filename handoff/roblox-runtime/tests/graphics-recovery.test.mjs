import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {transformText} from '../worker/gateway.js';

const origin='https://runtime.example';
const path='/_/c2V0dXAucmJ4Y2RuLmNvbQ/webclient/version-1ef59424f70d4932-RobloxWebClient/WasmPlayer.js';
const source=readFileSync(new URL('./fixtures/WasmPlayer-1ef.js',import.meta.url),'utf8');
const transformed=transformText(source,path,origin);
const start=transformed.indexOf('let j;\n    if(y){');
const end=transformed.indexOf('if(!y){let v=e.getContext',start);
assert.ok(start>0&&end>start,'the inspected actual-renderer initialization branch is present');
const selected=transformed.slice(start,end);
const adapterSetup=source.slice(source.indexOf('async function $e(){'),source.indexOf('function Ge('));

function harness({gpu=true,features=['texture-compression-bc'],adapterNull=false,deviceError,observerThrows=false}={}){
  const events=[],device={features:new Set(features)},calls=[];
  const adapter={features:new Set(features),requestDevice:async options=>{
    calls.push(['device',options]);if(deviceError)throw deviceError;return device;
  }};
  const scope={navigator:{gpu:{requestAdapter:async options=>{calls.push(['adapter',options]);return adapterNull?null:adapter;}}},
    console:{info(){}},__kkeepRuntime:{
      graphicsFailure:code=>{events.push(['failure',code]);if(observerThrows)throw new Error('observer failure');},
      graphicsDevice:value=>{events.push(['device',value]);if(observerThrows)throw new Error('observer failure');}
    }};
  scope.window=scope;
  vm.createContext(scope);
  vm.runInContext(adapterSetup+'\nasync function launch(y){'+selected+'return j;}\nthis.launch=launch;',scope);
  return {scope,events,calls,device,launch:()=>scope.launch(gpu)};
}

test('the actual selected WebGPU branch observes the returned device without changing native requests',async()=>{
  const h=harness();assert.equal(await h.launch(),h.device);
  assert.deepEqual(h.calls.map(([name])=>name),['adapter','device']);
  assert.equal(h.calls[0][1].powerPreference,'high-performance');
  assert.deepEqual([...h.calls[1][1].requiredFeatures],['texture-compression-bc']);
  assert.equal(h.events.length,1);assert.equal(h.events[0][0],'device');assert.equal(h.events[0][1],h.device);
});

test('the actual selected WebGL branch makes no WebGPU request or recovery claim',async()=>{
  const h=harness({gpu:false});assert.equal(await h.launch(),undefined);
  assert.deepEqual(h.calls,[]);assert.deepEqual(h.events,[]);
});

test('adapter absence and unsupported compression report only a bounded initialization failure',async()=>{
  for(const options of [{adapterNull:true},{features:[]}]){
    const h=harness(options);await assert.rejects(h.launch());
    assert.deepEqual(h.events,[['failure','graphics-init']]);
    assert.equal(h.calls.some(([name])=>name==='device'),false);
  }
});

test('requestDevice rejection keeps the exact original exception and never hands out a partial device',async()=>{
  const error=new TypeError('private graphics detail');const h=harness({deviceError:error});
  await assert.rejects(h.launch(),received=>received===error);
  assert.deepEqual(h.events,[['failure','graphics-init']]);
  assert.equal(JSON.stringify(h.events).includes('private'),false);
});

test('optional recovery observers cannot alter a successful device or swallow an original failure',async()=>{
  const success=harness({observerThrows:true});assert.equal(await success.launch(),success.device);
  const error=new Error('original');const failed=harness({observerThrows:true,deviceError:error});
  await assert.rejects(failed.launch(),received=>received===error);
});

test('a changed or duplicated renderer initialization contract fails closed',()=>{
  const selected='let j=y?await $e():void 0;';
  assert.throws(()=>transformText(source.replace(selected,'let j=await otherDevice();'),path,origin),/graphics initialization contract changed/);
  assert.throws(()=>transformText(source.replace(selected,selected+selected),path,origin),/graphics initialization contract changed/);
});
