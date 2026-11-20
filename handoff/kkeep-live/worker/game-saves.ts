import {profileIdentity} from './profile.ts';
import type {BrowserDB} from './browser-data.ts';
import {findSavedGame} from '../lib/games/save-catalog.ts';
export const MAX_GAME_SAVE=1048576;
export function validGameSave(save:unknown):boolean{
 const s=save as {version?:unknown;local?:unknown;databases?:unknown};
 if(!s||s.version!==1||!Array.isArray(s.local)||s.local.length>1024||!Array.isArray(s.databases)||s.databases.length>24)return false;
 if(s.local.some(e=>!Array.isArray(e)||e.length!==2||typeof e[0]!=='string'||e[0].length>512||typeof e[1]!=='string'||e[1].length>MAX_GAME_SAVE))return false;
 const names=new Set();
 for(const value of s.databases){
  const db=value as {name?:unknown;version?:unknown;stores?:unknown};
  if(!db||typeof db.name!=='string'||db.name.length>512||names.has(db.name)||!Number.isSafeInteger(db.version)||Number(db.version)<1||!Array.isArray(db.stores)||db.stores.length>64)return false;
  names.add(db.name);
  for(const value of db.stores){const st=value as {name?:unknown;records?:unknown;indexes?:unknown;keyPath?:unknown;autoIncrement?:unknown};if(!st||typeof st.name!=='string'||st.name.length>256||!Array.isArray(st.records)||st.records.length>8192||!Array.isArray(st.indexes)||st.indexes.length>32||typeof st.autoIncrement!=='boolean'||!(st.keyPath===null||typeof st.keyPath==='string'||Array.isArray(st.keyPath)&&st.keyPath.every(v=>typeof v==='string')))return false;}
 }
 return JSON.stringify(s).length<=MAX_GAME_SAVE;
}
export async function gameSaveApi(request:Request,db?:BrowserDB){
 const url=new URL(request.url),headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
 const reply=(data:unknown,status=200)=>Response.json(data,{status,headers});
 if(request.headers.get('X-Kkeep-Game-Save')!=='1'||request.headers.get('Sec-Fetch-Site')==='cross-site'||request.headers.get('Origin')&&request.headers.get('Origin')!==url.origin)return reply({error:'Open games from Kkeep.'},403);
 const slug=url.searchParams.get('game')||'',game=findSavedGame(slug);
 if(!game||game.external)return reply({error:'This game does not support Kkeep saves.'},400);
 if(!['GET','POST'].includes(request.method))return reply({error:'Method not allowed.'},405);
 if(!db)return reply({error:'Profile saves are temporarily unavailable.'},503);
 try{
  const account=await profileIdentity(request,db);
  if(request.method==='GET'){
   if(!account)return reply({account:null,save:null,revision:0});
   const row=(await db.prepare('SELECT data,revision,updated FROM kkeep_game_saves WHERE account=? AND game=?').bind(account.id,slug).all()).results[0] as {data:string;revision:number;updated:number}|undefined;
   return reply({account,save:row?JSON.parse(row.data):null,revision:row?.revision||0,updated:row?.updated||null});
  }
  if(!account)return reply({error:'Log in to Profile to sync progress.'},401);
  const reader=request.body?.getReader();if(!reader)return reply({error:'Missing save.'},400);
  const chunks:Uint8Array[]=[];let length=0;
  for(;;){const {value,done}=await reader.read();if(done)break;length+=value.length;if(length>MAX_GAME_SAVE+1024){await reader.cancel();return reply({error:'This save is too large. The previous backup is safe.'},413);}chunks.push(value);}
  const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  const input=JSON.parse(new TextDecoder().decode(bytes));
  if(input.scope!==account.id)return reply({error:'Profile changed. Reopen the game before syncing.'},409);
  if(!Number.isSafeInteger(input.revision)||input.revision<0||!validGameSave(input.save))return reply({error:'Invalid save. The previous backup is safe.'},400);
  const data=JSON.stringify(input.save),now=Date.now();
  const result=input.revision===0?
   await db.prepare('INSERT OR IGNORE INTO kkeep_game_saves (account,game,data,previous,revision,updated) VALUES (?,?,?,NULL,1,?)').bind(account.id,slug,data,now).run():
   await db.prepare('UPDATE kkeep_game_saves SET previous=data,data=?,revision=revision+1,updated=? WHERE account=? AND game=? AND revision=?').bind(data,now,account.id,slug,input.revision).run();
  if(!result.meta.changes)return reply({error:'Newer progress exists on another device. Reopen this game to restore it.'},409);
  return reply({saved:true,revision:input.revision+1,updated:now});
 }catch{return reply({error:'Could not sync progress. Your local save is kept.'},503);}
}
