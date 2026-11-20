import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const upstream=read('tests/fixtures/hill-compat/index.html');
function setup({touch=true}={}) {
  const win=new EventTarget(), doc=new EventTarget(), canvas=new EventTarget(), calls=[];
  doc.defaultView=win;doc.hidden=false;canvas.ownerDocument=doc;
  if(touch)win.ontouchstart=null;
  let ready=true,focused=0,rect={left:0,top:0,width:1024,height:768};
  canvas.focus=()=>focused++;canvas.setPointerCapture=()=>{};
  canvas.getBoundingClientRect=()=>rect;
  const context=vm.createContext({canvas,GAME_W:1280,GAME_H:720});
  vm.runInContext(upstream.slice(upstream.indexOf('  const pos ='),upstream.indexOf("  addEventListener('keydown'"))+'globalThis.pos=pos;',context);
  vm.runInContext(read('public/games/ipad-imports/assets/hill-input.js'),context);
  const destroy=context.KkeepHcrInput.attach(canvas,{position:context.pos,emit:(...args)=>calls.push(args),ready:()=>ready});
  const event=(target,type,props={})=>{
    const e=new Event(type,{cancelable:true,bubbles:true});Object.assign(e,props);target.dispatchEvent(e);return e;
  };
  const finger=(identifier,clientX,clientY)=>({identifier,clientX,clientY});
  const touchEvent=(type,...fingers)=>event(type==='touchstart'||type==='touchmove'?canvas:win,type,{changedTouches:fingers});
  const pointer=(type,id,x,y,kind='touch',target=type==='pointerup'||type==='pointercancel'?win:canvas)=>event(target,type,{pointerId:id,clientX:x,clientY:y,pointerType:kind,button:0});
  return {win,doc,canvas,calls,destroy,event,finger,touchEvent,pointer,context,
    touches:()=>calls.filter(c=>c[0]==='hcr_ev_touch'),focused:()=>focused,
    setReady:v=>{ready=v;},setRect:v=>{rect=v;}};
}
test('two native fingers press and release independently with immediate letterboxed coordinates',()=>{
  const h=setup(),gas=h.finger(991,880,592),brake=h.finger(42,144,592);
  assert(h.touchEvent('touchstart',gas).defaultPrevented);
  assert.deepEqual(h.touches(),[['hcr_ev_touch',0,2,1100,620]]);
  h.touchEvent('touchstart',brake);
  assert.deepEqual(h.touches().at(-1),['hcr_ev_touch',0,3,180,620]);
  h.touchEvent('touchend',brake);
  assert.deepEqual(h.touches().at(-1),['hcr_ev_touch',2,3,180,620]);
  h.touchEvent('touchmove',h.finger(991,800,592));
  assert.deepEqual(h.touches().at(-1),['hcr_ev_touch',1,2,1000,620]);
  h.touchEvent('touchend',h.finger(991,800,592));
  assert.deepEqual(h.touches().at(-1),['hcr_ev_touch',2,2,1000,620]);
  assert.equal(h.focused(),2);
});
test('Safari pointer and touch compatibility events never double-press a pedal',()=>{
  const h=setup(),f=h.finger(1,880,592);
  h.pointer('pointerdown',8,880,592);h.touchEvent('touchstart',f);
  h.pointer('pointermove',8,880,592);h.touchEvent('touchmove',f);
  h.pointer('pointerup',8,880,592);h.touchEvent('touchend',f);
  h.touchEvent('touchend',f);
  assert.deepEqual(h.touches().map(c=>c[1]),[0,2]);
});
test('pointer-only touch works when native TouchEvents are absent, including lost capture',()=>{
  const h=setup({touch:false});
  h.pointer('pointerdown',100,880,592);h.pointer('pointerdown',101,144,592);
  h.pointer('pointermove',100,800,592);
  h.event(h.canvas,'lostpointercapture',{pointerId:100});
  h.pointer('pointerup',100,800,592); // duplicate after lost capture
  h.pointer('pointerup',101,144,592); // outside-canvas release on window
  assert.deepEqual(h.touches().map(c=>[c[1],c[2]]),[[0,2],[0,3],[1,2],[2,2],[2,3]]);
});
test('canceled touch releases the last real position and ignores orphan moves',()=>{
  const h=setup();
  h.touchEvent('touchmove',h.finger(8,880,592));assert.equal(h.touches().length,0);
  h.touchEvent('touchstart',h.finger(8,880,592));
  h.touchEvent('touchcancel',h.finger(8,0,0));
  assert.deepEqual(h.touches().at(-1),['hcr_ev_touch',2,2,1100,620]);
});
test('background, focus loss and page exit release all held controls exactly once',()=>{
  for(const trigger of ['blur','pagehide','visibilitychange']) {
    const h=setup();h.touchEvent('touchstart',h.finger(1,880,592),h.finger(2,144,592));
    if(trigger==='visibilitychange'){h.doc.hidden=true;h.event(h.doc,trigger);}else h.event(h.win,trigger);
    h.touchEvent('touchend',h.finger(1,880,592),h.finger(2,144,592));
    assert.deepEqual(h.touches().map(c=>c[1]),[0,0,2,2]);
    assert.deepEqual(h.calls.at(-1),['hcr_ev_focus',0]);
    h.doc.hidden=false;h.event(h.win,'focus');
    h.touchEvent('touchstart',h.finger(3,880,592));
    assert.deepEqual(h.touches().at(-1),['hcr_ev_touch',0,2,1100,620]);
  }
});
test('portrait orientation and changed game dimensions use the current letterbox',()=>{
  const h=setup();h.setRect({left:10,top:20,width:768,height:1024});
  h.touchEvent('touchstart',h.finger(1,394,532));
  assert.deepEqual(h.touches().at(-1),['hcr_ev_touch',0,2,640,360]);
  h.context.GAME_W=800;h.context.GAME_H=600;
  h.touchEvent('touchmove',h.finger(1,394,532));
  assert.deepEqual(h.touches().at(-1),['hcr_ev_touch',1,2,400,300]);
});
test('mouse and pen input stay native, and cleanup removes listeners and held buttons',()=>{
  const h=setup();
  h.pointer('pointerdown',1,880,592,'mouse');h.pointer('pointerdown',2,144,592,'pen');
  assert.deepEqual(h.calls.filter(c=>c[0]==='hcr_ev_mouse'),[['hcr_ev_mouse',0,1100,620,0,0],['hcr_ev_mouse',1,1100,620,0,0]]);
  h.destroy();
  assert.deepEqual(h.calls.slice(-2),[['hcr_ev_mouse',2,1100,620,0,0],['hcr_ev_touch',2,3,180,620]]);
  const count=h.calls.length;h.pointer('pointerdown',1,880,592,'mouse');h.touchEvent('touchstart',h.finger(2,144,592));
  assert.equal(h.calls.length,count);
});
test('loading taps do not create invisible held contacts and repeated taps reuse bounded IDs',()=>{
  const h=setup();h.setReady(false);h.touchEvent('touchstart',h.finger(1,880,592));
  h.setReady(true);h.touchEvent('touchend',h.finger(1,880,592));assert.equal(h.touches().length,0);
  for(let n=0;n<1000;n++){h.touchEvent('touchstart',h.finger(n,880,592));h.touchEvent('touchend',h.finger(n,880,592));}
  assert.equal(h.touches().length,2000);assert(h.touches().every(c=>c[2]===2));
});
test('loader installs the input adapter before rewriting the original game page',()=>{
  const loader=read('public/games/ipad-imports/hill-climb-racing.html');
  assert(loader.indexOf('hill-input.js?v=1')<loader.indexOf('KkeepHcrRuntime.patchPage'));
  assert(loader.includes('window.URL.revokeObjectURL(this.src)'));
});
