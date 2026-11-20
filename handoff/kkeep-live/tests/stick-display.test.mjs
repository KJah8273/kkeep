import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {patchStickAudioPosition,patchStickCanvasTarget,patchStickDisplay} from '../lib/stick-display.ts';
import {stickAsset} from '../worker/stick.ts';
const original=readFileSync(new URL('./fixtures/stick-native-size.js',import.meta.url),'utf8');
function run(source){
 const canvas={width:1920,height:1080,getBoundingClientRect:()=>({width:1536,height:864})};
 const resolution={value:'auto'},Module={};
 const context={Module,window:{devicePixelRatio:2},$:id=>id==='unity-canvas'?canvas:resolution,autoCap:960,lastSize:''};
 vm.runInNewContext(source,context);const resize=context._WebPortInstallUI();resize();
 return {canvas,resolution,Module,resize,context};
}
test('reproduces native adapter overwriting the fixed canvas while Unity resize is disabled',()=>{
 const r=run(original);assert.equal(r.Module.matchWebGLToCanvasSize,false);assert.equal(r.canvas.width,960);assert.equal(r.canvas.height,540);
});
test('patched native quality changes use Unity pixel ratio without changing its buffer directly',()=>{
 const r=run(patchStickDisplay(original));assert.equal(r.Module.matchWebGLToCanvasSize,true);assert.equal(r.Module.devicePixelRatio,.625);
 assert.equal(r.canvas.width,1920);assert.equal(r.canvas.height,1080);
 r.context.autoCap=640;r.resize();assert.equal(r.Module.devicePixelRatio,640/1536);assert.equal(r.canvas.width,1920);
 r.resolution.value='sharp';r.resize();assert.equal(r.Module.devicePixelRatio,2048/1536);assert.equal(r.canvas.width,1920);
});
test('the exact correction is idempotent and does not rewrite unknown or ambiguous upstream code',()=>{
 const once=patchStickDisplay(original);assert.equal(patchStickDisplay(once),once);
 assert.equal(patchStickDisplay(original+original),original+original);
 assert.equal(patchStickDisplay('unrelated framework'),'unrelated framework');
});
test('framework delivery applies the display fix and removes the obsolete content length',async()=>{
 const url='https://cdn.play.unity.com/games/5b35bbb8-64f5-4e2e-ae44-cdfaac211def/80444349-c477-4650-9f0b-007c0a2af944/framework.js';
 const response=await stickAsset(new Request('https://kkeep.test/api/stick-asset?url='+encodeURIComponent(url)),async()=>new Response(original,{headers:{'Content-Length':String(original.length)}}));
 assert.equal(response.headers.get('X-Kkeep-Stick-Fixes'),'unity-resize-1');assert.equal(response.headers.get('Content-Length'),null);
 assert.equal(await response.text(),patchStickDisplay(original));
});
test('non-finite Unity audio positions are ignored while valid positions still pass through',()=>{
 const source='function _JS_Sound_SetPosition(channelInstance,x,y,z){if(WEBAudio.audioWebEnabled==0)return;var channel=WEBAudio.audioInstances[channelInstance];channel.setPosition(x,y,z)}';
 const patched=patchStickAudioPosition(source),calls=[];
 assert.notEqual(patched,source);assert.equal(patchStickAudioPosition(patched),patched);
 const context={WEBAudio:{audioWebEnabled:1,audioInstances:[{setPosition:(...args)=>calls.push(args)}]},Number};
 vm.runInNewContext(patched+';_JS_Sound_SetPosition(0,1,2,3);_JS_Sound_SetPosition(0,NaN,2,3);_JS_Sound_SetPosition(0,Infinity,2,3);',context);
 assert.deepEqual(calls,[[1,2,3]]);
});

const canvasLookup=readFileSync(new URL('./fixtures/stick-canvas-target.js',import.meta.url),'utf8');
function runCanvasLookup(source){
 const canvas={id:'canvas',width:960,height:540},other={id:'other',width:1,height:1};
 const context={Module:{canvas},maybeCStringToJsString:value=>value,specialHTMLTargets:{},document:{querySelector:selector=>selector==='#'+canvas.id?canvas:selector==='#other'?other:null}};
 vm.runInNewContext(source,context);
 // The game changes the element ID after Unity has cached its initial target.
 canvas.id='unity-canvas';
 return {canvas,other,resize:context._emscripten_set_canvas_element_size};
}
test('reproduces Unity failing to resize after the game renames its canvas',()=>{
 const r=runCanvasLookup(canvasLookup);
 assert.equal(r.resize('#canvas',640,360),-4);
 assert.deepEqual([r.canvas.width,r.canvas.height],[960,540]);
});
test('both cached Unity selectors resize the same canvas across resolution changes',()=>{
 const r=runCanvasLookup(patchStickCanvasTarget(canvasLookup));
 for(const [selector,width,height] of [['#canvas',640,360],['#unity-canvas',1536,900],['#canvas',2048,1200]]){
  assert.equal(r.resize(selector,width,height),0);
  assert.deepEqual([r.canvas.width,r.canvas.height],[width,height]);
 }
 assert.equal(r.resize('#other',20,30),0);
 assert.deepEqual([r.other.width,r.other.height],[20,30]);
 assert.equal(r.resize('#missing',20,30),-4);
});
test('canvas selector repair is idempotent and is delivered by the live asset adapter',async()=>{
 const patched=patchStickCanvasTarget(canvasLookup);
 assert.notEqual(patched,canvasLookup);assert.equal(patchStickCanvasTarget(patched),patched);
 const url='https://cdn.play.unity.com/games/5b35bbb8-64f5-4e2e-ae44-cdfaac211def/80444349-c477-4650-9f0b-007c0a2af944/framework.js';
 const r=await stickAsset(new Request('https://kkeep.test/api/stick-asset?url='+encodeURIComponent(url)),async()=>new Response(canvasLookup));
 assert.equal(r.headers.get('X-Kkeep-Stick-Fixes'),'stable-canvas-target-2');
 assert.equal(await r.text(),patched);
});
