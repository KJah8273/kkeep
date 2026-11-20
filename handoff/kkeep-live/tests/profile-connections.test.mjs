import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createHmac} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {digest} from '../worker/profile.ts';
import {googleProfile,verifyGoogleToken} from '../worker/profile-google.ts';
import {communityAuth,COMMUNITY_ORIGIN} from '../worker/community-auth.ts';
const origin='https://kkeep.test';
function db(){const sql=new DatabaseSync(':memory:');for(const file of ['0005_lonely_landau.sql','0010_plain_bishop.sql'])sql.exec(readFileSync(new URL('../drizzle/'+file,import.meta.url),'utf8'));return {sql,prepare(q){let args=[];const st={bind(...v){args=v;return st;},async all(){return {results:sql.prepare(q).all(...args)};},async run(){return {meta:sql.prepare(q).run(...args)};}};return st;},batch:items=>Promise.all(items.map(i=>i.run()))};}
async function account(store,id,token){store.sql.prepare('INSERT INTO kkeep_accounts VALUES (?,?,?,?,?)').run(id,id,id,'unused',Date.now());store.sql.prepare('INSERT INTO kkeep_sessions VALUES (?,?,?)').run(await digest(token),id,Date.now()+60000);return '__Host-kkeep-profile='+token;}
function req(path,body,cookie='',extra={}){return new Request(origin+path,{method:body?'POST':'GET',headers:{Origin:origin,'X-Kkeep-Profile':'1','Content-Type':'application/json',Cookie:cookie,...extra},body:body?JSON.stringify(body):undefined});}
const pair=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
const jwk={...await crypto.subtle.exportKey('jwk',pair.publicKey),kid:'test-key'};
const encode=v=>Buffer.from(JSON.stringify(v)).toString('base64url');
async function token(nonce,patch={},key=pair.privateKey){const now=Math.floor(Date.now()/1000),data=encode({alg:'RS256',kid:'test-key'})+'.'+encode({iss:'https://accounts.google.com',aud:'test-client',sub:'verified-subject',nonce,iat:now,exp:now+600,...patch});return data+'.'+Buffer.from(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',key,new TextEncoder().encode(data))).toString('base64url');}
const keys=async()=>Response.json({keys:[jwk]});
test('Google verifies signature, audience, issuer, expiration and nonce',async()=>{
 const signed=await token('nonce');assert.equal((await verifyGoogleToken(signed,'test-client','nonce',keys)).sub,'verified-subject');
 for(const patch of [{aud:'attacker'},{iss:'attacker'},{exp:0},{nonce:'different'}])await assert.rejects(verifyGoogleToken(await token('nonce',patch),'test-client','nonce',keys));
 const parts=signed.split('.');parts[2]=parts[2].slice(0,-8)+'AAAAAAAA';await assert.rejects(verifyGoogleToken(parts.join('.'),'test-client','nonce',keys));
});
test('Google is disabled without configuration and links only to the authenticated profile',async()=>{
 assert.deepEqual(await(await googleProfile(req('/api/profile/google'),{})).json(),{enabled:false});
 assert.equal((await googleProfile(req('/api/profile/google',{action:'start'}),{})).status,503);
 const store=db(),cookie=await account(store,'existing','a'.repeat(64)),env={DB:store,KKEEP_GOOGLE_CLIENT_ID:'test-client'};
 assert.equal((await googleProfile(req('/api/profile/google',{action:'start'},cookie,{Origin:'https://attacker.test'}),env)).status,403);
 const start=await googleProfile(req('/api/profile/google',{action:'start'},cookie),env),data=await start.json(),googleCookie=start.headers.get('set-cookie').split(';')[0];
 const signed=await token(data.nonce);const result=await googleProfile(req('/api/profile/google',{credential:signed},cookie+'; '+googleCookie),env);
 assert.equal(result.status,200);assert.equal(store.sql.prepare('SELECT account FROM kkeep_google_accounts').get().account,'existing');assert.match(result.headers.get('set-cookie'),/__Host-kkeep-profile=/);
 assert.equal((await googleProfile(req('/api/profile/google',{credential:signed},cookie+'; '+googleCookie),env)).status,400);
 assert.equal(store.sql.prepare('SELECT count(*) AS n FROM kkeep_accounts').get().n,1);
});
test('Community codes require an account, bind state, expire and can only be exchanged once',async()=>{
 const store=db(),cookie=await account(store,'player','b'.repeat(64)),state='c'.repeat(64);
 assert.equal((await communityAuth(req('/api/community-auth',{state}),store)).status,401);
 const issue=await communityAuth(req('/api/community-auth',{state},cookie),store),redirect=new URL((await issue.json()).url);assert.equal(redirect.origin,COMMUNITY_ORIGIN);const code=redirect.searchParams.get('code');
 const exchange=(stateValue,extra={})=>communityAuth(req('/api/community-auth/exchange',{code,state:stateValue},'',{Origin:COMMUNITY_ORIGIN,...extra}),store);
 assert.equal((await exchange('d'.repeat(64))).status,401);assert.equal((await exchange(state,{Origin:'https://attacker.test'})).status,403);
 const accepted=await exchange(state);assert.equal(accepted.status,200);assert.equal((await accepted.json()).account.id,'player');assert.equal((await exchange(state)).status,401);
 const another=new URL((await(await communityAuth(req('/api/community-auth',{state},cookie),store)).json()).url).searchParams.get('code');store.sql.prepare('UPDATE kkeep_community_codes SET expires=0').run();assert.equal((await communityAuth(req('/api/community-auth/exchange',{code:another,state},'',{Origin:COMMUNITY_ORIGIN}),store)).status,401);
});
test('Roblox sign-in exchanges the code once for a signed grant scoped to the browser proof',async()=>{
 const store=db(),cookie=await account(store,'player','b'.repeat(64));
 const preview='https://kkeep-roblox-preview.testerqrr1.chatgpt.site',verifier='f'.repeat(64),state=await digest(verifier);
 const secret='a'.repeat(64);
 assert.equal((await communityAuth(req('/api/community-auth/roblox',{state},cookie),store)).status,503);
 const issue=await communityAuth(req('/api/community-auth/roblox',{state},cookie),store,secret);
 const callback=new URL((await issue.json()).url);
 assert.equal(callback.origin+callback.pathname,preview+'/auth/callback');
 const code=callback.searchParams.get('code');
 const exchange=(proof,origin=preview,path='/api/community-auth/roblox/exchange')=>communityAuth(req(path,{code,state:proof},'',{Origin:origin,'Content-Type':'text/plain'}),store,secret);
 assert.equal((await exchange(state)).status,401);
 const foreign=await exchange(verifier,COMMUNITY_ORIGIN);
 assert.equal(foreign.status,403);
 assert.equal(foreign.headers.get('Access-Control-Allow-Origin'),null);
 assert.equal((await exchange(state,COMMUNITY_ORIGIN,'/api/community-auth/exchange')).status,401);
 const accepted=await exchange(verifier);
 assert.equal(accepted.headers.get('Access-Control-Allow-Origin'),preview);
 const {grant}=await accepted.json(),[payload,signature]=grant.split('.');
 assert.equal(signature,createHmac('sha256',secret).update('kkeep-roblox-grant.v1.'+payload).digest('base64url'));
 const claims=JSON.parse(Buffer.from(payload,'base64url').toString());
 assert.deepEqual({...claims,expires:0},{name:'player',state,expires:0});
 assert.ok(claims.expires>Date.now()&&claims.expires<=Date.now()+30000);
 assert.equal((await exchange(verifier)).status,401);
});
