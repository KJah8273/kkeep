import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
import {patchAmongRuntime} from '../scripts/patch-among-runtime.mjs';
const root=new URL('../public/games/among-us-old/Build/',import.meta.url);
const original=readFileSync(new URL('framework.original.js',root),'utf8');
const fixed=readFileSync(new URL('framework.js',root),'utf8');
function mediaHook(source){
 const start=source.indexOf('Module["preRun"].push((function(){var enumerateMediaDevices=');
 const end=source.indexOf('enumerateMediaDevices()}));',start)+'enumerateMediaDevices()}));'.length;
 return source.slice(start,end);
}
test('legacy media fallback returns without invoking an absent modern API',()=>{
 let called=0;const context={Module:{preRun:[]},navigator:{getUserMedia(){}},MediaStreamTrack:{getSources(){called++;}},console};
 vm.runInNewContext(mediaHook(fixed),context);context.Module.preRun[0]();assert.equal(called,1);
 const old={...context,Module:{preRun:[]}};vm.runInNewContext(mediaHook(original),old);
 assert.throws(()=>old.Module.preRun[0](),/enumerateDevices/);
});
test('denied media enumeration logs its actual error without a secondary ReferenceError',()=>{
 const lines=[];const context={Module:{preRun:[]},navigator:{getUserMedia(){},mediaDevices:{enumerateDevices(){return {then(){return {catch(fn){fn({name:'NotAllowedError',message:'Camera unavailable'})}}}}}}},console:{log:x=>lines.push(x)}};
 vm.runInNewContext(mediaHook(fixed),context);context.Module.preRun[0]();assert.deepEqual(lines,['NotAllowedError: Camera unavailable']);
});
function extractFunction(name){
 const start=fixed.indexOf('function '+name+'('),brace=fixed.indexOf('{',start);let depth=1,end=brace+1;
 while(depth){if(fixed[end]==='{')depth++;if(fixed[end]==='}')depth--;end++;}
 return fixed.slice(start,end);
}
test('spatial audio ignores invalid coordinates and preserves normal updates',()=>{
 const updates=[],capture=(...args)=>updates.push(args);
 const context={WEBAudio:{audioWebEnabled:1,audioContext:{listener:{setPosition:capture,setOrientation:capture}},audioInstances:[{panner:{setPosition:capture}}]}};
 for(const name of ['SetPosition','SetListenerPosition','SetListenerOrientation'])vm.runInNewContext(extractFunction('_JS_Sound_'+name),context);
 context._JS_Sound_SetPosition(0,NaN,1,2);context._JS_Sound_SetListenerPosition(1,Infinity,3);context._JS_Sound_SetListenerOrientation(1,2,3,0,NaN,0);assert.equal(updates.length,0);
 context._JS_Sound_SetPosition(0,1,2,3);context._JS_Sound_SetListenerPosition(4,5,6);context._JS_Sound_SetListenerOrientation(1,2,3,0,1,0);
 assert.deepEqual(updates,[[1,2,3],[4,5,6],[-1,-2,-3,0,1,0]]);
});
test('decompressed game files are complete and framework changes are reproducible',()=>{
 assert.equal(fixed,patchAmongRuntime(original));
 for(const [file,hash] of [['game.wasm','e7d2d598c21d9866e00223c5336bb8454a79db6163bdc55050bcebeb097e823a'],['game.data','39956c8a8ab7103fc01813bf86fa740f7061a5d071f143cf5683971bab6c1dc6']]){
  const bytes=readFileSync(new URL(file,root));assert.equal(createHash('sha256').update(bytes).digest('hex'),hash);
  if(file.endsWith('.wasm'))assert.equal(WebAssembly.validate(bytes),true);
  else assert.equal(bytes.subarray(0,16).toString(),'UnityWebData1.0\0');
 }
});
