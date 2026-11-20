import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {memoryStorage,storageEntries} from '../lib/games/save-codec.mjs';
const source=path=>readFileSync(new URL('../public/games/'+path,import.meta.url),'utf8');
function puzzle(entries=[]){
 const storage=memoryStorage(entries),context=vm.createContext({localStorage:storage,document:{querySelector:()=>null},setTimeout,console});
 for(const file of ['grid','tile','game_manager'])vm.runInContext(source('2048/js/'+file+'.js'),context);
 vm.runInContext(`function AI(grid){this.grid=grid;}function Input(){this.on=function(){};}function Actuator(){this.actuate=this.restart=this.setRunButton=function(){};}`,context);
 vm.runInContext(source('2048/js/save.js'),context);
 vm.runInContext('game=new GameManager(4,Input,Actuator)',context);
 return {context,storage,game:context.game};
}
test('2048 saves an actual move, restores the same board/score, and keeps the best score after restart',()=>{
 const first=puzzle();vm.runInContext('game.grid=new Grid(4);game.grid.insertTile(new Tile({x:0,y:0},2));game.grid.insertTile(new Tile({x:1,y:0},2));game.move(3)',first.context);
 assert.equal(first.game.score,4);
 const saved=JSON.parse(first.storage.getItem('kkeep.2048.board.v1'));
 assert.ok(saved.cells.includes(4));
 const other=puzzle(storageEntries(first.storage));
 assert.deepEqual(JSON.parse(other.storage.getItem('kkeep.2048.board.v1')),saved);
 assert.equal(other.game.score,4);other.game.restart();assert.equal(other.game.score,0);
 assert.equal(other.storage.getItem('kkeep.2048.best.v1'),'4');
 assert.notDeepEqual(JSON.parse(other.storage.getItem('kkeep.2048.board.v1')).cells,saved.cells);
});
test('2048 restores finished boards and discards malformed data without a startup crash',()=>{
 const cells=Array(16).fill(2),saved={version:1,cells,score:2048,won:true,over:false};
 const restored=puzzle([['kkeep.2048.board.v1',JSON.stringify(saved)]]);assert.equal(restored.game.won,true);
 for(const value of ['broken',JSON.stringify({...saved,cells:[-2]}),JSON.stringify({...saved,score:-1})])assert.equal(puzzle([['kkeep.2048.board.v1',value]]).game.score,0);
});
test('Basket Battle uses a separate save key and waits for Unity before delivering saved data',async()=>{
 const storage=memoryStorage(),events=new Map();
 const context=vm.createContext({localStorage:storage,setTimeout,document:{hidden:false,addEventListener:(name,fn)=>events.set(name,fn),removeEventListener:name=>events.delete(name)}});
 context.window=context;context.unityGameInstance={};vm.runInContext(source('basket-battle/save.js'),context);
 assert.equal(await context.ytgame.game.loadData(),'');
 const data=JSON.stringify({level:12,coins:500});await context.ytgame.game.saveData(data);
 assert.equal(await context.ytgame.game.loadData(),data);assert.equal(storageEntries(storage).length,1);
 await assert.rejects(()=>context.ytgame.game.saveData(null));assert.equal(await context.ytgame.game.loadData(),data);
 let paused=0;const off=context.ytgame.system.onPause(()=>paused++);context.document.hidden=true;events.get('visibilitychange')();assert.equal(paused,1);off();assert.equal(events.size,0);
 const other=memoryStorage(storageEntries(storage));assert.equal(other.getItem('kkeep.basket-battle.save.v1'),data);
});
