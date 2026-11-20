import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {transformText} from '../worker/gateway.js';

const origin='https://runtime.example';
const hook=readFileSync(new URL('./fixtures/hook.js',import.meta.url),'utf8');
const stubPath='/277b9a60aa4d6118e89b19fbc8ca6f1e4e5eb81a/assets/webclient/stub.js';
const stub=readFileSync(new URL('./fixtures/stub.js',import.meta.url),'utf8');
const engine=origin+'/_/c2V0dXAucmJ4Y2RuLmNvbQ/webclient/version-1ef59424f70d4932-RobloxWebClient/WebClient.js?channel=fixture%2Bencoded&part=one';
const patched=transformText(hook,'/hook.js',origin);
const patchedStub=transformText(stub,stubPath,origin);
const tick=()=>new Promise(resolve=>setImmediate(resolve));

function environment(href,{storage='missing',page=false,navigator}={}){
  const workers=[],blobs=new Map(),sockets=[],native=[],imports=[],timers=new Map(),stored=[],values=new Map();let timerId=0;
  const completeRequest=result=>{const request={result};queueMicrotask(()=>request.onsuccess?.());return request;};
  class Worker {
    constructor(url,options){this.url=url;this.options=options;workers.push(this);}
    addEventListener(){}
  }
  class BlobURL extends URL {
    static createObjectURL(blob){const url='blob:'+origin+'/'+blobs.size;blobs.set(url,blob);return url;}
  }
  class Socket {
    constructor(url){this.url=url;this.readyState=1;this.listeners=new Map();sockets.push(this);}
    addEventListener(type,callback){const all=this.listeners.get(type)||[];all.push(callback);this.listeners.set(type,all);}
    send(){}
    close(){this.readyState=3;for(const fn of this.listeners.get('close')||[])fn();this.onclose?.();}
  }
  class NativeTransport {
    constructor(url,options){this.url=url;this.options=options;native.push(this);this.ready=Promise.resolve();this.closed=new Promise(resolve=>{this.finish=resolve;});}
    close(){this.finish({});}
  }
  const context=vm.createContext({URL:BlobURL,URLSearchParams,Blob,Request,Response,Headers,DOMException,
    TextEncoder,TextDecoder,ReadableStream,WritableStream,MessageChannel,ArrayBuffer,Uint8Array,DataView,
    btoa,atob,setTimeout:(fn,ms)=>{timers.set(++timerId,{fn,ms});return timerId;},clearTimeout:id=>timers.delete(id),setInterval:()=>1,clearInterval(){},performance,
    location:new URL(href),fetch:async()=>new Response(''),importScripts:(...urls)=>imports.push(...urls),
    console:{log(){},warn(){},error(){}},WebTransport:NativeTransport,WebSocket:Socket,
    ...(navigator?{navigator}:{}),
    ...(page?{Worker,document:{},sessionStorage:{getItem:()=>null}}:{}),
    ...(storage==='missing'?{}:{indexedDB:{open(){
      if(storage==='throws')throw new Error('Storage unavailable');
      if(storage!=='recording')return {};
      return completeRequest({transaction(){return{objectStore(){return{
        get:key=>completeRequest(values.get(key)),
        put(value,key){const copy=JSON.parse(JSON.stringify(value));stored.push({key,value:copy});values.set(key,copy);return completeRequest(key);},
      };}};}});
    }}})
  });
  context.self=context;
  return {context,workers,blobs,sockets,native,imports,timers,stored};
}

function page(query,{navigator,storage='throws'}={}){
  const env=environment(origin+'/games/start?placeId=123'+query,{page:true,storage,navigator});
  const start=patched.indexOf('function install(scope, origin) {');
  const end=patched.indexOf('  const reroute = install(globalThis, PROXY_ORIGIN);',start);
  const wrapperStart=patched.indexOf('  const NativeWorker = globalThis.Worker;');
  const wrapperEnd=patched.lastIndexOf('\n})();');
  assert.ok(start>=0&&end>start&&wrapperStart>end&&wrapperEnd>wrapperStart);
  // Execute the actual provider install and Worker constructor; generated blob
  // code below comes from this constructor, never a test-built substitute.
  vm.runInContext('const PROXY_ORIGIN='+JSON.stringify(origin)+';\n'+patched.slice(start,end)+
    '\nconst reroute=install(globalThis,PROXY_ORIGIN);\n'+patched.slice(wrapperStart,wrapperEnd),env.context);
  return env;
}

async function expectRelay(env,{immediate=true,timeoutDb=false}={}){
  const url='https://game.example:444/session?ticket=fixture';
  const options={serverCertificateHashes:[{algorithm:'sha-256',value:new Uint8Array([1,2,3])}]};
  const transport=new env.context.WebTransport(url,options);
  try{
    if(!immediate){
      await tick();
      if(timeoutDb){
        assert.equal(env.sockets.length,0);assert.equal(env.native.length,0);
        const deadline=[...env.timers.values()].find(timer=>timer.ms===750);assert.ok(deadline);deadline.fn();await tick();
      }
    }
    // The socket must be created synchronously even if IndexedDB never answers.
    assert.equal(env.sockets.length,1);
    assert.equal(env.native.length,0);
    const socket=env.sockets[0],target=new URL(socket.url);
    const decode=value=>atob(value.replace(/-/g,'+').replace(/_/g,'/'));
    assert.equal(target.origin,'wss://api.spf50krem.com');
    assert.equal(target.pathname,'/_rbx/wt');
    assert.equal(decode(target.searchParams.get('t')),'game.example:444');
    assert.equal(decode(target.searchParams.get('p')),'/session?ticket=fixture');
    assert.equal(target.searchParams.get('h'),'AQID');
    socket.onmessage({data:new Uint8Array([4]).buffer});
    await transport.ready;
    assert.equal(transport.how,'relay');
  }finally{transport.close();}
}

test('explicit relay choice survives the actual blob worker bootstrap with missing, denied or stalled storage',async()=>{
  const env=page('&wt=relay'),options={type:'classic',name:'engine-fixture',credentials:'same-origin'};
  new env.context.Worker(engine,options);
  assert.equal(env.workers.length,1);
  assert.equal(env.workers[0].options,options);
  const blob=env.blobs.get(env.workers[0].url);
  assert.ok(blob);
  const boot=await blob.text();
  for(const storage of ['missing','throws','stalled']){
    const worker=environment(env.workers[0].url,{storage});
    vm.runInContext(boot,worker.context);
    assert.equal(worker.context.__kkeepForceRelay,true);
    assert.deepEqual(worker.imports,[engine]);
    await expectRelay(worker);
  }
});

test('explicit relay choice reaches the actual direct stub without changing engine src or Worker options',async()=>{
  const env=page('&wt=relay'),options={type:'classic',name:'engine-fixture',credentials:'same-origin'};
  const url=origin+stubPath+'?src='+encodeURIComponent(engine)+'&other=keep%2Bvalue';
  new env.context.Worker(new URL(url),options);
  assert.equal(env.workers.length,1);
  const launched=env.workers[0],target=new URL(launched.url);
  assert.equal(env.blobs.size,0);
  assert.equal(launched.options,options);
  assert.equal(target.origin,origin);
  assert.equal(target.pathname,stubPath);
  assert.equal(target.searchParams.get('src'),engine);
  assert.equal(target.searchParams.get('other'),'keep+value');
  assert.deepEqual(target.searchParams.getAll('wt'),['relay']);
  for(const storage of ['missing','throws','stalled']){
    const worker=environment(target.href,{storage});
    vm.runInContext(patchedStub,worker.context);
    assert.equal(worker.context.__kkeepForceRelay,true);
    assert.deepEqual(worker.imports,[engine]);
    await expectRelay(worker);
  }
});

test('ordinary and invalid launch choices preserve native selection; valid native and auto choices reach owned workers',async()=>{
  for(const query of ['', '&wt=native','&wt=auto','&wt=RELAY','&wt=relay-unknown','&wt=relay&wt=native','&wt=relay&wt=relay']){
    const env=page(query),direct=new URL(origin+stubPath+'?src='+encodeURIComponent(engine));
    new env.context.Worker(direct);
    const choice=query==='&wt=native'?'native':query==='&wt=auto'?'auto':'';
    if(choice){
      const launched=new URL(env.workers[0].url);
      assert.equal(launched.searchParams.get('wt'),choice);assert.equal(launched.searchParams.get('src'),engine);
    }else assert.equal(env.workers[0].url,direct);
    new env.context.Worker(engine);
    const launch=env.workers[1],boot=await env.blobs.get(launch.url).text();
    const worker=environment(launch.url);
    vm.runInContext(boot,worker.context);
    assert.equal(worker.context.__kkeepForceRelay,false);
    assert.equal(worker.context.__kkeepPreferRelay,false);assert.equal(worker.context.__kkeepTransportChoice,choice);
    const transport=new worker.context.WebTransport('https://game.example/session');
    try{
      await tick();
      await transport.ready;
      assert.equal(transport.how,'native');
      assert.equal(worker.native.length,1);
      assert.equal(worker.sockets.length,0);
    }finally{transport.close();}
  }
});

test('worker forwarding requires the boolean choice and does not rewrite external direct workers',async()=>{
  const env=page('&wt=relay'),external='https://unrelated.example/stub.js?src=unchanged';
  new env.context.Worker(external);
  assert.equal(env.workers[0].url,external);
  env.context.__kkeepForceRelay='true';
  env.context.__kkeepPreferRelay='true';env.context.__kkeepTransportChoice='';
  const direct=origin+stubPath+'?src='+encodeURIComponent(engine);
  new env.context.Worker(direct);
  assert.equal(env.workers[1].url,direct);
  new env.context.Worker(engine);
  const launched=env.workers[2],boot=await env.blobs.get(launched.url).text();
  const worker=environment(launched.url);
  vm.runInContext(boot,worker.context);
  assert.equal(worker.context.__kkeepForceRelay,false);
  assert.equal(worker.context.__kkeepPreferRelay,false);
});

const ipad={userAgent:'Mozilla/5.0 (iPad; CPU OS 27_2 like Mac OS X) AppleWebKit/605.1.15 Version/27.2 Safari/605.1.15',platform:'iPad',maxTouchPoints:5};
const desktopIpad={userAgent:'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Version/27.2 Safari/605.1.15',platform:'MacIntel',maxTouchPoints:5};

test('actual provider query persistence rejects suffix and duplicate modes while preserving valid preference records',async()=>{
  for(const query of ['&wt=native-unknown','&wt=auto-unknown','&wt=relay-unknown','&wt=native&wt=relay','&wt=relay&wt=native','&wt=auto&wt=auto','&wt=NATIVE']){
    const env=page(query,{navigator:desktopIpad,storage:'recording'});await tick();
    assert.equal(env.context.__kkeepTransportChoice,'');
    assert.equal(env.context.__kkeepPreferRelay,true);
    assert.deepEqual(env.stored.filter(entry=>entry.key==='mode'),[],query+' must not write a forced override from the old prefix regex');
  }
  for(const choice of ['native','auto','relay']){
    const before=Date.now(),env=page('&wt='+choice,{navigator:desktopIpad,storage:'recording'});await tick();
    const records=env.stored.filter(entry=>entry.key==='mode');assert.equal(records.length,1);
    if(choice==='auto')assert.deepEqual(records[0].value,{mode:'auto'});
    else{
      assert.deepEqual(Object.keys(records[0].value).sort(),['at','forced','mode']);
      assert.equal(records[0].value.mode,choice);assert.equal(records[0].value.forced,true);
      assert.ok(records[0].value.at>=before&&records[0].value.at<=Date.now());
    }
    const worker=environment(origin+stubPath+'?src='+encodeURIComponent(engine)+'&wt='+choice,{storage:'recording'});
    vm.runInContext(patchedStub,worker.context);await tick();
    assert.deepEqual(worker.stored.filter(entry=>entry.key==='mode'),[],'a worker launch choice does not persist page preferences');
  }
});

test('changed or duplicate provider mode persistence contracts fail closed',()=>{
  const marker=String.raw`const m = scope.document && /[?&]wt=(auto|relay|native)\b/.exec(scope.location.search);`;
  assert.throws(()=>transformText(hook.replace(marker,marker.replace('scope.document','other.document')),'/hook.js',origin),/transport preference persistence changed/);
  assert.throws(()=>transformText(hook.replace(marker,marker+'\n'+marker),'/hook.js',origin),/transport preference persistence changed/);
});

test('iPad default reaches actual blob and direct stub workers with missing, denied, or stalled preference storage',async()=>{
  for(const navigator of [ipad,desktopIpad])for(const direct of [false,true]){
    const env=page('',{navigator}),options={name:'owned-ipad-engine',credentials:'same-origin'};
    const initial=direct?origin+stubPath+'?src='+encodeURIComponent(engine)+'&job=keep%2Bserver':engine;
    new env.context.Worker(initial,options);
    const launched=env.workers[0];assert.equal(launched.options,options);
    const boot=direct?patchedStub:await env.blobs.get(launched.url).text();
    if(direct){
      const url=new URL(launched.url);
      assert.equal(url.searchParams.get('kkeepIpadRelay'),'1');
      assert.equal(url.searchParams.get('src'),engine);assert.equal(url.searchParams.get('job'),'keep+server');
      assert.equal(url.searchParams.has('wt'),false,'a default must not become a forced relay launch');
    }
    for(const storage of ['missing','throws','stalled']){
      const worker=environment(launched.url,{storage});
      vm.runInContext(boot,worker.context);
      assert.equal(worker.context.__kkeepPreferRelay,true);assert.notEqual(worker.context.__kkeepForceRelay,true);
      assert.equal(worker.context.__kkeepTransportChoice,'');assert.deepEqual(worker.imports,[engine]);
      await expectRelay(worker,{immediate:false,timeoutDb:storage==='stalled'});
    }
  }
});

test('explicit native and auto launch preferences survive both actual iPad worker paths',async()=>{
  for(const choice of ['native','auto'])for(const direct of [false,true]){
    const env=page('&wt='+choice,{navigator:desktopIpad});
    new env.context.Worker(direct?origin+stubPath+'?src='+encodeURIComponent(engine):engine);
    const launched=env.workers[0],boot=direct?patchedStub:await env.blobs.get(launched.url).text();
    const worker=environment(launched.url,{storage:'throws'});
    vm.runInContext(boot,worker.context);
    assert.equal(worker.context.__kkeepPreferRelay,true);assert.equal(worker.context.__kkeepTransportChoice,choice);
    const transport=new worker.context.WebTransport('https://game.example/session');
    try{await tick();await transport.ready;assert.equal(transport.how,'native');assert.equal(worker.sockets.length,0);}
    finally{transport.close();}
  }
});

test('desktop, Android, and iPhone defaults stay native and a worker never infers iPad from its own Mac user agent',async()=>{
  for(const navigator of [
    {...desktopIpad,maxTouchPoints:0},
    {userAgent:'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',platform:'Win32',maxTouchPoints:10},
    {userAgent:'Mozilla/5.0 (Linux; Android 15; Tablet)',platform:'Linux armv8l',maxTouchPoints:5},
    {userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 27_2 like Mac OS X)',platform:'iPhone',maxTouchPoints:5},
  ]){
    const env=page('',{navigator});assert.equal(env.context.__kkeepPreferRelay,false);
    const direct=new URL(origin+stubPath+'?src='+encodeURIComponent(engine));new env.context.Worker(direct);
    assert.equal(env.workers[0].url,direct);
    new env.context.Worker(engine);
    const launched=env.workers[1],boot=await env.blobs.get(launched.url).text();
    const worker=environment(launched.url,{navigator:desktopIpad});
    vm.runInContext(boot,worker.context);assert.equal(worker.context.__kkeepPreferRelay,false);
    const transport=new worker.context.WebTransport('https://game.example/session');
    try{await tick();await transport.ready;assert.equal(transport.how,'native');assert.equal(worker.sockets.length,0);}
    finally{transport.close();}
  }
});

test('explicit relay propagation preserves relative direct worker resolution and existing src semantics',()=>{
  const env=page('&wt=relay');
  const url='stub.js?src='+encodeURIComponent(engine)+'&wt=native#unchanged';
  const expected=new URL(url,env.context.location.href);
  new env.context.Worker(url);
  const launched=new URL(env.workers[0].url);
  assert.equal(launched.pathname,expected.pathname);
  assert.equal(launched.searchParams.get('src'),engine);
  assert.equal(launched.hash,expected.hash);
  assert.deepEqual(launched.searchParams.getAll('wt'),['relay']);
});

test('unknown provider worker construction is rejected rather than dropping the explicit choice',()=>{
  const changed=hook.replace('super(url, options);\n          return;','super(url, options, changed);\n          return;');
  assert.throws(()=>transformText(changed,'/hook.js',origin),/worker launch preference routing changed/);
  const changedBlob=hook.replace('JSON.stringify(PROXY_ORIGIN) + ");\\n"','JSON.stringify(NEW_ORIGIN) + ");\\n"');
  assert.throws(()=>transformText(changedBlob,'/hook.js',origin),/worker launch preference routing changed/);
});
