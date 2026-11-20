export const BOB_ID='1d5841f1-943a-46a5-b9a2-e4dae98833b2';
export const BOB_BUILD='8a3e730b-1013-4124-aa45-8c80c3abbe54';
const source=`https://play-prod.struckd.com/api/v1/games/game/${BOB_ID}/build/${BOB_BUILD}`;
const cdnPath=`/game-builds/${BOB_BUILD}/`;
const cors={'Access-Control-Allow-Origin':'*','Cross-Origin-Resource-Policy':'cross-origin','X-Content-Type-Options':'nosniff'};
type Context={waitUntil(promise:Promise<unknown>):void};
function exactFile(value:string,path:string){
 const url=new URL(value);
 if(url.protocol!=='https:'||url.hostname!=='cdn.play.unity.com'||url.port||url.username||url.password||decodeURIComponent(url.pathname)!==cdnPath+path)throw Error('Unexpected game file');
 return url.href;
}
// Unity promoted this port's engine.wasm to game.wasm in the main build folder.
// Resolve its current signed URL rather than embedding an expiring CDN token.
export function bobEngineUrl(html:string){
 for(const candidate of html.match(/https:\/\/cdn\.play\.unity\.com\/[^\s"'<>]+/g)||[]){
  try{return exactFile(candidate.replaceAll('&amp;','&'),'game.wasm');}catch{}
 }
 throw Error('Game engine unavailable');
}
export async function bobStreaming(request:Request,fetcher:typeof fetch=fetch,ctx?:Context){
 const url=new URL(request.url),prefix=`/api/bob-streaming/${BOB_BUILD}/`;
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{...cors,'Access-Control-Allow-Methods':'GET, HEAD, OPTIONS','Access-Control-Allow-Headers':'Range'}});
 if(!['GET','HEAD'].includes(request.method)||!url.pathname.startsWith(prefix)||url.search)return new Response('Not found',{status:404,headers:cors});
 let path;try{path=decodeURIComponent(url.pathname.slice(prefix.length));}catch{return new Response('Not found',{status:404,headers:cors});}
 if(!path.startsWith('RobberyBob/')||path.length>1024||!/^[-a-zA-Z0-9_+./]+$/.test(path)||path.split('/').some(p=>!p||p==='.'||p==='..'))return new Response('Not found',{status:404,headers:cors});
 const cache=(globalThis as unknown as {caches?:{default?:Cache}}).caches?.default,key=new Request(request.url,{method:'GET'});
 if(cache&&!request.headers.has('Range')){const cached=await cache.match(key).catch(()=>undefined);if(cached)return request.method==='HEAD'?new Response(null,cached):cached;}
 try{
  const options:RequestInit={method:request.method,redirect:'manual',credentials:'omit',signal:AbortSignal.timeout(45000),headers:request.headers.has('Range')?{Range:request.headers.get('Range')!}:{}};
  let upstream:Response;
  if(path==='RobberyBob/engine.wasm'){
   const frame=await fetcher(source+'/frame',{...options,method:'GET',headers:{}});
   if(!frame.ok)throw Error('Game engine unavailable');
   upstream=await fetcher(bobEngineUrl(await frame.text()),options);
  }else{
   upstream=await fetcher(source+'/streaming/'+path,options);
   if([301,302,303,307,308].includes(upstream.status)){
    const target=exactFile(upstream.headers.get('Location')||'','StreamingAssets/'+path);
    await upstream.body?.cancel();upstream=await fetcher(target,options);
   }
  }
  if(!upstream.ok)throw Error('Game file unavailable');
  const types:Record<string,string>={js:'application/javascript',css:'text/css',json:'application/json',html:'text/html; charset=utf-8',wasm:'application/wasm',m4a:'audio/mp4',png:'image/png',jpg:'image/jpeg'};
  const headers=new Headers({...cors,'Content-Type':types[path.split('.').at(-1)||'']||'application/octet-stream','Cache-Control':'public, max-age=86400','Access-Control-Expose-Headers':'Content-Length, Content-Range, Accept-Ranges'});
  for(const name of ['Content-Range','Accept-Ranges']){const value=upstream.headers.get(name);if(value)headers.set(name,value);}
  if(!upstream.headers.has('Content-Encoding')&&upstream.headers.has('Content-Length'))headers.set('Content-Length',upstream.headers.get('Content-Length')!);
  const response=new Response(request.method==='HEAD'?null:upstream.body,{status:upstream.status,headers});
  if(cache&&ctx&&request.method==='GET'&&upstream.status===200&&!request.headers.has('Range'))ctx.waitUntil(cache.put(key,response.clone()).catch(()=>{}));
  return response;
 }catch{return new Response('Game file temporarily unavailable',{status:502,headers:{...cors,'Cache-Control':'no-store'}});}
}
