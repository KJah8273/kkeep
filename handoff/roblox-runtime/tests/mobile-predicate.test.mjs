import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {runtimeBootstrap} from '../worker/runtime.js';
import {transformText} from '../worker/gateway.js';

const origin='https://runtime.example';
const path='/_/c2V0dXAucmJ4Y2RuLmNvbQ/webclient/version-1ef59424f70d4932-RobloxWebClient/WasmPlayer.js';
const original=readFileSync(new URL('./fixtures/WasmPlayer-1ef.js',import.meta.url),'utf8');
const patched=transformText(original,path,origin);
const engine=readFileSync(new URL('./fixtures/WebClient-1ef.js',import.meta.url),'utf8');
const mobileExpression=runtimeBootstrap.toString().match(/const mobile = ([^;]+);/)?.[1];
const nativePredicate=engine.match(/function fa\(\)\{[^}]+\}/)?.[0];
const ipad={userAgent:'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) Version/27.2 Safari/605.1.15',platform:'MacIntel',maxTouchPoints:5};

function classify(source,navigator,{runtime=true,ratio=0.7,query=''}={}){
  const start=source.indexOf('let R='),end=source.indexOf(';let O=',start);
  assert.ok(start>=0&&end>start);
  assert.ok(mobileExpression&&nativePredicate&&engine.includes('is_mobile_browser:fa'));
  const scope=vm.createContext({navigator,URLSearchParams,location:new URL(origin+'/games/start?'+query),devicePixelRatio:ratio,s:{}});
  scope.window=scope;
  if(runtime)vm.runInContext('window.__kkeepRuntime={mobile:('+mobileExpression+')};',scope);
  // Execute the inspected loader's actual DPR/mobile callbacks and the exact
  // native is_mobile_browser import, rather than a rewritten test predicate.
  vm.runInContext(source.slice(start,end)+';var f=s;'+nativePredicate,scope);
  const pretend=source.match(/function _e\(\)\{[^}]+\}/)?.[0];
  assert.ok(pretend);vm.runInContext(pretend,scope);
  return {nativeMobile:scope.fa(),moduleMobile:scope.s.isMobileDevice(),pretendMobile:scope._e(),ratio:scope.s.getEffectiveDevicePixelRatio()};
}

test('desktop-UA iPad uses the same mobile classification for the native engine and loader',()=>{
  const before=classify(original,ipad);
  assert.equal(before.nativeMobile,false,'the original loader loses Safari iPad classification');
  const after=classify(patched,ipad);
  assert.equal(after.nativeMobile,true);
  assert.equal(after.moduleMobile,true);
  assert.equal(after.pretendMobile,true);
  assert.equal(after.ratio,0.7,'the existing mobile drawing budget is not enlarged');
});

test('desktop and touch-device classifications preserve desktop sizing and explicit renderScale',()=>{
  for(const navigator of [
    {...ipad,maxTouchPoints:0},
    {userAgent:'Mozilla/5.0 (Windows NT 10.0) Chrome/130.0',platform:'Win32',maxTouchPoints:0},
  ]){
    assert.deepEqual(classify(patched,navigator,{ratio:2}),classify(original,navigator,{ratio:2}));
    assert.equal(classify(patched,navigator,{ratio:2}).nativeMobile,false);
  }
  for(const navigator of [
    ipad,
    {userAgent:'Mozilla/5.0 (iPad; CPU OS 27_2 like Mac OS X)',platform:'iPad',maxTouchPoints:5},
    {userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 27_2) Mobile',platform:'iPhone',maxTouchPoints:5},
    {userAgent:'Mozilla/5.0 (Linux; Android 16) Mobile',platform:'Linux',maxTouchPoints:5},
  ]){
    assert.equal(classify(patched,navigator).nativeMobile,true);
    for(const ratio of [0.7,1,1.5,2,3]){
      assert.equal(classify(patched,navigator,{ratio}).ratio,classify(original,navigator,{ratio}).ratio,
        'native mobile classification must not change the original DPR policy or full-resolution choice');
    }
    assert.equal(classify(patched,navigator,{ratio:2,query:'renderScale=0.5'}).ratio,1);
  }
});

test('without runtime classification the original client-hints and UA fallbacks remain intact',()=>{
  for(const navigator of [ipad,{...ipad,userAgentData:{mobile:true}}, {...ipad,userAgentData:{mobile:false}},
    {userAgent:'Android Mobile',platform:'Linux',maxTouchPoints:5}]){
    assert.deepEqual(classify(patched,navigator,{runtime:false,ratio:2}),classify(original,navigator,{runtime:false,ratio:2}));
  }
});

test('an unrecognized or duplicate inspected native mobile callback fails closed',()=>{
  const marker='s.isMobileDevice=()=>R';
  assert.equal(original.split(marker).length,2);
  for(const source of [original.replace(marker,'s.isMobileDevice=()=>false'),original+marker]){
    assert.throws(()=>transformText(source,path,origin),/Engine mobile classification changed/);
  }
});
