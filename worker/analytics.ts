import type {BrowserDB} from './browser-data';
import {analyticsPage,analyticsGate} from './analytics-view.ts';

export type AnalyticsEnv={DB?:BrowserDB;KKEEP_ANALYTICS_OWNER_EMAIL?:string;KKEEP_ANALYTICS_SECRET?:string;KKEEP_ANALYTICS_STARTED_AT?:string};
type EdgeRequest=Request & {cf?:{country?:string;botManagement?:{verifiedBot?:boolean;score?:number}}};
const DAY=86400000, OFFSET=4*3600000, RETENTION=35*DAY;
export const surfaces=['home','web','youtube','tiktok','snapchat','roblox','clash','ghost','gfn','xbox'] as const;
const SURFACES=new Set<string>(surfaces);
const OPT_OUT='__Host-kkeep-analytics-exclude';
const secureHeaders={'Cache-Control':'no-store, private','Vary':'Cookie, oai-authenticated-user-email','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin'};
function json(value:unknown,status=200){return Response.json(value,{status,headers:secureHeaders});}
function empty(){return new Response(null,{status:204,headers:secureHeaders});}
export function analyticsOwner(request:Request,env:AnalyticsEnv){
 const expected=env.KKEEP_ANALYTICS_OWNER_EMAIL?.trim().toLowerCase();
 return !!expected&&request.headers.get('oai-authenticated-user-email')?.trim().toLowerCase()===expected;
}
function optedOut(request:Request){return new RegExp('(?:^|;\\s*)'+OPT_OUT+'=1(?:;|$)').test(request.headers.get('cookie')||'');}
function sameOrigin(request:Request){return request.headers.get('origin')===new URL(request.url).origin&&request.headers.get('x-kkeep-analytics')==='1';}
export function coarseDevice(ua:string,ipad=false){
 if(/iPad/i.test(ua)||(ipad&&/Macintosh/i.test(ua)))return 'iPad';
 if(/iPhone|iPod/i.test(ua))return 'iPhone';
 if(/Android/i.test(ua))return /Mobile/i.test(ua)?'Android phone':'Android tablet';
 if(/Windows/i.test(ua))return 'Windows';
 if(/Macintosh|Mac OS X/i.test(ua))return 'Mac';
 if(/CrOS/i.test(ua))return 'Chromebook';
 if(/Linux/i.test(ua))return 'Linux';
 return 'Other';
}
export function coarseBrowser(ua:string){
 if(/Edg(?:e|A|iOS)?\//i.test(ua))return 'Edge';
 if(/OPR\/|Opera|OPiOS/i.test(ua))return 'Opera';
 if(/Firefox|FxiOS/i.test(ua))return 'Firefox';
 if(/Chrome|CriOS|Chromium/i.test(ua))return 'Chrome family';
 if(/Safari/i.test(ua))return 'Safari';
 return 'Other';
}
function isBot(request:EdgeRequest){
 const ua=request.headers.get('user-agent')||'';
 return !ua||/bot\b|crawler|spider|headless|lighthouse|pagespeed|curl|wget|python|monitoring|uptime/i.test(ua)||request.cf?.botManagement?.verifiedBot===true||(typeof request.cf?.botManagement?.score==='number'&&request.cf.botManagement.score<30);
}
async function body(request:Request){
 const reader=request.body?.getReader();if(!reader)throw new Error('body');
 let length=0;const parts:Uint8Array[]=[];
 for(;;){const part=await reader.read();if(part.done)break;length+=part.value.length;if(length>512){await reader.cancel();throw new Error('size');}parts.push(part.value);}
 const bytes=new Uint8Array(length);let at=0;for(const part of parts){bytes.set(part,at);at+=part.length;}
 return JSON.parse(new TextDecoder().decode(bytes));
}
async function mac(secret:string,value:string){
 const enc=new TextEncoder();const key=await crypto.subtle.importKey('raw',enc.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 return Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',key,enc.encode(value))),x=>x.toString(16).padStart(2,'0')).join('');
}
export function dubaiDay(now:number){return new Date(now+OFFSET).toISOString().slice(0,10);}
export function reportRange(now:number,days:number){
 const today=Math.floor((now+OFFSET)/DAY)*DAY-OFFSET;
 return {from:today-(days-1)*DAY,to:now,startDay:dubaiDay(today-(days-1)*DAY),endDay:dubaiDay(now)};
}
let lastCleanup=0;
export async function collectAnalytics(request:EdgeRequest,env:AnalyticsEnv,now=Date.now()){
 if(request.method!=='POST')return json({error:'Method not allowed'},405);
 if(!sameOrigin(request))return json({error:'Open Kkeep to use this action.'},403);
 if(optedOut(request)||analyticsOwner(request,env)||request.headers.get('dnt')==='1'||request.headers.get('sec-gpc')==='1'||isBot(request))return empty();
 if(!env.DB||!env.KKEEP_ANALYTICS_SECRET||!env.KKEEP_ANALYTICS_OWNER_EMAIL)return empty();
 let data;try{data=await body(request);}catch{return json({error:'Invalid event'},400);}
 if(!data||typeof data!=='object'||Array.isArray(data)||Object.keys(data).some(key=>!['surface','event','ipad'].includes(key))||!SURFACES.has(data.surface)||typeof data.event!=='string'||!/^[a-f0-9-]{36}$/i.test(data.event)||(data.ipad!==undefined&&typeof data.ipad!=='boolean'))return json({error:'Invalid event'},400);
 // These headers are supplied by the hosting edge. Never accept an IP or country in the body.
 const ip=request.headers.get('cf-connecting-ip');if(!ip||ip.length>64)return empty();
 const ua=(request.headers.get('user-agent')||'').slice(0,1024);
 const device=coarseDevice(ua,data.ipad===true),browser=coarseBrowser(ua);
 const rawCountry=request.cf?.country||request.headers.get('cf-ipcountry')||'';
 const country=/^[A-Z]{2}$/.test(rawCountry)&&!['XX','T1'].includes(rawCountry)?rawCountry:'Unknown';
 // Daily data expires; the pseudonym is never returned by the report API.
 // Shared networks/browser types can merge visitors; changes of network can split them.
 const visitor=await mac(env.KKEEP_ANALYTICS_SECRET,'visitor\0'+ip+'\0'+device+'\0'+browser);
 const id=await mac(env.KKEEP_ANALYTICS_SECRET,'event\0'+visitor+'\0'+data.event);
 try{
  await env.DB.prepare('INSERT OR IGNORE INTO analytics_events (id,visitor,created,day,country,device,browser,surface) SELECT ?,?,?,?,?,?,?,? WHERE (SELECT count(*) FROM analytics_events WHERE visitor=? AND created>?)<20 AND (SELECT count(*) FROM analytics_events WHERE visitor=? AND created>?)<500')
   .bind(id,visitor,now,dubaiDay(now),country,device,browser,data.surface,visitor,now-60000,visitor,now-DAY).run();
  if(now-lastCleanup>3600000){await env.DB.prepare('DELETE FROM analytics_events WHERE created<?').bind(now-RETENTION).run();lastCleanup=now;}
  return empty();
 }catch{console.warn('Kkeep analytics storage unavailable');return empty();}
}
export async function analyticsPreference(request:Request,env:AnalyticsEnv){
 if(request.method==='GET')return json({excluded:optedOut(request),owner:analyticsOwner(request,env),privacySignal:request.headers.get('dnt')==='1'||request.headers.get('sec-gpc')==='1'});
 if(request.method!=='POST')return json({error:'Method not allowed'},405);
 if(!sameOrigin(request))return json({error:'Open Kkeep to use this action.'},403);
 let data;try{data=await body(request);}catch{return json({error:'Invalid preference'},400);}
 if(!data||typeof data.excluded!=='boolean')return json({error:'Invalid preference'},400);
 const response=json({excluded:data.excluded,owner:analyticsOwner(request,env)});
 response.headers.set('Set-Cookie',`${OPT_OUT}=${data.excluded?'1':'0'}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=${data.excluded?31536000:0}`);
 return response;
}
export async function analyticsReport(request:Request,env:AnalyticsEnv,now=Date.now()){
 if(request.method!=='GET')return json({error:'Method not allowed'},405);
 if(!analyticsOwner(request,env))return json({error:'Only the Kkeep owner can view analytics.'},403);
 if(!env.DB)return json({error:'Analytics storage is unavailable.'},503);
 const value=new URL(request.url).searchParams.get('days')||'30';
 if(!['1','7','30'].includes(value))return json({error:'Choose today, 7 days, or 30 days.'},400);
 const days=Number(value),range=reportRange(now,days);
 try{
  const rows=async(sql:string)=>(await env.DB!.prepare(sql).bind(range.from,range.to).all()).results;
  const [total,daily,countries,devices,browsers,pages]=await Promise.all([
   rows('SELECT count(*) AS views,count(DISTINCT visitor) AS visitors,count(DISTINCT CASE WHEN country<>\'Unknown\' THEN country END) AS countries FROM analytics_events WHERE created>=? AND created<=?'),
   rows('SELECT day,count(*) AS views,count(DISTINCT visitor) AS visitors FROM analytics_events WHERE created>=? AND created<=? GROUP BY day ORDER BY day'),
   rows('SELECT country AS name,count(*) AS views,count(DISTINCT visitor) AS visitors FROM analytics_events WHERE created>=? AND created<=? GROUP BY country ORDER BY views DESC,name LIMIT 250'),
   rows('SELECT device AS name,count(*) AS views,count(DISTINCT visitor) AS visitors FROM analytics_events WHERE created>=? AND created<=? GROUP BY device ORDER BY views DESC,name'),
   rows('SELECT browser AS name,count(*) AS views,count(DISTINCT visitor) AS visitors FROM analytics_events WHERE created>=? AND created<=? GROUP BY browser ORDER BY views DESC,name'),
   rows('SELECT surface AS name,count(*) AS views,count(DISTINCT visitor) AS visitors FROM analytics_events WHERE created>=? AND created<=? GROUP BY surface ORDER BY views DESC,name'),
  ]);
  return json({days,timezone:'Asia/Dubai',range,startedAt:env.KKEEP_ANALYTICS_STARTED_AT||null,updatedAt:new Date(now).toISOString(),totals:total[0]||{views:0,visitors:0,countries:0},daily,countries,devices,browsers,pages,excluded:optedOut(request),retentionDays:35});
 }catch{console.warn('Kkeep analytics report unavailable');return json({error:'Could not load analytics. Please retry.'},503);}
}
export function analyticsDocument(request:Request,env:AnalyticsEnv){
 if(request.method!=='GET'&&request.method!=='HEAD')return json({error:'Method not allowed'},405);
 const owner=analyticsOwner(request,env),signedIn=!!request.headers.get('oai-authenticated-user-email');
 const html=owner?analyticsPage:analyticsGate(signedIn,!!env.KKEEP_ANALYTICS_OWNER_EMAIL);
 const headers=new Headers({...secureHeaders,'Content-Type':'text/html; charset=utf-8','X-Frame-Options':'DENY','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"});
 return new Response(request.method==='HEAD'?null:html,{status:owner?200:signedIn?403:200,headers});
}
