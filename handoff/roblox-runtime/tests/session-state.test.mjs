import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {IDBFactory} from 'fake-indexeddb';
import {transformText} from '../worker/gateway.js';
import {transformSessionState} from '../worker/session-state.js';

const network=fs.readFileSync(new URL('./fixtures/session-network.js',import.meta.url),'utf8');
const apiFixture=fs.readFileSync(new URL('./fixtures/session-api.js',import.meta.url),'utf8');
const original=`const CFG = new URL(location.href).searchParams;
const WS_PROTO = location.protocol === "https:" ? "wss" : "ws";
const WISP_MAIN = \`${'${WS_PROTO}'}://${'${location.host}'}/wisp/\`;
const WISP = CFG.get("wisp") || \`${'${WS_PROTO}'}://${'${location.host}'}/_rbx/wisp/\`;
async function viaJar(){}
${network}
${apiFixture}
\tfunction diag(k, m) {}
\tself.addEventListener("install", () => self.skipWaiting());
\tself.addEventListener("fetch", (e) => {
\t\tconst sj = self.$scramjetController;
\t\tif (sj && sj.shouldRoute(e)) e.respondWith(sj.route(e));
\t});`;
const origin='https://runtime.example';
const old='a'.repeat(120),rotated='b'.repeat(121),newLogin='c'.repeat(122);
const section=(source,start,end)=>{
  const a=source.indexOf(start),b=source.indexOf(end,a);
  assert.ok(a>=0&&b>a,'the public provider fixture retains its exact functions');
  return source.slice(a,b);
};
const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};};
const reply=(status=200,cookie)=>({status,headers:new Headers(),rawHeaders:cookie?{'Set-Cookie':'.ROBLOSECURITY='+cookie+'; Path=/'}:{},json:async()=>({id:1})});

async function harness({fixed=true,remoteStatus=200,readResponse=reply()}={}){
  const source=fixed?transformText(original,'/_jar/sw.js',origin):original;
  const calls=[],started=deferred();
  const scope={indexedDB:new IDBFactory(),URL,Request,Response,Headers,Date,Number,setTimeout,csrf:'',
    ROBLOX_ORIGIN:'https://www.roblox.com',MIN_TOKEN_LEN:100,stats:{rotated:0},JOB_ID:/^[a-f0-9-]{36}$/,
    viaUs:value=>value,createData:()=>({}),clearCache(){},diag(){},dropClient(){},
    isReadPost:()=>false,onSlot:(_slot,run)=>run(),hedged:go=>go(),
    client:async()=>({fetch:async(url,options)=>{
      calls.push({path:new URL(url).pathname,method:options.method});
      if(url.endsWith('/v1/users/authenticated')){started.resolve();return await (typeof readResponse==='function'?readResponse():readResponse);}
      assert.ok(url.endsWith('/v2/logout'));
      if(remoteStatus===0)throw new TypeError('synthetic relay failure');
      return reply(remoteStatus);
    }}),
  };
  vm.createContext(scope);
  vm.runInContext(section(source,'\tfunction db()', '\tconst POOL')+
    section(source,'\tasync function keepRotatedToken(', '\tconst HEDGE_MS')+
    section(source,'\tasync function rbxJson(', '\tlet userMemo = null')+
    section(source,'\tlet userMemo = null', '\tfunction diag(k, m)')+
    '\nglobalThis.auth={read:()=>rbxJson("users.roblox.com","/v1/users/authenticated"),api:rbxApi,kv,token};',scope);
  await scope.auth.kv('put','token',old);
  return {calls,started:started.promise,stats:scope.stats,read:()=>scope.auth.read(),
    get:()=>scope.auth.kv('get','token'),getToken:()=>scope.auth.token(),
    changeLogin:()=>scope.auth.kv('put','token',newLogin),
    async api(path='/session'){const url=new URL('/_rbx/api'+path,origin);const response=await scope.auth.api(new Request(url),url);return {status:response.status,data:await response.json()};},
    async logout(){const url=new URL('/_rbx/api/session',origin);const response=await scope.auth.api(new Request(url,{method:'DELETE'}),url);return {status:response.status,data:await response.json()};},
  };
}

test('the actual provider reports success and deletes local credentials after remote logout failure',async()=>{
  for(const remoteStatus of [0,503]){
    const h=await harness({fixed:false,remoteStatus});
    assert.equal((await h.logout()).status,200);
    assert.equal(await h.get(),undefined);
  }
});

test('hardened remote logout failure retains the current session and sends one mutation only',async()=>{
  for(const remoteStatus of [0,401,403,429,500,503]){
    const h=await harness({remoteStatus});
    const result=await h.logout();
    assert.equal(result.status,502);assert.equal(result.data.ok,undefined);
    assert.equal(await h.get(),old);assert.equal(await h.getToken(),old);
    assert.deepEqual(h.calls,[{path:'/v2/logout',method:'POST'}]);
  }
});

test('confirmed remote 200 and 204 logout replies clear the local token normally',async()=>{
  for(const remoteStatus of [200,204]){
    const h=await harness({remoteStatus});
    assert.deepEqual(await h.logout(),{status:200,data:{ok:true}});
    assert.equal(await h.get(),undefined);assert.equal(await h.getToken(),'');
  }
});

test('a normal response still rotates through the actual provider HTTP function and refreshes its memo',async()=>{
  const h=await harness({readResponse:reply(200,rotated)});
  assert.equal(await h.getToken(),old);
  assert.equal((await h.read()).status,200);
  assert.equal(await h.get(),rotated);assert.equal(await h.getToken(),rotated);
  assert.equal(h.stats.rotated,1);
});

test('session and launch verify a normally rotated token once before accepting its identity',async()=>{
  for(const path of ['/session','/launch?placeId=123']){
    const responses=[reply(200,rotated),reply()];
    const h=await harness({readResponse:()=>responses.shift()});
    const result=await h.api(path);
    assert.equal(result.status,200);
    if(path==='/session')assert.equal(result.data.loggedIn,true);
    else assert.equal(result.data.url,'/play/123');
    assert.equal(h.calls.length,2);assert.equal(h.calls.every(call=>call.method==='GET'),true);
    assert.equal(await h.getToken(),rotated);assert.equal(h.stats.rotated,1);
  }
});

test('repeated cookie changes stop after one identity recheck while preserving the newest token',async()=>{
  const responses=[reply(200,rotated),reply(200,newLogin)];
  const h=await harness({readResponse:()=>responses.shift()});
  const result=await h.api();
  assert.equal(result.status,502);assert.equal(result.data.loggedIn,undefined);
  assert.equal(h.calls.length,2);assert.equal(await h.getToken(),newLogin);
});

test('late actual provider HTTP completion cannot restore logout or overwrite a newer login',{timeout:5000},async()=>{
  for(const nextLogin of [false,true]){
    const response=deferred(),h=await harness({readResponse:response.promise});
    const reading=h.read();
    await h.started;
    assert.equal(h.calls.length,1);
    assert.equal((await h.logout()).status,200);
    assert.equal(await h.get(),undefined);
    if(nextLogin)await h.changeLogin();
    response.resolve(reply(200,rotated));
    assert.equal((await reading).status,200);
    assert.equal(await h.get(),nextLogin?newLogin:undefined);
    assert.equal(await h.getToken(),nextLogin?newLogin:'');
    assert.equal(h.stats.rotated,0);
  }
});

test('the hardening guard rejects changed provider rotation or logout contracts',()=>{
  for(const changed of [original.replace('async function keepRotatedToken(up, tok)', 'async function keepRotatedToken(up, other)'),original.replace('"/v2/logout", { method: "POST" }','"/v2/logout", { method: "PATCH" }')]){
    assert.throws(()=>transformSessionState(changed),/Provider logout contract changed/);
  }
  new Function(transformText(original,'/_jar/sw.js',origin));
});
