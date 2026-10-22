import {HGOLA_FRAME,parseHgolaBuild} from './hgola.ts';
import type {GameAssetEnv} from './game-assets.ts';

export const HGOLA_BUILD='2b6f1ee8-4d7e-4e17-9a9c-4a5c390d703b';
// Original decoded Unity files. Stable, versioned addresses are essential for
// browser caching; the upstream signed query string must never be a cache key.
export const hgolaFiles={
 'game.data':{bytes:436097435,sha256:'7dfdf862a3cc1ab9687e32558b8cb74ca5cc45c6a4e179af65f6e7e0ab3ebb34',configKey:'dataUrl'},
 'game.wasm':{bytes:77685580,sha256:'b0d317cd1d1f19ba82eea93af6c3d9710115e1b41b156293694e3555638e8459',configKey:'codeUrl'},
} as const;
let pendingBuild:Promise<ReturnType<typeof parseHgolaBuild>>|undefined,buildUntil=0;
async function resolveBuild(fetcher:typeof fetch){
 if(!pendingBuild||Date.now()>buildUntil){
  buildUntil=Date.now()+60000;
  pendingBuild=(async()=>{const r=await fetcher(HGOLA_FRAME,{signal:AbortSignal.timeout(20000),cache:'no-store'});if(!r.ok)throw Error('Build unavailable');const b=parseHgolaBuild(await r.text());if(b.config.productVersion!==HGOLA_BUILD)throw Error('Build changed');return b;})();
  pendingBuild.catch(()=>{pendingBuild=undefined;});
 }
 return pendingBuild;
}
const failure=()=>new Response('Game files are unavailable. Retry without clearing saved data.',{status:503,headers:{'Cache-Control':'no-store'}});
export async function hgolaFile(request:Request,env:GameAssetEnv,fetcher:typeof fetch=fetch){
 const path=new URL(request.url).pathname,prefix=`/api/hgola-files/${HGOLA_BUILD}/`,name=path.slice(prefix.length);
 if(!path.startsWith(prefix)||!Object.hasOwn(hgolaFiles,name)||!['GET','HEAD'].includes(request.method))return new Response('Not found',{status:404});
 const file=hgolaFiles[name as keyof typeof hgolaFiles],key=`hgola-builds/${HGOLA_BUILD}/${name}`;
 const headers=new Headers({'Content-Type':name.endsWith('.wasm')?'application/wasm':'application/octet-stream','Cache-Control':'public, max-age=31536000, immutable','ETag':`"${file.sha256}"`,'X-Content-Type-Options':'nosniff'});
 try{
  let object=await (request.method==='HEAD'?env.GAME_ASSETS?.head(key):env.GAME_ASSETS?.get(key));
  const valid=()=>object?.size===file.bytes&&object?.customMetadata?.sha256===file.sha256;
  if(!valid()&&request.method==='HEAD')return failure();
  if(!valid()){
   const build=await resolveBuild(fetcher),source=build.config[file.configKey];
   const download=()=>fetcher(source,{redirect:'manual',headers:{'User-Agent':'Mozilla/5.0','Origin':'https://play-prod.struckd.com','Referer':HGOLA_FRAME},signal:AbortSignal.timeout(180000)});
   let upstream=await download();
   if(!upstream.ok||!upstream.body)return failure();
   if(env.GAME_ASSETS){
    try{
     // Stream directly into persistent storage; never buffer 500 MB in a Worker.
     // R2 validates the exact file checksum before committing it.
     const Fixed=(globalThis as unknown as {FixedLengthStream?:new(length:number)=>TransformStream}).FixedLengthStream;
     const source=Fixed?upstream.body.pipeThrough(new Fixed(file.bytes)):upstream.body;
     try{await env.GAME_ASSETS.put(key,source,{sha256:file.sha256,customMetadata:{sha256:file.sha256},httpMetadata:{contentType:headers.get('Content-Type'),cacheControl:headers.get('Cache-Control')}});}
     catch(error){await source.cancel().catch(()=>{});throw error;}
     object=await env.GAME_ASSETS.get(key);
    }catch{upstream=await download();}
   }
   if(!valid()){
    if(!upstream.ok||!upstream.body||upstream.bodyUsed)return failure();
    headers.set('Cache-Control','no-store');headers.set('X-Kkeep-Game-Cache','upstream');
    return new Response(upstream.body,{headers});
   }
  }
  headers.set('X-Kkeep-Game-Cache','storage');
  if(request.headers.get('If-None-Match')===headers.get('ETag'))return new Response(null,{status:304,headers});
  if(request.method==='HEAD'){headers.set('Content-Length',String(file.bytes));return new Response(null,{headers});}
  let body=object!.body;
  if(/(?:^|,)\s*gzip\s*(?:,|$)/i.test(request.headers.get('Accept-Encoding')||'')&&typeof CompressionStream!=='undefined'){
   body=body!.pipeThrough(new CompressionStream('gzip'));headers.set('Content-Encoding','gzip');
  }
  headers.set('Vary','Accept-Encoding');
  return new Response(body,{headers,encodeBody:'manual'} as ResponseInit);
 }catch{return failure();}
}
