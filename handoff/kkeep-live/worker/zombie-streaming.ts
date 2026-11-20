import {ZOMBIE_ID} from './zombie.ts';
export const ZOMBIE_BUILD='0b5c4574-1b88-46c4-8df1-ca32b7472c95';
const cors={'Access-Control-Allow-Origin':'*','Cross-Origin-Resource-Policy':'cross-origin','X-Content-Type-Options':'nosniff'};
type Context={waitUntil(promise:Promise<unknown>):void};
// Resolve Unity's signed CDN redirect for this exact published game's files only.
export async function zombieStreaming(request:Request,fetcher:typeof fetch=fetch,ctx?:Context){
 const url=new URL(request.url),prefix=`/api/zombie-streaming/${url.pathname.startsWith('/api/zombie-streaming/v2/')?'v2/':''}${ZOMBIE_BUILD}/`;
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{...cors,'Access-Control-Allow-Methods':'GET, HEAD, OPTIONS','Access-Control-Allow-Headers':'Range'}});
 if(!['GET','HEAD'].includes(request.method)||!url.pathname.startsWith(prefix)||url.search)return new Response('Not found',{status:404,headers:cors});
 let path;try{path=decodeURIComponent(url.pathname.slice(prefix.length));}catch{return new Response('Not found',{status:404,headers:cors});}
 if(!path.startsWith('game/')||path.length>1024||!/^[-a-zA-Z0-9_+./]+$/.test(path)||path.split('/').some(p=>!p||p==='.'||p==='..'))return new Response('Not found',{status:404,headers:cors});
 const cache=(globalThis as unknown as {caches?:{default?:Cache}}).caches?.default,key=new Request(request.url+'?content-types=2',{method:'GET'});
 if(cache&&!request.headers.has('Range')){const cached=await cache.match(key).catch(()=>undefined);if(cached)return request.method==='HEAD'?new Response(null,cached):cached;}
 try{
  const source=`https://play-prod.struckd.com/api/v1/games/game/${ZOMBIE_ID}/build/${ZOMBIE_BUILD}/streaming/${path}`;
  const options:RequestInit={method:request.method,redirect:'manual' as const,credentials:'omit' as const,signal:AbortSignal.timeout(45000),headers:request.headers.has('Range')?{Range:request.headers.get('Range')!}:{}};
  let upstream=await fetcher(source,options);
  if([301,302,303,307,308].includes(upstream.status)){
   const next=new URL(upstream.headers.get('Location')||'',source);
   if(next.protocol!=='https:'||next.hostname!=='cdn.play.unity.com'||next.port||next.username||next.password||decodeURIComponent(next.pathname)!==`/games/${ZOMBIE_ID}/${ZOMBIE_BUILD}/StreamingAssets/${path}`){await upstream.body?.cancel();throw Error('Unexpected game redirect');}
   await upstream.body?.cancel();upstream=await fetcher(next.href,options);
  }
  if(!upstream.ok)throw Error('Game file unavailable');
  // Unity stores StreamingAssets as octet-stream, including scripts/styles.
  // nosniff correctly blocks those unless we set the known file's actual type.
  const extension=path.split('.').at(-1)?.toLowerCase()||'';
  const types:Record<string,string>={js:'application/javascript',css:'text/css',json:'application/json',html:'text/html; charset=utf-8',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',ttf:'font/ttf',mp3:'audio/mpeg',wasm:'application/wasm'};
  const mime=path==='game/engine.bin'||path==='game/fmod/fmodstudio.bin'?'application/wasm':types[extension]||upstream.headers.get('Content-Type')||'application/octet-stream';
  const headers=new Headers({...cors,'Content-Type':mime,'Cache-Control':'public, max-age=86400','Access-Control-Expose-Headers':'Content-Length, Content-Range, Accept-Ranges'});
  for(const name of ['Content-Range','Accept-Ranges']){const value=upstream.headers.get(name);if(value)headers.set(name,value);}
  if(!upstream.headers.has('Content-Encoding')&&upstream.headers.has('Content-Length'))headers.set('Content-Length',upstream.headers.get('Content-Length')!);
  const response=new Response(request.method==='HEAD'?null:upstream.body,{status:upstream.status,headers});
  if(cache&&ctx&&request.method==='GET'&&upstream.status===200&&!request.headers.has('Range'))ctx.waitUntil(cache.put(key,response.clone()).catch(()=>{}));
  return response;
 }catch{return new Response('Game file temporarily unavailable',{status:502,headers:{...cors,'Cache-Control':'no-store'}});}
}
