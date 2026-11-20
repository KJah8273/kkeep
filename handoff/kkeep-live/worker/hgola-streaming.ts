import {HGOLA_ID} from './hgola.ts';
import {HGOLA_BUILD,HGOLA_RECENT_BUILD,HGOLA_PREVIOUS_BUILD,HGOLA_LEGACY_BUILD} from './hgola-files.ts';
// Fixed game/build only. This is not a user-selected URL relay.
export async function hgolaStreaming(request:Request,fetcher:typeof fetch=fetch){
 const url=new URL(request.url),build=url.pathname.split('/')[3],prefix=`/api/hgola-streaming/${build}/`;
 if(build!==HGOLA_BUILD&&build!==HGOLA_RECENT_BUILD&&build!==HGOLA_PREVIOUS_BUILD&&build!==HGOLA_LEGACY_BUILD)return new Response('Not found',{status:404});
 if(!['GET','HEAD'].includes(request.method)||!url.pathname.startsWith(prefix)||url.search)return new Response('Not found',{status:404});
 let path;try{path=decodeURIComponent(url.pathname.slice(prefix.length));}catch{return new Response('Not found',{status:404});}
 if(!path||path.length>1024||!/^[-a-zA-Z0-9_./]+$/.test(path)||path.split('/').some(p=>!p||p==='.'||p==='..'))return new Response('Not found',{status:404});
 try{
  let source=`https://play-prod.struckd.com/api/v1/games/game/${HGOLA_ID}/build/${build}/streaming/${path}`;
  let upstream:Response|undefined;
  for(let hop=0;hop<3;hop++){
   upstream=await fetcher(source,{method:request.method,redirect:'manual',signal:AbortSignal.timeout(45000)});
   if(![301,302,303,307,308].includes(upstream.status))break;
   const next=new URL(upstream.headers.get('Location')||'',source);
   const allowed=next.protocol==='https:'&&!next.port&&!next.username&&!next.password&&(
    (next.hostname==='play-prod.struckd.com'&&next.pathname.startsWith(`/api/v1/games/game/${HGOLA_ID}/build/${build}/streaming/`))||
    (next.hostname==='cdn.play.unity.com'&&next.pathname.startsWith(`/games/${HGOLA_ID}/${build}/`)));
   if(!allowed)break;
   await upstream.body?.cancel();source=next.href;
  }
  if(!upstream)throw Error('Resource unavailable');
  if(!upstream.ok)return new Response('Game resource unavailable',{status:502,headers:{'Cache-Control':'no-store'}});
  const headers=new Headers({'Content-Type':upstream.headers.get('Content-Type')||'application/octet-stream','Cache-Control':'public, max-age=3600','X-Content-Type-Options':'nosniff'});
  if(!upstream.headers.has('Content-Encoding')&&upstream.headers.has('Content-Length'))headers.set('Content-Length',upstream.headers.get('Content-Length')!);
  return new Response(upstream.body,{headers});
 }catch{return new Response('Game resource unavailable',{status:503,headers:{'Cache-Control':'no-store'}});}
}
