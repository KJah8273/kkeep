import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {runtimeBootstrap} from '../worker/runtime.js';

function harness() {
  const handlers=new Map(),messages=[],requests=[];
  const canvas={clientWidth:1180,clientHeight:734,width:974,height:606};
  const parent={postMessage:(...args)=>messages.push(args)};
  const scope={navigator:{userAgent:'Safari',platform:'MacIntel',maxTouchPoints:5},
    parent,crossOriginIsolated:true,SharedArrayBuffer,
    WebAssembly:{Memory:class{},Suspending(){},promising(){},instantiate:async()=>({})},
    document:{getElementById:id=>id==='canvas'?canvas:null},
    addEventListener:(type,fn)=>{const list=handlers.get(type)||[];list.push(fn);handlers.set(type,list);},
    fetch:(...args)=>{requests.push(args);return Promise.resolve();},
    console:{error(){}},setTimeout,clearTimeout,
  };
  scope.window=scope;
  vm.runInNewContext('('+runtimeBootstrap.toString()+')()',scope);
  messages.length=0;
  return {scope,canvas,messages,requests,parent,
    request({source=parent,origin='https://kkeep.fun',data={type:'kkeep:roblox-view-request'}}={}) {
      for(const callback of handlers.get('message')||[])callback({source,origin,data});
    },
    response:()=>JSON.parse(JSON.stringify(messages.at(-1)?.[0])),
  };
}

test('view checks are requested locally and report the real current canvas without claiming a join',()=>{
  const h=harness();
  assert.equal(h.messages.length,0);
  h.request();
  assert.deepEqual(h.response(),{type:'kkeep:roblox-view',revision:'join19',
    canvas:{cssWidth:1180,cssHeight:734,width:974,height:606},startup:null,lifecycle:null});
  assert.equal(h.messages[0][1],'https://kkeep.fun');
  assert.deepEqual(h.requests,[]);
  h.canvas.clientWidth=820;h.canvas.clientHeight=1060;h.canvas.width=675;h.canvas.height=873;
  h.request();
  assert.deepEqual(h.response().canvas,{cssWidth:820,cssHeight:1060,width:675,height:873});
});

test('only the exact numeric native startup line is retained; unrelated or private output is discarded',()=>{
  const h=harness(),record=h.scope.__kkeepRuntime.engineOutput;
  for(const line of [null,{},'private session https://example.invalid/?ticket=secret',
    'Canvas: 1180x734 CSS, 974x606 backing (effective dpr=0.83, raw=0.83) token=secret',
    'Canvas: 1180x734 CSS, 974x606 backing (effective dpr=NaN, raw=0.83)',
    'Canvas: 32769x734 CSS, 974x606 backing (effective dpr=0.83, raw=0.83)',
    'Canvas: 1180x734 CSS, 974x606 backing (effective dpr=0, raw=0.83)',
    'Canvas: 1180x734 CSS, 974x606 backing (effective dpr=0.83, raw=17.00)']) record(line);
  h.request();assert.equal(h.response().startup,null);
  record('Canvas: 1180x734 CSS, 974x606 backing (effective dpr=0.83, raw=0.83)');
  h.request();
  assert.deepEqual(h.response().startup,{cssWidth:1180,cssHeight:734,width:974,height:606,effectiveDpr:0.83,rawDpr:0.83});
  record('Canvas: 820x1060 CSS, 675x873 backing (effective dpr=0.82, raw=0.82)');
  h.request();assert.equal(h.response().startup.cssWidth,1180,'keep the initial native size distinct from current dimensions');
  assert.equal(JSON.stringify(h.messages).includes('secret'),false);
  assert.deepEqual(h.requests,[]);
});

test('an actual zero-size native report stays distinct from no startup report',()=>{
  const h=harness();
  h.scope.__kkeepRuntime.engineOutput('Canvas: 0x0 CSS, 0x0 backing (effective dpr=1.00, raw=1.00)');
  h.request();
  assert.deepEqual(h.response().startup,{cssWidth:0,cssHeight:0,width:0,height:0,effectiveDpr:1,rawDpr:1});
});

test('only exact registered native lifecycle messages become fixed local enums',()=>{
  const h=harness(),record=h.scope.__kkeepRuntime.engineOutput;
  for(const line of ['[LIFECYCLE] joinGameSucceeded secret','[LIFECYCLE] defaultLoadingScreenRemoved 123',
    'prefix [LIFECYCLE] joinGameSucceeded','constructor','__proto__']) record(line);
  h.request();assert.equal(h.response().lifecycle,null);
  for(const [line,event] of [['[LIFECYCLE] joinGameSucceeded','join-reported'],
    ['[LIFECYCLE] ugcGameLuaWillStart','scripts-starting'],['[LIFECYCLE] ugcGameWillClose','game-closed']]){
    record(line);h.request();assert.equal(h.response().lifecycle,event);
  }
  assert.equal(JSON.stringify(h.messages).includes('secret'),false);
  assert.deepEqual(h.requests,[]);
});

test('view requests reject untrusted origins, nested senders and other messages',()=>{
  const h=harness();
  for(const input of [{origin:'https://example.invalid'},{origin:'https://kkeep.fun.evil.invalid'},
    {origin:'null'},{source:{}},{source:h.scope},{data:{type:'other'}},{data:null}]) h.request(input);
  assert.equal(h.messages.length,0);
  h.request({origin:'https://kkeep.kha971.chatgpt.site'});
  assert.equal(h.messages.length,1);
  assert.equal(h.messages[0][1],'https://kkeep.kha971.chatgpt.site');
});

test('invalid or absent canvas sizes stay unavailable; the check cannot throw into game code',()=>{
  const h=harness();
  for(const value of [-1,32769,NaN,Infinity,'1180',1.5]){
    h.canvas.clientWidth=value;h.request();assert.equal(h.response().canvas,null);
  }
  h.scope.document.getElementById=()=>null;h.request();assert.equal(h.response().canvas,null);
  h.scope.document.getElementById=()=>{throw new Error('unavailable');};
  assert.doesNotThrow(()=>h.request());
  assert.deepEqual(h.requests,[]);
});
