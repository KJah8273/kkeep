import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
globalThis.self=globalThis;
await import('../public/gfn/engine/scramjet.js');
const sj=globalThis.$scramjet;
sj.setWasm(fs.readFileSync(new URL('../public/gfn/engine/scramjet.wasm',import.meta.url)));
const bundle=fs.readFileSync(new URL('../public/gfn/engine/scramjet.js',import.meta.url),'utf8');
const start=bundle.indexOf('7492(e,t,r){'),end=bundle.indexOf('},2967(e,t,r){',start);
assert.ok(start>=0&&end>start);
const module=vm.runInNewContext('(function'+bundle.slice(start+4,end+1)+')');let parse;
const require=id=>({5994:{xP:URL,$D:Error,BR:Object.keys,nJ:Object.entries},5657:{v2:(url,context)=>url.href.startsWith(context.prefix.href)?decodeURIComponent(url.href.slice(context.prefix.href.length)):url.href},7623:{},7742:{A:{warn(){}}}}[id]);require.d=(_,exports)=>{parse=exports.T();};module({}, {},require);
const prefix=new URL('https://kkeep.example/gfn/browse/session/frame/');
const context={config:sj.defaultConfig,prefix,cookieJar:new sj.CookieJar(),interface:{codecEncode:encodeURIComponent,codecDecode:decodeURIComponent,getInjectScripts:()=>[]},hooks:{rewriter:{html:sj.Tap.create()}}};
const page='https://www.epicgames.com/id/login';
const entry='https://static-assets-prod.unrealengine.com/account-portal/static/assets/index-fixture.js';
const chunk='https://static-assets-prod.unrealengine.com/account-portal/static/assets/login-fixture.js';
const pageMeta=origin=>({origin:new URL(origin),base:new URL(origin),referrerPolicy:'strict-origin-when-cross-origin'});
const parsed=url=>parse({rawUrl:new URL(url),rawDestination:'script'},{context,trackedClients:new Map()});
const importTarget=code=>new URL(/\bfrom\s+["']([^"']+)/.exec(String(code))[1],prefix).href;
function staticTarget(origin=page,bytes=false,target='./index-fixture.js') {
 const dynamic=sj.rewriteUrl(chunk,context,pageMeta(origin),{isModule:true});
 const meta=parsed(dynamic).meta;
 let input=`import {instance} from ${JSON.stringify(target)}; export {instance};`;
 if(bytes)input=new TextEncoder().encode(input);
 const rewritten=sj.rewriteJs(input,chunk,context,meta,true);
 return importTarget(typeof rewritten==='string'?rewritten:new TextDecoder().decode(rewritten));
}
test('Epic entry, static re-import and dynamic import have one browser module identity',()=>{
 const html=sj.rewriteHtml(`<script type="module" src="${entry}"></script>`,context,pageMeta(page),{loadScripts:false,inline:false,source:page});
 const entryUrl=/\bsrc="([^"]+)"/.exec(html)[1].replaceAll('&amp;','&');
 const dynamic=sj.rewriteUrl(entry,context,pageMeta(page),{isModule:true});
 assert.equal(entryUrl,dynamic);
 assert.equal(staticTarget(),entryUrl,'A second URL would execute a second React runtime');
 assert.equal(staticTarget(page,true),entryUrl,'Byte-stream scripts use the same metadata');
});
test('module fetches retain the document initiator and CDN base for relative resolution',()=>{
 const url=sj.rewriteUrl(chunk,context,pageMeta(page),{isModule:true});const request=parsed(url);
 assert.equal(request.meta.moduleOrigin,'https://www.epicgames.com');
 assert.equal(request.meta.base.href,chunk);
 assert.equal(request.fetchInitiatorOrigin,'https://www.epicgames.com');
 const rewritten=staticTarget(page,false,'./nested/dependency.js?v=7');
 assert.equal(parsed(rewritten).url.href,'https://static-assets-prod.unrealengine.com/account-portal/static/assets/nested/dependency.js?v=7');
 assert.equal(new URL(rewritten).searchParams.get('$io'),'https://www.epicgames.com');
});
test('module origin cannot leak across sequential rewrites or change native URL behavior',()=>{
 assert.equal(new URL(staticTarget('https://play.geforcenow.com/mall/')).searchParams.get('$io'),'https://play.geforcenow.com');
 assert.equal(new URL(staticTarget()).searchParams.get('$io'),'https://www.epicgames.com');
 assert.equal(new URL(chunk).origin,'https://static-assets-prod.unrealengine.com');
 const unknown={...pageMeta(chunk),moduleOrigin:'not-an-origin'};
 const code=sj.rewriteJs('import {x} from "./x.js"',chunk,context,unknown,true);
 assert.equal(new URL(importTarget(code)).searchParams.get('$io'),'https://static-assets-prod.unrealengine.com');
});
test('account-linking strings and ordinary non-module URLs retain their original meaning',()=>{
 const value='https://www.epicgames.com/id/authorize?state=fixture-state&redirect_uri=https%3A%2F%2Fals.geforcenow.com%2Fcallback%2Fredirect';
 const code=sj.rewriteJs('const auth='+JSON.stringify(value)+';',chunk,context,pageMeta(page),true);
 assert.ok(String(code).includes(JSON.stringify(value)));
 const url=sj.rewriteUrl(value,context,pageMeta(page));
 assert.equal(parsed(url).url.href,value);
 assert.equal(new URL(url).searchParams.has('$module'),false);
});
