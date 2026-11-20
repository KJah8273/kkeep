import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {transformText} from '../worker/gateway.js';

const origin='https://runtime.example';
const path='/_/c2V0dXAucmJ4Y2RuLmNvbQ/webclient/version-1ef59424f70d4932-RobloxWebClient/WasmPlayer.js';
const source=readFileSync(new URL('./fixtures/WasmPlayer-1ef.js',import.meta.url),'utf8');
const defaults={robloxLocaleId:'',gameLocaleId:''};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const plain=value=>JSON.parse(JSON.stringify(value));
const successful=()=>({ok:true,json:async()=>({
  generalExperience:{locale:' en-us '},ugc:{locale:' ar-sa '}
})});
function deferred(){
  let resolve,reject;
  const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});
  return{promise,resolve,reject};
}

// Run the actual locale implementation, actual startup Promise.all, actual
// Rt call and actual Rt wrapper. Only the network and native Je are stand-ins.
// This verifies that an optional stalled locale can no longer block Je once
// flags and the filesystem index are available.
function harness({patched=true,locale=successful,proxy,PromiseClass=Promise,
  Controller=AbortController}={}){
  const code=patched?transformText(source,path,origin):source;
  const localeStart=code.indexOf('var vt="/v1/locales/');
  const localeEnd=code.indexOf('function Et(',localeStart);
  const gateStart=code.indexOf('let ce=Pt(a,p),[T,S,s]=await Promise.all(');
  const gateEnd=code.indexOf('if(b&&Object.assign(',gateStart);
  const rtStart=code.indexOf('async function Rt(e){');
  const rtEnd=code.indexOf('(async()=>{let e=await xt()',rtStart);
  const launchStart=code.indexOf('if(m){let c=await Rt(',gateEnd);
  const launchEnd=code.indexOf(';window.opener',launchStart);
  assert.ok(localeStart>0&&localeEnd>localeStart&&gateStart>0&&gateEnd>gateStart);
  assert.ok(rtStart>0&&rtEnd>rtStart&&launchStart>gateEnd&&launchEnd>launchStart);
  const requests=[],timers=new Map(),starts=[],logs=[],flags={applicationSettings:{kept:'value'}};
  let clock=0,nextTimer=0;
  const context=vm.createContext({
    URL,Uint8Array,Promise:PromiseClass,AbortController:Controller,
    a:'www.roblox.com',p:proxy,k:Promise.resolve(flags),
    y:{id:'canvas'},te:origin,A:'',P:!!proxy,m:123,h:'',
    ee:()=>origin+'/WebClient.fsindex.txt',
    console:{log:(...args)=>logs.push(args),warn:(...args)=>logs.push(args)},
    setTimeout(fn,ms){const id=++nextTimer;timers.set(id,{fn,at:clock+ms,ms});return id;},
    clearTimeout:id=>timers.delete(id),
    fetch:async(url,options)=>{
      requests.push({url,options});
      if(String(url).endsWith('/WebClient.fsindex.txt')){
        return{ok:true,arrayBuffer:async()=>Uint8Array.of(1,2,3).buffer};
      }
      return locale(url,options);
    },
    Je:async(...args)=>{
      starts.push(args);
      context.__resolveGameExit({reason:'join_failed'});
      return{};
    }
  });
  context.window=context;
  const promise=vm.runInContext(code.slice(localeStart,localeEnd)+'\n'+code.slice(rtStart,rtEnd)+
    '\n(async()=>{'+code.slice(gateStart,gateEnd)+code.slice(launchStart+'if(m){'.length,launchEnd)+
    ';return{locales:s,flags:T,assetIndex:S,exit:c};})()',context);
  return{context,requests,timers,starts,logs,flags,promise,
    async advance(ms){
      clock+=ms;
      for(;;){
        const due=[...timers].filter(([,timer])=>timer.at<=clock).sort((a,b)=>a[1].at-b[1].at)[0];
        if(!due)break;
        timers.delete(due[0]);due[1].fn();await tick();
      }
      await tick();
    }
  };
}

test('the actual unpatched startup remains blocked by a stalled optional locale response or JSON body',async()=>{
  for(const locale of [()=>new Promise(()=>{}),()=>({ok:true,json:()=>new Promise(()=>{})})]){
    const h=harness({patched:false,locale});
    await tick();
    assert.equal(h.requests.length,2);
    assert.equal(h.starts.length,0);
    assert.equal(h.timers.size,0);
    assert.equal(h.requests[0].options.signal,undefined);
  }
});

test('successful locale values and the original credential and proxy routing survive the exact player transform',async()=>{
  for(const proxied of [false,true]){
    const headers={'Roblox-Channel-Token':'synthetic-channel-token'},routed=[];
    const proxy=proxied?{
      url:url=>{routed.push(url);return origin+'/locale-proxy';},
      authHeaders:()=>headers
    }:undefined;
    const h=harness({proxy});
    const result=await h.promise;
    assert.deepEqual(plain(result.locales),{robloxLocaleId:'en-us',gameLocaleId:'ar-sa'});
    assert.equal(result.flags,h.flags);
    assert.deepEqual([...result.assetIndex],[1,2,3]);
    assert.equal(h.starts.length,1);
    assert.equal(h.starts[0][4],result.locales);
    assert.equal(h.timers.size,0);
    assert.equal(h.requests.length,2,'one locale lookup and one existing index lookup; no retry');
    const request=h.requests[0];
    const target='https://locale.roblox.com/v1/locales/user-localization-locus-supported-locales';
    assert.equal(request.url,proxied?origin+'/locale-proxy':target);
    assert.equal(request.options.credentials,'include');
    assert.equal(request.options.headers,proxied?headers:undefined);
    assert.equal(request.options.signal.aborted,false);
    assert.deepEqual(Object.keys(request.options).sort(),proxied?['credentials','headers','signal']:['credentials','signal']);
    assert.deepEqual(routed,proxied?[target]:[]);
  }
});

test('the 12-second deadline covers both pending headers and a stalled JSON body before native startup',async()=>{
  for(const bodyStalls of [false,true]){
    let jsonCalls=0;
    const h=harness({locale:()=>bodyStalls?{ok:true,json:()=>{jsonCalls++;return new Promise(()=>{});}}:new Promise(()=>{})});
    await tick();
    assert.equal(h.starts.length,0);
    assert.equal(h.timers.size,1);
    assert.equal([...h.timers.values()][0].ms,12000);
    assert.equal(jsonCalls,bodyStalls?1:0);
    await h.advance(11999);
    assert.equal(h.starts.length,0);
    assert.equal(h.requests[0].options.signal.aborted,false);
    await h.advance(1);
    const result=await h.promise;
    assert.deepEqual(plain(result.locales),defaults);
    assert.equal(h.requests[0].options.signal.aborted,true);
    assert.equal(h.starts.length,1);
    assert.equal(h.requests.length,2);
    assert.equal(h.timers.size,0);
  }
});

test('the deadline rejects before abort can synchronously settle the pending request',async()=>{
  const order=[],pending=deferred();
  class OrderedPromise extends Promise{
    constructor(executor){
      super((resolve,reject)=>executor(resolve,error=>{
        if(error?.message==='Optional locale lookup timed out')order.push('reject');
        reject(error);
      }));
    }
  }
  class Controller extends AbortController{
    abort(){order.push('abort');super.abort();}
  }
  const h=harness({PromiseClass:OrderedPromise,Controller,locale:(_,options)=>{
    options.signal.addEventListener('abort',()=>pending.resolve(successful()),{once:true});
    return pending.promise;
  }});
  await tick();await h.advance(12000);
  assert.deepEqual(order.slice(0,2),['reject','abort']);
  assert.deepEqual(plain((await h.promise).locales),defaults);
  assert.equal(h.starts.length,1);
  assert.equal(h.timers.size,0);
});

test('receiving headers does not restart the total 12-second locale deadline',async()=>{
  const headers=deferred();
  const h=harness({locale:()=>headers.promise});
  await tick();await h.advance(8000);
  headers.resolve({ok:true,json:()=>new Promise(()=>{})});
  await tick();await h.advance(3999);
  assert.equal(h.starts.length,0);
  assert.equal(h.requests[0].options.signal.aborted,false);
  await h.advance(1);
  assert.deepEqual(plain((await h.promise).locales),defaults);
  assert.equal(h.starts.length,1);
  assert.equal(h.requests[0].options.signal.aborted,true);
  assert.equal(h.timers.size,0);
});

test('late header and JSON completions cannot replace the fallback or start the engine again',async()=>{
  for(const bodyStalls of [false,true]){
    const pending=deferred();
    const h=harness({locale:()=>bodyStalls?{ok:true,json:()=>pending.promise}:pending.promise});
    await tick();await h.advance(12000);
    const result=await h.promise;
    assert.deepEqual(plain(result.locales),defaults);
    pending.resolve(bodyStalls?{generalExperience:{locale:'late'},ugc:{locale:'late'}}:successful());
    await tick();
    assert.deepEqual(plain(result.locales),defaults);
    assert.equal(h.starts.length,1);
    assert.equal(h.requests.length,2);
    assert.equal(h.timers.size,0);
  }
});

test('existing locale failures still use their immediate defaults and clear the deadline',async()=>{
  for(const locale of [
    ()=>({ok:false,status:401}),
    ()=>({ok:false,status:503}),
    ()=>Promise.reject(new TypeError('synthetic network failure')),
    ()=>({ok:true,json:()=>Promise.reject(new SyntaxError('synthetic malformed JSON'))}),
    ()=>({ok:true,json:async()=>({generalExperience:{locale:' '}})})
  ]){
    const h=harness({locale});
    const result=await h.promise;
    assert.deepEqual(plain(result.locales),defaults);
    assert.equal(h.starts.length,1);
    assert.equal(h.requests.length,2);
    assert.equal(h.requests[0].options.signal.aborted,false);
    assert.equal(h.timers.size,0);
  }
});

test('locale patch requires the exact inspected request contract and leaves unknown builds unchanged',()=>{
  const original='async function Pt(e,t){let n=yt(e),o=t?t.url(n):n;try{let r=await fetch(o,{credentials:"include",...t?{headers:t.authHeaders()}:{}});';
  assert.throws(()=>transformText(source.replace(original,original.replace('credentials:"include"','credentials:"same-origin"')),path,origin),
    /Engine optional locale lookup changed/);
  const start=source.indexOf('async function Pt(e,t){'),end=source.indexOf('function Et(',start);
  assert.ok(start>0&&end>start);
  assert.throws(()=>transformText(source+'\n'+source.slice(start,end),path,origin),/Engine optional locale lookup changed/);
  const unknown=path.replace('1ef59424f70d4932','0000000000000000');
  assert.equal(transformText(source,unknown,origin),source.replaceAll('https://api.spf50krem.com',origin));
  assert.doesNotThrow(()=>new vm.Script(transformText(source,path,origin)));
});
