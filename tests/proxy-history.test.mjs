import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

for(const engine of ['engine','gfn/engine','xbox/engine'])test(engine+': bundled history hook preserves omitted and null URLs and rewrites real navigation',()=>{
 const bundle=fs.readFileSync(new URL('../public/'+engine+'/scramjet.js',import.meta.url),'utf8');
 // Exercise the shipped module, not a second implementation of the fix.
 const start=bundle.indexOf('4397(e,t,r){');
 const end=bundle.indexOf('},5421(e,t,r){',start);
 assert.ok(start>=0&&end>start,'pinned history module must be present');
 const module=vm.runInNewContext('(function'+bundle.slice(start+4,end+1)+')');
 let init,hook;
 const require=id=>id===3129?{C:{dispatch(){}}}:{Qf:String,xP:URL};
 require.r=()=>{};require.d=(_,exports)=>{init=exports.default();};
 module({}, {}, require);
 const current=new URL('https://www.tiktok.com/?lang=en#feed');
 const rewrites=[];
 const client={url:current,rewriteUrl(value){rewrites.push(value);return 'proxy:'+value;},hooks:{lifecycle:{navigate:{}}}};
 init({box:{histories:new Map([['history',client]])},Proxy(_paths,h){hook=h.apply;}});
 for(const args of [[{},''],[{},'',undefined],[{},'',null]]){
  const before=args.slice();let calls=0;
  hook({this:'history',args,call(){calls++;},return(){assert.fail('unexpected rejection');}});
  assert.deepEqual(args,before);assert.equal(calls,1);
 }
 assert.deepEqual(rewrites,[]);
 const args=[{},'','/foryou'];let calls=0;
 hook({this:'history',args,call(){calls++;},return(){assert.fail('unexpected rejection');}});
 assert.equal(args[2],'proxy:/foryou');assert.equal(calls,1);
 assert.deepEqual(rewrites,['/foryou']);
});
