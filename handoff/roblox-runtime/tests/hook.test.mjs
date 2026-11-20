import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {transformText} from '../worker/gateway.js';

const origin='https://runtime.example';
const fixture=readFileSync(new URL('./fixtures/hook.js',import.meta.url),'utf8');
const stub=readFileSync(new URL('./fixtures/stub.js',import.meta.url),'utf8');
const player=readFileSync(new URL('./fixtures/WasmPlayer-1ef.js',import.meta.url),'utf8');
const loader=readFileSync(new URL('./fixtures/WasmLoader.js',import.meta.url),'utf8');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const decode=value=>atob(value.replace(/-/g,'+').replace(/_/g,'/'));

function install(scope,source=fixture,path='/hook.js') {
 const transformed=transformText(source,path,origin);
 new vm.Script(transformed);
 const start=transformed.indexOf('function install(scope, origin) {');
 const end=transformed.indexOf('  const reroute = install(globalThis, PROXY_ORIGIN);',start);
 assert.ok(start>=0&&end>start);
 const context=vm.createContext({URL,Request,Response,Headers,DOMException,TextEncoder,TextDecoder,ReadableStream,WritableStream,
  MessageChannel,ArrayBuffer,Uint8Array,DataView,btoa,atob,setTimeout,clearTimeout,console:{log(){},warn(){},error(){}},...scope});
 vm.runInContext(transformed.slice(start,end)+'\ninstall(globalThis,'+JSON.stringify(origin)+');',context);
 return context;
}

test('current page and actual embedded worker hook both transform without rejecting the provider relay layout',()=>{
 for(const [source,path] of [[fixture,'/hook.js'],[stub,'/277b9a60aa4d6118e89b19fbc8ca6f1e4e5eb81a/assets/webclient/stub.js']]) {
  const text=transformText(source,path,origin);
  assert.doesNotThrow(()=>new vm.Script(text));
  assert.ok(text.includes('wss://api.spf50krem.com'));
  assert.ok(!text.includes('const NativeMemory = WebAssembly.Memory;'));
  assert.ok(text.includes('function sessionClient('));
 }
 const unknown=fixture.replace('let wtPath = "/_rbx/wt";','let wtPath = readConfig();');
 assert.throws(()=>transformText(unknown,'/hook.js',origin),/relay paths changed/);
});

test('actual current player script has the verified iPad memory and mobile predicate without changing desktop defaults',()=>{
 const path='/_/c2V0dXAucmJ4Y2RuLmNvbQ/webclient/version-1ef59424f70d4932-RobloxWebClient/WasmPlayer.js';
 const text=transformText(player,path,origin);
 assert.doesNotThrow(()=>new vm.Script(text));
 const predicate=text.match(/function _e\(\)\{[^}]+\}/)?.[0];
 assert.ok(predicate);
 const run=new Function('window','navigator',predicate+';return _e();');
 assert.equal(run({__kkeepRuntime:{mobile:true}},{userAgent:'Mozilla/5.0 (Macintosh; Intel Mac OS X)',platform:'MacIntel',maxTouchPoints:5}),true);
 assert.equal(run({__kkeepRuntime:{mobile:false}},{userAgent:'Mozilla/5.0 (Macintosh; Intel Mac OS X)',platform:'MacIntel',maxTouchPoints:0}),false);
 const memory=text.match(/parseInt\(\(window\.__kkeepRuntime\?\.mobile&&\(i\.applicationSettings\.FIntWasmMemoryPages="16384"\),i\.applicationSettings\.FIntWasmMemoryPages\?\?"32768"\)\)/)?.[0];
 assert.ok(memory);
 const pages=new Function('window','i','return '+memory);
 assert.equal(pages({__kkeepRuntime:{mobile:true}},{applicationSettings:{}}),16384);
 assert.equal(pages({__kkeepRuntime:{mobile:false}},{applicationSettings:{}}),32768);
});

test('both relay layouts retain target and certificate parameters on the existing provider endpoint',async()=>{
 for(const legacy of [false,true])for(const staging of [false,true]) {
  const sockets=[];
  class Socket {
   constructor(url){this.url=url;this.listeners={};sockets.push(this);}
   addEventListener(type,fn){this.listeners[type]=fn;}
   close(){this.listeners.close?.();}
  }
  const source=legacy?fixture.replace('origin.replace(/^http/, "ws") + wtPath + "?t="','origin.replace(/^http/, "ws") + "/_rbx/wt?t="'):fixture;
  const context=install({document:{},sessionStorage:{getItem:()=>staging?'/_rbx/app-staging/':null},fetch:async()=>new Response(''),WebSocket:Socket},source);
  const options={serverCertificateHashes:[{algorithm:'sha-256',value:new Uint8Array([1,2,3])}]};
  const transport=new context.WebTransport('https://game.example:444/session?ticket=test-fixture',options);
  await tick();
  assert.equal(sockets.length,1);
  const url=new URL(sockets[0].url);
  assert.equal(url.origin,'wss://api.spf50krem.com');
  assert.equal(url.pathname,!legacy&&staging?'/_rbx/wt-stg':'/_rbx/wt');
  assert.equal(decode(url.searchParams.get('t')),'game.example:444');
  assert.equal(decode(url.searchParams.get('p')),'/session?ticket=test-fixture');
  assert.equal(url.searchParams.get('h'),'AQID');
  transport.close();
 }
});

test('restored hook routes public version discovery so the real loader replaces a stale cached engine',async()=>{
 const version='version-1ef59424f70d4932';
 const cached='version-f4a4-stale-fixture';
 for(const hookEnabled of [false,true]) {
  const requests=[],scripts=[],storage=new Map([['clientVersion_prod',JSON.stringify({clientVersionUpload:cached,channelName:'',version:'old'})]]);
  class Script {constructor(){this.src=origin+'/assets/webclient/WasmLoader.js';}}
  const values={URL,HTMLScriptElement:Script,location:new URL(origin+'/games/start'),
   document:{currentScript:new Script(),createElement:()=>new Script(),body:{appendChild:s=>scripts.push(s)},getElementById:()=>null},
   localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v)},
   sessionStorage:{getItem:()=>null},robloxWasmHostConfig:{server:'prod'},console:{log(){},warn(){},error(){}},
   fetch:async raw=>{
    const u=new URL(String(raw));requests.push(u);
    if(u.origin!==origin)throw new TypeError('Cross-origin version discovery unavailable');
    if(u.pathname.endsWith('/v2/client-version/WebClientApp'))return Response.json({clientVersionUpload:version,version:'current'});
    return new Response(null,{status:503});
   }};
  const context=hookEnabled?install(values):vm.createContext(values);
  context.window=context;
  // This test isolates version routing; controlled startup ordering and
  // rejection are exercised against the full loader in engine-loader.test.
  if(hookEnabled)context.__kkeepSessionReady=async controlled=>assert.equal(controlled,true);
  // The unpatched provider loader reproduces the original failure; the
  // repaired loader + hook must use normal discovery before any fallback.
  const source=hookEnabled?transformText(loader,'/assets/webclient/WasmLoader.js',origin):loader.replaceAll('https://api.spf50krem.com',origin);
  vm.runInContext(source,context);
  await tick();
  assert.equal(scripts.length,1);
  assert.ok(scripts[0].src.includes((hookEnabled?version:cached)+'-RobloxWebClient/WasmPlayer.js'));
  const discovery=requests.find(u=>u.pathname.endsWith('/v2/client-version/WebClientApp'));
  assert.equal(discovery.origin,hookEnabled?origin:'https://clientsettings.roblox.com');
  if(hookEnabled){
   assert.ok(discovery.pathname.startsWith('/_/'+btoa('clientsettings.roblox.com').replace(/=+$/,'')));
   assert.equal(JSON.parse(storage.get('clientVersion_prod')).clientVersionUpload,version);
  }
 }
});
