import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import * as idb from 'fake-indexeddb';
import {readProxyEngine,isProxyEngine,saveProxyEngine} from '../lib/proxy-engines.ts';

function worker(upstream){
  const requests=[];
  const ctx=vm.createContext({...idb,crossOriginIsolated:false,console,WebSocket,MessagePort,MessageChannel,URL,Headers,Request,Response,TextEncoder,TextDecoder,ReadableStream,Blob,Event,EventTarget,DOMException,MessageEvent,atob,btoa,setTimeout,clearTimeout,structuredClone,
    location:new URL('https://kkeep.fun/uv/sw.js'),navigator:{userAgent:'iPad Safari',language:'en'},indexedDB:new idb.IDBFactory(),IDBKeyRange:idb.IDBKeyRange,
    clients:{matchAll:async()=>[]},fetch:async(url,options)=>{
      assert.equal(url,'https://kkeep.fun/api/relay');assert.equal(options.credentials,'same-origin');
      const meta=JSON.parse(Buffer.from(options.headers['X-Kha-Meta'],'base64').toString());requests.push(meta);
      const result=upstream(meta),packed=Buffer.from(JSON.stringify({status:result.status||200,statusText:'OK',headers:result.headers||[['content-type','text/html']]})).toString('base64');
      return new Response(result.body,{headers:{'X-Kha-Response':packed}});
    }});
  ctx.self=ctx;
  for(const file of ['uv.bundle.js','uv.config.js','uv.sw.js'])vm.runInContext(readFileSync('public/uv/'+file,'utf8'),ctx);
  return {proxy:vm.runInContext('new UVServiceWorker()',ctx),ctx,requests};
}

test('the real Ultraviolet engine rewrites HTML, script, image, and navigation through Kkeep',async()=>{
  const {proxy,requests}=worker(()=>({body:'<!doctype html><html><head><title>Example</title></head><body><a href="/next">Next</a><img src="/photo.jpg"><script src="/app.js"></script></body></html>'}));
  const request=new Request('https://kkeep.fun/uv/service/'+encodeURIComponent('https://example.org/start'));
  Object.defineProperty(request,'destination',{value:'document'});
  const response=await proxy.fetch({request});const text=await response.text();
  assert.equal(response.status,200);assert.match(text,/uv\.handler\.js/);
  assert.ok(text.includes('https%3A%2F%2Fexample.org%2Fnext'));assert.ok(text.includes('https%3A%2F%2Fexample.org%2Fphoto.jpg'));assert.ok(text.includes('https%3A%2F%2Fexample.org%2Fapp.js'));
  assert.equal(requests[0].url,'https://example.org/start');
});
test('Ultraviolet rewrites script fetch destinations using its own rewriter',async()=>{
  const {proxy}=worker(()=>({body:'fetch("/api/feed"); location.href = "/next";',headers:[['content-type','application/javascript']]}));
  const request=new Request('https://kkeep.fun/uv/service/'+encodeURIComponent('https://example.org/app.js'));
  Object.defineProperty(request,'destination',{value:'script'});
  const response=await proxy.fetch({request});const text=await response.text();assert.match(text,/__uv\.\$get\(location\)/);assert.doesNotMatch(text,/Scramjet/);
});
test('relay adapter preserves duplicate cookies and rejects non-web destinations',async()=>{
  const {ctx}=worker(()=>({body:'ok',headers:[['content-type','text/plain'],['set-cookie','one=1; Path=/'],['set-cookie','two=2; Path=/']]}));
  const client=vm.runInContext('new Ultraviolet.BareClient()',ctx);
  const response=await client.fetch('https://example.org/');assert.deepEqual(Array.from(response.rawHeaders['set-cookie']),['one=1; Path=/','two=2; Path=/']);assert.equal(response.finalURL,'https://example.org/');
  await assert.rejects(client.fetch('file:///etc/passwd'),/Unsupported/);
});
test('engine preferences reject invalid or unavailable engines and survive blocked storage',()=>{
  globalThis.localStorage={getItem:()=>{throw Error('private');},setItem:()=>{throw Error('private');}};
  assert.equal(readProxyEngine(),'scramjet-v2');assert.equal(readProxyEngine('ultraviolet'),'ultraviolet');assert.equal(readProxyEngine('eproxy'),'scramjet-v2');assert.equal(isProxyEngine('javascript:alert(1)'),false);saveProxyEngine('ultraviolet');delete globalThis.localStorage;
});

test('Ultraviolet keeps redirect targets inside its own engine',async()=>{
  const {proxy}=worker(()=>({body:null,status:302,headers:[['location','https://example.org/next']]}));
  const response=await proxy.fetch({request:new Request('https://kkeep.fun/uv/service/'+encodeURIComponent('https://example.org/old'))});
  assert.equal(response.status,302);
  assert.equal(response.headers.get('location'),'https://kkeep.fun/uv/service/'+encodeURIComponent('https://example.org/next'));
});

test('Ultraviolet sockets wait for the upstream handshake and survive native API hooks',()=>{
  const sockets=[];
  class NativeSocket extends EventTarget {
    constructor(url){super();this.endpoint=url;this.sent=[];this.nativeState=0;sockets.push(this);}
    get readyState(){return this.nativeState;}
    set binaryType(value){this.nativeBinaryType=value;}
    send(data){this.sent.push(data);}
    close(code,reason){this.nativeState=3;this.dispatchEvent(new LocalCloseEvent('close',{code,reason,wasClean:true}));}
  }
  class LocalCloseEvent extends Event {constructor(type,init){super(type);Object.assign(this,init);}}
  const ctx=vm.createContext({fetch,location:new URL('https://kkeep.fun/uv/service/'),WebSocket:NativeSocket,EventTarget,Event,MessageEvent,CloseEvent:LocalCloseEvent,DOMException,URL,TextEncoder,TextDecoder,Headers,Response,btoa,atob});
  ctx.self=ctx;ctx.Ultraviolet={};vm.runInContext(readFileSync('lib/uv-relay.js','utf8'),ctx);
  // UV replaces these methods globally; the relay must keep the native methods.
  NativeSocket.prototype.send=()=>{throw Error('hooked');};NativeSocket.prototype.close=()=>{throw Error('hooked');};
  Object.defineProperty(NativeSocket.prototype,'readyState',{get(){throw Error('hooked');}});
  const ws=vm.runInContext('new Ultraviolet.BareClient().createWebSocket("wss://example.org/live", ["chat"], null, {Origin:"https://example.org"})',ctx);
  const socket=sockets[0];let opened=0;let message='';
  ws.addEventListener('open',()=>opened++);ws.addEventListener('message',event=>message=event.data);
  socket.nativeState=1;socket.dispatchEvent(new Event('open'));
  assert.equal(opened,0);assert.equal(ws.readyState,0);
  assert.deepEqual(JSON.parse(socket.sent[0]),{url:'wss://example.org/live',protocols:['chat'],headers:[['Origin','https://example.org']]});
  socket.dispatchEvent(new MessageEvent('message',{data:JSON.stringify({type:'open'})}));
  assert.equal(opened,1);assert.equal(ws.readyState,1);
  ws.send('hello');assert.equal(socket.sent[1],'hello');
  socket.dispatchEvent(new MessageEvent('message',{data:'world'}));assert.equal(message,'world');
  ws.close();assert.equal(ws.readyState,3);
});

test('a returning Ultraviolet session uses its active worker while an update is stalled',async()=>{
  let registered=0,updated=0;const frames=[];
  const ctx=vm.createContext({URL,Error,Promise,setTimeout,clearTimeout,setInterval:()=>1,clearInterval(){},location:new URL('https://kkeep.fun/browser'),
    navigator:{serviceWorker:{getRegistration:async()=>({scope:'https://kkeep.fun/uv/',active:{state:'activated'},update(){updated++;return new Promise(()=>{});}}),register(){registered++;return new Promise(()=>{});}}},
    document:{createElement:()=>({style:{},setAttribute(){},addEventListener(){},removeEventListener(){},remove(){}})}});
  ctx.window=ctx;vm.runInContext(readFileSync('public/uv/runtime.js','utf8'),ctx);
  let navigated='';const handle=await ctx.KkeepUVProxy.mount({appendChild:frame=>frames.push(frame)},{onNavigate:url=>navigated=url});
  handle.go('https://example.org/a?q=one#part');
  assert.equal(registered,0);assert.equal(updated,1);assert.equal(navigated,'https://example.org/a?q=one#part');
  assert.equal(frames[0].src,'/uv/service/'+encodeURIComponent(navigated));handle.destroy();
});
