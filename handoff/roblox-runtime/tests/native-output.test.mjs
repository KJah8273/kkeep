import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {transformText} from '../worker/gateway.js';
import {runtimeBootstrap} from '../worker/runtime.js';

const origin='https://runtime.example';
const path='/_/c2V0dXAucmJ4Y2RuLmNvbQ/webclient/version-1ef59424f70d4932-RobloxWebClient/WebClient.js';
const source=readFileSync(new URL('./fixtures/WebClient-1ef.js',import.meta.url),'utf8');
const canvasLine='Canvas: 1440x895 CSS, 1298x807 backing (effective dpr=0.90, raw=0.90)';

function harness({patched=true}={}) {
  const code=patched?transformText(source,path,origin):source;
  // These native printf messages use this import, not Module.print. Execute
  // the actual bridge and runtime parser; only the UTF-8 memory read is stubbed.
  assert.ok(code.includes('emscripten_console_log:Is,'));
  const start=code.indexOf('function Is(e){'),end=code.indexOf('function Ds(e){',start);
  assert.ok(start>=0&&end>start);
  const handlers=new Map(),messages=[],requests=[],logs=[],forwarded=[];
  const parent={postMessage:(...args)=>messages.push(args)};
  let currentLine;
  const scope={navigator:{userAgent:'Safari',platform:'MacIntel',maxTouchPoints:5},
    parent,crossOriginIsolated:true,SharedArrayBuffer,
    WebAssembly:{Memory:class{},Suspending(){},promising(){},instantiate:async()=>({})},
    document:{getElementById:()=>({clientWidth:1440,clientHeight:895,width:1299,height:807})},
    addEventListener:(type,callback)=>{const list=handlers.get(type)||[];list.push(callback);handlers.set(type,list);},
    fetch:(...args)=>{requests.push(args);return Promise.resolve();},
    console:{log:(...args)=>logs.push(args),error(){}},setTimeout,clearTimeout,
    T:pointer=>{assert.equal(pointer,0xffffffff,'preserve the native unsigned pointer conversion');return currentLine;},
  };
  scope.window=scope;
  vm.createContext(scope);
  vm.runInContext('('+runtimeBootstrap.toString()+')()',scope);
  messages.length=0;
  const record=scope.__kkeepRuntime.engineOutput;
  scope.__kkeepRuntime.engineOutput=line=>{forwarded.push(line);record(line);};
  vm.runInContext(code.slice(start,end),scope);
  return {scope,logs,forwarded,requests,messages,
    emit(line){currentLine=line;return scope.Is(-1);},
    snapshot(){
      for(const callback of handlers.get('message')||[])callback({source:parent,origin:'https://kkeep.fun',data:{type:'kkeep:roblox-view-request'}});
      return JSON.parse(JSON.stringify(messages.at(-1)[0]));
    },
  };
}

test('the actual original native console bridge bypasses the player print diagnostic',()=>{
  const h=harness({patched:false});
  h.emit(canvasLine+'\n');h.emit('[LIFECYCLE] joinGameSucceeded\n');
  assert.deepEqual(h.logs,[[canvasLine+'\n'],['[LIFECYCLE] joinGameSucceeded\n']]);
  assert.deepEqual(h.forwarded,[]);
  const snapshot=h.snapshot();
  assert.equal(snapshot.startup,null);assert.equal(snapshot.lifecycle,null);
});

test('the actual native import forwards bounded view and lifecycle records with its native line ending',()=>{
  for(const ending of ['', '\n', '\r\n']){
    const h=harness();
    assert.equal(h.emit(canvasLine+ending),undefined);
    const snapshot=h.snapshot();
    assert.deepEqual(snapshot.startup,{cssWidth:1440,cssHeight:895,width:1298,height:807,effectiveDpr:0.9,rawDpr:0.9});
    assert.deepEqual(snapshot.canvas,{cssWidth:1440,cssHeight:895,width:1299,height:807});
    for(const [line,event] of [['[LIFECYCLE] joinGameSucceeded','join-reported'],
      ['[LIFECYCLE] ugcGameLuaWillStart','scripts-starting'],['[LIFECYCLE] ugcGameWillClose','game-closed']]){
      h.emit(line+ending);
      assert.equal(h.snapshot().lifecycle,event);
    }
    assert.deepEqual(h.forwarded,[canvasLine,'[LIFECYCLE] joinGameSucceeded','[LIFECYCLE] ugcGameLuaWillStart','[LIFECYCLE] ugcGameWillClose']);
    assert.deepEqual(h.logs,h.forwarded.map(line=>[line+ending]),'console keeps the original string and line ending');
    assert.deepEqual(h.requests,[],'native diagnostics make no request');
    assert.ok(h.messages.every(([,target])=>target==='https://kkeep.fun'));
  }
});

test('the actual native import does not forward unrelated, malformed, multiline, or out-of-range output',()=>{
  const h=harness();
  const rejected=['account=private https://example.invalid/?ticket=secret',
    '[LIFECYCLE] joinGameSucceeded secret','prefix [LIFECYCLE] joinGameSucceeded',
    '[LIFECYCLE] defaultLoadingScreenRemoved','[LIFECYCLE] joinGameSucceeded\r',
    '[LIFECYCLE] joinGameSucceeded\n\n','[LIFECYCLE] joinGameSucceeded\r\n\r\n',
    canvasLine+' private',canvasLine+'\naccount=private',canvasLine+'\n\n',canvasLine+'\r',
    canvasLine.replace('1440x895','32769x895'),canvasLine.replace('dpr=0.90','dpr=0.00'),
    canvasLine.replace('raw=0.90','raw=17.00'),canvasLine.replace('raw=0.90','raw=NaN'),
    'Canvas: '+'1'.repeat(210),null,undefined,42,{}];
  for(const line of rejected)h.emit(line);
  assert.deepEqual(h.logs,rejected.map(line=>[line]),'unrelated console behavior stays intact');
  assert.deepEqual(h.forwarded,[]);
  const snapshot=h.snapshot();assert.equal(snapshot.startup,null);assert.equal(snapshot.lifecycle,null);
  assert.equal(JSON.stringify(h.messages).includes('secret'),false);
  assert.deepEqual(h.requests,[]);
});

test('missing or broken optional diagnostics cannot interrupt the native console import',()=>{
  const h=harness();
  h.scope.__kkeepRuntime.engineOutput=()=>{throw new Error('diagnostic unavailable');};
  assert.doesNotThrow(()=>h.emit(canvasLine+'\n'));
  delete h.scope.__kkeepRuntime;
  assert.doesNotThrow(()=>h.emit('[LIFECYCLE] joinGameSucceeded\n'));
  Object.defineProperty(h.scope,'__kkeepRuntime',{get(){throw new Error('diagnostic unavailable');}});
  assert.doesNotThrow(()=>h.emit('[LIFECYCLE] ugcGameWillClose\n'));
  assert.deepEqual(h.logs,[[canvasLine+'\n'],['[LIFECYCLE] joinGameSucceeded\n'],['[LIFECYCLE] ugcGameWillClose\n']]);
  assert.deepEqual(h.requests,[]);
});

test('the native console transform rejects a changed or duplicate import and leaves unknown builds alone',()=>{
  const bridge='function Is(e){e>>>=0,console.log(T(e))}';
  assert.throws(()=>transformText(source.replace(bridge,'function Is(e){console.info(T(e))}'),path,origin),/Engine native console handling changed/);
  assert.throws(()=>transformText(source+'\n'+bridge,path,origin),/Engine native console handling changed/);
  const unknown=path.replace('1ef59424f70d4932','0000000000000000');
  assert.equal(transformText(source,unknown,origin),source.replaceAll('https://api.spf50krem.com',origin));
});
