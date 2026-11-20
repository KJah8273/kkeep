import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {MessageChannel} from 'node:worker_threads';
import {proxySessionWorker} from '../worker/proxy-session.js';
import {sessionClient} from '../worker/session.js';
import {signinBootstrap} from '../worker/signin.js';
import gateway from '../worker/index.js';

const provider=readFileSync(new URL('./fixtures/controller.sw.js',import.meta.url),'utf8');
const providerApi=readFileSync(new URL('./fixtures/controller.api.js',import.meta.url),'utf8');
const origin='https://runtime.example', prefix='/~/sj/owned123/';
function clock() {
  let now=0,next=0; const timers=new Map();
  return {timers,setTimeout(fn,ms){const id=++next;timers.set(id,{fn,at:now+ms});return id;},clearTimeout(id){timers.delete(id);},
    async advance(ms){
      const end=now+ms;
      for(let i=0;i<12;i++)await Promise.resolve();
      for(;;){
        const due=[...timers].filter(([,v])=>v.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];
        if(!due)break; now=due[1].at;timers.delete(due[0]);due[1].fn();
        for(let i=0;i<12;i++)await Promise.resolve();
      }
      now=end;
    }};
}
function harness({restore=true, blockedEnumeration=false, keepBootNotice=false}={}) {
  const timer=clock(), listeners={}, notices=[], calls=[], clients=[];
  const scope={URL,Request,Response,ReadableStream,ArrayBuffer,Map,DOMException,console:{log(){},error(){}},
    location:{origin},setTimeout:timer.setTimeout,clearTimeout:timer.clearTimeout,
    addEventListener(type,fn){(listeners[type]??=[]).push(fn);},
    clients:{claim:async()=>{},get:async()=>({url:origin+'/_rbx/signin'}),matchAll:async()=>blockedEnumeration?new Promise(()=>{}):clients}};
  scope.self=scope;
  vm.createContext(scope);vm.runInContext(provider,scope);
  // Preserve the actual provider's cold table and message registration logic;
  // its unsolicited boot notice is not the repair being tested.
  const bootDelay=[...timer.timers.values()].map(t=>t.at);
  if(!keepBootNotice)timer.timers.clear();
  function register(routePrefix=prefix) {
    const id=routePrefix.split('/').filter(Boolean).at(-1);
    const port={postMessage(message){
      const data=message['tabchannel-'+id];
      if(data?.$type!=='request')return;
      if(data.$method==='request') {
        calls.push(data.$args);
        const body=new TextEncoder().encode('proxied response').buffer;
        queueMicrotask(()=>port.onmessage({data:{['tabchannel-'+id]:{$type:'response',$token:data.$token,$data:{status:200,statusText:'OK',headers:[['content-type','text/plain']],body}}}}));
      } else queueMicrotask(()=>port.onmessage({data:{['tabchannel-'+id]:{$type:'response',$token:data.$token}}}));
    }};
    for(const listener of listeners.message)listener({data:{$controller$init:{prefix:routePrefix,id}},ports:[port]});
  }
  const addClient=(url,owner=false)=>clients.push({url,postMessage(data){notices.push({url,data});if(owner&&restore&&data.prefix===prefix)register();}});
  addClient(origin+'/_rbx/signin',true);
  addClient(origin+'/_rbx/app/');
  addClient(origin+'/~/sj/untrusted/frame/url');
  addClient('https://elsewhere.example/_rbx/signin');
  addClient('not a URL');
  vm.runInContext('('+proxySessionWorker.toString()+')(self)',scope);
  function request(url=origin+prefix+'frame123/example',body='synthetic sign-in body',options={}) {
    const req=new Request(url,{method:'POST',body,...options});
    let response;
    const event={request:req,clientId:'synthetic-client',respondWith(result){assert.equal(response,undefined);response=Promise.resolve(result);}};
    for(const listener of listeners.fetch)listener(event);
    return {event,get response(){return response;}};
  }
  return {scope,timer,bootDelay,register,request,notices,calls,clients,listeners};
}

test('actual provider cold routing table reproduces the sign-in POST falling through to gateway404',async()=>{
  const h=harness({restore:false}), req=new Request(origin+prefix+'frame123/example',{method:'POST',body:'synthetic'});
  assert.equal(h.scope.$scramjetController.shouldRoute({request:req}),false);
  assert.equal((await gateway.fetch(req)).status,404);
  assert.deepEqual(h.bootDelay,[100]);
  h.register(); assert.equal(h.scope.$scramjetController.shouldRoute({request:req}),true);
});

test('cold-start requests wait for their owner, coalesce one wake-up, and dispatch each original body once',async()=>{
  const h=harness(), a=h.request(undefined,'first body'), b=h.request(undefined,'second body');
  assert.ok(a.response&&b.response); assert.equal(h.calls.length,0);
  await h.timer.advance(25);
  assert.equal((await a.response).status,200);assert.equal((await b.response).status,200);
  assert.equal(h.notices.length,1);assert.equal(h.notices[0].url,origin+'/_rbx/signin');
  assert.deepEqual(Object.keys(h.notices[0].data).sort(),['prefix','type']);
  assert.equal(h.notices[0].data.prefix,prefix);
  assert.equal(h.calls.length,2);
  assert.deepEqual(await Promise.all(h.calls.map(c=>new Response(c.body).text())),['first body','second body']);
  assert.ok(h.calls.every(c=>c.method==='POST'&&c.rawUrl===a.event.request.url));
});

test('registered routes run immediately without waking or resetting another sign-in controller',async()=>{
  const h=harness();h.register();const request=h.request();
  assert.equal((await request.response).status,200);assert.equal(h.calls.length,1);assert.equal(h.notices.length,0);
});

test('a different controller prefix cannot release a waiting request',async()=>{
  const h=harness({restore:false}), request=h.request();h.register('/~/sj/other123/');
  await h.timer.advance(3000);
  assert.equal((await request.response).status,503);assert.equal(h.calls.length,0);
  h.register();await h.timer.advance(1000);assert.equal(h.calls.length,0);
});

test('missing owners and blocked client enumeration fail locally within the deadline without replay',async()=>{
  for(const blockedEnumeration of [false,true]) {
    const h=harness({restore:false,blockedEnumeration}), request=h.request();
    await h.timer.advance(3000);
    const response=await request.response;
    assert.equal(response.status,503);assert.equal(response.headers.get('cache-control'),'no-store');
    assert.equal(h.calls.length,0);await h.timer.advance(10000);assert.equal(h.calls.length,0);
  }
});

test('an aborted original is not dispatched when a shared owner wait completes',async()=>{
  const h=harness({restore:false}), abort=new AbortController();
  const cancelled=h.request(undefined,'cancelled body',{signal:abort.signal});
  const rejected=assert.rejects(cancelled.response,{name:'AbortError'});
  const remaining=h.request(undefined,'remaining body');
  abort.abort();h.register();await h.timer.advance(25);await rejected;
  assert.equal((await remaining.response).status,200);
  assert.equal(h.calls.length,1);
  assert.equal(await new Response(h.calls[0].body).text(),'remaining body');
  const alreadyAborted=h.request(undefined,'never sent',{signal:abort.signal});
  await assert.rejects(alreadyAborted.response,{name:'AbortError'});
  assert.equal(h.calls.length,1);
});

test('late client enumeration cannot reset a route after timeout or after another revive restored it',async()=>{
  for(const restored of [false,true]) {
    const h=harness({restore:false});let finishEnumeration;
    h.scope.clients.matchAll=()=>new Promise(resolve=>{finishEnumeration=resolve;});
    const request=h.request();
    if(restored)h.register();
    await h.timer.advance(restored?25:3000);
    assert.equal((await request.response).status,restored?200:503);
    finishEnumeration(h.clients);await h.timer.advance(25);
    assert.equal(h.notices.length,0);
    assert.equal(h.calls.length,restored?1:0);
  }
});

test('a closing sign-in client does not prevent waking the actual owner',async()=>{
  const h=harness();let attempts=0;
  h.clients.unshift({url:origin+'/_rbx/signin',postMessage(){attempts++;throw new DOMException('Closed','InvalidStateError');}});
  const request=h.request();await h.timer.advance(25);
  assert.equal((await request.response).status,200);
  assert.equal(attempts,1);assert.equal(h.calls.length,1);assert.equal(h.notices.length,1);
});

test('actual provider revive and port setup preserve an in-flight request in either wake ordering',async()=>{
  const listenerStart=providerApi.indexOf('navigator.serviceWorker.addEventListener("message",e=>');
  const setupStart=providerApi.indexOf('setupMessagePort(){',listenerStart);
  const setupEnd=providerApi.indexOf('applyCookieSyncEntries(e)',setupStart);
  assert.ok(listenerStart>0&&setupStart>listenerStart&&setupEnd>setupStart);
  const setupSource=providerApi.slice(setupStart,setupEnd);
  const listenerSource=providerApi.slice(listenerStart,setupStart-1);
  for(const targetedDelay of [0,150]) {
    const h=harness({restore:false,keepBootNotice:true});
    let closed=0, setups=0, requests=0, finished=false;
    const bodies=[];
    const message=(target,data,source)=>{
      const event=new Event('message');
      Object.defineProperties(event,{data:{value:data},source:{value:source}});
      target.dispatchEvent(event);
    };
    // Closing a port really drops messages, so an extra provider reattach
    // would strand the old worker RPC instead of allowing a false test pass.
    class Port extends EventTarget {
      closed=false;onmessage=null;
      postMessage(data) {
        const peer=this.peer;
        queueMicrotask(()=>{
          if(this.closed||peer.closed)return;
          const event=new Event('message');Object.defineProperty(event,'data',{value:data});
          peer.dispatchEvent(event);peer.onmessage?.(event);
        });
      }
      start() {}
      close() {if(!this.closed)closed++;this.closed=true;}
    }
    class Channel {
      constructor(){this.port1=new Port();this.port2=new Port();this.port1.peer=this.port2;this.port2.peer=this.port1;}
    }
    const active={scriptURL:origin+'/_jar/sw.js?kk=join18',postMessage(data,ports){
      for(const listener of h.listeners.message)listener({data,ports});
    }};
    const serviceWorker=new EventTarget();serviceWorker.controller=active;
    const loading={classList:{add(){}}};
    const page={navigator:{serviceWorker},location:{origin},document:{getElementById:()=>loading}};
    page.parent=page;
    const context={scope:page,URL,navigator:page.navigator,MessageChannel:Channel,setTimeout:h.timer.setTimeout,clearTimeout:h.timer.clearTimeout};
    vm.createContext(context);
    vm.runInContext('('+signinBootstrap.toString()+')(scope)',context);
    const Controller=vm.runInContext('(class {'+setupSource+'})',context);
    const controller=new Controller(), old=new Channel();
    Object.assign(controller,{id:'owned123',prefix,serviceWorkerController:active,port:old.port1,
      guardServiceWorkerRevive:false,wait:async()=>{}});
    const setup=controller.setupMessagePort;
    controller.setupMessagePort=function(){setups++;return setup.call(this);};
    controller.onTabChannelMessage=event=>{
      const data=event.data['tabchannel-owned123'];
      if(data?.$type!=='request')return;
      const respond=value=>controller.port.postMessage({'tabchannel-owned123':{$type:'response',$token:data.$token,$data:value}});
      if(data.$method==='request') {
        requests++;bodies.push(data.$args.body);
        h.timer.setTimeout(()=>respond({status:200,statusText:'OK',headers:[],body:new TextEncoder().encode('response after revive').buffer}),200);
      } else respond(undefined);
    };
    context.controller=controller;
    vm.runInContext('(function(){'+listenerSource+'}).call(controller)',context);
    await page.__kkeepSignIn.connect(controller);page.__kkeepSignIn.loaded();
    h.clients[0].postMessage=data=>{
      if(data.type==='kkeep:signin-route-wake'&&targetedDelay)h.timer.setTimeout(()=>message(serviceWorker,data,active),targetedDelay);
      else message(serviceWorker,data,active);
    };
    const request=h.request(undefined,'body sent exactly once');
    request.response.then(()=>{finished=true;});
    await h.timer.advance(175);
    assert.equal(setups,1);assert.equal(closed,1);assert.equal(requests,1);assert.equal(finished,false);
    await h.timer.advance(200);
    assert.equal((await request.response).status,200);
    assert.equal(await (await request.response).text(),'response after revive');
    assert.equal(await new Response(bodies[0]).text(),'body sent exactly once');
    // A later real wake remains available; an obsolete worker cannot reattach.
    await h.timer.advance(1000);
    message(serviceWorker,{$controller$swrevive:{}},{});assert.equal(setups,1);
    message(serviceWorker,{$controller$swrevive:{}},active);assert.equal(setups,2);
    assert.equal(requests,1);
  }
});

test('unrelated, cross-origin and malformed proxy paths are not intercepted or used for wake-up',async()=>{
  const h=harness();
  for(const url of [origin+'/_rbx/api/session',origin+'/_/cdn/engine.wasm','https://elsewhere.example'+prefix+'frame123/example',origin+'/~/sj/../bad',origin+'/~/sj/OWNED123/frame123/example']) {
    assert.equal(h.request(url).response,undefined);
  }
  await h.timer.advance(10000);assert.equal(h.notices.length,0);assert.equal(h.calls.length,0);
});

test('session readiness replaces its cached worker after controllerchange without retrying account requests',async()=>{
  let registrations=0;const listeners={},calls=[];
  const makeWorker=name=>({state:'activated',postMessage(data,ports){calls.push({name,op:data.op});ports[0].postMessage({version:'join18',revision:'join19'});ports[0].close();}});
  let active=makeWorker('old');
  const serviceWorker={controller:active,addEventListener(type,fn){listeners[type]=fn;},register:async()=>{registrations++;return{active};}};
  const scope={document:{},navigator:{serviceWorker},fetch:async()=>{throw Error('No network request expected');}};
  vm.runInNewContext('('+sessionClient.toString()+')(scope,origin)',{scope,origin,URL,Request,Response,Headers,MessageChannel,DOMException,setTimeout,clearTimeout,atob});
  assert.equal(await scope.__kkeepSessionReady(),active);
  active=makeWorker('new');serviceWorker.controller=active;listeners.controllerchange();
  assert.equal(await scope.__kkeepSessionReady(true),active);
  assert.equal(registrations,2);assert.ok(calls.slice(1).every(c=>c.name==='new'));
  assert.ok(calls.every(c=>['ping','claim'].includes(c.op)));
});
