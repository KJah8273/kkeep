import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

async function harness(){
 let transport,calls=0,now=Date.parse('2026-10-26T10:00:00Z'),status=429,responseHeaders=[],body='provider error';
 const warnings=[],deadlines=[],requests=[];const hooks=new Map(),postKey={},navigateKey={};
 class Clock extends Date {static now(){return now;}}
 class Controller {
  frames=[];
  constructor(options){transport=options.transport;}
  wait(){return Promise.resolve();}
  createFrame(){const f={hooks:{fetch:{},error:{},init:{post:postKey}},go(){}};this.frames.push(f);return f;}
 }
 const context=vm.createContext({window:{addEventListener(){},removeEventListener(){}},location:new URL('https://kkeep.test/'),navigator:{userAgent:'Test Safari',language:'en',serviceWorker:{controller:{state:'activated',scriptURL:'https://kkeep.test/proxy-sw.js?v=9'}}},document:{createElement:()=>({setAttribute(){},addEventListener(){},remove(){}})},$scramjetController:{Controller},$scramjet:{Plugin:class{tap(key,fn){hooks.set(key,fn);}}},URL,Headers,Date:Clock,TextEncoder,TextDecoder,Uint8Array,ArrayBuffer,ReadableStream,Blob,Map,Set,Promise,setTimeout,clearTimeout,queueMicrotask,MutationObserver:class{observe(){}disconnect(){}},btoa,atob,fetch:async(_url,init)=>{calls++;requests.push(JSON.parse(atob(init.headers['X-Kha-Meta'])));return new Response(body,{headers:{'X-Kha-Response':btoa(JSON.stringify({status,statusText:'Too Many Requests',headers:responseHeaders}))}});}});
 vm.runInContext(readFileSync(new URL('../public/engine/kha-runtime.js',import.meta.url),'utf8'),context);
 const mount=async()=>{const h=await context.window.KHAProxy.mount({appendChild(){}},{onNavigate(){},onError(){},onWarning:s=>warnings.push(s),onRateLimit:t=>deadlines.push(t)});h.go('https://kick.com/');return h;};
 let handle=await mount();
 return {warnings,deadlines,requests,navigate:url=>{if(!hooks.has(navigateKey))hooks.get(postKey)({isTopLevel:true,client:{url:new URL('https://kick.com/'),hooks:{lifecycle:{navigate:navigateKey}}},window:{document:{title:'',readyState:'loading'},addEventListener(){}}});hooks.get(navigateKey)({}, {url});},get calls(){return calls;},get now(){return now;},advance:ms=>now+=ms,response:(s,h=[],b='provider error')=>{status=s;responseHeaders=h;body=b;},send:(url='https://kick.com/api/v1/channels?limit=20',method='GET',body=null,headers=[])=>transport.request(new URL(url),method,body,headers),restart:async()=>{handle.destroy();handle=await mount();},close:()=>handle.destroy()};
}

test('Kick 429 honors Retry-After and stops endpoint retries across query changes and tab restarts',async()=>{
 const h=await harness();try{
  h.response(429,[['Retry-After','120'],['Set-Cookie','private=secret']],'original rate-limit body');
  const original=await h.send();assert.equal(await new Response(original.body).text(),'original rate-limit body');assert.equal(h.calls,1);assert.equal(h.deadlines.at(-1),h.now+120000);
  await h.restart();h.advance(10000);
  const paused=await h.send('https://kick.com/api/v1/channels?limit=50');
  assert.equal(h.calls,1);assert.equal(paused.status,429);assert.equal(new Headers(paused.headers).get('retry-after'),'110');assert.equal(new Headers(paused.headers).get('set-cookie'),null);
  assert.match(await new Response(paused.body).text(),/Kkeep paused/);assert.match(h.warnings.at(-1),/Kick is limiting/);
  h.advance(110001);h.response(200,[],'real channels');assert.equal(await new Response((await h.send()).body).text(),'real channels');assert.equal(h.calls,2);assert.equal(h.warnings.at(-1),'');assert.equal(h.deadlines.at(-1),0);
 }finally{h.close();}
});

test('Kick cooldown parses HTTP dates and defaults to one minute when Retry-After is absent or invalid',async()=>{
 for(const value of [null,'invalid',new Date(Date.parse('2026-10-26T10:00:00Z')+90000).toUTCString()]){
  const h=await harness();try{h.response(429,value?[['Retry-After',value]]:[]);await h.send();assert.equal(h.deadlines.at(-1)-h.now,value?.includes('GMT')?90000:60000);}finally{h.close();}
 }
});

test('cooldown leaves streams, other endpoints, other websites and user POSTs untouched and never replays them',async()=>{
 const h=await harness();try{
  await h.send();h.response(200,[],'ok');
  for(const [url,method,body] of [['https://kick.com/api/v1/channels','POST','password=example'],['https://kick.com/api/v2/other','GET',null],['https://kick.com/ivs/video.m3u8','GET',null],['https://example.org/api/v1/channels','GET',null]]){const before=h.calls;assert.equal((await h.send(url,method,body)).status,200);assert.equal(h.calls,before+1);}
  assert.equal(h.requests.filter(r=>r.method==='POST').length,1);
  assert.equal((await h.send()).status,429);assert.equal(h.calls,5);
 }finally{h.close();}
});


test('new-page navigation clears stale warnings while retaining the endpoint cooldown',async()=>{
 const h=await harness();try{
  await h.send();assert.match(h.warnings.at(-1),/429/);
  h.navigate('https://kick.com/browse');assert.equal(h.warnings.at(-1),'');assert.equal(h.deadlines.at(-1),0);
  assert.equal((await h.send()).status,429);assert.equal(h.calls,1);assert.match(h.warnings.at(-1),/429/);
 }finally{h.close();}
});


test('Kick page responses also respect the cooldown, including document requests outside API paths',async()=>{
 for(const kind of ['document','iframe']){
  const h=await harness();try{
   const headers=[['sec-fetch-dest',kind]];
   h.response(429,[['Retry-After','90']]);
   await h.send('https://kick.com/?_rsc=first','GET',null,headers);
   assert.equal(h.deadlines.at(-1),h.now+90000);
   const result=await h.send('https://kick.com/?_rsc=second','GET',null,headers);
   assert.equal(result.status,429);assert.equal(h.calls,1);assert.equal(new Headers(result.headers).get('retry-after'),'90');
  }finally{h.close();}
 }
});


test('a rate-limited user POST shows the retry deadline without automatic replay or stored response data',async()=>{
 const h=await harness();try{
  h.response(429,[['Retry-After','75']],'original');
  const result=await h.send('https://kick.com/api/v1/login','POST','example');
  assert.equal(await new Response(result.body).text(),'original');assert.equal(h.calls,1);assert.equal(h.deadlines.at(-1),h.now+75000);
 }finally{h.close();}
});
