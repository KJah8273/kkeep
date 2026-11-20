import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {MessageChannel} from 'node:worker_threads';
import {sessionClient,sessionWorker} from '../worker/session.js';

const origin='https://runtime.example';
const join=origin+'/_/'+btoa('gamejoin.roblox.com').replace(/=+$/,'')+'/v1/join-game';
const readRoutes=[
 ['assetdelivery.roblox.com','/v3/assets/batch'],
 ['thumbnails.roblox.com','/v1/batch'],
 ['users.roblox.com','/v1/users']
];
const encoded=(host,path)=>origin+'/_/'+btoa(host).replace(/=+$/,'')+path;
const scopeValues={URL,Request,Response,Headers,MessageChannel,DOMException,setTimeout,clearTimeout,atob};
function harness({source=origin+'/_/cGxheS5yb2Jsb3guY29t/games/start',handler,claimControl=true,bindings={}}={}){
 const listeners={},calls=[],network=[],claims=[];
 const sw={location:{origin},addEventListener:(type,fn)=>listeners[type]=fn,clients:{claim:async()=>{claims.push(true);if(claimControl)page.navigator.serviceWorker.controller=active;}}};
 const viaJar=async(req,host,path)=>{
  calls.push({host,path,method:req.method,body:await req.text()});
  return handler?handler(req):Response.json({status:2,jobId:'chosen-server'},{headers:{'set-cookie':'must-not-escape=1'}});
 };
 vm.runInNewContext('('+sessionWorker.toString()+')(self,viaJar,rbxApi)',{...scopeValues,self:sw,viaJar,rbxApi:async()=>Response.json({loggedIn:true})});
 const active={postMessage:(data,ports)=>listeners.message({data,ports,source:{url:source},waitUntil:p=>p.catch(()=>{})})};
 const page={document:{},navigator:{serviceWorker:{register:async()=>({active}),get ready(){throw new Error('An unbounded ready wait must not be used');}}},fetch:async(...args)=>{network.push(args);return new Response('asset');}};
 vm.runInNewContext('('+sessionClient.toString()+')(scope,origin)',{...scopeValues,...bindings,scope:page,origin});
 return{page,active,calls,network,claims};
}
test('sign-in claims the page and checks the new controller instead of using a stale worker',async()=>{
 const h=harness({source:origin+'/_rbx/signin'});
 h.page.navigator.serviceWorker.controller={postMessage:(data,ports)=>{ports[0].postMessage({version:'join5'});ports[0].close();}};
 assert.equal(await h.page.__kkeepSessionReady(true),h.active);
 assert.equal(h.claims.length,1);assert.equal(h.calls.length,0);assert.equal(h.network.length,0);
});
test('the updated worker preserves the old protocol while advertising the required recovery build',async()=>{
 const h=harness({source:origin+'/_rbx/signin'});
 const channel=new MessageChannel();
 const reply=new Promise(resolve=>channel.port1.once('message',resolve));
 h.active.postMessage({key:'kkeep:jar:v4',op:'ping'},[channel.port2]);
 assert.deepEqual(await reply,{version:'join18',revision:'join19'});channel.port1.close();
 assert.equal(await h.page.__kkeepSessionReady(true),h.active);
 assert.equal(h.calls.length,0);
});
test('a stale same-protocol worker cannot pass new-client readiness before the updated worker activates',async()=>{
 let elapsed=0,pings=0,registered;
 const stale={state:'activated',postMessage(data,ports){pings++;ports[0].postMessage({version:'join18'});ports[0].close();}};
 const current={state:'activated',postMessage(data,ports){ports[0].postMessage({version:'join18',revision:'join19'});ports[0].close();}};
 const registration={get active(){return pings<2?stale:current;}};
 const page={document:{},navigator:{serviceWorker:{register:async url=>{registered=url;return registration;}}},fetch:async()=>{throw new Error('No authentication requests expected');}};
 vm.runInNewContext('('+sessionClient.toString()+')(scope,origin)',{...scopeValues,scope:page,origin,Date:{now:()=>elapsed},setTimeout:(fn,ms)=>ms===100?setTimeout(()=>{elapsed+=100;fn();},0):setTimeout(fn,ms)});
 assert.equal(await page.__kkeepSessionReady(),current);assert.equal(pings,2);
 assert.equal(registered,'/_jar/sw.js?kk=join18','stable URL avoids old and new tabs replacing each other');
});
test('menu readiness works without a controller; missing sign-in control fails within its deadline',async()=>{
 let elapsed=0;
 const h=harness({claimControl:false,bindings:{Date:{now:()=>elapsed},setTimeout:(fn,ms)=>ms===100?setTimeout(()=>{elapsed+=2500;fn();},1):setTimeout(fn,ms)}});
 assert.equal(await h.page.__kkeepSessionReady(),h.active);
 await assert.rejects(h.page.__kkeepSessionReady(true),/could not control/);
 assert.equal(h.claims.length,1);assert.equal(h.network.length,0);
});
test('an untrusted proxied page cannot ask the session worker to claim clients',async()=>{
 const h=harness({source:origin+'/~/sj/untrusted'});
 await assert.rejects(h.page.__kkeepSessionReady(true),/client-path/);
 assert.equal(h.claims.length,0);
});
test('an uncontrolled page sends one authenticated join through its local session, never the asset gateway',async()=>{
 const h=harness(),body=JSON.stringify({placeId:123,gameId:'chosen-server'});
 const response=await h.page.fetch(join,{method:'POST',body,headers:{'Content-Type':'application/json'}});
 assert.equal(response.status,200);assert.equal(response.headers.get('set-cookie'),null);
 assert.equal((await response.json()).jobId,'chosen-server');
 assert.deepEqual(h.calls,[{host:'gamejoin.roblox.com',path:'/v1/join-game',method:'POST',body}]);
 assert.equal(h.network.length,0);
});
test('HTTP errors keep the actual status and body; joins are not retried',async()=>{
 const h=harness({handler:()=>Response.json({message:'not available'},{status:503})});
 const response=await h.page.fetch(join,{method:'POST',body:'{}'});
 assert.equal(response.status,503);assert.deepEqual(await response.json(),{message:'not available'});
 assert.equal(h.calls.length,1);assert.equal(h.network.length,0);
});
test('a Request object preserves the join method, body and headers',async()=>{
 const h=harness(),body=JSON.stringify({placeId:123});
 const response=await h.page.fetch(new Request(join,{method:'POST',body,headers:{'Content-Type':'application/json'}}));
 assert.equal(response.status,200);
 assert.deepEqual(h.calls,[{host:'gamejoin.roblox.com',path:'/v1/join-game',method:'POST',body}]);
});
test('browser-local bridge does not grant a proxied website access to the session',async()=>{
 const h=harness({source:origin+'/~/sj/untrusted'});
 const channel=new MessageChannel();
 const reply=new Promise(resolve=>channel.port1.once('message',resolve));
 h.active.postMessage({key:'kkeep:jar:v4',op:'fetch',url:join,method:'POST',headers:[],body:null},[channel.port2]);
 assert.equal((await reply).error,'client-path');assert.equal(h.calls.length,0);channel.port1.close();
});
test('native asset streaming is untouched and pre-aborted joins are never sent',async()=>{
 const h=harness();await h.page.fetch(origin+'/_/cdn/WebClient.wasm');
 assert.equal(h.network.length,1);
 const controller=new AbortController();controller.abort();
 await assert.rejects(h.page.fetch(join,{method:'POST',signal:controller.signal}),{name:'AbortError'});
 assert.equal(h.calls.length,0);
});
test('engine worker requests use their owner channel when WorkerNavigator has no serviceWorker',async()=>{
 const h=harness(),worker={fetch:async()=>{throw new Error('Unexpected network fallback');},postMessage:(data,ports)=>h.active.postMessage(data,ports)};
 vm.runInNewContext('('+sessionClient.toString()+')(scope,origin)',{...scopeValues,scope:worker,origin});
 const response=await worker.fetch(join,{method:'POST',body:'{}'});
 assert.equal(response.status,200);assert.equal(h.calls.length,1);
});
test('session API and empty HTTP responses survive RPC',async()=>{
 const h=harness({handler:()=>new Response(null,{status:204})});
 assert.deepEqual(await (await h.page.fetch(origin+'/_rbx/api/session')).json(),{loggedIn:true});
 const response=await h.page.fetch(join,{method:'POST',body:'{}'});
 assert.equal(response.status,204);assert.equal(await response.text(),'');
});

test('verified content reads support Request inputs and method overrides while preserving query and body',async()=>{
 for(const [host,path] of readRoutes){
  const body='{"synthetic":"batch"}', h=harness();
  const response=await h.page.fetch(new Request(encoded(host,path)+'?synthetic=1',{method:'POST',body}));
  assert.equal(response.status,200);assert.equal(h.network.length,0);
  assert.deepEqual(h.calls,[{host,path:path+'?synthetic=1',method:'POST',body}]);
 }
 const h=harness(), url=encoded(...readRoutes[0]);
 await h.page.fetch(new Request(url),{method:'post',body:'override'});
 assert.equal(h.calls.length,1);assert.equal(h.calls[0].body,'override');
 await h.page.fetch(new Request(url,{method:'POST',body:'native-only'}),{method:'DELETE'});
 assert.equal(h.calls.length,1);assert.equal(h.network.length,1);
});

test('content reads reject wrong methods, unrelated paths and external origins at both bridge boundaries',async()=>{
 const cases=[];
 for(const [host,path] of readRoutes){
  const url=encoded(host,path);
  for(const method of ['GET','HEAD','PUT','PATCH','DELETE'])cases.push({url,method});
  cases.push({url:url+'/other',method:'POST'});
  cases.push({url:url.replace(origin,'https://external.example'),method:'POST'});
 }
 cases.push({url:encoded('assetdelivery.roblox.com','/v2/assets/batch'),method:'POST'});
 cases.push({url:encoded('auth.roblox.com','/v1/users'),method:'POST'});
 cases.push({url:origin+'/unrelated',method:'POST'});
 for(const {url,method} of cases){
  const h=harness();
  await h.page.fetch(url,{method});
  assert.equal(h.calls.length,0);assert.equal(h.network.length,1);
  const channel=new MessageChannel();
  try{
   const reply=new Promise(resolve=>channel.port1.once('message',resolve));
   h.active.postMessage({key:'kkeep:jar:v4',op:'fetch',url,method,headers:[],body:null},[channel.port2]);
   assert.equal((await reply).error,'session-request');
   assert.equal(h.calls.length,0);
  }finally{channel.port1.close();}
 }
});

test('content reads retain the source-origin and source-page restrictions',async()=>{
 for(const [source,error] of [
  ['https://external.example/_/cGxheS5yb2Jsb3guY29t/games/start','client-origin'],
  [origin+'/~/sj/untrusted','client-path']
 ]){
  const h=harness({source});
  await assert.rejects(h.page.fetch(encoded(...readRoutes[0]),{method:'POST',body:'{}'}),new RegExp(error));
  assert.equal(h.calls.length,0);assert.equal(h.network.length,0);
 }
});

test('content failures keep their status and enforce existing size bounds without retry or public fallback',async()=>{
 const url=encoded(...readRoutes[0]);
 const unavailable=harness({handler:()=>new Response('content unavailable',{status:503})});
 const response=await unavailable.page.fetch(url,{method:'POST',body:'{}'});
 assert.equal(response.status,503);assert.equal(await response.text(),'content unavailable');
 assert.equal(unavailable.calls.length,1);assert.equal(unavailable.network.length,0);

 const requestBound=harness();
 await assert.rejects(requestBound.page.fetch(url,{method:'POST',body:new Uint8Array(2*1024*1024+1)}),/too large/);
 assert.equal(requestBound.calls.length,0);assert.equal(requestBound.network.length,0);

 for(const handler of [
  ()=>new Response(new Uint8Array(8*1024*1024+1)),
  ()=>{throw new TypeError('synthetic transport failure');}
 ]){
  const h=harness({handler});
  await assert.rejects(h.page.fetch(url,{method:'POST',body:'{}'}),/session-request/);
  assert.equal(h.calls.length,1);assert.equal(h.network.length,0);
 }
});


function updateHarness(outcome='updated') {
 let elapsed=0,updates=0,stalePings=0,currentRequests=0,network=0;
 const registered=[];
 const current={state:'activated',postMessage(data,ports){
  if(data.op==='ping')ports[0].postMessage({version:'join18',revision:'join19'});
  else {currentRequests++;ports[0].postMessage({status:200,statusText:'OK',headers:[],body:new TextEncoder().encode('{"loggedIn":true}').buffer});}
  ports[0].close();
 }};
 const stale={state:'activated',postMessage(data,ports){
  assert.equal(data.op,'ping','an obsolete worker must never receive an account request');
  stalePings++;ports[0].postMessage({version:'join18'});ports[0].close();
 }};
 let active=outcome==='current'?current:stale;
 const registration={get active(){return active;},update(){
  updates++;
  if(outcome==='rejected')return Promise.reject(new TypeError('synthetic update unavailable'));
  if(outcome==='hung')return new Promise(()=>{});
  active=current;return Promise.resolve(registration);
 }};
 const page={document:{},navigator:{serviceWorker:{register:async(...args)=>{registered.push(args);return registration;}}},fetch:async()=>{network++;throw new Error('Public fallback must not run');}};
 vm.runInNewContext('('+sessionClient.toString()+')(scope,origin)',{...scopeValues,scope:page,origin,Date:{now:()=>elapsed},
  setTimeout:(fn,ms)=>ms===100?setTimeout(()=>{elapsed+=outcome==='updated'?100:3000;fn();},0):setTimeout(fn,ms)});
 return {page,current,registered,get updates(){return updates;},get stalePings(){return stalePings;},get requests(){return currentRequests;},get network(){return network;},get elapsed(){return elapsed;}};
}

test('an unchanged stable registration explicitly updates once before any catalog request uses its new revision',async()=>{
 const h=updateHarness();
 const [worker,response]=await Promise.all([h.page.__kkeepSessionReady(),h.page.fetch(origin+'/_rbx/api/session')]);
 assert.equal(worker,h.current);assert.deepEqual(await response.json(),{loggedIn:true});
 assert.equal(h.updates,1);assert.equal(h.stalePings,1);assert.equal(h.requests,1);assert.equal(h.network,0);
 assert.equal(h.registered.length,1,'parallel readiness and catalog fetch share the same startup');
 assert.equal(h.registered[0][0],'/_jar/sw.js?kk=join18');
 assert.equal(h.registered[0][1].updateViaCache,'none');
 await h.page.fetch(origin+'/_rbx/api/session');assert.equal(h.updates,1);assert.equal(h.requests,2);
});

test('a failed or hung revision update remains bounded and never falls back or dispatches account requests',async()=>{
 for(const outcome of ['rejected','hung']){
  const h=updateHarness(outcome);
  await assert.rejects(h.page.fetch(origin+'/_rbx/api/session'),/Browser session is not ready \(session-version\)/);
  assert.equal(h.updates,1,outcome);assert.equal(h.requests,0,outcome);assert.equal(h.network,0,outcome);
  assert.ok(h.stalePings>1&&h.stalePings<20,outcome);
  assert.equal(h.elapsed,48000,'revision activation remains bounded by45secondgraceplusonepoll');
 }
});

test('an already-current worker does not request an unnecessary registration update',async()=>{
 const h=updateHarness('current');
 assert.equal(await h.page.__kkeepSessionReady(),h.current);
 assert.equal(h.updates,0);assert.equal(h.stalePings,0);assert.equal(h.requests,0);assert.equal(h.network,0);
});


test('a confirmed revision upgrade that activates after twenty seconds completes the original catalog request once',async()=>{
 let elapsed=0,updates=0,requests=0,network=0;
 const current={state:'activated',postMessage(data,ports){
  if(data.op==='ping')ports[0].postMessage({version:'join18',revision:'join19'});
  else {requests++;ports[0].postMessage({status:200,statusText:'OK',headers:[],body:new TextEncoder().encode('{"loggedIn":false}').buffer});}
  ports[0].close();
 }};
 const stale={state:'activated',postMessage(data,ports){
  assert.equal(data.op,'ping');ports[0].postMessage({version:'join18'});ports[0].close();
 }};
 const registration={get active(){return elapsed>=20000?current:stale;},update(){updates++;return Promise.resolve(registration);}};
 const page={document:{},navigator:{serviceWorker:{register:async()=>registration}},fetch:async()=>{network++;throw new Error('No public fallback');}};
 vm.runInNewContext('('+sessionClient.toString()+')(scope,origin)',{...scopeValues,scope:page,origin,Date:{now:()=>elapsed},
  setTimeout:(fn,ms)=>ms===100?setTimeout(()=>{elapsed+=1000;fn();},0):setTimeout(fn,ms)});
 const response=await page.fetch(origin+'/_rbx/api/session');
 assert.deepEqual(await response.json(),{loggedIn:false});
 assert.equal(elapsed,20000);assert.equal(updates,1);assert.equal(requests,1);assert.equal(network,0);
});

test('ordinary unavailable workers keep the fifteen-second deadline without requesting an update',async()=>{
 let elapsed=0,updates=0,network=0;
 const registration={active:null,update(){updates++;return Promise.resolve(registration);}};
 const page={document:{},navigator:{serviceWorker:{register:async()=>registration}},fetch:async()=>{network++;throw new Error('No public fallback');}};
 vm.runInNewContext('('+sessionClient.toString()+')(scope,origin)',{...scopeValues,scope:page,origin,Date:{now:()=>elapsed},
  setTimeout:(fn,ms)=>ms===100?setTimeout(()=>{elapsed+=1000;fn();},0):setTimeout(fn,ms)});
 await assert.rejects(page.__kkeepSessionReady(),/session-inactive/);
 assert.equal(elapsed,16000);assert.equal(updates,0);assert.equal(network,0);
});
