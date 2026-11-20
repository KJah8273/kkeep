import test from 'node:test';
import assert from 'node:assert/strict';
import {attachTikTokDesktop,desktopViewport,isTikTokUrl,TIKTOK_FEED,hasTikTokDialog} from '../lib/tiktok-desktop.ts';

function fixture(){
 const handlers=new Map(),notices=[],dialogs=[],rect={left:300,right:700,top:0,bottom:800,width:400,height:800};
 let clicks=0,dialog=false,error='',observer,focused=false,disconnected=false;
 const doc={documentElement:{classList:{contains:()=>focused}},addEventListener:(name,fn)=>handlers.set(name,fn),removeEventListener:name=>handlers.delete(name)};
 const element=(box=rect)=>({ownerDocument:doc,getBoundingClientRect:()=>box,hasAttribute:()=>false,getAttribute:()=>null,closest:()=>null});
 const video=element(),arrow={...element(),click(){clicks++;}},alert={...element(),get textContent(){return error;}};
 doc.defaultView={innerHeight:800,getComputedStyle:()=>({visibility:'visible',display:'block',overflowY:'auto'}),MutationObserver:class{constructor(cb){observer=cb;}observe(){}disconnect(){disconnected=true;}}};
 doc.querySelectorAll=selector=>selector==='video'?[video]:selector.includes('input[type="password"]')?(dialog?[element()]:[]):selector.includes('role="alert"')?(error?[alert]:[]):selector.includes('arrow-')?[arrow]:[];
 const view=attachTikTokDesktop(doc,value=>notices.push(value),value=>dialogs.push(value));
 const touch=(x,y,id=1)=>({clientX:x,clientY:y,identifier:id});
 const event=(touches,extra={})=>({touches,changedTouches:touches,target:video,preventDefault(){},stopPropagation(){},...extra});
 return {doc,view,handlers,notices,dialogs,touch,event,video,get clicks(){return clicks;},setDialog(v){dialog=v;observer();},setFocused:v=>focused=v,setError(value){error=value;observer();},get disconnected(){return disconnected;}};
}

test('desktop viewport fits iPad portrait and landscape without clipping',()=>{
 assert.deepEqual(desktopViewport(820,1100),{width:1024,height:1100/(820/1024),scale:820/1024});
 assert.deepEqual(desktopViewport(1180,820),{width:1180,height:820,scale:1});
 assert.equal(isTikTokUrl(TIKTOK_FEED),true);assert.equal(isTikTokUrl('https://tiktok.com.evil.example/'),false);
});
test('swiping over the player advances exactly once and ignores fast duplicate gestures',()=>{
 const f=fixture();try{
  const start=f.handlers.get('touchstart'),move=f.handlers.get('touchmove'),end=f.handlers.get('touchend');
  start(f.event([f.touch(450,600)]));move(f.event([f.touch(450,480)]));end(f.event([f.touch(450,200)]));
  assert.equal(f.clicks,1);
  start(f.event([f.touch(450,600)]));end(f.event([f.touch(450,200)]));assert.equal(f.clicks,1);
 }finally{f.view.destroy();}assert.equal(f.handlers.size,0);assert.equal(f.disconnected,true);
});
test('taps, sideways gestures, the sidebar, controls, multitouch and cancellation never skip videos',()=>{
 const f=fixture();try{
  const start=f.handlers.get('touchstart'),move=f.handlers.get('touchmove'),end=f.handlers.get('touchend');
  start(f.event([f.touch(450,600)]));end(f.event([f.touch(450,590)]));
  start(f.event([f.touch(450,600)]));move(f.event([f.touch(600,590)]));end(f.event([f.touch(600,200)]));
  start(f.event([f.touch(100,600)]));end(f.event([f.touch(100,200)]));
  start(f.event([f.touch(450,600)],{target:{closest:()=>({})}}));end(f.event([f.touch(450,200)]));
  start(f.event([f.touch(450,600)]));move(f.event([f.touch(450,500),f.touch(500,400,2)]));end(f.event([f.touch(450,200)]));
  start(f.event([f.touch(450,600)]));f.handlers.get('touchcancel')();end(f.event([f.touch(450,200)]));
  assert.equal(f.clicks,0);
 }finally{f.view.destroy();}
});
test('login dialogs and video focus suspend desktop navigation',()=>{
 const f=fixture();try{f.setDialog(true);f.view.step(1);assert.equal(f.clicks,0);f.setDialog(false);f.setFocused(true);f.view.step(1);assert.equal(f.clicks,0);f.setFocused(false);f.view.step(-1);assert.equal(f.clicks,1);}finally{f.view.destroy();}
});
test('TikTok login limit notice clears when the provider removes the error',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});const f=fixture();
 try{f.setError('Maximum number of attempts reached. Try again later.');t.mock.timers.tick(151);assert.deepEqual(f.notices,[true]);f.setError('Incorrect password');t.mock.timers.tick(151);assert.deepEqual(f.notices,[true,false]);assert.equal(f.clicks,0);}finally{f.view.destroy();t.mock.timers.reset();}
});

test('native TikTok method picker is recognized before any password field exists',()=>{
 const f=fixture();try{
  f.doc.querySelectorAll=selector=>selector.includes('#loginModalContentContainer')?[{ownerDocument:f.doc,getBoundingClientRect:()=>({width:500,height:600})}]:[];
  assert.equal(hasTikTokDialog(f.doc),true);f.view.step(1);assert.equal(f.clicks,0);
 }finally{f.view.destroy();}
});
test('dialog changes hide playback controls and restore them after closing',t=>{
 t.mock.timers.enable({apis:['setTimeout']});const f=fixture();
 try{assert.deepEqual(f.dialogs,[false]);f.setDialog(true);t.mock.timers.tick(151);assert.deepEqual(f.dialogs,[false,true]);f.setDialog(true);t.mock.timers.tick(151);assert.deepEqual(f.dialogs,[false,true]);f.setDialog(false);t.mock.timers.tick(151);assert.deepEqual(f.dialogs,[false,true,false]);}finally{f.view.destroy();t.mock.timers.reset();}
});
