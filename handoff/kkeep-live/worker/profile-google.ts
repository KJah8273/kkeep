import {hash} from 'bcryptjs';
import {digest,profileIdentity,createProfileSession} from './profile.ts';
import type {BrowserDB} from './browser-data.ts';
type GoogleEnv={DB?:BrowserDB;KKEEP_GOOGLE_CLIENT_ID?:string};
const COOKIE='__Host-kkeep-google';
export const randomToken=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),v=>v.toString(16).padStart(2,'0')).join('');
export function sameOrigin(request:Request){return request.headers.get('X-Kkeep-Profile')==='1'&&request.headers.get('Sec-Fetch-Site')!=='cross-site'&&(!request.headers.get('Origin')||request.headers.get('Origin')===new URL(request.url).origin);}
let keys:{keys:(JsonWebKey&{kid:string})[];expires:number}|undefined;
const decode=(text:string)=>Uint8Array.from(atob(text.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
export async function verifyGoogleToken(token:string,clientId:string,nonce:string,fetcher:typeof fetch=fetch){
 if(token.length>12000)throw Error('Invalid token');const parts=token.split('.');if(parts.length!==3)throw Error('Invalid token');
 const header=JSON.parse(new TextDecoder().decode(decode(parts[0]))),claims=JSON.parse(new TextDecoder().decode(decode(parts[1])));
 if(header.alg!=='RS256'||typeof header.kid!=='string')throw Error('Invalid signature algorithm');
 const now=Math.floor(Date.now()/1000);
 if(!['accounts.google.com','https://accounts.google.com'].includes(claims.iss)||claims.aud!==clientId||!Number.isFinite(claims.exp)||claims.exp<=now||!Number.isFinite(claims.iat)||claims.iat>now+60||typeof claims.sub!=='string'||claims.sub.length<1||claims.sub.length>255||claims.nonce!==nonce)throw Error('Invalid identity');
 if(!keys||keys.expires<Date.now()){
  const r=await fetcher('https://www.googleapis.com/oauth2/v3/certs',{signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error('Google unavailable');const json=await r.json() as {keys:(JsonWebKey&{kid:string})[]};
  if(!Array.isArray(json.keys))throw Error('Invalid keys');const ttl=Math.min(3600,Number(/max-age=(\d+)/.exec(r.headers.get('cache-control')||'')?.[1]||300));keys={keys:json.keys,expires:Date.now()+ttl*1000};
 }
 const jwk=keys.keys.find(k=>k.kid===header.kid&&k.kty==='RSA');if(!jwk){keys=undefined;throw Error('Google key changed. Try again.');}
 const key=await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
 if(!await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,decode(parts[2]),new TextEncoder().encode(parts[0]+'.'+parts[1])))throw Error('Invalid signature');return claims as {sub:string};
}
export async function googleProfile(request:Request,env:GoogleEnv){
 const headers=new Headers({'Cache-Control':'no-store','Content-Type':'application/json','X-Content-Type-Options':'nosniff'}),reply=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers});
 if(!sameOrigin(request))return reply({error:'Open Profile from Kkeep.'},403);
 if(request.method==='GET')return reply({enabled:!!env.KKEEP_GOOGLE_CLIENT_ID});
 if(request.method!=='POST')return reply({error:'Method not allowed.'},405);
 if(!env.DB||!env.KKEEP_GOOGLE_CLIENT_ID)return reply({error:'Google sign-in is not configured yet.'},503);
 const db=env.DB;
 try{
  const raw=await request.text();if(raw.length>14000)return reply({error:'Input too large.'},413);const input=JSON.parse(raw),account=await profileIdentity(request,db);
  const window=Math.floor(Date.now()/600000),ip=await digest(request.headers.get('CF-Connecting-IP')||'local');
  const limited=await db.prepare('INSERT INTO kkeep_auth_limits (key,count,expires) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 WHERE count<30').bind('google:'+ip+':'+window,Date.now()+1200000).run();if(!limited.meta.changes)return reply({error:'Too many attempts. Try again later.'},429);
  if(input.action==='start'){
   const nonce=randomToken();await db.prepare('INSERT INTO kkeep_login_nonces (nonce,account,expires) VALUES (?,?,?)').bind(await digest(nonce),account?.id||'',Date.now()+600000).run();await db.prepare('DELETE FROM kkeep_login_nonces WHERE expires<?').bind(Date.now()).run();
   headers.set('Set-Cookie',`${COOKIE}=${nonce}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=600`);return reply({clientId:env.KKEEP_GOOGLE_CLIENT_ID,nonce});
  }
  const nonce=/(?:^|;\s*)__Host-kkeep-google=([a-f0-9]{64})(?:;|$)/.exec(request.headers.get('Cookie')||'')?.[1];if(!nonce||typeof input.credential!=='string')return reply({error:'Restart Google sign-in.'},400);
  const identity=await verifyGoogleToken(input.credential,env.KKEEP_GOOGLE_CLIENT_ID,nonce);
  const row=(await db.prepare('DELETE FROM kkeep_login_nonces WHERE nonce=? AND expires>? AND account=? RETURNING account').bind(await digest(nonce),Date.now(),account?.id||'').all()).results[0];if(!row)return reply({error:'Sign-in expired. Try again.'},400);
  let linked=(await db.prepare('SELECT a.id,a.name FROM kkeep_google_accounts g JOIN kkeep_accounts a ON a.id=g.account WHERE g.subject=?').bind(identity.sub).all()).results[0] as {id:string;name:string}|undefined;
  if(account&&linked&&linked.id!==account.id)return reply({error:'This Google account is already connected to another Profile.'},409);
  if(!linked){
   if(account){await db.prepare('INSERT INTO kkeep_google_accounts (subject,account) VALUES (?,?)').bind(identity.sub,account.id).run();linked=account;}
   else{
    const id=crypto.randomUUID(),name='Player'+randomToken().slice(0,8),password=await hash(randomToken(),12);
    await db.batch([db.prepare('INSERT INTO kkeep_accounts (id,username,name,password,created) VALUES (?,?,?,?,?)').bind(id,'google_'+randomToken().slice(0,16),name,password,Date.now()),db.prepare('INSERT INTO kkeep_google_accounts (subject,account) VALUES (?,?)').bind(identity.sub,id)]);linked={id,name};
   }
  }
  headers.append('Set-Cookie',`${COOKIE}=; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=0`);headers.append('Set-Cookie',await createProfileSession(db,linked.id));return reply({account:{name:linked.name}});
 }catch{return reply({error:'Google sign-in did not complete. Please try again.'},400);}
}
