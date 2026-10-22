import test from 'node:test';
import assert from 'node:assert/strict';
import {boundedStorage} from '../public/hgola-startup.js';
import {readFileSync} from 'node:fs';
test('a blocked IndexedDB open reports a bounded error, ignores late callback and never deletes data',()=>{
 let callback,error,called=0;const timers=new Map();let n=0;
 const idb={getDB:(_name,cb)=>callback=cb,syncfs(){}};
 boundedStorage(idb,{},fn=>{timers.set(++n,fn);return n;},id=>timers.delete(id));
 idb.getDB('/idbfs',e=>{error=e;called++;});timers.values().next().value();assert.match(error.message,/timed out/);callback(null,{});assert.equal(called,1);
});
test('a stalled sync reports storage failure and keeps writes locked',()=>{
 const timers=[];let callback,error;const mount={kkeepStorageReady:true};let notices=0;
 boundedStorage({getDB(){},syncfs:(_m,_p,cb)=>callback=cb},{onPersistentStorageError(){notices++;}},fn=>timers.push(fn),()=>{});
 const idb={getDB(){},syncfs:(_m,_p,cb)=>callback=cb};boundedStorage(idb,{onPersistentStorageError(){notices++;}},fn=>timers.push(fn),()=>{});
 idb.syncfs(mount,true,e=>error=e);timers.at(-1)();assert.equal(mount.kkeepStorageReady,false);assert.match(error.message,/timed out/);assert.equal(notices,1);callback();assert.ok(error);
});
test('temporary session creates an in-memory directory before returning without mounting IndexedDB',()=>{
 const s=readFileSync(new URL('../public/games/hgola/2b6f1ee8-4d7e-4e17-9a9c-4a5c390d703b/framework-save3.js',import.meta.url),'utf8');assert.ok(s.includes('FS.mkdir("/idbfs");if(Module.kkeepTemporarySession)return;Module.__unityIdbfsMount='));
});

test('temporary play ignores manual save calls instead of accessing an absent persistent mount',()=>{
 const s=readFileSync(new URL('../public/games/hgola/2b6f1ee8-4d7e-4e17-9a9c-4a5c390d703b/framework-save3.js',import.meta.url),'utf8');assert.ok(s.includes('function _JS_FileSystem_Sync(){if(Module.kkeepTemporarySession)return;'));
});
