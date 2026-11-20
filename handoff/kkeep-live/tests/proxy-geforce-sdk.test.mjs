import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import vm from 'node:vm';
import {createGeForceInput} from '../lib/geforce/touch-input.mjs';

// Optional integration with the current public GeForce vendor bundle. It stays
// outside the repository and is never shipped in Kkeep or its source download.
// Extract the real standard-gamepad encoder, deduplicator and polling method;
// do not replace the provider's comparison with a mock of our implementation.
if(process.env.KKEEP_GFN_VENDOR)test('GeForce SDK sends movement and neutral release without a fire-button change',async()=>{
  const {parse}=await import('acorn');
  const source=readFileSync(process.env.KKEEP_GFN_VENDOR,'utf8');
  const ast=parse(source,{ecmaVersion:'latest'}),classes=new Map();
  function walk(node){
    if(!node||typeof node!=='object')return;
    if(node.type==='ClassDeclaration'&&['Ai','io'].includes(node.id?.name))classes.set(node.id.name,node);
    for(const value of Object.values(node))if(Array.isArray(value))value.forEach(walk);else if(value&&typeof value==='object')walk(value);
  }
  walk(ast);
  const sample=classes.get('Ai'),handler=classes.get('io');
  assert.ok(sample&&handler,'The upstream SDK changed: inspect its new encoder before updating this test');
  const methods=['rA','sv','ev','nv'].map(name=>{
    const method=handler.body.body.find(node=>node.key.name===name);assert.ok(method,'Missing SDK method '+name);return source.slice(method.start,method.end);
  });
  const context={performance,Mi:{getInstance:()=>({Bo(){}})}};
  vm.runInNewContext(source.slice(sample.start,sample.end)+';class Poller{'+methods.join('\n')+'};this.Poller=Poller;',context);
  const factory=process.env.KKEEP_GFN_INPUT_MODULE?(await import(pathToFileURL(process.env.KKEEP_GFN_INPUT_MODULE))).createGeForceInput:createGeForceInput;
  const input=factory(),win=new EventTarget(),doc=new EventTarget();
  win.document=doc;win.Event=Event;win.navigator={getGamepads:()=>[null,null,null,null]};
  input.register(win,'https://play.geforcenow.com/mall/');input.enable(true);
  const read=win.navigator.getGamepads,packets=[],poller=new context.Poller();
  Object.assign(poller,{aA:[],cA:[],dA:[],Ku:[],Au:{uA:false},yu:1,
    Kv(){},KA(){return true;},jv(){},
    EA(){this.aA=[{device:read()[0],gu:this.sv,wu:this.ev,bu:this.nv,OA:1,_A:0,jA:{}}];},
    Tu:[{xl(index,id,buttons,triggers,axes){packets.push({buttons,triggers,axes:[...axes]});},Hl(){}}],
  });
  const tick=()=>{const count=packets.length;poller.rA();assert.equal(packets.length,count+1,'The SDK must send this input change');return packets.at(-1);};
  try{
    tick();
    input.controller.stick('move',0,0,-1);let packet=tick();
    assert.deepEqual(packet.axes,[0,-1,0,0]);assert.equal(packet.buttons,0);assert.equal(packet.triggers,0);
    input.controller.stick('move',0,1,0);assert.deepEqual(tick().axes,[1,0,0,0]);
    input.controller.stick('look',1,.5,-.5);assert.deepEqual(tick().axes,[1,0,.5,-.5]);
    input.controller.button('fire',7);assert.equal(tick().triggers,65280);
    input.controller.release('fire');packet=tick();assert.equal(packet.triggers,0);assert.deepEqual(packet.axes,[1,0,.5,-.5]);
    input.controller.stick('move',0,-1,0);assert.deepEqual(tick().axes,[-1,0,.5,-.5]);
    input.controller.release('move');assert.deepEqual(tick().axes,[0,0,.5,-.5]);
    input.controller.release('look');assert.deepEqual(tick().axes,[0,0,0,0]);
    const count=packets.length;poller.rA();assert.equal(packets.length,count,'Unchanged inputs do not create extra packets');
  }finally{input.destroy();}
});
