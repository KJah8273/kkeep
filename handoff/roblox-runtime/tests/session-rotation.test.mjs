import test from 'node:test';
import assert from 'node:assert/strict';
import {IDBFactory} from 'fake-indexeddb';
import {storeRotatedSessionToken} from '../worker/session-state.js';

function harness(){
  const indexedDB=new IDBFactory();
  const openDb=()=>new Promise((resolve,reject)=>{
    const open=indexedDB.open('rbxjar',1);
    open.onupgradeneeded=()=>open.result.createObjectStore('kv');
    open.onsuccess=()=>resolve(open.result);open.onerror=()=>reject(open.error);
  });
  const operation=async(mode,work)=>{
    const db=await openDb();
    try{return await new Promise((resolve,reject)=>{
      const tx=db.transaction('kv',mode),store=tx.objectStore('kv'),request=work(store);
      tx.oncomplete=()=>resolve(request?.result);
      tx.onerror=tx.onabort=()=>reject(tx.error);
    });}finally{db.close();}
  };
  return {openDb,put:value=>operation('readwrite',store=>store.put(value,'token')),
    get:()=>operation('readonly',store=>store.get('token')),
    del:()=>operation('readwrite',store=>store.delete('token')),
    other:()=>operation('readwrite',store=>store.put('keep','display-preference')),
    readOther:()=>operation('readonly',store=>store.get('display-preference'))};
}
const old='a'.repeat(120),rotated='b'.repeat(121),newLogin='c'.repeat(122);
const response=value=>({rawHeaders:{'Set-Cookie':'.ROBLOSECURITY='+value+'; Path=/'}});

test('normal cookie rotation commits once while retaining unrelated browser data',async()=>{
  const h=harness();await h.put(old);await h.other();
  assert.equal(await storeRotatedSessionToken(response(rotated),old,h.openDb),'stored');
  assert.equal(await h.get(),rotated);assert.equal(await h.readOther(),'keep');
});

test('a late HTTP response cannot recreate a token after logout',async()=>{
  const h=harness();await h.put(old);await h.del();
  assert.equal(await storeRotatedSessionToken(response(rotated),old,h.openDb),'stale');
  assert.equal(await h.get(),undefined);
});

test('an anonymous request cannot create a browser session from a response cookie',async()=>{
  const h=harness();
  assert.equal(await storeRotatedSessionToken(response(rotated),'',h.openDb),'none');
  assert.equal(await h.get(),undefined);
});

test('a late HTTP response cannot replace a newer browser session',async()=>{
  const h=harness();await h.put(newLogin);
  assert.equal(await storeRotatedSessionToken(response(rotated),old,h.openDb),'stale');
  assert.equal(await h.get(),newLogin);
});

test('rotation queued before logout finishes deleted; rotation queued after logout skips',async()=>{
  for(const rotationFirst of [true,false]){
    const h=harness();await h.put(old);
    const first=rotationFirst?storeRotatedSessionToken(response(rotated),old,h.openDb):h.del();
    const second=rotationFirst?h.del():storeRotatedSessionToken(response(rotated),old,h.openDb);
    await Promise.all([first,second]);
    assert.equal(await h.get(),undefined);
  }
});

test('separate worker connections compare the current IndexedDB value instead of stale memory',async()=>{
  const h=harness();await h.put(old);
  const workerA=()=>h.openDb(),workerB=()=>h.openDb();
  const results=await Promise.all([
    storeRotatedSessionToken(response(rotated),old,workerA),
    storeRotatedSessionToken(response(newLogin),old,workerB),
  ]);
  assert.equal(results.filter(value=>value==='stored').length,1);
  assert.equal(results.filter(value=>value==='stale').length,1);
  assert.ok([rotated,newLogin].includes(await h.get()));
});

test('the final eligible cookie retains the provider multiple-header semantics',async()=>{
  const h=harness();await h.put(old);
  const up={rawHeaders:{'set-cookie':['unrelated=unchanged','.ROBLOSECURITY='+rotated+'; Path=/','.ROBLOSECURITY='+newLogin+'; Path=/']}};
  assert.equal(await storeRotatedSessionToken(up,old,h.openDb),'stored');
  assert.equal(await h.get(),newLogin);
});
