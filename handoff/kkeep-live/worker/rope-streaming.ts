export const ROPE_ID='094afd7e-c335-439a-b914-93ec7f54cdf4';
export const ROPE_BUILD='baa50b5d-66c3-47a7-aa33-56104b10fc3a';
const cors={'Access-Control-Allow-Origin':'*','Cross-Origin-Resource-Policy':'cross-origin','X-Content-Type-Options':'nosniff'};
type Context={waitUntil(promise:Promise<unknown>):void};
// Resolve Unity's signed CDN redirect for this exact published game's files only.
export async function ropeStreaming(request:Request,fetcher:typeof fetch=fetch,ctx?:Context){
 const url=new URL(request.url),prefix=`/api/rope-streaming/${url.pathname.startsWith('/api/rope-streaming/v2/')?'v2/':''}${ROPE_BUILD}/`;
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{...cors,'Access-Control-Allow-Methods':'GET, HEAD, OPTIONS','Access-Control-Allow-Headers':'Range'}});
 if(!['GET','HEAD'].includes(request.method)||!url.pathname.startsWith(prefix)||url.search)return new Response('Not found',{status:404,headers:cors});
 let path;try{path=decodeURIComponent(url.pathname.slice(prefix.length));}catch{return new Response('Not found',{status:404,headers:cors});}
 if(!path.startsWith('Ctr2/')||path.length>1024||!/^[-a-zA-Z0-9_+./]+$/.test(path)||path.split('/').some(p=>!p||p==='.'||p==='..'))return new Response('Not found',{status:404,headers:cors});
 const cache=(globalThis as unknown as {caches?:{default?:Cache}}).caches?.default,key=new Request(request.url+'?content-types=2',{method:'GET'});
 if(cache&&!request.headers.has('Range')){const cached=await cache.match(key).catch(()=>undefined);if(cached)return request.method==='HEAD'?new Response(null,cached):cached;}
 try{
  const source=`https://play-prod.struckd.com/api/v1/games/game/${ROPE_ID}/build/${ROPE_BUILD}/streaming/${path}`;
  const options:RequestInit={method:request.method,redirect:'manual' as const,credentials:'omit' as const,signal:AbortSignal.timeout(45000),headers:request.headers.has('Range')?{Range:request.headers.get('Range')!}:{}};
  let upstream=await fetcher(source,options);
  if([301,302,303,307,308].includes(upstream.status)){
   const next=new URL(upstream.headers.get('Location')||'',source);
   if(next.protocol!=='https:'||next.hostname!=='cdn.play.unity.com'||next.port||next.username||next.password||decodeURIComponent(next.pathname)!==`/games/${ROPE_ID}/${ROPE_BUILD}/StreamingAssets/${path}`){await upstream.body?.cancel();throw Error('Unexpected game redirect');}
   await upstream.body?.cancel();upstream=await fetcher(next.href,options);
  }
  if(!upstream.ok)throw Error('Game file unavailable');
  // Unity stores StreamingAssets as octet-stream, including scripts/styles.
  // nosniff correctly blocks those unless we set the known file's actual type.
  const extension=path.split('.').at(-1)?.toLowerCase()||'';
  const types:Record<string,string>={js:'application/javascript',css:'text/css',json:'application/json',html:'text/html; charset=utf-8',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',ttf:'font/ttf',m4a:'audio/mp4',mp3:'audio/mpeg',wasm:'application/wasm'};
  const mime=path==='Ctr2/native-engine.bin'?'application/wasm':types[extension]||upstream.headers.get('Content-Type')||'application/octet-stream';
  const headers=new Headers({...cors,'Content-Type':mime,'Cache-Control':'public, max-age=86400','Access-Control-Expose-Headers':'Content-Length, Content-Range, Accept-Ranges'});
  for(const name of ['Content-Range','Accept-Ranges']){const value=upstream.headers.get(name);if(value)headers.set(name,value);}
  if(!upstream.headers.has('Content-Encoding')&&upstream.headers.has('Content-Length'))headers.set('Content-Length',upstream.headers.get('Content-Length')!);
  const response=new Response(request.method==='HEAD'?null:upstream.body,{status:upstream.status,headers});
  if(cache&&ctx&&request.method==='GET'&&upstream.status===200&&!request.headers.has('Range'))ctx.waitUntil(cache.put(key,response.clone()).catch(()=>{}));
  return response;
 }catch{return new Response('Game file temporarily unavailable',{status:502,headers:{...cors,'Cache-Control':'no-store'}});}
}
