import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {MessageChannel,MessagePort} from 'node:worker_threads';
import {isXboxStartupReport,xboxStartupFailures} from '../worker/xbox-diagnostics.ts';
const read=path=>fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');

function earlyClient(engine){
  const symbol=Symbol('client'),updates=[];
  // Scramjet hides navigator.serviceWorker from the remote site but keeps its
  // original container on the client. An early contentWindow hook does this
  // before the document's controller.inject script executes.
  const client={serviceWorker:{controller:{id:'native-worker'}},syncDocumentInit(value){updates.push(value);}};
  const context={navigator:{},MessageChannel,MessagePort,$scramjet:{SCRAMJETCLIENT:symbol},[symbol]:client,console,ReadableStream,ArrayBuffer,Uint8Array,Map,WeakMap,Promise,setTimeout,clearTimeout};
  context.self=context;context.globalThis=context;
  vm.runInNewContext(read('public/'+engine+'/engine/controller.inject.js'),context);
  return {context,client,updates};
}
for (const engine of ['gfn','xbox']) test(engine+' controller survives an early sign-in window hook and synchronizes the callback',()=>{
  const {context,client,updates}=earlyClient(engine);
  const callback=engine==='gfn'?'https://steamcommunity.com/openid/login?openid.return_to=https%3A%2F%2Fstatic-als.nvidia.com%2Fresult%3Fstate%3Dfixture':'https://login.live.com/oauth20_authorize.srf?state=fixture';
  const init={initHeaders:[['content-type','text/html']],history:[{url:callback}],cookies:'fixture-cookie-jar'};
  context.$scramjetController.load(init);
  assert.equal(updates.length,1);
  assert.equal(updates[0].history,init.history);assert.equal(updates[0].initHeaders,init.initHeaders);assert.equal(updates[0].cookies,init.cookies);
  assert.equal(updates[0].history[0].url,callback,'Keep the complete provider callback unchanged');
  assert.equal(context.navigator.serviceWorker,undefined,'Do not expose Kkeep service workers to the remote page');
  assert.equal(client.serviceWorker.controller.id,'native-worker');
});

test('a delayed Microsoft form clears the stale error only once it is visible, and observers clean up',t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const nodes=[],listeners=new Map();let mutate,disconnected=0,ready=0;
  const doc={querySelectorAll:()=>nodes,addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:name=>listeners.delete(name)};
  class MutationObserver{constructor(fn){mutate=fn;}observe(){}disconnect(){disconnected++;}}
  const context={window:{},URL,MutationObserver,setTimeout,clearTimeout};vm.runInNewContext(read('public/xbox/signin-compat.js'),context);
  const api=context.window.KkeepXboxSignIn;
  const cleanup=api.watch(doc,'https://login.live.com/oauth20_authorize.srf',()=>ready++);
  assert.equal(ready,0);
  let visible=false;nodes.push({hidden:false,getClientRects:()=>visible?[{}]:[]});mutate();t.mock.timers.tick(1);assert.equal(ready,0);
  visible=true;mutate();t.mock.timers.tick(1);assert.equal(ready,1);
  mutate();t.mock.timers.tick(1);assert.equal(ready,1);
  mutate();cleanup();t.mock.timers.tick(1);assert.equal(ready,1);assert.equal(disconnected,1);assert.equal(listeners.size,0);
  for(const url of ['https://www.xbox.com/play','https://login.live.com.evil.test/','not-a-url'])assert.equal(api.isSignIn(url),false);
  t.mock.timers.reset();
});

test('Microsoft startup diagnostics accept only the existing Xbox report and return fixed labels',()=>{
  const target=new URL('https://browser.events.data.microsoft.com/OneCollector/1.0/');
  const headers=new Headers({referer:'https://login.live.com/'});
  assert.equal(isXboxStartupReport('xbox',target,headers,'POST'),true);
  assert.equal(isXboxStartupReport('geforce',target,headers,'POST'),false);
  assert.equal(isXboxStartupReport('xbox',target,new Headers({referer:'https://login.live.com.evil.test/'}),'POST'),false);
  const body=new TextEncoder().encode(JSON.stringify({name:'IDUX_ClientTelemetry_PageLoadErrors',data:{correlationId:'private-id',errors:[{message:"Cannot read properties of undefined (reading 'controller')",url:'https://login.live.com/?state=secret',stack:'private-stack'},{message:'Failed to load BrsConfig file'}],account:'private-account'}})).buffer;
  assert.deepEqual(xboxStartupFailures(body),['blank-form','controller-initialization','configuration-load']);
  assert.doesNotMatch(JSON.stringify(xboxStartupFailures(body)),/private|secret|https/);
  assert.deepEqual(xboxStartupFailures(new TextEncoder().encode('not-json').buffer),[]);
  assert.deepEqual(xboxStartupFailures(new ArrayBuffer(129*1024)),[]);
});
