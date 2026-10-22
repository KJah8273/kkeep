import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {profileApi,profileIdentity} from '../worker/profile.ts';
import {username,snapshot} from '../lib/profile-model.ts';
import {defaults} from '../lib/living-space/model.ts';
import {hgolaSave} from '../worker/hgola-saves.ts';
function db(){const sql=new DatabaseSync(':memory:');for(const f of ['0004_smiling_vector.sql','0005_lonely_landau.sql'])sql.exec(readFileSync(new URL('../drizzle/'+f,import.meta.url),'utf8'));return {prepare(query){let args=[];const st={bind(...v){args=v;return st;},async all(){return {results:sql.prepare(query).all(...args)};},async run(){return {meta:sql.prepare(query).run(...args)};}};return st;},batch:items=>Promise.all(items.map(i=>i.run())),sql};}
const origin='https://kkeep.test';
function req(input,cookie='',path='/api/profile'){return new Request(origin+path,{method:input?'POST':'GET',headers:{'X-Kkeep-Profile':'1','X-Kkeep-Hgola':'1','Content-Type':'application/json',Origin:origin,Cookie:cookie,'CF-Connecting-IP':'127.0.0.1'},body:input?JSON.stringify(input):undefined});}
const look={theme:'midnight',wallpaper:'stars',match:true,moving:true,dense:false};
const data={version:1,preferences:{...defaults,wallpaper:'brick-planets'},legacy:look,original:look};
test('usernames normalize Arabic and English and reject offensive variants',()=>{
 assert.equal(username('Khaled_123').key,'khaled123');assert.equal(username('خالد سالم').name,'خالد سالم');assert.equal(username('أحمد').key,username('احمد').key);
 for(const name of ['f.u.c.k','SH1T','قحبة','شرموط','كسم','bad<script>','abc\u202e'])assert.throws(()=>username(name));
 for(const name of ['classmate','Cassidy','كسلان','عبدالله'])assert.ok(username(name));
});
test('profile schema strips unsupported data and rejects wrong versions',()=>{assert.throws(()=>snapshot({...data,version:2}));const v=snapshot({...data,cookies:'secret'});assert.equal(v.cookies,undefined);});
test('accounts hash passwords, restore across devices, isolate users, reject stale writes and revoke logout',async()=>{
 const store=db();const signup=await profileApi(req({action:'signup',username:'Khaled123',password:'Strong-Test-2026'}),store);assert.equal(signup.status,200);const cookie=signup.headers.get('set-cookie').split(';')[0];assert.match(signup.headers.get('set-cookie'),/Secure; HttpOnly; SameSite=Strict/);
 const row=store.sql.prepare('SELECT password FROM kkeep_accounts').get();assert.match(row.password,/^\$2[ab]\$12\$/);assert.notEqual(row.password,'Strong-Test-2026');
 assert.equal((await profileApi(req({action:'save',data,revision:0},cookie),store)).status,200);
 assert.equal((await profileApi(req({action:'save',data,revision:0},cookie),store)).status,409);
 const login=await profileApi(req({action:'login',username:'khaled123',password:'Strong-Test-2026'}),store);assert.equal(login.status,200);const otherDevice=login.headers.get('set-cookie').split(';')[0];
 const restored=await (await profileApi(req(null,otherDevice),store)).json();assert.equal(restored.data.preferences.wallpaper,'brick-planets');assert.equal(restored.revision,1);
 assert.equal((await profileApi(req({action:'login',username:'khaled123',password:'Wrong-Password'}),store)).status,401);
 assert.equal((await (await profileApi(req(null),store)).json()).account,null);
 assert.equal((await profileApi(req({action:'save',data,revision:1}),store)).status,401);
 const backup={format:'kkeep-hgola-save',version:1,entries:[{path:'/idbfs/save',mode:32768,time:1,data:'AQ=='}]};
 const get=await hgolaSave(req(null,cookie,'/api/hgola-save'),store);const gameCookie=get.headers.get('set-cookie').split(';')[0];
 assert.equal((await hgolaSave(req({save:backup,revision:0},cookie+'; '+gameCookie,'/api/hgola-save'),store)).status,200);
 const saved=await (await hgolaSave(req(null,otherDevice,'/api/hgola-save'),store)).json();assert.deepEqual(saved.save,backup);
 await profileApi(req({action:'logout'},otherDevice),store);assert.equal(await profileIdentity(req(null,otherDevice),store),null);assert.ok(await profileIdentity(req(null,cookie),store));
});
test('cross-origin requests and brute force are rejected',async()=>{
 const store=db();const bad=new Request(origin+'/api/profile',{headers:{'X-Kkeep-Profile':'1',Origin:'https://evil.test'}});assert.equal((await profileApi(bad,store)).status,403);
 for(let n=0;n<12;n++)store.sql.prepare('INSERT INTO kkeep_auth_limits VALUES (?,?,?)').run('other'+n,1,Date.now()+100000);
 // Rate limiter updates atomically, never resets on cookie removal.
 let response;for(let i=0;i<13;i++)response=await profileApi(req({action:'login',username:'Nobody',password:'not-a-real-password'}),store);
 assert.equal(response.status,429);
});
test('separate accounts cannot read each other’s profile or Hgola backup',async()=>{
 const store=db();const accounts=[];
 for(const user of ['TestOwnerA','TestOwnerB']){const r=await profileApi(req({action:'signup',username:user,password:'Separate-Password-2026'}),store);assert.equal(r.status,200);accounts.push(r.headers.get('set-cookie').split(';')[0]);}
 await profileApi(req({action:'save',data,revision:0},accounts[0]),store);
 const other=await (await profileApi(req(null,accounts[1]),store)).json();assert.equal(other.data,null);assert.equal(other.revision,0);
});
