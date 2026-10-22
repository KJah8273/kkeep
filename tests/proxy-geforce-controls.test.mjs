import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createGeForceInput} from '../lib/geforce/touch-input.mjs';

const url='https://play.geforcenow.com/mall/';
function realm({allowed=true,devices=[null,null,null,null]}={}){
  const win=new EventTarget(),doc=new EventTarget();doc.permissionsPolicy={allowsFeature:()=>allowed};
  const events=[];win.addEventListener('gamepadconnected',e=>events.push({type:e.type,index:e.gamepad.index,connected:e.gamepad.connected}));win.addEventListener('gamepaddisconnected',e=>events.push({type:e.type,index:e.gamepad.index,connected:e.gamepad.connected}));
  win.document=doc;win.Event=Event;win.navigator={getGamepads:()=>devices};
  return {win,events,devices};
}

test('GeForce can cache the input reader before Controls is opened and reads simultaneous sticks, aim and fire',()=>{
  const input=createGeForceInput(),{win,events}=realm(),native=win.navigator.getGamepads;input.register(win,url);
  const cached=win.navigator.getGamepads.bind(win.navigator);assert.equal(cached().filter(Boolean).length,0);
  let reads=0;const bridge=input.attach(win,input.controller.pad,()=>reads++);input.enable(true);
  assert.deepEqual(events,[{type:'gamepadconnected',index:0,connected:true}]);assert.equal(reads,0,'Announcements are not player polling');
  input.controller.stick('move',0,.8,-.9);input.controller.stick('look',1,-.3,.2);input.controller.button('aim',6);input.controller.button('fire',7);
  const pad=cached()[0];assert.equal(pad.mapping,'standard');assert.deepEqual(pad.axes,[.8,-.9,-.3,.2]);assert.equal(pad.buttons[6].value,1);assert.equal(pad.buttons[7].value,1);assert.equal(reads,1);
  input.controller.release('fire');assert.equal(cached()[0].buttons[7].pressed,false);assert.equal(cached()[0].buttons[6].pressed,true);
  input.enable(false);assert.equal(cached().filter(Boolean).length,0);assert.ok(input.controller.pad.buttons.every(b=>!b.pressed));assert.equal(events.at(-1).connected,false);
  input.enable(true);assert.equal(cached()[0].connected,true);bridge.destroy();input.destroy();assert.equal(win.navigator.getGamepads,native);assert.equal(cached().filter(Boolean).length,0);
});

test('stick-only movement, direction changes and release remain visible against prior polling samples',()=>{
  const input=createGeForceInput(),{win}=realm();input.register(win,url);input.enable(true);
  const read=win.navigator.getGamepads,neutral=read()[0];
  assert.equal(read()[0],neutral,'Polling alone does not invent an input change');
  input.controller.stick('move',0,0,-1);const forward=read()[0];
  assert.deepEqual(neutral.axes,[0,0,0,0],'The prior axes cannot be changed by a later touch');
  assert.deepEqual(forward.axes,[0,-1,0,0]);assert.notEqual(forward.axes,neutral.axes);
  assert.ok(forward.buttons.every(button=>!button.pressed),'Movement never needs or synthesizes a button press');
  input.controller.stick('move',0,1,0);const right=read()[0];
  assert.deepEqual(forward.axes,[0,-1,0,0]);assert.deepEqual(right.axes,[1,0,0,0]);
  input.controller.release('move');const stopped=read()[0];
  assert.deepEqual(right.axes,[1,0,0,0]);assert.deepEqual(stopped.axes,[0,0,0,0]);
  assert.ok(stopped.timestamp>=right.timestamp);input.destroy();
});

test('aim/fire transitions do not overwrite cached buttons or either stick',()=>{
  const input=createGeForceInput(),{win}=realm();input.register(win,url);input.enable(true);
  const read=()=>win.navigator.getGamepads()[0];
  input.controller.stick('move',0,.6,-.8);input.controller.stick('look',1,-.5,.25);const moving=read();
  input.controller.button('fire',7);const firing=read();
  assert.equal(moving.buttons[7].pressed,false);assert.equal(firing.buttons[7].pressed,true);
  assert.equal(firing.axes,moving.axes,'Unchanged axes keep their identity');
  input.controller.release('fire');const noFire=read();
  assert.equal(firing.buttons[7].pressed,true);assert.equal(noFire.buttons[7].pressed,false);
  assert.deepEqual(noFire.axes,[.6,-.8,-.5,.25]);
  input.controller.stick('move',0,-1,0);const strafe=read();
  assert.deepEqual(noFire.axes,[.6,-.8,-.5,.25]);assert.deepEqual(strafe.axes,[-1,0,-.5,.25]);
  assert.ok(Object.isFrozen(strafe.axes));assert.ok(Object.isFrozen(strafe.buttons));
  win.dispatchEvent(new Event('pagehide'));assert.deepEqual(read().axes,[0,0,0,0]);input.destroy();
});

test('physical controllers retain their slots even when one connects after touch controls',()=>{
  const physical={id:'Xbox Bluetooth',index:0,connected:true},input=createGeForceInput(),{win,events,devices}=realm({devices:[physical,null,null,null]});input.register(win,url);input.enable(true);
  assert.equal(events[0].index,1);assert.equal(win.navigator.getGamepads()[0],physical);
  const second={id:'DualSense',index:1};devices[1]=second;const pads=win.navigator.getGamepads();assert.equal(pads[1],second);assert.equal(pads[2].id,input.controller.pad.id);
  assert.deepEqual(events.slice(-2).map(e=>[e.type,e.index]),[['gamepaddisconnected',1],['gamepadconnected',2]]);input.destroy();
});

test('auth pages and unrelated apps are never patched and permission denials stay denied',()=>{
  for(const target of ['https://www.epicgames.com/id/login','https://login.nvidia.com/','https://play.geforcenow.com.evil.test/','http://play.geforcenow.com/']){
    const input=createGeForceInput(),{win}=realm(),original=win.navigator.getGamepads;input.register(win,target);input.enable(true);assert.equal(win.navigator.getGamepads,original);input.destroy();
  }
  const input=createGeForceInput(),{win}=realm({allowed:false}),original=win.navigator.getGamepads;input.register(win,url);input.enable(true);assert.equal(win.navigator.getGamepads,original);assert.throws(()=>input.attach(win,input.controller.pad,()=>{}));input.destroy();
});

test('navigation and hidden documents clear held inputs and detach old readers',()=>{
  const input=createGeForceInput(),{win}=realm();input.register(win,url);input.enable(true);input.controller.button('fire',7);const before=win.navigator.getGamepads;
  win.document.dispatchEvent(new Event('visibilitychange'));assert.equal(input.controller.pad.buttons[7].pressed,false);
  input.controller.stick('move',0,1,0);win.dispatchEvent(new Event('pagehide'));assert.deepEqual(input.controller.pad.axes,[0,0,0,0]);
  input.controller.button('fire',7);const next=new EventTarget();next.permissionsPolicy={allowsFeature:()=>true};win.document=next;input.register(win,url);assert.equal(input.controller.pad.buttons[7].pressed,false);assert.equal(before().filter(Boolean).length,0);input.destroy();
});

test('only the GeForce runtime installs the early input hook and loader precedes navigation',()=>{
  const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
  assert.match(read('../public/gfn/runtime.js'),/KkeepGeForceControls\?\.register\(context.window,context.client.url.href\)/);
  assert.doesNotMatch(read('../public/xbox/runtime.js'),/Kkeep(?:GeForce|Xbox)Controls/);
  assert.doesNotMatch(read('../public/engine/kha-runtime.js'),/KkeepGeForceControls/);
  const html=read('../public/gfn/index.html');assert.ok(html.indexOf('/gfn/touch-controls.js')<html.indexOf('/gfn/runtime.js'));assert.ok(html.indexOf('/gfn/runtime.js')<html.indexOf('/gfn/app.js'));
});

test('GeForce launcher exposes controls in fullscreen, closes them for account pages and resets on page restore',async()=>{
  const {default:vm}=await import('node:vm');
  const nodes=new Map(),events={},classes=new Set();let callbacks,opened=0,closed=0,resets=0,destroyed=0;
  const frame={};const node=id=>{if(!nodes.has(id))nodes.set(id,{hidden:false,attributes:{},setAttribute(k,v){this.attributes[k]=v;},addEventListener(k,fn){this[k]=fn;},querySelector(){return frame;}});return nodes.get(id);};
  const document={getElementById:node,body:{classList:{toggle(k,v){v?classes.add(k):classes.delete(k);}}},documentElement:{},addEventListener(k,fn){events[k]=fn;}};
  const window={isSecureContext:true,$scramjet:{},$scramjetController:{},addEventListener(k,fn){events[k]=fn;},KkeepGeForceControls:{open(f){assert.equal(f,frame);opened++;},close(){closed++;},reset(){resets++;}},KHAProxy:{setLite(){},setAdBlock(){},async mount(_,c){callbacks=c;return {go(u){c.onNavigate(u);},destroy(){destroyed++;},reload(){}};}}};
  vm.runInNewContext(readFileSync(new URL('../public/gfn/app.js',import.meta.url),'utf8'),{window,document,navigator:{serviceWorker:{}},URL,URLSearchParams,location:{search:'',origin:'https://kkeep.test',pathname:'/gfn/index.html'},history:{},localStorage:{getItem(){return null;}},Date});
  await new Promise(r=>setImmediate(r));
  node('touch-controls').click();assert.equal(opened,1);assert.equal(classes.has('immersive'),true);assert.equal(node('play-tools').hidden,false);assert.equal(node('touch-quick').attributes['aria-pressed'],'true');
  node('exit-fullscreen').click();assert.equal(closed,1);assert.equal(classes.has('immersive'),false);
  callbacks.onNavigate('https://www.epicgames.com/id/login');assert.equal(closed,2);node('touch-controls').click();assert.equal(opened,1);assert.match(node('error-message').textContent,/Open the GeForce/);
  events.pagehide();assert.equal(destroyed,1);assert.equal(resets,2);events.pageshow({persisted:true});await new Promise(r=>setImmediate(r));assert.equal(resets,3);
});
