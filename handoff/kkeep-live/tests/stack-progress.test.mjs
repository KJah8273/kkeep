import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const html=readFileSync('public/games/stack/index.html','utf8');
const recordScore=/Game\.prototype\.recordScore = function \(score\) \{([\s\S]*?)\n        \};/.exec(html)[1];
test('Stack records completed placements before the game ends and keeps the highest score',()=>{
 const values=new Map(),label={textContent:''},state={best:4,scoreContainer:{textContent:''}};
 const ctx=vm.createContext({state,localStorage:{setItem:(k,v)=>values.set(k,v)},document:{getElementById:()=>label}});
 vm.runInContext('(function(score){'+recordScore+'}).call(state,11)',ctx);
 assert.equal(values.get('stack:best'),'11');assert.equal(label.textContent,'Best 11');
 vm.runInContext('(function(score){'+recordScore+'}).call(state,2)',ctx);
 assert.equal(state.scoreContainer.textContent,'2');assert.equal(values.get('stack:best'),'11');
});
