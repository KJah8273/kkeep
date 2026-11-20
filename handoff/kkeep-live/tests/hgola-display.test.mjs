import test from 'node:test';
import assert from 'node:assert/strict';
import {fitGameCanvas} from '../public/hgola-display.js';
test('iPad landscape and portrait stay within a 720p drawing budget and retain aspect ratio',()=>{
 for(const [w,h] of [[1366,1024],[1024,1366],[1194,834],[834,1194]]){
  const canvas={};fitGameCanvas(canvas,w,h,true,2);
  assert.ok(canvas.width*canvas.height<=1280*720);
  assert.ok(Math.abs(canvas.width/canvas.height-w/h)<.002);
 }
});
test('small touch screens retain native resolution and desktop is capped at 1.5x',()=>{
 const c={};fitGameCanvas(c,640,360,true,3);assert.deepEqual(c,{width:640,height:360});
 fitGameCanvas(c,1920,1080,false,3);assert.deepEqual(c,{width:2880,height:1620});
});
