import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {IDBFactory} from 'fake-indexeddb';
import {transformText} from '../worker/gateway.js';
import {observeSessionDatabase} from './helpers/observe-session-database.mjs';

const provider=readFileSync(new URL('./fixtures/session-api.js',import.meta.url),'utf8');
const network=readFileSync(new URL('./fixtures/session-network.js',import.meta.url),'utf8');
const origin='https://runtime.example';
const user={id:1,name:'Fixture'};
const good={status:200,data:user};
const workerSource=excerpt=>`const CFG = new URL(location.href).searchParams;
const WS_PROTO = location.protocol === "https:" ? "wss" : "ws";
const WISP_MAIN = \`${'${WS_PROTO}'}://${'${location.host}'}/wisp/\`;
const WISP = CFG.get("wisp") || \`${'${WS_PROTO}'}://${'${location.host}'}/_rbx/wisp/\`;
async function viaJar(){}
${network}
${excerpt}
\tself.addEventListener("install", () => self.skipWaiting());
\tself.addEventListener("fetch", (e) => {
\t\tconst sj = self.$scramjetController;
\t\tif (sj && sj.shouldRoute(e)) e.respondWith(sj.route(e));
\t});`;

function deferred(){let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};}
async function identityStarted(h){
  await h.waitForIdentity();
  assert.equal(h.identityCalls,1,'the identity read reaches the synthetic provider');
}

async function harness(responses,{patched=true}={}){
  let now=1000,identityCalls=0;
  const calls=[],writes=[],identityStarts=[];
  const scope={indexedDB:new IDBFactory(),URL,Request,Response,Headers,Number,Date:{now:()=>now},location:new URL(origin+'/_jar/sw.js'),
    setTimeout:fn=>{queueMicrotask(fn);return 1;},clearTimeout(){},
    addEventListener(){},tokenMemo:null,csrf:'',
    clearCache(){},viaUs:value=>value,JOB_ID:/^[a-f0-9-]{36}$/,
    // The real provider takes its identity from getUser(), then dereferences
    // me.id inside home(). Keep that dependency so a missing memo cannot pass.
    createData:(_rbx,getUser)=>({home:async()=>{const me=getUser();return {me,id:me.id};}}),
    rbxJson:async(host,path,options={})=>{
      calls.push({host,path,method:options.method||'GET'});
      if(host==='auth.roblox.com'&&path==='/v2/logout')return {status:200,data:{}};
      assert.equal(host,'users.roblox.com');assert.equal(path,'/v1/users/authenticated');
      identityStarts[identityCalls++]?.resolve();
      assert.ok(responses.length,'fixture supplies every identity response');
      return await responses.shift();
    },
  };
  scope.self=scope;
  const syntheticRbx=scope.rbxJson;
  vm.createContext(scope);
  // Identity reads and atomic logout use the same isolated database and the
  // actual provider db/kv functions. Only external HTTP is synthetic.
  const original=workerSource(provider);
  vm.runInContext(patched?transformText(original,'/_jar/sw.js',origin):original,scope);
  scope.rbxJson=syntheticRbx;
  scope.db=observeSessionDatabase(scope.db,writes);
  vm.runInContext('globalThis.auth = {rbxApi, forgetSession, kv, memo:()=>userMemo};',scope);
  await scope.auth.kv('put','token','fixture-only-session-a');
  writes.length=0;
  return {calls,writes,
    get identityCalls(){return identityCalls;},
    hasToken:async()=>!!await scope.auth.kv('get','token'),
    get memoUser(){return scope.auth.memo()?.user??null;},
    advance(ms){now+=ms;},
    async changeToken(){await scope.auth.kv('put','token','fixture-only-session-b');scope.auth.forgetSession();},
    waitForIdentity(count=1){return identityCalls>=count?Promise.resolve():(identityStarts[count-1]??=deferred()).promise;},
    async api(path='/session',method='GET'){
      const url=new URL('/_rbx/api'+path,origin);
      const response=await scope.auth.rbxApi(new Request(url,{method}),url);
      return {status:response.status,data:await response.json()};
    },
  };
}

test('actual provider identity memo reproduces permanent transient rejection and stale expired success',async()=>{
  for(const [responses,signedIn] of [[[ {status:503,data:null},good ],false],[[good,{status:401,data:null}],true]]){
    const h=await harness(responses,{patched:false});
    assert.equal((await h.api()).data.loggedIn,signedIn);
    assert.equal((await h.api()).data.loggedIn,signedIn);
    assert.equal(h.identityCalls,1,'the unpatched worker never checks the recovery/expiry response');
  }
});

test('session checks verify current identity and only authoritative 401/403 mean signed out',async()=>{
  const h=await harness([good,{status:401,data:null},{status:403,data:null},good]);
  for(const signedIn of [true,false,false,true]){
    const result=await h.api();
    assert.equal(result.status,200);assert.equal(result.data.loggedIn,signedIn);
  }
  assert.equal(h.identityCalls,4);
  assert.equal(await h.hasToken(),true);assert.deepEqual(h.writes,[],'identity checks never delete or replace account credentials');
});

test('launch checks expired sessions before returning a game destination and never joins a server',async()=>{
  const h=await harness([good,{status:401,data:null},good]);
  assert.equal((await h.api()).data.loggedIn,true);
  const expired=await h.api('/launch?placeId=123');
  assert.equal(expired.status,401);assert.equal(expired.data.url,undefined);
  const recovered=await h.api('/launch?placeId=123');
  assert.equal(recovered.status,200);assert.equal(recovered.data.url,'/play/123');
  assert.equal(h.identityCalls,3);assert.equal(h.calls.every(call=>call.method==='GET'),true);
  assert.deepEqual(h.writes,[]);
});

test('catalog identity cache expires after 30 seconds without forcing duplicate reads for immediate pages',async()=>{
  const h=await harness([good,{status:401,data:null}]);
  assert.equal((await h.api('/ui/home')).status,200);
  h.advance(29999);
  assert.equal((await h.api('/ui/home')).status,200);assert.equal(h.identityCalls,1);
  h.advance(1);
  assert.equal((await h.api('/ui/home')).status,401);assert.equal(h.identityCalls,2);
  assert.equal(await h.hasToken(),true);assert.deepEqual(h.writes,[]);
});

test('transient HTTP and malformed identity responses stay retryable and cannot become a cached sign-out',async()=>{
  const failures=[
    {status:429,data:null},{status:500,data:null},{status:503,data:null},
    {status:200,data:null},{status:200,data:{}},{status:200,data:{id:0}},
    {status:200,data:{id:'1'}},{status:200,data:{id:1.5}},
  ];
  for(const failure of failures){
    const h=await harness([failure,good]);
    const first=await h.api();
    assert.equal(first.status,502);assert.equal(first.data.loggedIn,undefined);
    assert.equal((await h.api()).data.loggedIn,true);assert.equal(h.identityCalls,2);
    assert.equal(await h.hasToken(),true);assert.deepEqual(h.writes,[]);
  }
});

test('connection failure preserves the existing bounded read retries and can recover on a later check',async()=>{
  const h=await harness([...Array.from({length:4},()=>({status:0,data:null})),good]);
  assert.equal((await h.api()).status,502);assert.equal(h.identityCalls,4);
  assert.equal((await h.api()).data.loggedIn,true);assert.equal(h.identityCalls,5);
  assert.equal(await h.hasToken(),true);assert.deepEqual(h.writes,[]);
});

test('a transient fresh verification leaves the existing account and bounded catalog cache intact',async()=>{
  const h=await harness([good,{status:503,data:null},good]);
  assert.equal((await h.api()).data.loggedIn,true);
  assert.equal((await h.api()).status,502);
  assert.deepEqual((await h.api('/ui/home')).data.me,user);assert.equal(h.identityCalls,2);
  assert.equal((await h.api()).data.loggedIn,true);assert.equal(h.identityCalls,3);
  assert.equal(await h.hasToken(),true);assert.deepEqual(h.writes,[]);
});

test('a delayed identity read cannot restore the memo after the provider completes logout',async()=>{
  const read=deferred(),h=await harness([read.promise]);
  const pending=h.api();
  await identityStarted(h);
  assert.equal((await h.api('/session','DELETE')).status,200);
  assert.equal(await h.hasToken(),false);assert.deepEqual(h.writes,['del']);
  read.resolve(good);
  assert.equal((await pending).status,502);
  assert.equal(h.memoUser,null);
  assert.equal((await h.api()).data.loggedIn,false);assert.equal(h.identityCalls,1);
  assert.equal(h.calls.filter(call=>call.path==='/v2/logout').length,1,'logout is never replayed');
});

test('a delayed identity read cannot overwrite a newly selected browser session',async()=>{
  const read=deferred(),other={id:2,name:'Other fixture'},h=await harness([read.promise,{status:200,data:other}]);
  const pending=h.api();
  await identityStarted(h);
  await h.changeToken();
  assert.deepEqual((await h.api()).data.user,other);
  read.resolve(good);
  assert.equal((await pending).status,502);
  assert.deepEqual(h.memoUser,other);assert.deepEqual(h.writes,['put'],'only the simulated new login changes the stored token');
});

test('a first catalog read can complete while a newer identity verification is still pending',async()=>{
  const first=deferred(),next=deferred(),h=await harness([first.promise,next.promise]);
  const catalog=h.api('/ui/home');
  await identityStarted(h);
  const check=h.api();
  await h.waitForIdentity(2);
  assert.equal(h.identityCalls,2);
  first.resolve(good);
  const page=await catalog;
  assert.equal(page.status,200);assert.equal(page.data.id,user.id);
  next.resolve({status:401,data:null});
  assert.equal((await check).data.loggedIn,false);assert.equal(h.memoUser,null);
});

test('an older completed identity lookup cannot replace a newer cached signed-out decision',async()=>{
  const read=deferred(),h=await harness([read.promise,{status:401,data:null}]);
  const pending=h.api();
  await identityStarted(h);
  assert.equal((await h.api()).data.loggedIn,false);
  read.resolve(good);
  assert.equal((await pending).data.loggedIn,false,'the older request returns the accepted newer decision');
  assert.equal(h.memoUser,null);
  assert.equal((await h.api('/ui/home')).status,401);assert.equal(h.identityCalls,2);
});

test('identity source drift and duplicate markers fail closed without loosening session access',()=>{
  for(const changed of [
    provider.replace('async function currentUser()','async function changedUser()'),
    provider.replace('"/v1/users/authenticated"','"/v1/users/changed"'),
    provider.replace('const u = await currentUser();','const u = await differentUser();'),
    provider.replace('if (!await currentUser())','if (!await differentUser())'),
    provider.replace('function forgetSession() {','function forgetSession(changed) {'),
    provider+provider,
  ])assert.throws(()=>transformText(workerSource(changed),'/_jar/sw.js',origin),/Provider session identity changed/);
});
