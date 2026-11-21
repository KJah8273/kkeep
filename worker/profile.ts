import {hash,compare,truncates} from 'bcryptjs';
import type {BrowserDB} from './browser-data.ts';
import {username,snapshot} from '../lib/profile-model.ts';
import {normalizeText} from '../lib/chat-moderation.ts';
import {chatOwnerAccount} from './chat-owner.ts';
const COOKIE='__Host-kkeep-profile';
const hex=(v:Uint8Array)=>Array.from(v,n=>n.toString(16).padStart(2,'0')).join('');
export const digest=async(s:string)=>hex(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s))));
export async function profileIdentity(request:Request,db?:BrowserDB){
 const token=/(?:^|;\s*)__Host-kkeep-profile=([a-f0-9]{64})(?:;|$)/.exec(request.headers.get('Cookie')||'')?.[1];
 if(!db||!token)return null;
 const row=(await db.prepare('SELECT a.id,a.name,a.username FROM kkeep_accounts a JOIN kkeep_sessions s ON s.account=a.id WHERE s.token=? AND s.expires>?').bind(await digest(token),Date.now()).all()).results[0] as {id:string;name:string;username:string}|undefined;
 return row||null;
}
export async function createProfileSession(db:BrowserDB,account:string){
 const token=hex(crypto.getRandomValues(new Uint8Array(32)));
 await db.prepare('INSERT INTO kkeep_sessions (token,account,expires) VALUES (?,?,?)').bind(await digest(token),account,Date.now()+2592000000).run();
 await db.prepare('DELETE FROM kkeep_sessions WHERE expires<?').bind(Date.now()).run();
 return `${COOKIE}=${token}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=2592000`;
}
async function body(request:Request){
 const reader=request.body?.getReader();if(!reader)throw Error('Missing input.');let size=0;const chunks:Uint8Array[]=[];
 for(;;){const r=await reader.read();if(r.done)break;size+=r.value.length;if(size>66000){await reader.cancel();throw Error('Input is too large.');}chunks.push(r.value);}
 const bytes=new Uint8Array(size);let i=0;for(const c of chunks){bytes.set(c,i);i+=c.length;}return JSON.parse(new TextDecoder().decode(bytes));
}
export async function profileApi(request:Request,db?:BrowserDB){
 const headers=new Headers({'Cache-Control':'no-store','Content-Type':'application/json','X-Content-Type-Options':'nosniff'});
 const reply=(v:unknown,status=200)=>new Response(JSON.stringify(v),{status,headers});
 if(request.headers.get('X-Kkeep-Profile')!=='1'||request.headers.get('Sec-Fetch-Site')==='cross-site'||(request.headers.get('Origin')&&request.headers.get('Origin')!==new URL(request.url).origin))return reply({error:'Open Profile from Kkeep.'},403);
 if(!db)return reply({error:'Profile is unavailable. Try again.'},503);
 try{
  if(request.method==='GET'){
   const account=await profileIdentity(request,db);if(!account)return reply({account:null});
   const row=(await db.prepare('SELECT data,revision FROM kkeep_profiles WHERE account=?').bind(account.id).all()).results[0] as {data:string;revision:number}|undefined;
   return reply({account:{id:account.id,name:account.name,username:account.username},data:row?JSON.parse(row.data):null,revision:row?.revision||0});
  }
  if(request.method!=='POST')return reply({error:'Method not allowed.'},405);
  const input=await body(request),action=input.action;
  if(action==='signup'||action==='login'){
   const parsed=username(input.username);
   // The owner handle is reserved even if its account later chooses another name.
   if(action==='signup'&&parsed.key==='owner')return reply({error:'This username is reserved. Choose a different username.'},409);
   if(typeof input.password!=='string'||input.password.length<10||truncates(input.password))return reply({error:'Use a password of at least 10 characters, up to 72 bytes.'},400);
   // Atomic fixed-window limits, independent of client cookies. Never store raw IPs.
   const window=Math.floor(Date.now()/900000),ip=await digest(request.headers.get('CF-Connecting-IP')||'local-preview');
   for(const key of [`ip:${ip}:${window}`,`name:${parsed.key}:${window}`]){
    const result=await db.prepare('INSERT INTO kkeep_auth_limits (key,count,expires) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 WHERE count<12').bind(key,Date.now()+1800000).run();
    if(!result.meta.changes)return reply({error:'Too many attempts. Try again in 15 minutes.'},429);
   }
   await db.prepare('DELETE FROM kkeep_auth_limits WHERE expires<?').bind(Date.now()).run();
   let account=(await db.prepare('SELECT id,name,username,password FROM kkeep_accounts WHERE username=?').bind(parsed.key).all()).results[0] as {id:string;name:string;username:string;password:string}|undefined;
   if(action==='signup'){
    if(account)return reply({error:'Choose a different username.'},409);
    const id=crypto.randomUUID(),password=await hash(input.password,12);
    const created=await db.prepare('INSERT OR IGNORE INTO kkeep_accounts (id,username,name,password,created) VALUES (?,?,?,?,?)').bind(id,parsed.key,parsed.name,password,Date.now()).run();
    if(!created.meta.changes)return reply({error:'Choose a different username.'},409);
    account={id,name:parsed.name,username:parsed.key,password};
   }else{
    // Comparable work for unknown users. No password or token is logged or returned.
    const dummy='$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6Ttxzj.vKuGfWM6J2AZM/9UWMH6bG';
    const valid=await compare(input.password,account?.password||dummy);
    if(!account||!valid)return reply({error:'Username or password is incorrect.'},401);
   }
   headers.set('Set-Cookie',await createProfileSession(db,account.id));
   return reply({account:{id:account.id,name:account.name,username:account.username}});
  }
  const account=await profileIdentity(request,db);if(!account)return reply({error:'Log in first.'},401);
  if(action==='username'){
   let parsed:ReturnType<typeof username>;
   try{parsed=username(input.username);}catch(error){return reply({error:(error as Error).message},400);}
   if(parsed.key.length<3)return reply({error:'Use at least 3 letters or numbers for your username.'},400);
   // Resolve the known owner before a rename; authority follows the account ID.
   const owner=await chatOwnerAccount(db);
   if(parsed.key==='owner'&&owner!==account.id)return reply({error:'This username is reserved for the owner account.'},403);
   if(parsed.key===account.username&&parsed.name===account.name)return reply({account});
   const now=Date.now(),window=Math.floor(now/3600000);
   const limited=await db.prepare('INSERT INTO kkeep_auth_limits (key,count,expires) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 WHERE count<5').bind('username:'+account.id+':'+window,now+7200000).run();
   if(!limited.meta.changes){headers.set('Retry-After',String(Math.ceil(((window+1)*3600000-now)/1000)));return reply({error:'You have tried too many username changes this hour. Please try again later.'},429);}
   const chat=(await db.prepare('SELECT display_name FROM kkeep_chat_profiles WHERE account=?').bind(account.id).all()).results[0] as {display_name:string}|undefined;
   const profileUnchanged=chat?'EXISTS (SELECT 1 FROM kkeep_chat_profiles WHERE account=? AND display_name=?)':'NOT EXISTS (SELECT 1 FROM kkeep_chat_profiles WHERE account=?)';
   const changes=[db.prepare('UPDATE OR IGNORE kkeep_accounts SET username=?,name=? WHERE id=? AND username=? AND name=? AND '+profileUnchanged).bind(parsed.key,parsed.name,account.id,account.username,account.name,account.id,...(chat?[chat.display_name]:[]))];
   if(chat)changes.push(db.prepare('UPDATE kkeep_chat_profiles SET search_key=?,updated=? WHERE account=? AND display_name=? AND EXISTS (SELECT 1 FROM kkeep_accounts WHERE id=? AND username=? AND name=?)').bind(normalizeText(chat.display_name+' '+parsed.key),now,account.id,chat.display_name,account.id,parsed.key,parsed.name));
   const result=await db.batch(changes) as {meta:{changes:number}}[];
   if(!result[0]?.meta.changes)return reply({error:'That username is taken, or your profile changed on another device. Choose another name or reload your profile.'},409);
   return reply({account:{id:account.id,name:parsed.name,username:parsed.key}});
  }
  if(action==='logout'){
   const token=/(?:^|;\s*)__Host-kkeep-profile=([a-f0-9]{64})(?:;|$)/.exec(request.headers.get('Cookie')||'')?.[1];
   if(token)await db.prepare('DELETE FROM kkeep_sessions WHERE token=?').bind(await digest(token)).run();
   headers.set('Set-Cookie',`${COOKIE}=; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=0`);return reply({ok:true});
  }
  if(action!=='save'||!Number.isSafeInteger(input.revision)||input.revision<0)return reply({error:'Invalid action.'},400);
  const data=JSON.stringify(snapshot(input.data)),now=Date.now();
  const result=input.revision===0?await db.prepare('INSERT OR IGNORE INTO kkeep_profiles (account,data,revision,updated) VALUES (?,?,1,?)').bind(account.id,data,now).run():await db.prepare('UPDATE kkeep_profiles SET data=?,revision=revision+1,updated=? WHERE account=? AND revision=?').bind(data,now,account.id,input.revision).run();
  if(!result.meta.changes)return reply({error:'Profile changed on another device. Log in again to restore it.'},409);
  return reply({revision:input.revision+1});
 }catch{return reply({error:'Could not complete this action. Your saved data is unchanged.'},400);}
}
