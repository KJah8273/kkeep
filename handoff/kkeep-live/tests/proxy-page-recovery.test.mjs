import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

test('missing Kkeep chunks refresh once while preserving cloud launch URLs',()=>{
 const events={},storage=new Map(),destinations=[];
 const context={URL,Date,navigator:{onLine:true},sessionStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},location:{href:'https://kkeep.test/cloud/geforce?launch=https%3A%2F%2Fplay.geforcenow.com%2F',origin:'https://kkeep.test',replace:url=>destinations.push(url)},addEventListener:(name,fn)=>events[name]=fn};
 const source=readFileSync(new URL('../public/page-recovery.js',import.meta.url),'utf8');
 const boot=()=>vm.runInNewContext(source,context);
 boot();
 events.error({target:{tagName:'SCRIPT',src:'https://unrelated.test/assets/broken.js'}});
 events.error({target:{tagName:'SCRIPT',src:'https://kkeep.test/browse/session/broken.js'}});
 assert.equal(destinations.length,0,'provider errors must not restart Kkeep');
 events.error({target:{tagName:'SCRIPT',src:'https://kkeep.test/assets/old.js'}});
 assert.equal(destinations.length,1);
 const destination=new URL(destinations[0]);
 assert.equal(destination.pathname,'/cloud/geforce');
 assert.equal(destination.searchParams.get('launch'),'https://play.geforcenow.com/');
 assert.ok(destination.searchParams.get('_kkeep_refresh'));
 boot();events['vite:preloadError']();
 assert.equal(destinations.length,1,'a persistent asset error must not create a reload loop');
});
