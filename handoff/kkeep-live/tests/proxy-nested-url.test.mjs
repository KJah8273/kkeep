import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
for(const engine of ['engine','gfn/engine','xbox/engine'])test(engine+': nested proxy URLs unwrap only within their frame and retain the real-origin guard',()=>{
 const bundle=fs.readFileSync(new URL('../public/'+engine+'/scramjet.js',import.meta.url),'utf8');const start=bundle.indexOf('7492(e,t,r){'),end=bundle.indexOf('},2967(e,t,r){',start);assert.ok(start>=0&&end>start);
 const module=vm.runInNewContext('(function'+bundle.slice(start+4,end+1)+')');let parse;
 const require=id=>({5994:{xP:URL,$D:Error,BR:Object.keys,nJ:Object.entries},5657:{v2:(url,context)=>url.href.startsWith(context.prefix.href)?decodeURIComponent(url.href.slice(context.prefix.href.length)):url.href},7623:{},7742:{A:{warn(){}}}}[id]);require.d=(_,exports)=>{parse=exports.T();};module({}, {},require);
 const prefix='https://kkeep.test/browse/session/frame/';const wrap=url=>prefix+encodeURIComponent(url);const read=url=>parse({rawUrl:new URL(url),rawDestination:'document'},{context:{prefix:new URL(prefix)},trackedClients:new Map()});
 assert.equal(read(wrap('https://play.geforcenow.com/')).url.href,'https://play.geforcenow.com/');assert.equal(read(wrap(wrap('https://play.geforcenow.com/mall?x=1'))).url.href,'https://play.geforcenow.com/mall?x=1');
 for(const url of ['https://kkeep.test/api/browser-data','https://kkeep.test/browse/another/frame/https%3A%2F%2Fexample.com'])assert.throws(()=>read(wrap(url)),/same origin/);
 let excessive='https://play.geforcenow.com/';for(let i=0;i<6;i++)excessive=wrap(excessive);assert.throws(()=>read(excessive),/same origin/);
});
