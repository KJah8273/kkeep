import type {BrowserDB} from './browser-data';
import {teamRole} from './team-auth.ts';
type AnalyticsEnv={DB?:BrowserDB};
const headers={'Cache-Control':'no-store, private','Vary':'Cookie, oai-authenticated-user-email','X-Content-Type-Options':'nosniff'};
const json=(data:unknown,status=200)=>Response.json(data,{status,headers});
async function setup(env:AnalyticsEnv){
 await env.DB!.batch([
 env.DB!.prepare('CREATE TABLE IF NOT EXISTS team_announcements (id TEXT PRIMARY KEY,title TEXT NOT NULL,body TEXT NOT NULL,created INTEGER NOT NULL)'),
 env.DB!.prepare('CREATE TABLE IF NOT EXISTS team_hours (role TEXT PRIMARY KEY,start TEXT NOT NULL,end TEXT NOT NULL,days TEXT NOT NULL)'),
 env.DB!.prepare("INSERT OR IGNORE INTO team_hours VALUES ('Owner','07:30','16:00','Daily'),('Staff','07:30','16:00','Daily')")]);
}
export async function announcements(request:Request,env:AnalyticsEnv){
 const path=new URL(request.url).pathname;
 try{
 const role=await teamRole(request,env);
 if(path==='/api/announcements/access')return json({role});
 if(!env.DB)return json({error:'Storage unavailable.'},503);
 await setup(env);
 if(path==='/announcements'||path==='/announcements/')return new Response(shell(page(role||'visitor')),{headers:{...headers,'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"}});
 if(request.method==='GET')return json({role,posts:(await env.DB.prepare('SELECT * FROM team_announcements ORDER BY created DESC LIMIT 100').all()).results,hours:(await env.DB.prepare('SELECT * FROM team_hours ORDER BY role').all()).results});
 if(!role)return json({error:'Owner or staff access required.'},403);
 if(request.method!=='POST')return json({error:'Method not allowed.'},405);
 if(request.headers.get('origin')!==new URL(request.url).origin||request.headers.get('x-kkeep-team')!=='1')return json({error:'Invalid request.'},403);
 const raw=await request.text();if(raw.length>12000)return json({error:'Input too large.'},413);
 const data=JSON.parse(raw);
 if(data.action==='post'){
 const title=String(data.title||'').trim(),body=String(data.body||'').trim();
 if(!title||title.length>100||!body||body.length>4000)return json({error:'Enter a title (up to 100 characters) and message (up to 4,000).'},400);
 await env.DB.prepare('INSERT INTO team_announcements VALUES (?,?,?,?)').bind(crypto.randomUUID(),title,body,Date.now()).run();
 }else if(data.action==='delete'){
 await env.DB.prepare('DELETE FROM team_announcements WHERE id=?').bind(String(data.id)).run();
 }else if(data.action==='hours'){
 if(!['Owner','Staff'].includes(data.role)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(data.start)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(data.end)||!String(data.days||'').trim()||String(data.days).length>80)return json({error:'Choose valid hours and days.'},400);
 await env.DB.prepare('UPDATE team_hours SET start=?,end=?,days=? WHERE role=?').bind(data.start,data.end,String(data.days).trim(),data.role).run();
 }else return json({error:'Unknown action.'},400);
 return json({saved:true});
 }catch{return json({error:'Could not complete this request. Please retry.'},503);}
}
function shell(content:string){return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Announcements · Kkeep</title><link rel="stylesheet" href="/announcements/team.css"></head><body><main><nav><a href="/">← Kkeep</a><span>KKEEP UPDATES</span></nav>${content}</main></body></html>`;}
function page(role:string){return `<header><p class="tag">KKEEP TEAM</p><h1>Announcements</h1><p>Updates from the Kkeep team.</p></header><p id="error" role="alert"></p><div class="layout"><div>${role!=='visitor'?`<section><h2>Post an announcement</h2><form id="post"><label>Title<input name="title" required maxlength="100" placeholder="What’s new?"></label><label>Message<textarea name="body" required maxlength="4000" rows="4" placeholder="Share an update with the team"></textarea></label><button>Post announcement</button></form></section>`:''}<div id="posts" aria-live="polite"></div></div><aside><section><h2>Active hours</h2><p>UAE time · UTC+4</p><small>Scheduled availability, not live online status.</small><div id="hours"></div></section></aside></div>${role==='visitor'?'<details><summary>Owner / helper login</summary><form id="team-login"><label>Username<input name="username" autocomplete="username" placeholder="Owner or helper" required></label><label>Password<input name="password" type="password" autocomplete="current-password" required></label><button>Log in</button></form></details>':'<p><button id="team-logout" class="secondary">Log out</button></p>'}<script src="/announcements/team.js" defer></script>`;}
