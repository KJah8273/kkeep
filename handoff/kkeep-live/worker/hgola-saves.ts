import {profileIdentity} from './profile.ts';
import type {BrowserDB} from './browser-data.ts';
export const MAX_SAVE_BYTES=524288;
export function validHgolaSave(value:unknown){
 const v=value as {format?:unknown;version?:unknown;entries?:unknown[]};
 if(!v||v.format!=='kkeep-hgola-save'||v.version!==1||!Array.isArray(v.entries)||v.entries.length>256)return false;
 const paths=new Set<string>();let files=0;
 for(const item of v.entries){
  const e=item as {path?:unknown;mode?:unknown;time?:unknown;data?:unknown};
  if(!e||typeof e.path!=='string'||!e.path.startsWith('/idbfs/')||e.path.length>512||e.path.split('/').some(p=>p==='..'||p==='.')||/[\x00-\x1f\\]/.test(e.path)||paths.has(e.path)||!Number.isInteger(e.mode)||!Number.isFinite(e.time)||Number(e.time)<0)return false;
  paths.add(e.path);const type=Number(e.mode)&61440;
  if(type===32768){if(typeof e.data!=='string'||e.data.length>MAX_SAVE_BYTES||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(e.data))return false;files++;}
  else if(type!==16384||e.data!==undefined)return false;
 }
 return files>0&&JSON.stringify(v).length<=MAX_SAVE_BYTES;
}
const hex=(bytes:Uint8Array)=>Array.from(bytes,n=>n.toString(16).padStart(2,'0')).join('');
export async function hgolaSave(request:Request,db?:BrowserDB){
 const origin=new URL(request.url).origin,headers=new Headers({'Cache-Control':'no-store','Content-Type':'application/json','X-Content-Type-Options':'nosniff'});
 const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers});
 if(request.headers.get('X-Kkeep-Hgola')!=='1'||(request.headers.get('Origin')&&request.headers.get('Origin')!==origin)||request.headers.get('Sec-Fetch-Site')==='cross-site')return reply({error:'Open saves from Kkeep'},403);
 if(!['GET','POST'].includes(request.method))return reply({error:'Method not allowed'},405);
 if(!db)return reply({error:'Online backup unavailable; local saves remain unchanged'},503);
 let token=/(?:^|;\s*)__Host-kkeep-hgola=([a-f0-9]{64})(?:;|$)/.exec(request.headers.get('Cookie')||'')?.[1];
 if(!token){
  if(request.method!=='GET')return reply({error:'Open your save first'},409);
  token=hex(crypto.getRandomValues(new Uint8Array(32)));
  headers.set('Set-Cookie',`__Host-kkeep-hgola=${token}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=31536000`);
 }
 let owner=hex(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token))));
 try{
  const account=await profileIdentity(request,db);
  if(account){
   const accountOwner='profile:'+account.id;
   // Adopt the existing browser backup only if the account has none.
   await db.prepare('INSERT OR IGNORE INTO hgola_saves (owner,data,previous,revision,updated) SELECT ?,data,previous,revision,updated FROM hgola_saves WHERE owner=?').bind(accountOwner,owner).run();
   owner=accountOwner;
  }
  if(request.method==='GET'){
   const row=(await db.prepare('SELECT data,revision,updated FROM hgola_saves WHERE owner=?').bind(owner).all()).results[0] as {data:string;revision:number;updated:number}|undefined;
   return reply(row?{save:JSON.parse(row.data),revision:row.revision,updated:row.updated,scope:account?.id||'browser'}:{save:null,revision:0,updated:null,scope:account?.id||'browser'});
  }
  const reader=request.body?.getReader();if(!reader)return reply({error:'Missing save'},400);
  const chunks:Uint8Array[]=[];let size=0;
  for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>MAX_SAVE_BYTES+128){await reader.cancel();return reply({error:'Save is too large'},413);}chunks.push(value);}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  const input=JSON.parse(new TextDecoder().decode(bytes));
  if(!validHgolaSave(input.save)||!Number.isSafeInteger(input.revision)||input.revision<0)return reply({error:'Invalid or empty save; previous backup kept'},400);
  const data=JSON.stringify(input.save),now=Date.now();
  const result=input.revision===0?
   await db.prepare('INSERT OR IGNORE INTO hgola_saves (owner,data,previous,revision,updated) VALUES (?,?,NULL,1,?)').bind(owner,data,now).run():
   await db.prepare('UPDATE hgola_saves SET previous=data,data=?,revision=revision+1,updated=? WHERE owner=? AND revision=?').bind(data,now,owner,input.revision).run();
  if(!result.meta.changes)return reply({error:'Another game window saved newer progress. Reopen before backing up again.'},409);
  return reply({saved:true,revision:input.revision+1,updated:now});
 }catch{return reply({error:'Backup unavailable; previous saved data was kept'},503);}
}
