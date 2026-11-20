import {profileIdentity} from './profile.ts';
import type {BrowserDB} from './browser-data.ts';
import {VIDEO_ID,CHANNEL_ID,card,cards,type VideoCard,type VideoDetails,type SavedVideo} from '../lib/kkeep-youtube/model.ts';
export type VideoEnv={DB?:BrowserDB;INVIDIOUS_URL?:string;INVIDIOUS_API_KEY?:string;INVIDIOUS_COMPANION_URL?:string};
type Context={waitUntil(promise:Promise<unknown>):void};
class VideoError extends Error{readonly status:number;constructor(message:string,status=502){super(message);this.status=status;}}
const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
export function backendOrigin(value?:string){if(!value)return null;try{const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||u.port||u.pathname!=='/'||u.search||u.hash)return null;return u.origin;}catch{return null;}}
export function streamTarget(value:unknown,env:VideoEnv){
 if(typeof value!=='string')return null;try{const u=new URL(value,backendOrigin(env.INVIDIOUS_URL)||undefined),origin=backendOrigin(env.INVIDIOUS_URL),companion=backendOrigin(env.INVIDIOUS_COMPANION_URL);
 if(u.protocol!=='https:'||u.username||u.password||u.port)return null;
 // Video URLs originate in the configured backend's response, never a user-supplied URL.
 if((u.origin===origin||u.origin===companion)&&/^\/(?:videoplayback|companion\/)/.test(u.pathname))return u;
 if(/^[a-z0-9-]+\.googlevideo\.com$/.test(u.hostname)&&u.pathname==='/videoplayback')return u;
 }catch{}return null;
}
async function boundedJson(response:Response,max=2000000){
 const reader=response.body?.getReader();if(!reader)throw new VideoError('The video server returned an empty response.');let length=0;const parts:Uint8Array[]=[];
 for(;;){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>max){await reader.cancel();throw new VideoError('The video server response is too large.');}parts.push(value);}
 const bytes=new Uint8Array(length);let offset=0;for(const p of parts){bytes.set(p,offset);offset+=p.length;}try{return JSON.parse(new TextDecoder().decode(bytes));}catch{throw new VideoError('The video server returned an invalid response.');}
}
export async function kkeepYoutube(request:Request,env:VideoEnv,ctx:Context,fetcher:typeof fetch=fetch){
 const url=new URL(request.url),route=url.pathname.slice('/api/kkeep-youtube/'.length),reply=(value:unknown,status=200)=>Response.json(value,{status,headers});
 const media=route==='stream'||route==='image';
 if(request.headers.get('Sec-Fetch-Site')==='cross-site'||request.headers.get('Origin')&&request.headers.get('Origin')!==url.origin||!media&&request.headers.get('X-Kkeep-Video')!=='1')return reply({error:'Open Kkeep YouTube from Kkeep.'},403);
 if(!['GET','HEAD','POST'].includes(request.method)||request.method==='POST'&&route!=='action'||request.method==='HEAD'&&!media)return reply({error:'Method not allowed.'},405);
 if(!env.DB)return reply({error:'Profile is temporarily unavailable.'},503);
 try{
  const account=await profileIdentity(request,env.DB),origin=backendOrigin(env.INVIDIOUS_URL),db=env.DB;
  if(route==='status'&&request.method==='GET')return reply({account,configured:!!origin});
  if(!account)return reply({error:'Log in to your Kkeep Profile to watch and save videos.'},401);
  const rows=async(query:string,...args:unknown[])=>(await db.prepare(query).bind(...args).all()).results as Record<string,unknown>[];
  const metadata=async(path:string,query:Record<string,string>={})=>{
   if(!origin)throw new VideoError('Kkeep YouTube is waiting for its video server.',503);
   const endpoint=new URL('/api/v1/'+path,origin);for(const [key,value] of Object.entries(query))endpoint.searchParams.set(key,value);
   const cache=(globalThis as unknown as {caches?:{default?:Cache}}).caches?.default;
   const cacheUrl=new URL('/__kkeep-video-cache',url.origin);cacheUrl.searchParams.set('source',endpoint.href);
   const key=new Request(cacheUrl);if(cache){try{const hit=await cache.match(key);if(hit)return await hit.json();}catch{}}
   const res=await fetcher(endpoint.href,{headers:{Accept:'application/json',...(env.INVIDIOUS_API_KEY?{'X-Kkeep-Backend-Key':env.INVIDIOUS_API_KEY}:{})},redirect:'manual',credentials:'omit',signal:AbortSignal.timeout(18000)});
   if(!res.ok)throw new VideoError(res.status===404?'This video or channel is unavailable.':'The video server is unavailable. Try again shortly.',res.status===404?404:502);
   const value=await boundedJson(res);if(value?.error)throw new VideoError('This video is unavailable from the video server.',422);
   if(cache)ctx.waitUntil(cache.put(key,Response.json(value,{headers:{'Cache-Control':'public, max-age=120'}})).catch(()=>{}));return value;
  };
  const saved=(r:Record<string,unknown>):SavedVideo=>({...JSON.parse(String(r.data)),position:Number(r.position),duration:Number(r.duration),watched:Number(r.watched),saved:!!r.saved,liked:!!r.liked,updated:Number(r.updated)});
  if(route==='state'&&request.method==='GET'){
   const [history,savedRows,liked,subscriptions]=await Promise.all([
    rows('SELECT * FROM kkeep_video_items WHERE account=? AND watched>0 ORDER BY watched DESC LIMIT 100',account.id),
    rows('SELECT * FROM kkeep_video_items WHERE account=? AND saved=1 ORDER BY updated DESC LIMIT 300',account.id),
    rows('SELECT * FROM kkeep_video_items WHERE account=? AND liked=1 ORDER BY updated DESC LIMIT 300',account.id),
    rows('SELECT channel AS id,name FROM kkeep_video_channels WHERE account=? ORDER BY created DESC LIMIT 100',account.id)]);
   return reply({account,configured:!!origin,history:history.map(r=>saved(r as Record<string,unknown>)),saved:savedRows.map(r=>saved(r as Record<string,unknown>)),liked:liked.map(r=>saved(r as Record<string,unknown>)),subscriptions});
  }
  if(route==='browse'&&request.method==='GET'){
   const type=url.searchParams.get('type')||'home',q=(url.searchParams.get('q')||'').trim(),page=Number(url.searchParams.get('page')||1),channel=url.searchParams.get('channel')||'';
   if(!Number.isSafeInteger(page)||page<1||page>20||q.length>150||!['home','trending','music','gaming','subscriptions','channel'].includes(type))throw new VideoError('Invalid search.',400);
   if(q)return reply({videos:cards(await metadata('search',{q,page:String(page),type:'video',sort:'relevance'})),more:page<20});
   if(type==='channel'){
    if(!CHANNEL_ID.test(channel))throw new VideoError('Invalid channel.',400);
    const info=await metadata('channels/'+channel),list=await metadata('channels/'+channel+'/videos');return reply({videos:cards(list.videos||list),channel:{id:channel,name:String(info.author||'Channel').slice(0,140)},more:false});
   }
   if(type==='subscriptions'){
    const subs=await rows('SELECT channel FROM kkeep_video_channels WHERE account=? ORDER BY created DESC LIMIT 12',account.id);
    const results=await Promise.allSettled(subs.map(s=>metadata('channels/'+s.channel+'/videos')));const videos=cards(results.flatMap(r=>r.status==='fulfilled'?(r.value.videos||r.value):[]));
    if(subs.length&&!videos.length&&results.every(r=>r.status==='rejected'))throw new VideoError('Could not load subscriptions. Try again.');return reply({videos,more:false});
   }
   const popular=await metadata('trending',{type:type==='music'||type==='gaming'?type:'default',region:'AE'});
   if(type!=='home')return reply({videos:cards(popular),more:false});
   const recent=await rows('SELECT video FROM kkeep_video_items WHERE account=? AND watched>0 ORDER BY updated DESC LIMIT 2',account.id);
   const related=await Promise.allSettled(recent.map(r=>metadata('videos/'+r.video)));
   return reply({videos:cards([...related.flatMap(r=>r.status==='fulfilled'?r.value.recommendedVideos||[]:[]),...popular]),more:false});
  }
  const videoId=url.searchParams.get('id')||'';
  if(['video','image','stream'].includes(route)&&!VIDEO_ID.test(videoId))throw new VideoError('Invalid video.',400);
  if(route==='image'){
   const response=await fetcher('https://i.ytimg.com/vi/'+videoId+'/hqdefault.jpg',{redirect:'manual',credentials:'omit',signal:AbortSignal.timeout(10000)});
   if(!response.ok||!/^image\/(?:jpeg|png|webp)/.test(response.headers.get('Content-Type')||''))throw new VideoError('Thumbnail unavailable.',404);
   return new Response(request.method==='HEAD'?null:response.body,{headers:{...headers,'Content-Type':response.headers.get('Content-Type')!,'Cache-Control':'private, max-age=3600'}});
  }
  const formats=(raw:any)=>Array.isArray(raw.formatStreams)?raw.formatStreams.filter((f:any)=>/^\d{1,4}$/.test(String(f.itag))&&/^video\/mp4(?:;|$)/.test(f.type||'')&&streamTarget(f.url,env)):[];
  if(route==='video'){
   const raw=await metadata('videos/'+videoId,{local:'true'}),base=card(raw);if(!base)throw new VideoError('This video is unavailable.',422);
   const details:VideoDetails={...base,description:String(raw.description||'').slice(0,12000),related:cards(raw.recommendedVideos),formats:formats(raw).map((f:any)=>({itag:String(f.itag),label:String(f.qualityLabel||f.quality||f.resolution||'Standard').slice(0,50),type:f.type})),unavailable:!!(raw.paid||raw.premium)};
   return reply(details);
  }
  if(route==='stream'){
   const itag=url.searchParams.get('itag')||'';if(!/^\d{1,4}$/.test(itag))throw new VideoError('Invalid video quality.',400);
   const raw=await metadata('videos/'+videoId,{local:'true'});if(!card(raw))throw new VideoError('This video is unavailable.',422);
   const f=formats(raw).find((f:any)=>String(f.itag)===itag),target=f&&streamTarget(f.url,env);if(!target)throw new VideoError('Playback is unavailable for this video.',422);
   const range=request.headers.get('Range');if(range&&!/^bytes=(?:\d+-\d*|-\d+)$/.test(range))throw new VideoError('Invalid video range.',416);
   // Bound connection setup only; a video body can stream for longer than 30 seconds.
   const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),30000);let upstream:Response;
   try{upstream=await fetcher(target.href,{method:request.method,headers:{...(range?{Range:range}:{}),...(target.origin===origin&&env.INVIDIOUS_API_KEY?{'X-Kkeep-Backend-Key':env.INVIDIOUS_API_KEY}:{})},credentials:'omit',redirect:'manual',signal:controller.signal});}finally{clearTimeout(timer);}
   if(![200,206].includes(upstream.status)||!/^video\/|^application\/octet-stream/.test(upstream.headers.get('Content-Type')||''))throw new VideoError('Video playback failed. Try another quality or retry.');
   const h=new Headers(headers);h.set('Content-Type','video/mp4');for(const key of ['Content-Length','Content-Range','Accept-Ranges']){const v=upstream.headers.get(key);if(v)h.set(key,v);}return new Response(request.method==='HEAD'?null:upstream.body,{status:upstream.status,headers:h});
  }
  if(route==='action'&&request.method==='POST'){
   const input=await boundedJson(new Response(request.body),4096);if(!input||typeof input!=='object'||Array.isArray(input))throw new VideoError('Invalid action.',400);if(input.scope!==account.id)throw new VideoError('Profile changed. Reload Kkeep YouTube.',409);
   const action=input.action,id=input.id;
   if(action==='subscribe'){
    if(!CHANNEL_ID.test(id)||typeof input.value!=='boolean')throw new VideoError('Invalid channel.',400);
    if(input.value){const info=await metadata('channels/'+id);await db.prepare('INSERT INTO kkeep_video_channels (account,channel,name,created) VALUES (?,?,?,?) ON CONFLICT(account,channel) DO UPDATE SET name=excluded.name').bind(account.id,id,String(info.author||'Channel').slice(0,140),Date.now()).run();}
    else await db.prepare('DELETE FROM kkeep_video_channels WHERE account=? AND channel=?').bind(account.id,id).run();return reply({ok:true});
   }
   if(!VIDEO_ID.test(id)||!['start','progress','save','like','remove-history'].includes(action))throw new VideoError('Invalid video action.',400);
   if(action==='progress'){
    if(typeof input.session!=='string'||!Number.isSafeInteger(input.seq)||input.seq<1||!Number.isFinite(input.position)||input.position<0||input.position>604800||!Number.isFinite(input.duration)||input.duration<0||input.duration>604800)throw new VideoError('Invalid playback progress.',400);
    const result=await db.prepare('UPDATE kkeep_video_items SET position=?,duration=?,watched=?,updated=?,seq=? WHERE account=? AND video=? AND session=? AND seq<?').bind(Math.min(input.position,input.duration||604800),input.duration,Date.now(),Date.now(),input.seq,account.id,id,input.session,input.seq).run();
    if(!result.meta.changes){const current=(await rows('SELECT session,seq FROM kkeep_video_items WHERE account=? AND video=?',account.id,id))[0];if(current?.session===input.session&&Number(current.seq)>=input.seq)return reply({ok:true,ignored:true});throw new VideoError('Playback continued in another window. Reopen this video to save here.',409);}return reply({ok:true});
   }
   if(action==='remove-history'){await db.prepare('UPDATE kkeep_video_items SET position=0,watched=0,session=NULL WHERE account=? AND video=?').bind(account.id,id).run();return reply({ok:true});}
   if(action==='save'||action==='like'){if(typeof input.value!=='boolean')throw new VideoError('Invalid library action.',400);}
   const raw=await metadata('videos/'+id),video=card(raw);if(!video)throw new VideoError('This video is unavailable.',422);
   await db.prepare('INSERT INTO kkeep_video_items (account,video,data,position,duration,watched,saved,liked,updated,seq) VALUES (?,?,?,0,?,0,0,0,?,0) ON CONFLICT(account,video) DO UPDATE SET data=excluded.data').bind(account.id,id,JSON.stringify(video),video.length,Date.now()).run();
   if(action==='start'){
    const session=crypto.randomUUID();await db.prepare('UPDATE kkeep_video_items SET session=?,seq=0 WHERE account=? AND video=?').bind(session,account.id,id).run();
    const row=(await rows('SELECT position,duration FROM kkeep_video_items WHERE account=? AND video=?',account.id,id))[0];return reply({session,position:row.position,duration:row.duration});
   }
   const field=action==='save'?'saved':'liked';await db.prepare(`UPDATE kkeep_video_items SET ${field}=?,updated=? WHERE account=? AND video=?`).bind(input.value?1:0,Date.now(),account.id,id).run();return reply({ok:true});
  }
  return reply({error:'Not found.'},404);
 }catch(error){return reply({error:error instanceof VideoError?error.message:'Kkeep YouTube is temporarily unavailable.'},error instanceof VideoError?error.status:503);}
}
