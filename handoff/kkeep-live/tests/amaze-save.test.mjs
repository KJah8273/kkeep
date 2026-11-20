import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {memoryStorage,storageEntries} from '../lib/games/save-codec.mjs';
const source=readFileSync(new URL('../public/games/truffled-imports/amaze-save.js',import.meta.url),'utf8');
function device(entries=[]){const storage=memoryStorage(entries),window={},listeners=new Map(),document={hidden:false,addEventListener:(n,fn)=>listeners.set(n,fn),removeEventListener:n=>listeners.delete(n)};vm.runInNewContext(source,{window,document,localStorage:storage});return {sdk:window.ytgame,storage,listeners,document};}
test('Amaze starts at level zero and restores all saved modes on another device',async()=>{
 const first=device();assert.deepEqual(JSON.parse(await first.sdk.game.loadData()),{'0_lev':0,'1_lev':0,'2_lev':0});
 await first.sdk.game.saveData(JSON.stringify({'0_lev':14,'1_lev':6,'2_lev':2}));
 await first.sdk.game.saveData(JSON.stringify({'0_lev':15}));
 const second=device(storageEntries(first.storage));assert.deepEqual(JSON.parse(await second.sdk.game.loadData()),{'0_lev':15,'1_lev':6,'2_lev':2});
 await assert.rejects(()=>second.sdk.game.saveData('null'));assert.equal(JSON.parse(await second.sdk.game.loadData())['0_lev'],15);
});
test('Amaze pauses when hidden and removes its listeners cleanly',()=>{
 const d=device();let paused=0;const remove=d.sdk.system.onPause(()=>paused++);d.listeners.get('visibilitychange')();assert.equal(paused,0);d.document.hidden=true;d.listeners.get('visibilitychange')();assert.equal(paused,1);remove();assert.equal(d.listeners.size,0);
});
