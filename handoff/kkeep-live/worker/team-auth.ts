import type {BrowserDB} from './browser-data';
const community='https://kkeep-community.testerqrr1.chatgpt.site';
const cookieName='__Host-kkeep-team';
const headers={'Cache-Control':'no-store, private','X-Content-Type-Options':'nosniff'};
function token(request:Request){return /(?:^|;\s*)__Host-kkeep-team=([a-f0-9]{64})(?:;|$)/.exec(request.headers.get('cookie')||'')?.[1];}
export async function teamRole(request:Request,_env?:unknown,send:typeof fetch=fetch){
 const value=token(request);if(!value)return null;
 const response=await send(community+'/api/session',{headers:{Cookie:'kkeep_session='+value},redirect:'error',signal:AbortSignal.timeout(8000)});
 if(!response.ok)return null;
 const data=await response.json() as {user?:{role?:string}};
 return data.user?.role==='owner'||data.user?.role==='helper'?data.user.role:null;
}
export async function teamAuth(request:Request,db?:BrowserDB,send:typeof fetch=fetch){
 const json=(value:unknown,status=200,extra:Record<string,string>={})=>Response.json(value,{status,headers:{...headers,...extra}});
 if(request.method!=='POST')return json({error:'Method not allowed.'},405);
 if(request.headers.get('origin')!==new URL(request.url).origin||request.headers.get('x-kkeep-team')!=='1')return json({error:'Invalid request.'},403);
 try{
 const raw=await request.text();if(raw.length>1024)return json({error:'Input too large.'},413);
 const input=JSON.parse(raw),logout=input.action==='logout';
 if(!logout){
 if(!['Owner','helper'].includes(input.username)||typeof input.password!=='string'||input.password.length>128)return json({error:'Enter your Owner or helper username and password.'},400);
 if(!db)return json({error:'Login unavailable. Please retry.'},503);
 await db.prepare('CREATE TABLE IF NOT EXISTS team_login_limits (key TEXT PRIMARY KEY,count INTEGER NOT NULL,expires INTEGER NOT NULL)').run();
 const key=request.headers.get('cf-connecting-ip')||'unknown',now=Date.now();
 await db.prepare('INSERT INTO team_login_limits VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN expires<=? THEN 1 ELSE count+1 END,expires=CASE WHEN expires<=? THEN ? ELSE expires END').bind(key,now+900000,now,now,now+900000).run();
 const row=(await db.prepare('SELECT count FROM team_login_limits WHERE key=?').bind(key).all()).results[0] as {count:number};
 if(row.count>15)return json({error:'Too many attempts. Please try again in 15 minutes.'},429);
 }
 const value=token(request);
 const response=await send(community+(logout?'/api/logout':'/api/login'),{method:'POST',headers:{'Content-Type':'application/json','Origin':community,'X-Kkeep-Client':'1',...(value?{Cookie:'kkeep_session='+value}:{})},body:JSON.stringify(logout?{}:{username:input.username,password:input.password}),redirect:'error',signal:AbortSignal.timeout(15000)});
 if(logout)return json({ok:true},200,{'Set-Cookie':cookieName+'=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0'});
 const data=await response.json() as {user?:{role?:string};error?:string};
 if(!response.ok)return json({error:data.error||'Login failed.'},response.status);
 const session=/kkeep_session=([a-f0-9]{64})(?:;|$)/.exec(response.headers.get('set-cookie')||'')?.[1];
 if(!session||!['owner','helper'].includes(data.user?.role||''))return json({error:'Owner or helper access required.'},403);
 await db!.prepare('DELETE FROM team_login_limits WHERE key=? OR expires<?').bind(request.headers.get('cf-connecting-ip')||'unknown',Date.now()).run();
 return json({ok:true},200,{'Set-Cookie':cookieName+'='+session+'; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=86400'});
 }catch{return json({error:'Login is temporarily unavailable. Please retry.'},503);}
}
