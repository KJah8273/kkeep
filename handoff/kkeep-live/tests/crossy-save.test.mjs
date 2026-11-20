import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {memoryStorage,storageEntries} from '../lib/games/save-codec.mjs';
const html=readFileSync(new URL('../public/games/crossy-road/index.html',import.meta.url),'utf8');
const code=html.match(/<script id="kkeep-crossy-save">([\s\S]*?)<\/script>/)[1];
function device(entries=[]){const localStorage=memoryStorage(entries),window={};vm.runInNewContext(code,{window,localStorage});return {storage:localStorage,game:window.ytgame.game};}
test('Crossy Road partial character saves preserve coins and score across restore',async()=>{
 const first=device();await first.game.saveData(JSON.stringify({topScore:123,coins:47,unlockedCharacters:[0],currCharacter:0}));
 await first.game.saveData(JSON.stringify({unlockedCharacters:[0,5]}));
 const second=device(storageEntries(first.storage));assert.deepEqual(JSON.parse(await second.game.loadData()),{topScore:123,coins:47,unlockedCharacters:[0,5],currCharacter:0});
 await assert.rejects(()=>second.game.saveData('invalid'));
 assert.equal(JSON.parse(await second.game.loadData()).coins,47);
});
