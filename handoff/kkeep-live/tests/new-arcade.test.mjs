import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,statSync} from 'node:fs';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
import {installForestControls} from '../public/games/trees-hate-you/controls.js';
const root=new URL('../public/games/',import.meta.url),read=path=>readFileSync(new URL(path,root),'utf8');

test('all vendored Stickman engine chunks match their pinned lengths and checksums',()=>{
 const manifest=JSON.parse(read('stickman-duel/manifest.json'));
 for(const [name,size] of Object.entries(manifest.files)){
  const bytes=readFileSync(new URL('packed/stickman-duel/'+name,root));
  assert.equal(bytes.length,size);assert.equal(createHash('sha256').update(bytes).digest('hex'),manifest.sha256[name]);assert(size<25*1024*1024);
 }
});
test('new catalog entries have real cover files and isolated players',()=>{
 const catalog=readFileSync(new URL('../components/kkeep-home.tsx',import.meta.url),'utf8');
 for(const slug of ['stickman-duel','bad-piggies','trees-hate-you','angry-birds']){
  assert(catalog.includes('/play/'+slug));assert(statSync(new URL('covers/'+slug+'.webp',root)).size>1000);
  assert.match(read(slug+'/index.html'),/<iframe id="game-frame"/);assert(read(slug+'/player.html').includes('viewport-fit=cover'));
 }
});
test('Angry Birds resizes its actual renderer and keeps original touch coordinates',()=>{
 const source=read('angry-birds/A7D2865EA92B17405E65BA89B782F73B.cache.js');const body=JSON.parse(source.slice(source.indexOf('(')+1,source.lastIndexOf(')')));
 const resize=body.match(/function P2\(a\)\{[^\n]*/)[0],touch=body.match(/function Tkd\(a,b\)\{[^\n]*/)[0];
 const ctx={sizes:[],F2:false,H2:0,G2:0,$wnd:{innerWidth:1180,innerHeight:820},W7c:{e:{Ni(w,h){ctx.sizes.push([w,h]);}}},E4b(){},Ap(){},feb:function(){}};
 vm.runInNewContext(resize+';P2({t:{i:true}})',ctx);assert.deepEqual(ctx.sizes,[[1180,820]]);assert.equal(ctx.F2,true);
 const game={ownerDocument:{body:{}},scrollTop:0};
 const point=vm.runInNewContext(touch+';Tkd(game,{clientX:405,clientY:266})',{game,nl:()=>5,ol:()=>6,pl:()=>0,ej:()=>0,Z7c:function(_time,x,y){this.x=x;this.y=y;}});
 assert.equal(point.x,400);assert.equal(point.y,260);
});
class Node extends EventTarget{
 constructor(tag){super();this.tag=tag;this.children=[];this.dataset={};this.style={setProperty(k,v){this[k]=v;}};this.attrs={};}
 append(...items){this.children.push(...items);for(const node of items)node.parentNode=this;}
 setAttribute(k,v){this.attrs[k]=v;}getAttribute(k){return this.attrs[k];}
 set innerHTML(value){this.html=value;if(value.includes('<i>'))this.append(new Node('i'));}
 querySelector(tag){return this.children.find(n=>n.tag===tag);}
 contains(node){return node===this||this.children.some(c=>c.contains?.(node));}
 setPointerCapture(id){this.captured=id;}getBoundingClientRect(){return{left:0,top:0,width:150,height:150};}
}
class InputEvent extends Event{constructor(type,init){super(type,{bubbles:true,cancelable:true});Object.assign(this,init);}}
test('forest stick supports diagonals, independent pause fingers, cancellation, and hidden-menu reset',()=>{
 const oldWindow=globalThis.window,oldDocument=globalThis.document,oldNav=Object.getOwnPropertyDescriptor(globalThis,'navigator');
 const win=new EventTarget(),doc=new EventTarget();doc.createElement=tag=>new Node(tag);doc.body=new Node('body');doc.hidden=false;win.KeyboardEvent=class{constructor(type,init){this.type=type;Object.assign(this,init);}};win.MouseEvent=win.KeyboardEvent;
 globalThis.window=win;globalThis.document=doc;Object.defineProperty(globalThis,'navigator',{value:{maxTouchPoints:5},configurable:true});
 try{
  const events=[],canvas={focus(){},dispatchEvent:e=>events.push(e)};const {pad,input}=installForestControls(canvas),[stick,pause]=pad.children;
  assert.equal(pad.hidden,true);win.dispatchEvent(new Event('kkeep-game-ready'));assert.equal(pad.hidden,false);
  const pointer=(id,x=120,y=30)=>({pointerId:id,clientX:x,clientY:y,preventDefault(){},stopPropagation(){}});
  stick.onpointerdown(pointer(1));assert(input.keys.has('KeyW'));assert(input.keys.has('KeyD'));
  stick.onpointerdown(pointer(2,20,120));assert(input.keys.has('KeyD'),'second finger cannot steal stick');
  pause.onpointerdown(pointer(3));pause.onpointercancel(pointer(3));assert(input.keys.has('KeyW'));
  stick.onpointercancel(pointer(1));assert(!input.keys.has('KeyW'));assert(!input.keys.has('KeyD'));
  stick.onpointerdown(pointer(4));win.dispatchEvent(new CustomEvent('kkeep-player-setting',{detail:{type:'menu',value:true}}));assert.equal(input.keys.size,0);assert.equal(pad.hidden,true);
  win.dispatchEvent(new CustomEvent('kkeep-player-setting',{detail:{type:'menu',value:false}}));stick.onpointerdown(pointer(5));win.dispatchEvent(new Event('blur'));assert.equal(input.keys.size,0);
  win.dispatchEvent(new CustomEvent('kkeep-player-setting',{detail:{type:'opacity',value:.2}}));assert.equal(pad.style['--opacity'],'0.2');
 }finally{globalThis.window=oldWindow;globalThis.document=oldDocument;if(oldNav)Object.defineProperty(globalThis,'navigator',oldNav);else delete globalThis.navigator;}
});
