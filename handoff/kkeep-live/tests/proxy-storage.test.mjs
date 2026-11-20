import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Execute the storage hook from the exact bundle served to TikTok. Never inspect
// real browser storage or account data; these are disposable synthetic entries.
class StorageFixture {
  getItem(key) { return Object.hasOwn(this, String(key)) ? this[String(key)] : null; }
  setItem(key, value) { Object.defineProperty(this, String(key), {value:String(value), writable:true, configurable:true, enumerable:true}); }
  removeItem(key) { delete this[String(key)]; }
}
function storageFixture() {
  const bundle=fs.readFileSync(new URL('../public/engine/scramjet.js',import.meta.url),'utf8');
  const start=bundle.indexOf('5724(e,t,r){');
  const end=bundle.indexOf('},7530(e,t,r){',start);
  assert.ok(start>=0&&end>start,'pinned storage module must be present');
  const module=vm.runInNewContext('(function'+bundle.slice(start+4,end+1)+')');
  let init;
  const require=id=>{assert.equal(id,5994);return {BR:Object.keys,rF:Reflect.get,lK:Reflect.ownKeys};};
  require.r=()=>{}; require.d=(_,exports)=>{init=exports.default();};
  module({}, {}, require);
  const raw=new StorageFixture();
  raw.setItem('www.tiktok.com@existing','retained');
  raw.setItem('www.tiktok.com.other@unrelated','other-host');
  raw.setItem('kkeep-profile','untouched');
  const frame={localStorage:raw,sessionStorage:new StorageFixture()};
  init({url:new URL('https://www.tiktok.com/')},frame);
  return {raw,store:frame.localStorage,session:frame.sessionStorage};
}

test('storage key(index) returns the unprefixed key name, not its value',()=>{
  const {store}=storageFixture();
  assert.equal(store.key(0),'existing');
  assert.equal(store.key(1),null);
  store.setItem('next','synthetic-value');
  assert.deepEqual([store.key(0),store.key(1)],['existing','next']);
  assert.equal(store.key(99),null);
});
test('storage enumeration stays within the exact host namespace',()=>{
  const {store}=storageFixture();
  assert.equal(store.length,1);
  assert.deepEqual(Object.keys(store),['existing']);
});
test('storage clear removes only this host entries and leaves other sessions alone',()=>{
  const {store,raw}=storageFixture();
  store.setItem('temporary','one');
  store.clear();
  assert.equal(store.length,0);
  assert.equal(raw.getItem('www.tiktok.com@existing'),null);
  assert.equal(raw.getItem('www.tiktok.com@temporary'),null);
  assert.equal(raw.getItem('www.tiktok.com.other@unrelated'),'other-host');
  assert.equal(raw.getItem('kkeep-profile'),'untouched');
});
test('named storage deletion removes the same entry as removeItem',()=>{
  const {store}=storageFixture();
  store.draft='temporary';
  assert.equal(store.getItem('draft'),'temporary');
  assert.equal(delete store.draft,true);
  assert.equal(store.getItem('draft'),null);
  assert.equal('draft' in store,false);
});
test('missing named storage properties are undefined while getItem returns null',()=>{
  const {store}=storageFixture();
  assert.equal(store.missing,undefined);
  assert.equal(store.getItem('missing'),null);
  store.empty='';
  assert.equal(store.empty,'');
  assert.equal('getItem' in store,true);
  assert.equal('length' in store,true);
});
test('installing storage compatibility preserves existing data and separates session storage',()=>{
  const {store,session,raw}=storageFixture();
  assert.equal(store.getItem('existing'),'retained');
  assert.equal(session.getItem('existing'),null);
  session.setItem('existing','session-only');
  assert.equal(store.getItem('existing'),'retained');
  assert.equal(session.getItem('existing'),'session-only');
  assert.equal(raw.getItem('kkeep-profile'),'untouched');
});
