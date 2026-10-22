import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const base=new URL('../public/games/hgola/2b6f1ee8-4d7e-4e17-9a9c-4a5c390d703b/',import.meta.url);
function engine(patched){
 const source=readFileSync(new URL(patched?'framework-save2.js':'framework.js',base),'utf8');
 const start=source.indexOf('var IDBFS='),end=source.indexOf(';var FS=',start),pending=[],notices=[];
 const context=vm.createContext({Module:{onPersistentStorageError:e=>notices.push(e)},setTimeout:fn=>pending.push(fn),Error,Date,console});
 vm.runInContext(source.slice(start,end)+';this.result=IDBFS;',context);
 return {idb:context.result,pending,notices};
}
function failRemote(idb){
 let tx;
 idb.getDB=(_name,cb)=>cb(null,{transaction(){tx={objectStore:()=>({index:()=>({openKeyCursor:()=>({})})})};return tx;}});
 return ()=>tx.onerror({target:{error:new Error('Safari storage temporarily unavailable')},preventDefault(){}});
}
const local={type:'local',entries:{'/idbfs/PlayerPrefs':{timestamp:new Date(1000)}}};
test('reproduces the screenshot failure in the untouched Unity storage code',()=>{
 const {idb}=engine(false);idb.getLocalSet=(_mount,cb)=>cb(null,local);const fail=failRemote(idb);
 idb.syncfs({mountpoint:'/idbfs'},false,()=>{});
 assert.throws(fail,/entries/);
});
test('patched Unity forwards the real error instead of reconciling with undefined files',()=>{
 const {idb,pending}=engine(true);idb.getLocalSet=(_mount,cb)=>cb(null,local);const fail=failRemote(idb);let error,calls=0,reconciles=0;
 idb.reconcile=()=>reconciles++;
 idb.syncfs({mountpoint:'/idbfs',kkeepStorageReady:true},false,e=>{error=e;calls++;});
 assert.doesNotThrow(fail);while(pending.length){pending.shift()();assert.doesNotThrow(fail);}assert.match(error.message,/Safari storage/);assert.equal(calls,1);assert.equal(reconciles,0);
});
test('a transient read reopens storage and succeeds without deleting saved entries',()=>{
 const {idb,pending,notices}=engine(true),mount={mountpoint:'/idbfs'};let tries=0,closed=0,done=0;
 idb.dbs['/idbfs']={close(){closed++;}};
 idb.getLocalSet=(_m,cb)=>cb(null,{type:'local',entries:{}});
 idb.getRemoteSet=(_m,cb)=>{tries++;if(tries===1)cb(Error('temporarily closed'));else cb(null,{type:'remote',entries:{}});};
 idb.syncfs(mount,true,error=>{assert.equal(error,null);done++;});
 assert.equal(done,0);pending.shift()();assert.equal(tries,2);assert.equal(closed,1);assert.equal(done,1);assert.equal(mount.kkeepStorageReady,true);assert.equal(notices.length,0);
});
test('failed startup never overwrites unread progress and reports only once',()=>{
 const {idb,pending,notices}=engine(true),mount={mountpoint:'/idbfs'};let reads=0,finished=0;
 idb.getLocalSet=(_m,cb)=>cb(null,{type:'local',entries:{}});
 idb.getRemoteSet=(_m,cb)=>{reads++;cb(Error('storage denied'));cb(Error('duplicate abort'));};
 idb.syncfs(mount,true,error=>{assert.ok(error);finished++;});while(pending.length)pending.shift()();
 assert.equal(reads,3);assert.equal(finished,1);assert.equal(notices.length,1);assert.equal(mount.kkeepStorageReady,false);
 idb.syncfs(mount,false,error=>assert.match(error.message,/refusing to overwrite/));assert.equal(reads,3);
});
test('missing file lists are errors, never interpreted as an empty save to reconcile',()=>{
 const {idb}=engine(true);let error;assert.doesNotThrow(()=>idb.reconcile(local,undefined,e=>error=e));assert.match(error.message,/unavailable/);
});
