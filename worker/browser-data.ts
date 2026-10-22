import {profileIdentity} from './profile.ts';
type Statement={bind:(...args:unknown[])=>Statement;all:()=>Promise<{results:unknown[]}>;run:()=>Promise<{meta:{changes:number}}>};
export type BrowserDB={prepare:(sql:string)=>Statement;batch:(items:Statement[])=>Promise<unknown>};
export function savedAddress(value:unknown,origin:string){
 const url=new URL(String(value));
 if(!['https:','http:'].includes(url.protocol)||url.username||url.password||url.origin===origin||url.href.length>4096)throw new Error('Choose a public website address.');
 url.hash='';url.search='';return url.href;
}
export async function browserData(request:Request,db?:BrowserDB){
 const headers=new Headers({'Cache-Control':'no-store','Content-Type':'application/json'});
 const answer=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers});
 const origin=new URL(request.url).origin;
 if(request.headers.get('x-kkeep')!=='1'||(request.headers.get('origin')&&request.headers.get('origin')!==origin))return answer({error:'Open this action from Kkeep.'},403);
 if(!db)return answer({error:'Saved data is unavailable. Please try again later.'},503);
 let token=/__Host-kkeep-data=([a-f0-9]{64})(?:;|$)/.exec(request.headers.get('cookie')||'')?.[1];
 if(!token){token=Array.from(crypto.getRandomValues(new Uint8Array(32)),n=>n.toString(16).padStart(2,'0')).join('');headers.set('Set-Cookie',`__Host-kkeep-data=${token}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=31536000`);}
 let owner=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token))),n=>n.toString(16).padStart(2,'0')).join('');
 try{
  const account=await profileIdentity(request,db);
  if(account){const next='profile:'+account.id;await db.prepare('UPDATE browser_items SET owner=? WHERE owner=?').bind(next,owner).run();owner=next;}
  if(request.method==='GET')return answer({items:(await db.prepare('SELECT id,kind,title,url,created FROM browser_items WHERE owner=? ORDER BY created DESC LIMIT 200').bind(owner).all()).results});
  if(request.method!=='POST')return answer({error:'Method not supported.'},405);
  const reader=request.body?.getReader();if(!reader)return answer({error:'Missing data.'},400);
  let size=0;const chunks:Uint8Array[]=[];
  for(;;){const r=await reader.read();if(r.done)break;size+=r.value.length;if(size>8192){await reader.cancel();return answer({error:'Message is too long.'},413);}chunks.push(r.value);}
  const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}
  const data=JSON.parse(new TextDecoder().decode(bytes));const now=Date.now();const id=crypto.randomUUID();
  if(data.action==='idea'){
   const message=String(data.message||'').trim();if(message.length<5||message.length>1000)return answer({error:'Write an idea between 5 and 1,000 characters.'},400);
   const result=await db.prepare('INSERT INTO ideas (id,owner,message,created) SELECT ?,?,?,? WHERE (SELECT count(*) FROM ideas WHERE owner=? AND created>?)<5 AND (SELECT count(*) FROM ideas WHERE created>?)<1000').bind(id,owner,message,now,owner,now-86400000,now-86400000).run();
   return result.meta.changes?answer({saved:true}):answer({error:'The idea inbox has reached its daily limit. Please try tomorrow.'},429);
  }
  if(!['bookmark','history'].includes(data.kind))return answer({error:'Invalid list.'},400);
  if(data.action==='clear'){await db.prepare('DELETE FROM browser_items WHERE owner=? AND kind=?').bind(owner,data.kind).run();return answer({saved:true});}
  if(data.action==='delete'){await db.prepare('DELETE FROM browser_items WHERE owner=? AND kind=? AND id=?').bind(owner,data.kind,String(data.id)).run();return answer({saved:true});}
  if(data.action!=='save')return answer({error:'Invalid action.'},400);
  const url=savedAddress(data.url,origin);const title=String(data.title||new URL(url).hostname).slice(0,150);
  await db.batch([
   db.prepare('DELETE FROM browser_items WHERE owner=? AND kind=? AND url=?').bind(owner,data.kind,url),
   db.prepare('INSERT INTO browser_items (id,owner,kind,title,url,created) VALUES (?,?,?,?,?,?)').bind(id,owner,data.kind,title,url,now),
   db.prepare('DELETE FROM browser_items WHERE owner=? AND kind=? AND id NOT IN (SELECT id FROM browser_items WHERE owner=? AND kind=? ORDER BY created DESC LIMIT 100)').bind(owner,data.kind,owner,data.kind),
  ]);
  return answer({item:{id,kind:data.kind,title,url,created:now}});
 }catch{ return answer({error:'Could not save or load this data. Your input has been kept; please retry.'},400); }
}
