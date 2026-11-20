import pokiAdapter from './poki-source.ts';
import {gameAssetUrl} from './asset-url.ts';
import type {SavedGame} from './save-catalog';
export type GameSnapshot={version:1;local:[string,string][];databases:unknown[]};
export type GameAccount={id:string;name:string};
export type ProgressRow={key:string;save:GameSnapshot;revision:number;dirty:boolean;updated:number;claimed?:string};
export type CloudProgress={account:GameAccount|null;save:GameSnapshot|null;revision:number;updated?:number};
export const emptyGameSave=():GameSnapshot=>({version:1,local:[],databases:[]});
let database:Promise<IDBDatabase>|undefined;
function open(){return database??=(new Promise<IDBDatabase>((resolve,reject)=>{
 let settled=false;const fail=()=>{if(settled)return;settled=true;clearTimeout(timeout);database=undefined;reject(Error('Device storage is unavailable.'));};
 const timeout=setTimeout(fail,4000),request=indexedDB.open('kkeep-game-progress-v1',1);
 request.onupgradeneeded=()=>request.result.createObjectStore('saves',{keyPath:'key'});
 request.onsuccess=()=>{if(settled){request.result.close();return;}settled=true;clearTimeout(timeout);request.result.onversionchange=()=>{request.result.close();database=undefined;};resolve(request.result);};request.onerror=request.onblocked=fail;
}));}
export async function readProgress(key:string):Promise<ProgressRow|null>{
 try{const db=await open();return await new Promise((resolve,reject)=>{const request=db.transaction('saves').objectStore('saves').get(key);request.onsuccess=()=>resolve(request.result||null);request.onerror=()=>reject(request.error);});}catch{return null;}
}
export async function writeProgress(row:ProgressRow){const db=await open();await new Promise<void>((resolve,reject)=>{const tx=db.transaction('saves','readwrite');tx.objectStore('saves').put(row);tx.oncomplete=()=>resolve();tx.onerror=tx.onabort=()=>reject(Error('Device storage is full or unavailable.'));});}
export async function claimGuestProgress(slug:string,account:string):Promise<ProgressRow|null>{
 const db=await open();
 return new Promise((resolve,reject)=>{
  const tx=db.transaction('saves','readwrite'),saves=tx.objectStore('saves'),key=account+':'+slug;
  let row:ProgressRow|null=null;
  const current=saves.get(key);
  current.onsuccess=()=>{
   if(current.result){row=current.result;return;}
   const request=saves.get('guest:'+slug);
   request.onsuccess=()=>{
    const guest=request.result as ProgressRow|undefined;
    if(!guest||guest.claimed)return;
    row={...guest,key,revision:0,dirty:true};
    saves.put(row);saves.put({...guest,claimed:account});
   };
  };
  tx.oncomplete=()=>resolve(row);
  tx.onerror=tx.onabort=()=>reject(Error('Could not move device progress to this Profile.'));
 });
}
export async function cloudProgress(game:string,input?:{scope:string;revision:number;save:GameSnapshot},keepalive=false):Promise<CloudProgress&{revision:number}>{
 const body=input?JSON.stringify(input):undefined;
 const response=await fetch('/api/game-save?game='+encodeURIComponent(game),{method:input?'POST':'GET',headers:{'X-Kkeep-Game-Save':'1',...(input?{'Content-Type':'application/json'}:{})},body,credentials:'same-origin',cache:'no-store',keepalive:keepalive&&!!body&&body.length<60000,signal:AbortSignal.timeout(15000)});
 const result=await response.json();if(!response.ok)throw Object.assign(Error(result.error||'Profile saves are unavailable.'),{status:response.status});return result;
}
export function prepareGameHtml(html:string,base:string,game:SavedGame):string{
 const doc=new DOMParser().parseFromString(html,'text/html');
 const originalBase=new URL(doc.querySelector('base')?.getAttribute('href')||base,base).href;
 const map=(value:string)=>gameAssetUrl(value,base,originalBase,location.origin,game);
 for(const script of doc.querySelectorAll('script')){
  const src=script.getAttribute('src')||'',text=script.textContent||'';
  if(game.slug==='drive-mad'&&/\/js\/main\.js$/.test(src)||/googlesyndication|googletagmanager|google-analytics|\/cloak(?:er)?\.js|macvg\/cloaker|Jump_Gamemonetize/.test(src)||!src&&/adsbygoogle|gtag\(/.test(text)){script.remove();continue;}
  if(['stickman-hook','sausage-flip','blumgi-racers','idle-mining-empire','hypersnake'].includes(game.slug)&&/poki-sdk/.test(src)){script.remove();continue;}
 }
 doc.querySelectorAll('ins.adsbygoogle').forEach(el=>el.remove());
 doc.querySelectorAll('base').forEach(el=>el.remove());
 const baseElement=doc.createElement('base');baseElement.href=map(originalBase);doc.head.prepend(baseElement);
 for(const el of doc.querySelectorAll('[src],[href]'))for(const attr of ['src','href']){const value=el.getAttribute(attr);if(value&&!value.startsWith('#')&&!value.startsWith('data:')&&!value.startsWith('blob:')&&el!==baseElement)el.setAttribute(attr,map(value));}
 doc.querySelectorAll('img').forEach(el=>el.setAttribute('crossorigin','anonymous'));
 if(['stickman-hook','sausage-flip','blumgi-racers','idle-mining-empire','hypersnake'].includes(game.slug)){const adapter=doc.createElement('script');adapter.id='poki-jssdk';adapter.textContent=pokiAdapter;baseElement.after(adapter);}
 // Keep the game's own scripts and controls. A fixed base preserves relative assets.
 doc.title=game.name+' · Kkeep';return '<!doctype html>'+doc.documentElement.outerHTML;
}

// Copy known legacy saves once; never remove or rewrite the original game's storage.
export async function migrateLegacyProgress(slug:string):Promise<ProgressRow|null>{
 const rules:Record<string,RegExp>={
  'idle-mining-empire':/^MJS-Idle-Mining-Empire-v1\.0\.1$/,
  'geometry-dash':/^(?:gd_|bestPercent_|practiceBestPercent_|viewedLevel_|icon(?:MainColor|SecondaryColor|Current)|created_levels$|playerName$|userSfxVol$|menuMusicEnabled$)/,
  'stick-war-legacy':/^kkeep\.stick-war\.save\.v1$/,
  'solar-smash':/^kkeep\.solar-smash\.save\.v1$/,
 };
 try{
  const rule=rules[slug],marker='kkeep.game-migrated.'+slug;if(!rule||localStorage.getItem(marker))return null;
  const local:[string,string][]=[];for(let i=0;i<localStorage.length;i++){const name=localStorage.key(i);if(name&&rule.test(name))local.push([name,localStorage.getItem(name)!]);}
  if(!local.length)return null;
  const row:ProgressRow={key:'guest:'+slug,save:{version:1,local,databases:[]},revision:0,dirty:false,updated:Date.now()};
  if(JSON.stringify(row.save).length>1048576)return null;
  await writeProgress(row);localStorage.setItem(marker,'1');return row;
 }catch{return null;}
}
