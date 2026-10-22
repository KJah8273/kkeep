import manifest from './game-asset-manifest.ts';

interface Asset {bytes:number;size:number;sha256:string;compressedSha256:string;repo:string;revision:string;path:string;}
interface StoredAsset {body?:ReadableStream;size:number;httpEtag?:string;customMetadata?:Record<string,string>;}
export interface GameBucket {
 get(key:string):Promise<StoredAsset|null>;
 head(key:string):Promise<StoredAsset|null>;
 put(key:string,body:ReadableStream,options:Record<string,unknown>):Promise<unknown>;
}
export interface GameAssetEnv {GAME_ASSETS?:GameBucket;GAME_ASSET_UPLOAD_TOKEN?:string;}
interface Context {waitUntil(promise:Promise<unknown>):void;}
const index:Record<string,Asset>=manifest;
const immutable='public, max-age=31536000, immutable';
const keyFor=(id:string)=>'game-chunks/v1/'+id;
const error=(message:string,status:number)=>Response.json({error:message},{status,headers:{'Cache-Control':'no-store'}});

export async function gameAsset(request:Request,env:GameAssetEnv,_ctx:Context,options:{assets?:Record<string,Asset>;fetcher?:typeof fetch}={}) {
 const url=new URL(request.url),id=url.pathname.slice('/api/game-assets/'.length);
 const assets=options.assets||index,asset=Object.hasOwn(assets,id)?assets[id]:undefined;
 if(!asset||!/^[a-f0-9]{24}\.bin$/.test(id))return error('Unknown game file',404);
 const raw=url.searchParams.get('raw')==='1';
 if(!['GET','HEAD','PUT'].includes(request.method))return error('Method not allowed',405);
 if(request.method==='PUT'){
  if(!env.GAME_ASSET_UPLOAD_TOKEN||request.headers.get('Authorization')!=='Bearer '+env.GAME_ASSET_UPLOAD_TOKEN)return error('Not authorised',403);
  if(!env.GAME_ASSETS)return error('Game storage unavailable',503);
  if(!request.body||Number(request.headers.get('Content-Length'))!==asset.bytes)return error('Incorrect game file length',400);
  const existing=await env.GAME_ASSETS.head(keyFor(id));
  if(existing?.size===asset.bytes&&existing.customMetadata?.sha256===asset.compressedSha256){await request.body.cancel();return new Response(null,{status:204});}
  try{
   // R2 validates the pinned compressed checksum before committing the object.
   await env.GAME_ASSETS.put(keyFor(id),request.body,{sha256:asset.compressedSha256,httpMetadata:{contentType:'application/octet-stream',cacheControl:immutable},customMetadata:{sha256:asset.compressedSha256,rawSha256:asset.sha256}});
   return new Response(null,{status:201});
  }catch{return error('Game file checksum or upload failed',400);}
 }
 // Managed Sites workers do not expose caches.default. Serve from persistent
 // R2 storage directly; immutable headers and the browser's part cache reuse it.
 const object=await (request.method==='HEAD'?env.GAME_ASSETS?.head(keyFor(id)):env.GAME_ASSETS?.get(keyFor(id)));
 if(object&&object.size===asset.bytes&&object.customMetadata?.sha256===asset.compressedSha256){
  const headers=new Headers({'Content-Type':'application/octet-stream','Content-Length':String(raw?asset.size:asset.bytes),'Cache-Control':immutable,'X-Content-Type-Options':'nosniff','X-Kkeep-Game-Cache':'storage'});
  if(object.httpEtag&&!raw)headers.set('ETag',object.httpEtag);
  const body=request.method==='HEAD'?null:raw?object.body!.pipeThrough(new DecompressionStream('gzip')):object.body!;
  const response=new Response(body,{headers});
  return response;
 }
 if(!raw||request.method==='HEAD')return error('Game file is being prepared; use the fallback download',503);
 // A first-party fallback keeps an upstream failure out of the iPad's browser.
 // Sources and paths come only from the pinned allowlist, never from a user URL.
 const fetcher=options.fetcher||fetch;
 for(const source of [`https://cdn.jsdelivr.net/gh/${asset.repo}@${asset.revision}/${asset.path}`,`https://raw.githubusercontent.com/${asset.repo}/${asset.revision}/${asset.path}`]){
  const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;
  const renew=()=>{clearTimeout(timer);timer=setTimeout(()=>controller.abort(),12000);};renew();
  try{
   const upstream=await fetcher(source,{signal:controller.signal});
   if(!upstream.ok||!upstream.body||/text\/html/i.test(upstream.headers.get('Content-Type')||'')){clearTimeout(timer);await upstream.body?.cancel();continue;}
   let received=0;const reader=upstream.body.getReader();
   const stream=new ReadableStream({async pull(out){try{const part=await reader.read();if(part.done){clearTimeout(timer);if(received!==asset.size)throw new Error('Incomplete game file');out.close();return;}renew();received+=part.value.byteLength;if(received>asset.size)throw new Error('Oversized game file');out.enqueue(part.value);}catch(e){clearTimeout(timer);controller.abort();out.error(e);}},cancel(reason){clearTimeout(timer);controller.abort();return reader.cancel(reason);}});
   return new Response(request.method==='HEAD'?null:stream,{headers:{'Content-Type':'application/octet-stream','Content-Length':String(asset.size),'Cache-Control':'no-store','X-Kkeep-Game-Cache':'upstream'}});
  }catch{clearTimeout(timer);}
 }
 return error('Game download is unavailable. Retry to continue saved parts.',502);
}
