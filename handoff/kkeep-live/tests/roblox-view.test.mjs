import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {transformSync} from 'esbuild';

const module={exports:{}};
vm.runInNewContext(transformSync(readFileSync(new URL('../lib/roblox-player.ts',import.meta.url),'utf8'),{loader:'ts',format:'cjs'}).code,{module,exports:module.exports,URL});
const {robloxOrigin,robloxViewEvent}=module.exports;
const frame={};
const dimensions=()=>({cssWidth:1180,cssHeight:734,width:1416,height:880});
const report=(overrides={})=>({type:'kkeep:roblox-view',revision:'join18',canvas:dimensions(),startup:{...dimensions(),effectiveDpr:1.2,rawDpr:1.2},lifecycle:'join-reported',...overrides});
const receive=(data,options={})=>robloxViewEvent({source:frame,origin:robloxOrigin,data,...options},frame);

test('view reports require the exact current frame, origin, message type and revision',()=>{
  assert.ok(receive(report()));
  for(const origin of ['https://evil.test',robloxOrigin+'.evil.test',robloxOrigin+'/', 'http://kkeep-roblox-runtime.kha971.chatgpt.site'])assert.equal(receive(report(),{origin}),null);
  assert.equal(receive(report(),{source:{}}),null);
  assert.equal(receive(report(),{source:null}),null);
  assert.equal(robloxViewEvent({source:frame,origin:robloxOrigin,data:report()},null),null);
  assert.equal(receive(report({revision:'join19'})).revision,'join19','current revision works during the rolling upgrade');
  for(const data of [null,[],42,'raw log',report({type:'kkeep:roblox-runtime'}),report({type:'kkeep:roblox-view-request'}),report({revision:'join16'}),report({revision:'join20'}),report({revision:null})])assert.equal(receive(data),null);
});

test('view reports clone only the agreed scalar fields and discard raw runtime data',()=>{
  const data=report({raw:{account:'private'},log:'private log',stage:'running',token:'private token'});
  data.canvas.raw='private canvas data';data.startup.raw='private startup data';
  const snapshot=receive(data);
  assert.deepEqual(JSON.parse(JSON.stringify(snapshot)),{revision:'join18',canvas:dimensions(),startup:{...dimensions(),effectiveDpr:1.2,rawDpr:1.2},lifecycle:'join-reported'});
  assert.notEqual(snapshot.canvas,data.canvas);assert.notEqual(snapshot.startup,data.startup);
  data.canvas.width=9;data.startup.cssWidth=9;data.lifecycle='game-closed';
  assert.equal(snapshot.canvas.width,1416);assert.equal(snapshot.startup.cssWidth,1180);assert.equal(snapshot.lifecycle,'join-reported');
});

test('canvas and startup dimensions accept only bounded safe integers, including zero',()=>{
  for(const field of ['canvas','startup']){
    for(const key of ['cssWidth','cssHeight','width','height']){
      for(const value of [-1,32769,0.5,NaN,Infinity,-Infinity,Number.MAX_SAFE_INTEGER,'1180',null,undefined,{},[]]){
        const data=report();data[field][key]=value;
        assert.equal(receive(data),null,`${field}.${key} rejects ${String(value)}`);
      }
      for(const value of [0,32768]){
        const data=report();data[field][key]=value;
        assert.equal(receive(data)[field][key],value,`${field}.${key} preserves ${value}`);
      }
    }
    for(const value of [undefined,[],{},'raw data',false])assert.equal(receive(report({[field]:value})),null);
  }
});

test('startup scales require finite positive numbers no greater than sixteen',()=>{
  for(const key of ['effectiveDpr','rawDpr']){
    for(const value of [0,-1,16.01,NaN,Infinity,-Infinity,'1.2',null,undefined,{},[]]){
      const data=report();data.startup[key]=value;
      assert.equal(receive(data),null,`${key} rejects ${String(value)}`);
    }
    for(const value of [0.1,1,16]){
      const data=report();data.startup[key]=value;
      assert.equal(receive(data).startup[key],value);
    }
  }
});

test('absent measurements and native events remain unreported, and unknown events are rejected',()=>{
  const snapshot=receive(report({canvas:null,startup:null,lifecycle:null}));
  assert.deepEqual(JSON.parse(JSON.stringify(snapshot)),{revision:'join18',canvas:null,startup:null,lifecycle:null});
  const legacy=report();delete legacy.lifecycle;
  assert.equal(receive(legacy).lifecycle,null);
  for(const lifecycle of ['join-reported','scripts-starting','game-closed'])assert.equal(receive(report({lifecycle})).lifecycle,lifecycle);
  for(const lifecycle of ['joined','running','JOIN-REPORTED',0,false,{},[]])assert.equal(receive(report({lifecycle})),null);
});
