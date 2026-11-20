import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const script=readFileSync('public/games/hunter-assassin/app.js','utf8');
async function setup({renderError=false}={}){
 const frames=[],tasks=[],calls=[],elements=new Map();
 const element=id=>{if(!elements.has(id))elements.set(id,{style:{},hidden:true,listeners:{},addEventListener(type,fn){this.listeners[type]=fn;},getBoundingClientRect:()=>({left:20,top:30,width:270,height:405}),setPointerCapture(){}});return elements.get(id);};
 const context={console:{log(){}},navigator:{maxTouchPoints:5},Map,Promise,DataView,ArrayBuffer,setTimeout,clearTimeout,document:{getElementById:element,hidden:false,body:{classList:{add:name=>calls.push(['class',name])}},addEventListener(){}},addEventListener(){},requestAnimationFrame:fn=>frames.push(fn),queueMicrotask:fn=>tasks.push(fn),configureBrowserGL(){},HunterDownload:{onProgress(fn){fn({percent:0,phase:'Downloading game…'});},setPhase(phase){element('loading-phase').textContent=phase;},engine:async()=>({_create_gl(){}}),read(){}},HunterPort:class{
  constructor(){this.view=new DataView(new ArrayBuffer(32));this.audioItems=new Map();}
  async prepare(){}
  boot(w,h){calls.push(['boot',w,h]);}
  alloc(){return 0;}
  object(){return 1;}
  save(){calls.push(['save']);}
  entry(...args){calls.push(args);if(renderError&&args[0]==='nativeRender')throw Error('Graphics failed');}
 }};
 context.window=context;vm.runInNewContext(script,context);
 const startup=tasks.shift()();frames.shift()(0);frames.shift()(1);await new Promise(resolve=>setImmediate(resolve));
 frames.shift()(2);frames.shift()(3);await startup;
 return {context,calls,frames,element};
}
test('Hunter iPad loader remains visible until a rendered frame and touch coordinates match the canvas',async()=>{
 const {context,calls,frames,element}=await setup();
 assert.equal(context.portReady,true);assert.deepEqual(calls.find(c=>c[0]==='boot'),['boot',540,810]);
 assert.notEqual(element('status').style.display,'none');assert.equal(element('loading-percent').textContent,'0%');
 element('canvas').listeners.pointerdown({preventDefault(){},pointerId:1,clientX:155,clientY:232.5});
 frames.shift()(32);
 assert.equal(element('status').style.display,'none');assert.equal(context.framesRendered,1);
 const touch=calls.find(c=>c[0]==='nativeTouchesBegin');assert.deepEqual(Array.from(touch[1]),[1]);assert.deepEqual(Array.from(touch[2]),[270,405]);
});
test('Hunter keeps the cover and retry visible if the first native render fails',async()=>{
 const {context,frames,element}=await setup({renderError:true});frames.shift()(32);
 assert.equal(context.framesRendered,0);assert.equal(element('status').style.display,'grid');assert.equal(element('start').hidden,false);assert.match(element('detail').textContent,/Graphics failed/);
});
