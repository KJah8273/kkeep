import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {engineProfiles,resolvePublicEngine} from '../worker/engine.js';
import {engineCheckBootstrap,checkPage} from '../worker/check.js';

const current='version-1ef59424f70d4932';
const binary=version=>'/_/c2V0dXAucmJ4Y2RuLmNvbQ/webclient/'+version+'-RobloxWebClient/WebClient.wasm';
const metadata=version=>({version,files:[binary(version)]});
function harness({version=current,fetch:fetcher,isolated=true,imports}={}) {
  const nodes={results:{textContent:''},run:{disabled:false},status:{textContent:''}};
  const requests=[],memories=[],links=[],timers=new Map();
  let next=0,compiled=0;
  const scope={
    document:{getElementById:id=>nodes[id]},isSecureContext:true,crossOriginIsolated:isolated,
    SharedArrayBuffer,AbortController,sessionStorage:{getItem:()=>null},
    setTimeout(fn,delay){const id=++next;timers.set(id,{fn,delay});return id;},clearTimeout:id=>timers.delete(id),
    fetch:async(url,options)=>{requests.push({url,options});return fetcher?fetcher(url,options):url==='/_rbx/engine'?Response.json(metadata(version)):new Response('wasm');},
    WebAssembly:{
      Suspending:class{},promising:()=>{},
      compileStreaming:async()=>{compiled++;return {};},
      Module:{imports:()=>imports||[{module:'env',name:'memory',kind:'memory'},{module:'env',name:'read',kind:'function'}]},
      Memory:class{constructor(descriptor){memories.push(descriptor);}},
      instantiate:async(module,values)=>{links.push(values);return {};}
    }
  };
  engineCheckBootstrap(scope,engineProfiles,resolvePublicEngine);
  return {scope,nodes,requests,memories,links,timers,get compiled(){return compiled;},expire(delay){for(const [id,timer] of timers)if(timer.delay===delay){timers.delete(id);timer.fn();}}};
}

test('startup check resolves and links the current metadata version rather than an old pinned binary',async()=>{
  const h=harness();await h.nodes.run.onclick();
  assert.deepEqual(h.requests.map(r=>r.url),['/_rbx/engine',binary(current)]);
  assert.ok(h.requests.every(r=>r.options.credentials==='omit'));
  assert.equal(h.requests[0].options.cache,'no-store');
  assert.equal(h.compiled,1);assert.equal(h.links.length,1);
  assert.deepEqual(h.memories,[{initial:16384,maximum:16384,shared:true}]);
  assert.equal(typeof h.links[0].env.read,'function');
  assert.ok(h.nodes.results.textContent.includes('Current engine: '+current));
  assert.ok(h.nodes.status.textContent.startsWith('Startup check passed for '+current));
  assert.ok(h.nodes.status.textContent.includes('does not test gameplay'));
  assert.equal(h.nodes.run.disabled,false);assert.equal(h.timers.size,0);
});

test('an unknown engine can be compiled without inheriting a verified upload memory override or startup success',async()=>{
  const version='version-0000000000000001',h=harness({version});
  await h.nodes.run.onclick();
  assert.equal(h.requests[1].url,binary(version));assert.equal(h.compiled,1);
  assert.equal(h.memories.length,0);assert.equal(h.links.length,0);
  assert.ok(h.nodes.status.textContent.includes('memory layout has not been verified'));
  assert.ok(!h.nodes.status.textContent.includes('check passed'));
});

test('metadata must identify the canonical public binary and cannot redirect checks to arbitrary URLs',async()=>{
  for(const value of [null,{},metadata('../bad'),{version:current,files:['https://external.example/engine.wasm']},{version:current,files:['/_rbx/api/session']},{version:current,files:[binary('version-0000000000000001')]}]){
    assert.equal(resolvePublicEngine(value),null);
    const h=harness({fetch:async()=>Response.json(value)});await h.nodes.run.onclick();
    assert.equal(h.requests.length,1);assert.equal(h.compiled,0);
    assert.ok(h.nodes.status.textContent.startsWith('Startup check failed:'));
  }
});

test('download errors and changed import types cannot be reported as a successful startup',async()=>{
  const denied=harness({fetch:async url=>url==='/_rbx/engine'?Response.json(metadata(current)):new Response('denied',{status:403})});
  await denied.nodes.run.onclick();assert.ok(denied.nodes.status.textContent.includes('HTTP 403'));
  assert.equal(denied.compiled,0);assert.equal(denied.links.length,0);assert.equal(denied.timers.size,0);
  const changed=harness({imports:[{module:'env',name:'table',kind:'table'}]});
  await changed.nodes.run.onclick();assert.ok(changed.nodes.status.textContent.includes('import format changed: table'));
  assert.equal(changed.links.length,0);
});

test('missing isolation skips the large engine download and leaves the check available',async()=>{
  const h=harness({isolated:false});await h.nodes.run.onclick();
  assert.equal(h.requests.length,0);assert.equal(h.nodes.run.disabled,false);
  assert.ok(h.nodes.status.textContent.includes('required browser feature is missing'));
});

test('a stalled metadata lookup times out, aborts, and cannot start a late engine download',async()=>{
  let finish;
  const h=harness({fetch:()=>new Promise(resolve=>{finish=resolve;})});
  const pending=h.nodes.run.onclick();h.expire(15000);await pending;
  assert.equal(h.requests[0].options.signal.aborted,true);
  assert.ok(h.nodes.status.textContent.includes('timed out'));
  assert.equal(h.nodes.run.disabled,false);assert.equal(h.timers.size,0);
  finish(Response.json(metadata(current)));await Promise.resolve();await Promise.resolve();
  assert.equal(h.requests.length,1);assert.equal(h.links.length,0);
});

test('the served check includes a complete runnable bootstrap and shared metadata validation',()=>{
  const h=harness();
  const script=/<script>([\s\S]*?)<\/script>/.exec(checkPage)?.[1];
  assert.ok(script);vm.runInNewContext(script,{window:h.scope,AbortController,Promise,Error});
  assert.equal(typeof h.nodes.run.onclick,'function');
  assert.ok(h.nodes.results.textContent.includes('isolation: ready'));
});
