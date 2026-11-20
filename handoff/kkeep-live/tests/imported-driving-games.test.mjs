import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {mountDriftControls,drivingButtons} from '../public/games/drift-hunters/touch.js';
import {findSavedGame} from '../lib/games/save-catalog.ts';
import {buildSync} from 'esbuild';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
function controls(touch=true){
 const events=[],listeners={},buttons=[];
 class El{constructor(){this.handlers={};this.dataset={};this.hidden=false;}setAttribute(){}setPointerCapture(){}addEventListener(n,f){this.handlers[n]=f;}appendChild(el){buttons.push(el);}querySelectorAll(){return buttons;}remove(){}}
 const panelElements=[];const doc={hidden:false,body:{append:(...els)=>panelElements.push(...els)},createElement:()=>new El(),querySelector:()=>({dispatchEvent:e=>events.push(e),focus(){}}),addEventListener:(n,f)=>listeners[n]=f,removeEventListener:n=>delete listeners[n]};
 const win={navigator:{maxTouchPoints:touch?5:0},matchMedia:()=>({matches:false}),KeyboardEvent:class{constructor(type,options){this.type=type;Object.assign(this,options);}},addEventListener:(n,f)=>listeners[n]=f,removeEventListener:n=>delete listeners[n]};
 const cleanup=mountDriftControls(doc,win);
 const press=(id,pointerId)=>buttons.find(b=>b.className==='drift-'+id).handlers.pointerdown({pointerId,pointerType:'touch',preventDefault(){},stopPropagation(){}});
 const cancel=(id,pointerId)=>buttons.find(b=>b.className==='drift-'+id).handlers.pointercancel({pointerId});
 return {events,listeners,buttons,panelElements,press,cancel,cleanup,doc};
}
test('iPad can steer, accelerate and handbrake together; cancelling a finger releases only its key',()=>{
 const h=controls();h.press('gas',1);h.press('left',2);h.press('handbrake',3);
 assert.deepEqual(h.events.map(e=>[e.type,e.code]),[['keydown','KeyW'],['keydown','KeyA'],['keydown','Space']]);
 h.cancel('handbrake',3);assert.equal(h.events.at(-1).code,'Space');assert.equal(h.events.at(-1).type,'keyup');assert.equal(h.events.length,4);
 h.listeners.blur();assert.deepEqual(h.events.slice(-2).map(e=>[e.type,e.code]),[['keyup','KeyW'],['keyup','KeyA']]);h.cleanup();assert.equal(Object.keys(h.listeners).length,0);
});
test('manual gears use the left modifiers and desktop gets no touch overlay',()=>{
 const h=controls();h.press('up',1);assert.equal(h.events.at(-1).location,1);h.press('down',2);assert.equal(h.events.at(-1).location,1);h.cleanup();
 const d=controls(false);assert.equal(d.buttons.length,0);d.cleanup();assert.ok(drivingButtons.some(x=>x[3]==='KeyC'));
});
test('both games use the existing Profile player and the complete catalog remains available',()=>{
 const compiled=buildSync({entryPoints:['lib/menu-catalog.ts'],bundle:true,platform:'node',format:'cjs',write:false}).outputFiles[0].text,context={module:{exports:{}},exports:{}};vm.runInNewContext(compiled,context);
 const games=context.module.exports.games;assert.ok(games.length>=41);assert.equal(new Set(games.map(g=>g.id)).size,games.length);
 for(const slug of ['monster-tracks','drift-hunters','paperio-2','stickman-hook','idle-mining-empire','geometry-dash'])assert.ok(games.some(g=>g.id===slug));
 for(const slug of ['plants-vs-zombies-2','level-devil'])assert.ok(!games.some(g=>g.id===slug));
 for(const slug of ['monster-tracks','drift-hunters']){const game=findSavedGame(slug);assert.ok(game&&!game.external&&game.gameOnly);assert.match(read('public'+game.entry),/<canvas|gameContainer/);}
});
test('split loader rejects short error bodies, retries and assembles only validated parts',async()=>{
 let calls=0,output;const load=read('public/games/drift-hunters/loader-fixes.js');
 const context={window:{},document:{querySelector:()=>({value:0})},Uint8Array,Error,Promise,setTimeout:fn=>fn(),UnityLoader:{Compression:{decompress:(data,fn)=>fn(data)}},XMLHttpRequest:class{open(method,url){this.url=url;}send(){calls++;this.status=200;const bytes=calls===1?[]:this.url.endsWith('.000')?[1,2,3]:[4,5];this.response=Uint8Array.from(bytes).buffer;this.onload();}}};
 context.KkeepUnity={install(){}};vm.runInNewContext(load,context);await context.UnityLoader.downloadJobMulti({size:5,split_size:3,totalFile:2},{parameters:{url:'https://assets/game'},complete:value=>output=value});
 assert.equal(calls,3);assert.deepEqual([...output],[1,2,3,4,5]);
});
test('Monster Tracks ships its entire data package and valid Wasm locally',()=>{
 const js=read('public/games/monster-tracks/webapp/index.js'),expected=Number(/"remote_package_size":(\d+)/.exec(js)[1]);
 assert.equal(readFileSync('public/games/monster-tracks/webapp/index.data').byteLength,expected);
 assert.ok(WebAssembly.validate(readFileSync('public/games/monster-tracks/webapp/index.wasm')));
 assert.match(js,/FS\.mount\(IDBFS,\{\},"\/sandbox"\)/);
 assert.match(read('public/games/drift-hunters/framework.js'),/Module\["FS"\]=FS/);
});
test('Drift streams validated gzip chunks instead of assembling the compressed archive',async()=>{
 const {gzipSync}=await import('node:zlib');const raw='game-data'.repeat(100),gz=gzipSync(raw),size=Math.ceil(gz.length/2);let output;
 const ctx={window:{},document:{},Uint8Array,Error,Promise,ReadableStream,DecompressionStream,Response,KkeepUnity:{install(){}},UnityLoader:{Compression:{decompress(){throw Error('Must use stream');}}}};
 vm.runInNewContext(read('public/games/drift-hunters/loader-fixes.js'),ctx);
 ctx.UnityLoader.downloadFile=async(_,__,index)=>gz.subarray(index*size,Math.min(gz.length,(index+1)*size));
 await ctx.UnityLoader.downloadJobMulti({size:gz.length,split_size:size,totalFile:2},{parameters:{url:'game'},complete:bytes=>output=bytes});
 assert.equal(new TextDecoder().decode(output),raw);
 assert.equal(JSON.parse(read('public/games/drift-hunters/dh-ipad.json')).TOTAL_MEMORY,536870912);
});
