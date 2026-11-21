import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {randomBytes,randomUUID} from 'node:crypto';
import {hash} from 'bcryptjs';
import {profileApi,profileIdentity,digest} from '../worker/profile.ts';
import {chatOwnerAccount} from '../worker/chat-owner.ts';

const origin='https://kkeep.test';
const password='Synthetic-Profile-Test-2026';
const passwordHash=await hash(password,4);
function database(){
 const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');
 for(const file of readdirSync(new URL('../drizzle/',import.meta.url)).filter(name=>name.endsWith('.sql')).sort())sql.exec(readFileSync(new URL('../drizzle/'+file,import.meta.url),'utf8'));
 const store={sql,beforeBatch:null,prepare(query){let values=[];const statement={bind(...args){values=args;return statement;},async all(){return {results:sql.prepare(query).all(...values)};},async run(){return {meta:sql.prepare(query).run(...values)};}};return statement;},async batch(statements){store.beforeBatch?.();sql.exec('BEGIN');try{const results=[];for(const statement of statements)results.push(await statement.run());sql.exec('COMMIT');return results;}catch(error){sql.exec('ROLLBACK');throw error;}}};
 return store;
}
async function account(store,username,id=randomUUID(),name=username){
 const token=randomBytes(32).toString('hex');
 store.sql.prepare('INSERT INTO kkeep_accounts (id,username,name,password,created) VALUES (?,?,?,?,?)').run(id,username,name,passwordHash,Date.now());
 store.sql.prepare('INSERT INTO kkeep_sessions (token,account,expires) VALUES (?,?,?)').run(await digest(token),id,Date.now()+3600000);
 store.sql.prepare('INSERT INTO kkeep_chat_profiles (account,display_name,search_key,joined,updated) VALUES (?,?,?,?,?)').run(id,'Display '+username,'display '+username,Date.now(),Date.now());
 return {id,cookie:'__Host-kkeep-profile='+token};
}
function request(body,cookie='',extra={}){return new Request(origin+'/api/profile',{method:body?'POST':'GET',headers:{'X-Kkeep-Profile':'1',Origin:origin,'Content-Type':'application/json',Cookie:cookie,...extra},body:body?JSON.stringify(body):undefined});}
const rename=(store,user,username,extra={})=>profileApi(request({action:'username',username,...extra},user.cookie),store);

test('changing a username keeps the account, display name, saved data and existing sessions',async()=>{
 const store=database(),user=await account(store,'oldhandle');
 store.sql.prepare('INSERT INTO kkeep_profiles (account,data,revision,updated) VALUES (?,?,?,?)').run(user.id,JSON.stringify({kept:'saved progress'}),7,Date.now());
 const result=await rename(store,user,'New_Handle');assert.equal(result.status,200);
 assert.deepEqual((await result.json()).account,{id:user.id,name:'New_Handle',username:'newhandle'});
 const identity=await profileIdentity(request(null,user.cookie),store);assert.equal(identity.id,user.id);assert.equal(identity.username,'newhandle');
 const restored=await (await profileApi(request(null,user.cookie),store)).json();assert.deepEqual(restored.data,{kept:'saved progress'});assert.equal(restored.revision,7);
 const chat=store.sql.prepare('SELECT display_name,search_key FROM kkeep_chat_profiles WHERE account=?').get(user.id);
 assert.equal(chat.display_name,'Display oldhandle');assert.ok(chat.search_key.endsWith('newhandle'));
 assert.equal(store.sql.prepare('SELECT password FROM kkeep_accounts WHERE id=?').get(user.id).password,passwordHash);
 assert.equal((await profileApi(request({action:'login',username:'newhandle',password}),store)).status,200);
 assert.equal((await profileApi(request({action:'login',username:'oldhandle',password}),store)).status,401);
});

test('owner authority stays with the selected account after a rename and its handle cannot be taken',async()=>{
 const store=database(),owner=await account(store,'owner','342d1bf6-2554-4344-82ea-8ead8a7ed5a9','The.'),member=await account(store,'member');
 assert.equal(await chatOwnerAccount(store),owner.id);
 assert.equal((await rename(store,owner,'KhaledOwner')).status,200);
 assert.equal(await chatOwnerAccount(store),owner.id);
 for(const name of ['owner','O.W.N.E.R','o_w_n_e_r'])assert.equal((await rename(store,member,name)).status,403);
 assert.equal((await profileApi(request({action:'signup',username:'o.w.n.e.r',password}),store)).status,409);
 assert.equal((await rename(store,owner,'owner')).status,200);
 assert.equal(await chatOwnerAccount(store),owner.id);
});

test('a matching display name or a new account named owner never claims ownership',async()=>{
 const store=database(),impostor=await account(store,'owner',randomUUID(),'Owner');
 assert.equal(await chatOwnerAccount(store),null);
 assert.equal((await rename(store,impostor,'owner')).status,403);
 assert.equal(await chatOwnerAccount(store),null);
});

test('duplicate or invalid usernames leave account and public profile unchanged',async()=>{
 const store=database(),user=await account(store,'alpha');await account(store,'beta');
 const before=store.sql.prepare('SELECT * FROM kkeep_chat_profiles WHERE account=?').get(user.id);
 assert.equal((await rename(store,user,'B.e.t.a')).status,409);
 for(const input of ['a..','bad<script>','\u202eowner','f.u.c.k',null])assert.equal((await rename(store,user,input)).status,400);
 assert.equal((await profileIdentity(request(null,user.cookie),store)).username,'alpha');
 assert.deepEqual(store.sql.prepare('SELECT * FROM kkeep_chat_profiles WHERE account=?').get(user.id),before);
});

test('username edits require the authenticated account and same-origin protection',async()=>{
 const store=database(),user=await account(store,'firstuser'),other=await account(store,'seconduser');
 assert.equal((await profileApi(request({action:'username',username:'newname'}),store)).status,401);
 assert.equal((await profileApi(request({action:'username',username:'newname'},user.cookie,{Origin:'https://attacker.test'}),store)).status,403);
 assert.equal((await rename(store,user,'mynewname',{accountId:other.id})).status,200);
 assert.equal((await profileIdentity(request(null,other.cookie),store)).username,'seconduser');
});

test('username edit limits are bound to the account, and stale edits do not replace a newer username',async()=>{
 const store=database(),user=await account(store,'firstuser');
 for(let index=0;index<5;index++)assert.equal((await rename(store,user,'changed'+index)).status,200);
 const blocked=await rename(store,user,'changedagain');assert.equal(blocked.status,429);assert.ok(Number(blocked.headers.get('Retry-After'))>0);
 const second=await account(store,'seconduser');
 store.beforeBatch=()=>{store.beforeBatch=null;store.sql.prepare('UPDATE kkeep_accounts SET username=?,name=? WHERE id=?').run('anotherdevice','AnotherDevice',second.id);};
 assert.equal((await rename(store,second,'staledevice')).status,409);
 assert.equal((await profileIdentity(request(null,second.cookie),store)).username,'anotherdevice');
});

test('a concurrent display-name edit or Chat join cannot leave a renamed account with a stale search key',async()=>{
 for(const joining of [false,true]){
  const store=database(),user=await account(store,'oldhandle');
  if(joining)store.sql.prepare('DELETE FROM kkeep_chat_profiles WHERE account=?').run(user.id);
  store.beforeBatch=()=>{
   store.beforeBatch=null;
   if(joining)store.sql.prepare('INSERT INTO kkeep_chat_profiles (account,display_name,search_key,joined,updated) VALUES (?,?,?,?,?)').run(user.id,'Joined Elsewhere','joined elsewhere oldhandle',Date.now(),Date.now());
   else store.sql.prepare('UPDATE kkeep_chat_profiles SET display_name=?,search_key=? WHERE account=?').run('Changed Elsewhere','changed elsewhere oldhandle',user.id);
  };
  assert.equal((await rename(store,user,'newhandle')).status,409);
  assert.equal((await profileIdentity(request(null,user.cookie),store)).username,'oldhandle');
  assert.equal((await rename(store,user,'newhandle')).status,200);
  assert.ok(store.sql.prepare('SELECT search_key FROM kkeep_chat_profiles WHERE account=?').get(user.id).search_key.endsWith('newhandle'));
 }
});
