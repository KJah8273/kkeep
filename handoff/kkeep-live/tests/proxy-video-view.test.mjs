import test from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import {readFileSync} from 'node:fs';
const source=ts.transpileModule(readFileSync(new URL('../lib/tiktok-view.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {focusTikTok}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
function fixture(){
 const listeners=new Map(),classes=new Set(),attrs=new Set();let styleRemoved=false;
 const doc={head:{append(){}},documentElement:{classList:{add:x=>classes.add(x),remove:x=>classes.delete(x),contains:x=>classes.has(x)}},defaultView:{innerHeight:900},createElement:()=>({remove(){styleRemoved=true}}),addEventListener:(n,f)=>listeners.set(n,f),removeEventListener:n=>listeners.delete(n)};
 const video={controls:false,paused:false,ended:false,isConnected:true,parentElement:null,getBoundingClientRect:()=>({width:400,height:700,top:0,bottom:700}),setAttribute:n=>attrs.add(n),removeAttribute:n=>attrs.delete(n)};
 doc.querySelectorAll=selector=>selector==='video'?[video]:[];doc.querySelector=()=>null;
 return {doc,video,classes,attrs,listeners,get styleRemoved(){return styleRemoved}};
}
test('video view preserves the existing player and restores it on exit',()=>{
 const f=fixture();const view=focusTikTok(f.doc,()=>{});
 assert.equal(f.video.controls,true);assert.ok(f.attrs.has('data-kkeep-focus'));
 view.destroy();assert.equal(f.video.controls,false);assert.equal(f.attrs.size,0);assert.equal(f.classes.size,0);assert.equal(f.listeners.size,0);assert.ok(f.styleRemoved);
});
test('vertical swipe uses native next navigation; sideways swipes do not',()=>{
 const f=fixture();let clicks=0;f.doc.querySelector=()=>({click(){clicks++}});
 const view=focusTikTok(f.doc,()=>{});
 const start=f.listeners.get('touchstart'),end=f.listeners.get('touchend');
 start({touches:[{clientX:100,clientY:400}],target:f.video});end({changedTouches:[{clientX:105,clientY:200}],preventDefault(){}});
 assert.equal(clicks,1);
 start({touches:[{clientX:100,clientY:400}],target:f.video});end({changedTouches:[{clientX:350,clientY:390}],preventDefault(){}});
 assert.equal(clicks,1);view.destroy();
});
test('video focus releases the player while a sign-in dialog is open',t=>{
 t.mock.timers.enable({apis:['setInterval']});const f=fixture();let dialog=false;
 f.doc.querySelectorAll=selector=>selector==='video'?[f.video]:dialog&&selector.includes('#loginModalContentContainer')?[{getBoundingClientRect:()=>({width:400,height:500})}]:[];
 const view=focusTikTok(f.doc,()=>{});
 try{assert.ok(f.classes.has('kkeep-video'));dialog=true;t.mock.timers.tick(751);assert.equal(f.classes.has('kkeep-video'),false);dialog=false;t.mock.timers.tick(751);assert.ok(f.classes.has('kkeep-video'));}finally{view.destroy();t.mock.timers.reset();}
});
