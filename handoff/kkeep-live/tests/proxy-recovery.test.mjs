import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const recovery=readFileSync(new URL('../public/session-recovery.js',import.meta.url),'utf8');
function run(from,{framed=false,last=0}={}){
 let redirect=null,message=null;const nodes={reopen:{},message:{}};
 const win={};win.parent=framed?{postMessage:m=>message=m}:win;
 vm.runInNewContext(recovery,{URL,URLSearchParams,Date,window:win,location:{origin:'https://kkeep.example',search:'?from='+encodeURIComponent(from),replace:s=>redirect=s},sessionStorage:{getItem:()=>last,setItem(){}},document:{getElementById:id=>nodes[id]}});
 return {redirect,message,nodes};
}
test('expired tabs reopen the original URL in a fresh shell session',()=>{
 const target='https://www.tiktok.com/@user/video/123?lang=ar';
 const result=run('/browse/session/frame/'+encodeURIComponent(target));
 assert.equal(result.redirect,'/?launch='+encodeURIComponent(target));
});
test('embedded expired sessions notify only their own same-origin shell',()=>{
 const r=run('/browse/session/frame/'+encodeURIComponent('https://www.tiktok.com/'),{framed:true});
 assert.equal(r.redirect,null);assert.equal(r.message.type,'kkeep-session-expired');
});
test('expired gaming sign-in pages recover through the isolated V2 launcher',()=>{
 const target='https://www.epicgames.com/id/login?redirectUrl=https%3A%2F%2Fplay.geforcenow.com%2F';
 const result=run('/gfn/browse/session/frame/'+encodeURIComponent(target));
 assert.equal(result.redirect,'/gfn/index.html?launch='+encodeURIComponent(target));
});
test('expired Microsoft sign-in recovers through Xbox instead of GeForce or home',()=>{
 const target='https://login.live.com/oauth20_authorize.srf?state=fixture-state&redirect_uri=https%3A%2F%2Fwww.xbox.com%2Fauth%2Fmsa%3FreturnUrl%3D%252Fen-us%252Fplay';
 const result=run('/xbox/browse/session/frame/'+encodeURIComponent(target));
 assert.equal(result.redirect,'/xbox/index.html?launch='+encodeURIComponent(target));
});
test('recovery rejects executable URLs and repeated automatic loops',()=>{
 for(const target of ['javascript:alert(1)','https://user:pass@example.com/','https://kkeep.example/browse/a/b/x'])assert.equal(run('/browse/a/b/'+encodeURIComponent(target)).redirect,null);
 assert.equal(run('/browse/a/b/'+encodeURIComponent('https://example.com/'),{last:Date.now()}).redirect,null);
});
for(const scope of ['','gfn/','xbox/'])test(scope+'expired subresources fail instead of returning a homepage as video bytes',async()=>{
 const listeners={};let response;
 const ctx={URL,Response,importScripts(){},self:{addEventListener:(n,f)=>listeners[n]=f},$scramjetController:{shouldRoute:()=>false}};
 vm.runInNewContext(readFileSync(new URL('../public/'+scope+'proxy-sw.js',import.meta.url),'utf8'),ctx);
 listeners.fetch({request:{url:'https://kkeep.example/'+scope+'browse/a/b/video',destination:'video'},respondWith:r=>response=r});
 assert.equal((await response).status,410);
 listeners.fetch({request:{url:'https://kkeep.example/'+scope+'browse/a/b/site',destination:'document',mode:'navigate'},respondWith:r=>response=r});
 assert.equal((await response).status,302);assert.match((await response).headers.get('location'),/\/recover.html/);
});
