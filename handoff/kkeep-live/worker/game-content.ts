import {findSavedGame} from '../lib/games/save-catalog.ts';
import {brawlhallaPlayer,brawlhallaAssetRedirect,brawlhallaAssetType} from '../lib/games/brawlhalla-player.ts';
type Env={ASSETS:{fetch(request:Request):Promise<Response>}};
type Context={waitUntil(promise:Promise<unknown>):void};
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Expose-Headers':'Content-Range, Accept-Ranges, Content-Length, ETag, Last-Modified','Cross-Origin-Resource-Policy':'cross-origin','X-Content-Type-Options':'nosniff'};
// These pinned files contain Brotli bytes but their CDN omits Content-Encoding.
// In particular Turbo Stars has no JavaScript decompression fallback.
export function gameBrotliType(url:URL):string|null{
 if(url.origin!=='https://cdn.jsdelivr.net')return null;
 const turbo='/gh/bubbls/youtube-playables@f86d947cd3a8c7271fc251ae687bb8c9ffd2a170/turbo-stars/Build/';
 const bridge='/gh/bubbls/youtube-playables@213d19aad1db5acdebe8e07a80ae4998f3146e33/bridge-race/Build/';
 if(url.pathname===turbo+'b8d7ec9f26d230dd840bc9156037ef05.wasm.br'||url.pathname===bridge+'BridgeRace.wasm.unityweb')return 'application/wasm';
 if(url.pathname===turbo+'d487c51591d26a3408c9db326b81577b.data.br'||url.pathname===bridge+'BridgeRace.data.unityweb')return 'application/octet-stream';
 if(url.pathname===bridge+'BridgeRace.framework.js.unityweb')return 'text/javascript';
 return null;
}
export function gameResourceTarget(input:URL):URL|null{
 const match=/^\/api\/game-resource\/([a-z0-9-]+)\/(\d+)\/(.*)$/.exec(input.pathname);
 if(!match)return null;
 const game=findSavedGame(match[1]),origin=game?.origins[Number(match[2])];if(!origin)return null;
 const url=new URL('/'+match[3]+input.search,origin);
 return url.origin===origin&&!url.username&&!url.password?url:null;
}
export async function gameContent(request:Request,env:Env,ctx:Context,fetcher:typeof fetch=fetch){
 const url=new URL(request.url);
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{...cors,'Access-Control-Allow-Methods':'GET, HEAD, OPTIONS','Access-Control-Allow-Headers':'Range, Content-Type'}});
 if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405,headers:cors});
 if(url.pathname.startsWith('/api/game-public/')){
  const asset=new URL(url.pathname.slice('/api/game-public'.length)+url.search,url.origin);
  if(!asset.pathname.startsWith('/games/'))return new Response('Invalid game asset',{status:400,headers:cors});
  const result=await env.ASSETS.fetch(new Request(asset));const response=new Response(request.method==='HEAD'?null:result.body,result);
  for(const [key,value] of Object.entries(cors))response.headers.set(key,value);return response;
 }
 const entry=/^\/api\/game-entry\/([a-z0-9-]+)$/.exec(url.pathname),game=entry?findSavedGame(entry[1]):undefined;
 if(entry&&(!game||game.external))return Response.json({error:'This player is unavailable.'},{status:404});
 const target=entry&&game?new URL(game.entry,url.origin):gameResourceTarget(url);
 if(!target)return new Response('Invalid game resource',{status:400,headers:cors});
 const brawlResource=url.pathname.startsWith('/api/game-resource/brawlhalla-offline/')?brawlhallaAssetType(target):null;
 const brotliType=!entry&&gameBrotliType(target);
 const cache=(globalThis as unknown as {caches?:{default?:Cache}}).caches?.default;
 // Version the entry cache when its player changes; old cached Unity wrappers
 // must not be served after deploying the direct browser-game launcher.
 const cacheUrl=new URL(request.url);
 if(entry&&game)cacheUrl.searchParams.set('_entry',game.entry+'|'+(game.fallbackEntry||''));
 if(brotliType)cacheUrl.searchParams.set('_encoding','br-1');
 if(entry&&game?.slug==='brawlhalla-offline')cacheUrl.searchParams.set('_player','direct-1');
 const key=new Request(cacheUrl,{method:'GET'});
 // A whole-file cache entry must never replace a requested byte slice.
 if(cache&&!request.headers.has('Range')){try{const found=await cache.match(key);if(found){const response=new Response(request.method==='HEAD'?null:found.body,{status:found.status,headers:found.headers,encodeBody:'manual'} as ResponseInit);for(const [name,value] of Object.entries(cors))response.headers.set(name,value);if(brawlResource)response.headers.set('Content-Type',brawlResource);return response;}}catch{}}
 try{
  if(entry&&game?.fallbackEntry){
   const read=async(address:string)=>{
    const response=await fetcher(address,{redirect:'manual',credentials:'omit',signal:AbortSignal.timeout(8000)});
    if(!response.ok)throw Error('HTTP '+response.status);
    const html=await response.text();
    if(html.length>1000000||!/<!doctype|<html|<body|<canvas/i.test(html))throw Error('Invalid player');
    return {html,base:address};
   };
   let source,fallback=false;
   try{
    source=await read(target.href);
    // Only unwrap the exact player configured for this game; never follow an
    // arbitrary iframe or forward Profile credentials to a game provider.
    if(game.frameEntry){
     if(!source.html.includes(game.frameEntry))throw Error('Player changed');
     source=await read(game.frameEntry);
    }
   }catch{source=await read(game.fallbackEntry);fallback=true;}
   const response=Response.json({...source,fallback},{headers:{...cors,'Cache-Control':'public, max-age=300'}});
   if(cache)ctx.waitUntil(cache.put(key,response.clone()).catch(()=>{}));
   return request.method==='HEAD'?new Response(null,response):response;
  }
  const isLocal=target.origin===url.origin;
  let upstream=isLocal?await env.ASSETS.fetch(new Request(target)):await fetcher(target.href,{redirect:'manual',credentials:'omit',headers:request.headers.has('Range')?{Range:request.headers.get('Range')!}:{},signal:AbortSignal.timeout(25000)});
  if(isLocal&&upstream.status>=300&&upstream.status<400&&upstream.headers.get('Location')){const next=new URL(upstream.headers.get('Location')!,target);if(next.origin===target.origin&&next.pathname.startsWith('/games/'))upstream=await env.ASSETS.fetch(new Request(next));}
  if(!isLocal&&url.pathname.startsWith('/api/game-resource/brawlhalla-offline/')&&[301,302,303,307,308].includes(upstream.status)){
   const next=brawlhallaAssetRedirect(target,upstream.headers.get('Location')||'');
   if(next)upstream=await fetcher(next.href,{redirect:'manual',credentials:'omit',headers:request.headers.has('Range')?{Range:request.headers.get('Range')!}:{},signal:AbortSignal.timeout(25000)});
  }
  if(!upstream.ok)throw Error('HTTP '+upstream.status);
  let response:Response;
  if(entry){
   let html=await upstream.text();if(html.length>1000000||!/<!doctype|<html|<body|<canvas/i.test(html))throw Error('Invalid player');
   if(game?.slug==='brawlhalla-offline')html=brawlhallaPlayer(html);
   response=Response.json({html,base:game?.slug==='brawlhalla-offline'?url.origin+'/games/brawlhalla-offline/':target.href},{headers:{...cors,'Cache-Control':'public, max-age=300'}});
  }else{
   const headers=new Headers(cors);headers.set('Content-Type',brawlResource||upstream.headers.get('Content-Type')||'application/octet-stream');headers.set('Cache-Control','public, max-age=3600');
   for(const name of ['Content-Range','Accept-Ranges','Content-Length','ETag','Last-Modified']){const value=upstream.headers.get(name);if(value)headers.set(name,value);}
   if(brotliType&&upstream.status===200){headers.set('Content-Type',brotliType);headers.set('Content-Encoding','br');}
   response=new Response(upstream.body,{status:upstream.status,headers,encodeBody:'manual'} as ResponseInit);
  }
  if(cache&&response.status===200&&!request.headers.has('Range'))ctx.waitUntil(cache.put(key,response.clone()).catch(()=>{}));
  return request.method==='HEAD'?new Response(null,response):response;
 }catch{return Response.json({error:'The game files could not load. Retry in a moment.'},{status:502,headers:{...cors,'Cache-Control':'no-store'}});}
}
