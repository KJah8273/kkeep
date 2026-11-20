import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

for(const engine of ['engine','gfn/engine','xbox/engine'])test(engine+': shipped WebSocket hook selects destination cookies and exposes the negotiated protocol',()=>{
 const bundle=fs.readFileSync(new URL('../public/'+engine+'/scramjet.js',import.meta.url),'utf8');
 const start=bundle.indexOf('3342(e,t,r){');
 const rest=bundle.slice(start+4);
 const boundary=/},\d+\(e,t,r\)\{/.exec(rest);
 assert.ok(start>=0&&boundary,'pinned WebSocket module must be present');
 const module=vm.runInNewContext('(function'+rest.slice(0,boundary.index+1)+')',{EventTarget,Event,MessageEvent,Blob,ReadableStream,WritableStream,ArrayBuffer,Promise});
 let init;const require=()=>({qm:WeakMap,xP:URL,Cu:Object.setPrototypeOf,rF:Reflect.get});
 require.r=()=>{};require.d=(_,exports)=>{init=exports.default();};module({}, {}, require);
 const hooks={},traps={},listeners={};let cookieUrl,headers,fake;
 const socket={protocol:'snap-protocol',extensions:'',addEventListener(type,fn){listeners[type]=fn;}};
 init({url:new URL('https://www.snapchat.com/web/'),context:{cookieJar:{getCookies(url){cookieUrl=url;return url.hostname==='socket.snapchat.com'?'socket_session=test':'wrong_page_cookie=test';}}},bare:{createWebSocket(_url,_protocols,h){headers=h;return socket;}},Proxy(name,hook){hooks[name]=hook;},Trap(name,hook){traps[name]=hook;}},{navigator:{userAgent:'Test'}});
 hooks.WebSocket.construct({args:['wss://socket.snapchat.com/chat',['snap-protocol']],fn:EventTarget,return(value){fake=value;}});
 assert.equal(cookieUrl.href,'wss://socket.snapchat.com/chat');
 assert.equal(headers.find(([name])=>name==='Cookie')[1],'socket_session=test');
 assert.equal(headers.find(([name])=>name==='Origin')[1],'https://www.snapchat.com');
 listeners.open();
 assert.equal(traps['WebSocket.prototype.protocol'].get({this:fake}),'snap-protocol');
});
