import test from 'node:test';
import assert from 'node:assert/strict';
import {MENU_EFFECTS_KEY,readMenuEffects,parseMenuEffects,menuMotionAllowed} from '../lib/menu-effects.ts';

test('the new snow scene is enabled even when the retired video wallpaper was disabled',()=>{
  const values=new Map([['kkeep-wallpaper-motion-v2','off']]);
  const effects=readMenuEffects({getItem:key=>values.get(key)??null});
  assert.equal(effects.motion,'full');assert.equal(effects.snow,true);assert.equal(effects.smooth,true);assert.equal(menuMotionAllowed(effects,true),true);
});
test('explicit menu choices survive reload independently of the video setting',()=>{
  const saved={motion:'reduced',snow:false,smooth:false};
  const effects=readMenuEffects({getItem:key=>key===MENU_EFFECTS_KEY?JSON.stringify(saved):'on'});
  assert.deepEqual(effects,saved);assert.equal(menuMotionAllowed(effects,false),false);
});
test('Auto follows accessibility preferences while Full is an explicit override',()=>{
  assert.equal(menuMotionAllowed({...parseMenuEffects(null),motion:'auto'},true),false);
  assert.equal(menuMotionAllowed({...parseMenuEffects(null),motion:'full'},true),true);
  assert.equal(menuMotionAllowed({...parseMenuEffects(null),motion:'reduced'},false),false);
});
test('invalid or unavailable storage keeps a usable default',()=>{
  for(const value of ['{bad','null','42',JSON.stringify({motion:'bad',snow:'false',smooth:0})])assert.deepEqual(parseMenuEffects(value),{motion:'full',snow:true,smooth:true});
  assert.deepEqual(readMenuEffects({getItem(){throw new Error('storage blocked');}}),{motion:'full',snow:true,smooth:true});
});
