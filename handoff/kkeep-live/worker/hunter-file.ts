import files from './hunter-files.json' with {type:'json'};
import chunks from './hunter-chunks.json' with {type:'json'};
import type {GameAssetEnv} from './game-assets';
export const HUNTER_ID='249d2b8f-96eb-4402-af03-dca7d3113dc3';
export const HUNTER_BUILD='fdec53b8-a2bc-427a-ba04-4d4475987ef7';
export const HUNTER_CHUNK_SIZE=4*1024*1024;
const archiveSize=189056865;
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Expose-Headers':'Content-Range, Content-Length, Accept-Ranges, X-Kkeep-Decoded-Length','Cross-Origin-Resource-Policy':'cross-origin','X-Content-Type-Options':'nosniff'};
const sourceCache=new WeakMap<typeof fetch,{url:string;until:number}>();
interface Context {waitUntil(task:Promise<unknown>):void;}
export function hunterDataUrl(html:string){
 const candidates=html.match(/https:\/\/cdn\.play\.unity\.com\/[^\s"'<>]+/g)||[];
 for(const candidate of candidates){const url=new URL(candidate.replaceAll('&amp;','&'));if(url.protocol==='https:'&&url.hostname==='cdn.play.unity.com'&&!url.username&&!url.password&&!url.port&&url.pathname===`/games/${HUNTER_ID}/${HUNTER_BUILD}/game.data`)return url.href;}
 throw Error('Game build unavailable');
}
async function source(fetcher:typeof fetch){
 const cached=sourceCache.get(fetcher);if(cached&&cached.until>Date.now())return cached.url;
 // Workers implement manual/follow, not redirect:error. Reject redirects by status.
 const frame=await fetcher(`https://play-prod.struckd.com/api/v1/games/game/${HUNTER_ID}/build/${HUNTER_BUILD}/frame`,{credentials:'omit',redirect:'manual',signal:AbortSignal.timeout(20000)});
 if(!frame.ok)throw Error('Game build unavailable');
 const url=hunterDataUrl(await frame.text()),expires=Number(new URL(url).searchParams.get('Expires'))*1000;
 if(expires>Date.now()+60000)sourceCache.set(fetcher,{url,until:Math.min(Date.now()+60000,expires-60000)});
 return url;
}
export async function verifiedHunterChunk(response:Response,size:number,sha256:string){
 // Cap allocation before reading: no upstream can make us buffer the full archive.
 const bytes=new Uint8Array(size),reader=response.body?.getReader();if(!reader)throw Error('Missing game file');
 let offset=0;
 try{for(;;){const part=await reader.read();if(part.done)break;if(offset+part.value.length>size)throw Error('Oversized game file');bytes.set(part.value,offset);offset+=part.value.length;}}
 catch(error){await reader.cancel().catch(()=>{});throw error;}
 if(offset!==size)throw Error('Incomplete game file');
 const actual=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');
 if(actual!==sha256)throw Error('Game file checksum mismatch');return bytes;
}
// New players request separately cacheable, compressed parts. Legacy range URLs
// remain compatible with open tabs. Neither route buffers the 189 MB archive.
export async function hunterFile(request:Request,fetcher:typeof fetch=fetch,env:GameAssetEnv={},ctx?:Context){
 const url=new URL(request.url),prefix=`/api/hunter-file/${HUNTER_BUILD}/`,name=url.pathname.slice(prefix.length);
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{...cors,'Access-Control-Allow-Methods':'GET, HEAD, OPTIONS','Access-Control-Allow-Headers':'Range'}});
 const part=url.searchParams.get('part');
 if(!['GET','HEAD'].includes(request.method)||!url.pathname.startsWith(prefix)||!Object.hasOwn(files,name)||[...url.searchParams.keys()].some(k=>k!=='part')||url.searchParams.getAll('part').length>1)return new Response('Not found',{status:404,headers:cors});
 const file=files[name as keyof typeof files],range=request.headers.get('Range');let start=0,end=file.size-1;
 if(part!==null){const index=Number(part);if(!/^\d+$/.test(part)||!Number.isSafeInteger(index)||index*HUNTER_CHUNK_SIZE>=file.size||range)return new Response('Invalid part',{status:416,headers:cors});start=index*HUNTER_CHUNK_SIZE;end=Math.min(file.size,start+HUNTER_CHUNK_SIZE)-1;}
 else if(range){const match=/^bytes=(\d+)-(\d+)$/.exec(range);if(!match||!Number.isSafeInteger(start=Number(match[1]))||!Number.isSafeInteger(end=Number(match[2]))||start>end||end>=file.size)return new Response(null,{status:416,headers:{...cors,'Content-Range':`bytes */${file.size}`}});}
 const size=end-start+1,first=file.offset+start,last=file.offset+end;
 try{
  let body:ReadableStream|null=null,cache='upstream';
  const sha=part===null?undefined:chunks[name as keyof typeof chunks][Number(part)],key=`hunter-builds/${HUNTER_BUILD}/${name}/part-${part}`;
  if(sha){
   const stored=await (request.method==='HEAD'?env.GAME_ASSETS?.head(key):env.GAME_ASSETS?.get(key))?.catch(()=>null);
   if(stored?.size===size&&stored.customMetadata?.sha256===sha){body=stored.body||null;cache='storage';}
   else await stored?.body?.cancel();
  }
  if(cache!=='storage'){
   const data=await source(fetcher);
   const upstream=await fetcher(data,{method:request.method,credentials:'omit',redirect:'manual',headers:{Range:`bytes=${first}-${last}`},signal:AbortSignal.timeout(60000)});
   if(upstream.status!==206||upstream.headers.get('Content-Range')!==`bytes ${first}-${last}/${archiveSize}`||Number(upstream.headers.get('Content-Length'))!==size){await upstream.body?.cancel();sourceCache.delete(fetcher);throw Error('Incomplete game file');}
   if(sha&&request.method==='GET'){
    const bytes=await verifiedHunterChunk(upstream,size,sha);body=new Response(bytes).body;
    if(env.GAME_ASSETS&&ctx)ctx.waitUntil(Promise.resolve().then(()=>env.GAME_ASSETS!.put(key,new Response(bytes).body!,{sha256:sha,customMetadata:{sha256:sha},httpMetadata:{contentType:'application/octet-stream',cacheControl:'public, max-age=31536000, immutable'}})).catch(()=>{}));
   }else body=upstream.body;
  }
  const headers=new Headers({...cors,'Accept-Ranges':'bytes','Content-Type':name.endsWith('.wasm')?'application/wasm':name.endsWith('.json')?'application/json':'application/octet-stream','Content-Length':String(size),'Cache-Control':part===null?'public, max-age=86400':'public, max-age=31536000, immutable','X-Kkeep-Game-Cache':cache});
  if(part!==null){
   headers.set('X-Kkeep-Decoded-Length',String(size));headers.set('Vary','Accept-Encoding');headers.set('ETag',`W/"${sha}"`);
   // assets.bin mostly contains already-compressed textures/audio. Compress the
   // engine and native code instead, to reduce mobile traffic without wasting CPU.
   const gzip=name!=='assets.bin'&&(request.headers.get('Accept-Encoding')||'').split(',').some(value=>{const [coding,...params]=value.trim().toLowerCase().split(';');const quality=params.find(p=>p.trim().startsWith('q='));return coding==='gzip'&&(!quality||Number(quality.trim().slice(2))>0);});
   if(gzip){headers.delete('Content-Length');headers.set('Content-Encoding','gzip');if(body)body=body.pipeThrough(new CompressionStream('gzip'));}
  }else{headers.set('Vary','Range');if(range)headers.set('Content-Range',`bytes ${start}-${end}/${file.size}`);}
  return new Response(request.method==='HEAD'?null:body,{status:part===null&&range?206:200,headers,encodeBody:'manual'} as ResponseInit);
 }catch{return new Response('Game file temporarily unavailable',{status:502,headers:{...cors,'Cache-Control':'no-store'}});}
}
