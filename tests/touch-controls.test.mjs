import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createPad,stickVector,attachGamepad} from '../lib/touch/gamepad.mjs';

test('three fingers move, look and shoot independently; cancellation releases all',()=>{
  const control=createPad(()=>42);
  control.stick('left',0,.4,-1);control.stick('right',1,-.8,.2);control.button('fire',7);
  assert.deepEqual(control.pad.axes,[.4,-1,-.8,.2]);assert.equal(control.pad.buttons[7].value,1);
  control.release('left');assert.deepEqual(control.pad.axes,[0,0,-.8,.2]);assert.equal(control.pad.buttons[7].pressed,true);
  control.reset();assert.deepEqual(control.pad.axes,[0,0,0,0]);assert.ok(control.pad.buttons.every(b=>!b.pressed&&b.value===0));
});
test('Phone and D-pad Up share input without releasing the other finger',()=>{
  const control=createPad();control.button('phone',12);control.button('up',12);control.release('phone');
  assert.equal(control.pad.buttons[12].pressed,true);control.release('up');assert.equal(control.pad.buttons[12].pressed,false);
});
test('analog stick is circular, has a deadzone, and points up with negative Y',()=>{
  assert.deepEqual(stickVector(2,2,50,.12),[0,0]);assert.deepEqual(stickVector(0,-50,50,.12),[0,-1]);
  const diagonal=stickVector(50,50,50,.12);assert.ok(Math.abs(Math.hypot(...diagonal)-1)<1e-10);
  const center=stickVector(25,0,50,.12);assert.ok(center[0]>0&&center[0]<.5);
});
function realm(native=()=>[null,null,null,null],allowed=true){const events=[];const navigator={getGamepads:native};return {navigator,document:{permissionsPolicy:{allowsFeature:()=>allowed}},Event,dispatchEvent:event=>events.push(event),events};}
test('same-page adapter exposes standard input and completely restores the API',()=>{
  const control=createPad(),host=realm(),original=host.navigator.getGamepads;let reads=0;
  const bridge=attachGamepad(host,control.pad,()=>reads++);bridge.announce();
  assert.equal(host.events[0].type,'gamepadconnected');control.button('phone',12);
  const pad=host.navigator.getGamepads()[0];assert.equal(pad.mapping,'standard');assert.equal(pad.buttons[12].pressed,true);assert.equal(reads,1);
  control.reset();assert.equal(host.navigator.getGamepads()[0].buttons[12].pressed,false);
  bridge.destroy();assert.equal(host.navigator.getGamepads,original);assert.equal(host.events.at(-1).type,'gamepaddisconnected');
});
test('real devices are preserved and browser permission denials stay denied',()=>{
  const physical={id:'Real controller',index:0},control=createPad(),host=realm(()=>[physical,null,null,null]);
  const bridge=attachGamepad(host,control.pad);const pads=host.navigator.getGamepads();assert.equal(pads[0],physical);assert.equal(pads[1].id,control.pad.id);bridge.destroy();
  const blocked=realm(undefined,false),before=blocked.navigator.getGamepads;assert.throws(()=>attachGamepad(blocked,control.pad),/does not allow/);assert.equal(blocked.navigator.getGamepads,before);
  const denied=realm(()=>{throw new DOMException('Denied','SecurityError');});assert.throws(()=>attachGamepad(denied,control.pad),{name:'SecurityError'});
});

// Optional integration against the exact public player downloaded for this task.
// It verifies the provider's encoder, rather than reimplementing its protocol.
if(process.env.KKEEP_GHOST_SCRIPT)test('GhostCloud encoder sends Phone Up, both sticks, trigger, then neutral release',()=>{
  const source=readFileSync(process.env.KKEEP_GHOST_SCRIPT,'utf8');const start=source.indexOf('function sendGamepadInput()');const end=source.indexOf('\nfunction ',start+20);
  assert.ok(start>0&&end>start);const control=createPad(),packets=[];
  const context=vm.createContext({navigator:{getGamepads:()=>[control.pad]},inputDC:{readyState:'open'},dcSend:buffer=>packets.push(new DataView(buffer))});vm.runInContext(source.slice(start,end),context);
  control.button('phone',12);control.button('gas',7);control.stick('walk',0,.5,-1);control.stick('look',1,-.25,.75);context.sendGamepadInput();
  const packet=packets.at(-1);assert.equal(packet.byteLength,17);assert.equal(packet.getUint16(5)&1,1);assert.equal(packet.getUint8(8),255);assert.equal(packet.getInt16(9),16384);assert.equal(packet.getInt16(11),32767);assert.equal(packet.getInt16(13),-8192);
  control.reset();context.sendGamepadInput();const neutral=packets.at(-1);assert.equal(neutral.getUint16(5),0);assert.equal(neutral.getUint8(8),0);assert.equal(neutral.getInt16(9),0);assert.equal(neutral.getInt16(11),0);
});

if(process.env.KKEEP_FIGURE_GAMEPAD)test('Figure player SDK encodes the same virtual pad as a physical controller',()=>{
  const source=readFileSync(process.env.KKEEP_FIGURE_GAMEPAD,'utf8'),control=createPad(),packets=[];
  const context=vm.createContext({navigator:{getGamepads:()=>[control.pad]},window:{GamepadEvent:Event,performance}});vm.runInContext(source,context);
  const encoder=new context.GamepadController();encoder.onoperate=buffer=>packets.push(new DataView(buffer));
  control.button('phone',12);control.button('gas',7);control.stick('walk',0,.5,-1);
  assert.equal(encoder.encodeGamepadStatus_(0,control.pad),true);
  const packet=packets.at(-1);assert.equal(packet.getUint16(5)&1,1);assert.equal(packet.getUint8(8),255);assert.equal(packet.getInt16(9),16384);assert.equal(packet.getInt16(11),32767);
  control.reset();encoder.encodeGamepadStatus_(0,control.pad);assert.equal(packets.at(-1).getUint16(5),0);assert.equal(packets.at(-1).getUint8(8),0);
});

if(process.env.KKEEP_ASTRA_PLAYER)test('Astra PC player reads Phone Up, both sticks and triggers, including release',async()=>{
  const {parse}=await import('acorn');const source=readFileSync(process.env.KKEEP_ASTRA_PLAYER,'utf8');
  const ast=parse(source,{ecmaVersion:'latest',sourceType:'module'});
  const map=ast.body.find(node=>node.type==='VariableDeclaration'&&node.declarations.some(d=>d.id.name==='Hn'));
  const round=ast.body.find(node=>node.type==='FunctionDeclaration'&&node.id.name==='ze');
  const player=ast.body.find(node=>node.type==='ClassDeclaration'&&node.id.name==='Gn');
  const poll=player.body.body.find(node=>node.key.value==='_pollGamepad');
  const control=createPad(),sent=[];
  const context=vm.createContext({_0x34890f:()=>'',navigator:{getGamepads:()=>[control.pad]},requestAnimationFrame:()=>1});
  vm.runInContext(source.slice(map.start,map.end)+'\n'+source.slice(round.start,round.end)+'\nclass Player{'+source.slice(poll.start,poll.end)+'}\nthis.player=new Player();',context);
  context.player.sendGamepad=packet=>sent.push(packet);context.player.log=()=>{};context.player._pollGamepad();sent.length=0;
  control.button('phone',12);control.button('gas',7);control.stick('left',0,.5,-1);control.stick('right',1,-.25,.75);context.player._pollGamepad();
  assert.ok(sent.includes('UP__|0;'));assert.ok(sent.includes('RT_Z|1;'));assert.ok(sent.includes('LT_X|0.5;LT_Y|-1;'));assert.ok(sent.includes('RT_X|-0.25;RT_Y|0.75;'));
  sent.length=0;control.reset();context.player._pollGamepad();assert.ok(sent.includes('UP__|1;'));assert.ok(sent.includes('RT_Z|-1;'));assert.ok(sent.includes('LT_X|0;LT_Y|0;'));
});
