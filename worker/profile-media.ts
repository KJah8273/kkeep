import {profileIdentity} from './profile.ts';
import type {BrowserDB} from './browser-data.ts';
import type {GameAssetEnv} from './game-assets.ts';
import {validateSignature} from '../lib/living-space/media.ts';
export async function profileMedia(request:Request,env:GameAssetEnv&{DB?:BrowserDB}){
 const reply=(v:unknown,status=400)=>Response.json(v,{status,headers:{'Cache-Control':'no-store'}});
 if(request.headers.get('X-Kkeep-Profile')!=='1'||request.headers.get('Sec-Fetch-Site')==='cross-site'||(request.headers.get('Origin')&&request.headers.get('Origin')!==new URL(request.url).origin))return reply({error:'Not allowed'},403);
 try{
 const user=await profileIdentity(request,env.DB);if(!user)return reply({error:'Log in first'},401);
 if(!env.GAME_ASSETS||!env.DB)return reply({error:'Storage unavailable'},503);
 const url=new URL(request.url),id=url.searchParams.get('id')||'',part=url.searchParams.get('part')||'blob';
 if(!/^upload:[a-f0-9-]{36}$/.test(id)||!['blob','poster'].includes(part))return reply({error:'Invalid wallpaper'});
 const key=`profile-media/${user.id}/${id}/${part}`;
 if(request.method==='GET'){
 const file=await env.GAME_ASSETS.get(key);if(!file?.body)return reply({error:'Wallpaper unavailable'},404);
 return new Response(file.body,{headers:{'Content-Type':file.customMetadata?.type||'application/octet-stream','Cache-Control':'private, max-age=3600','X-Content-Type-Options':'nosniff','X-Kkeep-Media':file.customMetadata?.info||'{}'}});
 }
 if(request.method!=='PUT')return reply({error:'Method not allowed'},405);
 const type=request.headers.get('Content-Type')||'',length=Number(request.headers.get('Content-Length'));
 if(!['image/jpeg','image/png','image/webp','image/avif','video/mp4','video/webm'].includes(type)||!Number.isSafeInteger(length)||length<1||length>(part==='poster'?2: type.startsWith('video/')?40:16)*1024*1024)return reply({error:'Invalid wallpaper size or type'},413);
 const info=JSON.parse(request.headers.get('X-Kkeep-Media')||'{}');
 if(!Number.isInteger(info.width)||!Number.isInteger(info.height)||info.width<320||info.height<180||info.width*info.height>24000000)return reply({error:'Invalid image dimensions'});
 // At most eight media records per account. Reservations are atomic and reused.
 const r=await env.DB.prepare('INSERT INTO kkeep_media (account,id) SELECT ?,? WHERE (SELECT count(*) FROM kkeep_media WHERE account=?)<8 ON CONFLICT(account,id) DO UPDATE SET id=excluded.id').bind(user.id,id,user.id).run();
 if(!r.meta.changes){const found=(await env.DB.prepare('SELECT id FROM kkeep_media WHERE account=? AND id=?').bind(user.id,id).all()).results;if(!found.length)return reply({error:'Wallpaper limit reached'},413);}
 if(!request.body)return reply({error:'Missing wallpaper'});
 let count=0,first=true;
 const stream=request.body.pipeThrough(new TransformStream({transform(chunk:Uint8Array,controller){count+=chunk.length;if(count>length)throw Error('File too large');if(first){validateSignature(chunk,type);first=false;}controller.enqueue(chunk);},flush(){if(count!==length)throw Error('Incomplete wallpaper');}}));
 const Fixed=(globalThis as unknown as {FixedLengthStream?:new(length:number)=>TransformStream}).FixedLengthStream;
 const sized=Fixed?stream.pipeThrough(new Fixed(length)):stream;
 await env.GAME_ASSETS.put(key,sized,{customMetadata:{type,info:JSON.stringify({width:info.width,height:info.height,kind:type.startsWith('video/')?'video':'image'})}});
 return reply({ok:true},200);
 }catch{return reply({error:'Wallpaper sync failed'},503);}
}
