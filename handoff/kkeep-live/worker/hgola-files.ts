import {HGOLA_FRAME,parseHgolaBuild} from './hgola.ts';
import type {GameAssetEnv} from './game-assets.ts';

export const HGOLA_BUILD='1fd2dc15-ff98-4202-a685-06411ff6f10e';
export const HGOLA_RECENT_BUILD='f485b572-cb8f-44f2-b7c3-26cca39c5dea';
export const HGOLA_PREVIOUS_BUILD='0d9f7b29-108b-4756-a4e2-870b21d94a0e';
export const HGOLA_LEGACY_BUILD='2b6f1ee8-4d7e-4e17-9a9c-4a5c390d703b';
// Original decoded Unity files. Stable, versioned addresses are essential for
// browser caching; the upstream signed query string must never be a cache key.
const legacyFiles={
 'game.data':{bytes:436097435,sha256:'7dfdf862a3cc1ab9687e32558b8cb74ca5cc45c6a4e179af65f6e7e0ab3ebb34',configKey:'dataUrl'},
 'game.wasm':{bytes:77685580,sha256:'b0d317cd1d1f19ba82eea93af6c3d9710115e1b41b156293694e3555638e8459',configKey:'codeUrl'},
} as const;
const previousFiles={
 'game.data':{bytes:436106018,sha256:'630e35598c5b61613ea488fa135ae839278335f0ab78867e3927a2be99f885cd',configKey:'dataUrl'},
 'game.wasm':{bytes:77703006,sha256:'bc9ef2ecd768f990628ac8ce042e6a984eee032062d85212fa5bdf0a38b0d0f8',configKey:'codeUrl'},
} as const;
const recentFiles={
 'game.data':{bytes:469223515,sha256:'33dde1b5fb64096f0ff7583b31ddc9e7f6f13db65bd231b73cc2070eae1f4d6a',configKey:'dataUrl'},
 'game.wasm':{bytes:50537103,sha256:'3b17b0c2cf03b165d4ed99e82927de82fea0c07d3cc0409d474025798130c45e',configKey:'codeUrl'},
} as const;
export const hgolaFiles={
 'game.data':{bytes:333022261,sha256:'14068c1fa2e1b18567984827c11e1d6445bb71d2a2c9ca0d9901924ed80707c5',configKey:'dataUrl'},
 'game.wasm':{bytes:50533602,sha256:'9146a766648907c734e467feec9021cce592cbcd0ae563e9b073d6a7d5f961e3',configKey:'codeUrl'},
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
interface Background {waitUntil(task:Promise<unknown>):void;}
const warming=new Set<string>();
function warm(key:string,ctx:Background|undefined,task:()=>Promise<unknown>){
 if(!ctx||warming.has(key))return;
 warming.add(key);
 ctx.waitUntil(task().catch(()=>{}).finally(()=>warming.delete(key)));
}
export async function hgolaFile(request:Request,env:GameAssetEnv,fetcher:typeof fetch=fetch,ctx?:Background){
 const path=new URL(request.url).pathname,build=path.split('/')[3],files=build===HGOLA_BUILD?hgolaFiles:build===HGOLA_RECENT_BUILD?recentFiles:build===HGOLA_PREVIOUS_BUILD?previousFiles:build===HGOLA_LEGACY_BUILD?legacyFiles:null,prefix=`/api/hgola-files/${build}/`,name=path.slice(prefix.length);
 if(!files||!path.startsWith(prefix)||!Object.hasOwn(files,name)||!['GET','HEAD'].includes(request.method))return new Response('Not found',{status:404});
 const file=files[name as keyof typeof hgolaFiles],key=`hgola-builds/${build}/${name}`;
 const headers=new Headers({'Content-Type':name.endsWith('.wasm')?'application/wasm':'application/octet-stream','Cache-Control':'public, max-age=31536000, immutable','X-Kkeep-Decoded-Length':String(file.bytes),'ETag':`"${file.sha256}"`,'X-Content-Type-Options':'nosniff'});
 try{
  const part=new URL(request.url).searchParams.get('part');
  if(part!==null){
   const query=new URL(request.url).searchParams,v2=query.get('v')==='2';
   const encoding=query.get('encoding')||'identity';
   if(v2&&!['gzip','identity'].includes(encoding))return new Response('Invalid encoding',{status:400});
   const chunkBytes=(v2?1:2)*1024*1024,index=Number(part),offset=index*chunkBytes;
   if(!/^\d+$/.test(part)||!Number.isSafeInteger(index)||offset>=file.bytes)return new Response('Invalid part',{status:416});
   const length=Math.min(chunkBytes,file.bytes-offset);
   const object=await env.GAME_ASSETS?.get(key,{range:{offset,length}});
   if(object?.size!==file.bytes||object.customMetadata?.sha256!==file.sha256||!object.body)return failure();
   headers.set('ETag',`"${file.sha256}-part-${index}${v2?'-v2-'+encoding:''}"`);
   if(v2){
    // Compression is an explicit file format here, not an HTTP content encoding.
    // Safari receives the same bytes regardless of its automatic gzip behavior.
    headers.set('Cache-Control','public, max-age=31536000, immutable, no-transform');
    headers.set('Content-Type','application/octet-stream');
    headers.set('X-Kkeep-Game-Cache','storage-part-v2');
    headers.set('X-Kkeep-Decoded-Length',String(length));
    headers.set('X-Kkeep-Part-Encoding',encoding);
    if(encoding==='identity')headers.set('Content-Length',String(length));
    return new Response(request.method==='HEAD'?null:encoding==='gzip'?object.body.pipeThrough(new CompressionStream('gzip')):object.body,{headers,encodeBody:'manual'} as ResponseInit);
   }
   headers.set('Vary','Accept-Encoding');headers.set('X-Kkeep-Game-Cache','storage-part');
   // Compress just this small section, keeping retries and Worker memory bounded.
   const gzip=/(?:^|,)\s*gzip\s*(?:,|$)/i.test(request.headers.get('Accept-Encoding')||'');
   if(gzip){headers.set('Content-Encoding','gzip');if(name==='game.data')headers.set('Content-Type','application/gzip');}else headers.set('Content-Length',String(length));
   return new Response(request.method==='HEAD'?null:gzip?object.body.pipeThrough(new CompressionStream('gzip')):object.body,{headers,encodeBody:'manual'} as ResponseInit);
  }
  const explicit=new URL(request.url).searchParams.get('stream')==='1';
  const streamEncoding=new URL(request.url).searchParams.get('encoding')||'identity';
  if(explicit&&!['gzip','identity'].includes(streamEncoding))return new Response('Invalid encoding',{status:400});
  if(explicit){headers.set('X-Kkeep-Part-Encoding',streamEncoding);headers.set('Content-Type','application/octet-stream');headers.set('Cache-Control','public, max-age=31536000, immutable, no-transform');}
  const gzip=explicit?streamEncoding==='gzip':/(?:^|,)\s*gzip\s*(?:,|$)/i.test(request.headers.get('Accept-Encoding')||'')&&typeof CompressionStream!=='undefined';
  const compressedKey=key+'.gzip-v1';
  headers.set('Vary','Accept-Encoding');
  // Reuse a completed compressed object instead of recompressing 436 MB per visit.
  if(gzip){
   const compressed=await (request.method==='HEAD'?env.GAME_ASSETS?.head(compressedKey):env.GAME_ASSETS?.get(compressedKey));
   if(compressed&&compressed.size>0&&compressed.customMetadata?.sourceSha256===file.sha256){
    !explicit&&headers.set('Content-Encoding','gzip');headers.set('X-Kkeep-Game-Cache','compressed-storage');
    if(request.headers.get('If-None-Match')===headers.get('ETag'))return new Response(null,{status:304,headers});
    headers.set('Content-Length',String(compressed.size));
    return new Response(request.method==='HEAD'?null:compressed.body,{headers,encodeBody:'manual'} as ResponseInit);
   }
  }
  const object=await (request.method==='HEAD'?env.GAME_ASSETS?.head(key):env.GAME_ASSETS?.get(key));
  const valid=object?.size===file.bytes&&object?.customMetadata?.sha256===file.sha256;
  if(!valid&&request.method==='HEAD')return failure();
  if(!valid){
   if(build!==HGOLA_BUILD)return failure();
   const resolved=await resolveBuild(fetcher),source=resolved.config[file.configKey];
   const download=()=>fetcher(source,{redirect:'manual',headers:{'User-Agent':'Mozilla/5.0','Origin':'https://play-prod.struckd.com','Referer':HGOLA_FRAME},signal:AbortSignal.timeout(180000)});
   const upstream=await download();
   if(!upstream.ok||!upstream.body)return failure();
   // Never make the player wait for a complete 436 MB storage write. Populate
   // independently, without tee() buffering the player's response in memory.
   warm(key,ctx,async()=>{
    if(!env.GAME_ASSETS)return;
    const copy=await download();if(!copy.ok||!copy.body)return;
    const Fixed=(globalThis as unknown as {FixedLengthStream?:new(length:number)=>TransformStream}).FixedLengthStream;
    const stream=Fixed?copy.body.pipeThrough(new Fixed(file.bytes)):copy.body;
    await env.GAME_ASSETS.put(key,stream,{sha256:file.sha256,customMetadata:{sha256:file.sha256},httpMetadata:{contentType:headers.get('Content-Type'),cacheControl:headers.get('Cache-Control')}});
   });
   headers.set('Cache-Control','no-store');headers.set('X-Kkeep-Game-Cache','upstream');
   if(gzip)!explicit&&headers.set('Content-Encoding','gzip');
   return new Response(gzip?upstream.body.pipeThrough(new CompressionStream('gzip')):upstream.body,{headers,encodeBody:'manual'} as ResponseInit);
  }
  if(gzip&&request.method==='GET')warm(compressedKey,ctx,async()=>{
   // A separate storage stream keeps memory bounded even if the player disconnects.
   const copy=await env.GAME_ASSETS?.get(key);
   if(!copy?.body||copy.size!==file.bytes||copy.customMetadata?.sha256!==file.sha256)return;
   await env.GAME_ASSETS!.put(compressedKey,copy.body.pipeThrough(new CompressionStream('gzip')),{customMetadata:{sourceSha256:file.sha256},httpMetadata:{contentType:headers.get('Content-Type'),contentEncoding:'gzip',cacheControl:headers.get('Cache-Control')}});
  });
  headers.set('X-Kkeep-Game-Cache','storage');
  if(request.headers.get('If-None-Match')===headers.get('ETag'))return new Response(null,{status:304,headers});
  if(request.method==='HEAD'){headers.set('Content-Length',String(file.bytes));return new Response(null,{headers});}
  let body=object!.body;
  if(gzip){
   body=body!.pipeThrough(new CompressionStream('gzip'));!explicit&&headers.set('Content-Encoding','gzip');
  }
  headers.set('Vary','Accept-Encoding');
  return new Response(body,{headers,encodeBody:'manual'} as ResponseInit);
 }catch{return failure();}
}
