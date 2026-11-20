import {digest,profileIdentity} from './profile.ts';
import {randomToken,sameOrigin} from './profile-google.ts';
import type {BrowserDB} from './browser-data.ts';
export const COMMUNITY_ORIGIN='https://kkeep-community.testerqrr1.chatgpt.site';
const ROBLOX_ORIGIN='https://kkeep-roblox-preview.testerqrr1.chatgpt.site';
const hexToken=/^[a-f0-9]{64}$/;
const encode=(bytes:Uint8Array)=>btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
async function signRobloxGrant(secret:string,name:string,state:string){
 const encoder=new TextEncoder();
 const payload=encode(encoder.encode(JSON.stringify({name,state,expires:Date.now()+30000})));
 const key=await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const signature=await crypto.subtle.sign('HMAC',key,encoder.encode('kkeep-roblox-grant.v1.'+payload));
 return payload+'.'+encode(new Uint8Array(signature));
}
export async function communityAuth(request:Request,db?:BrowserDB,robloxKey?:string){
 const path=new URL(request.url).pathname;
 const robloxExchange=path==='/api/community-auth/roblox/exchange';
 const roblox=robloxExchange||path==='/api/community-auth/roblox';
 const exchange=robloxExchange||path==='/api/community-auth/exchange';
 const origin=roblox?ROBLOX_ORIGIN:COMMUNITY_ORIGIN;
 const headers:Record<string,string>={'Cache-Control':'no-store','Referrer-Policy':'no-referrer'};
 if(robloxExchange){
  headers.Vary='Origin';
  if(request.headers.get('Origin')===origin)headers['Access-Control-Allow-Origin']=origin;
 }
 const reply=(body:unknown,status=200)=>Response.json(body,{status,headers});
 if(request.method!=='POST')return reply({error:'Method not allowed.'},405);
 if(!db)return reply({error:'Profile unavailable.'},503);
 if(roblox&&(!robloxKey||!hexToken.test(robloxKey)))return reply({error:'Roblox sign-in is temporarily unavailable.'},503);
 try{
  const raw=await request.text();if(raw.length>1000)return reply({error:'Input too large.'},413);const input=JSON.parse(raw);
  if(typeof input.state!=='string'||!hexToken.test(input.state))return reply({error:'Invalid sign-in request.'},400);
  const challenge=robloxExchange?await digest(input.state):input.state;
  const state=roblox?'roblox:'+challenge:challenge;
  if(exchange){
   if(request.headers.get('Origin')!==origin||typeof input.code!=='string'||!hexToken.test(input.code))return reply({error:'Invalid exchange.'},403);
   const row=(await db.prepare('DELETE FROM kkeep_community_codes WHERE code=? AND state=? AND expires>? RETURNING account').bind(await digest(input.code),await digest(state),Date.now()).all()).results[0] as {account:string}|undefined;
   if(!row)return reply({error:'Sign-in link expired. Start again.'},401);
   const account=(await db.prepare('SELECT id,name FROM kkeep_accounts WHERE id=?').bind(row.account).all()).results[0] as {id:string;name:string}|undefined;
   if(!account)return reply({error:'Profile unavailable.'},401);
   return robloxExchange?reply({grant:await signRobloxGrant(robloxKey!,account.name,challenge)}):reply({account});
  }
  if(!sameOrigin(request))return reply({error:'Open this action from Kkeep.'},403);
  const account=await profileIdentity(request,db);if(!account)return reply({error:'Log in to your Profile first.'},401);
  const code=randomToken();await db.prepare('INSERT INTO kkeep_community_codes (code,account,state,expires) VALUES (?,?,?,?)').bind(await digest(code),account.id,await digest(state),Date.now()+60000).run();await db.prepare('DELETE FROM kkeep_community_codes WHERE expires<?').bind(Date.now()).run();
  const callback=roblox?'/auth/callback':'/api/kkeep/callback';
  return reply({url:origin+callback+'?'+new URLSearchParams({code,state:input.state})});
 }catch{return reply({error:'Could not connect your Profile. Try again.'},400);}
}
