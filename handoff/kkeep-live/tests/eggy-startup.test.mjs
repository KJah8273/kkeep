import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync('public/games/eggy-car/ad-recovery.js','utf8');
function events(){const window={};vm.runInNewContext(source,{window});const result=[];window.GD_OPTIONS={onEvent:e=>result.push(e.name)};return {send:e=>window.GD_OPTIONS.onEvent(e),result};}
test('missing optional ad after normal initialization releases the game pause',()=>{
 const m=events();m.send({name:'SDK_READY'});m.send({name:'SDK_ERROR',message:'Blocked: js/null.js'});
 assert.deepEqual(m.result,['SDK_READY','SDK_ERROR','SDK_GAME_START']);
});
test('authorization and unknown errors are never turned into successful startup',()=>{
 for(const message of ['domain blocked','invalid game ID','not authorized','server failed']){
  const m=events();m.send({name:'SDK_READY'});m.send({name:'SDK_ERROR',message});assert.deepEqual(m.result,['SDK_READY','SDK_ERROR']);
 }
 const m=events();m.send({name:'SDK_ERROR',message:'Blocked: js/null.js'});assert.deepEqual(m.result,['SDK_ERROR']);
});
