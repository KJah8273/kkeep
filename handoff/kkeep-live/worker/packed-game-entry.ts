import {packedGameEntries} from '../lib/games/packed-entries.mjs';

export async function packedGameEntry(request:Request,assets:{fetch(request:Request):Promise<Response>}):Promise<Response|null>{
 const url=new URL(request.url);
 const path=url.pathname.replace(/^\/api\/game-public(?=\/games\/)/,'');
 if(!packedGameEntries.has(path)||!['GET','HEAD'].includes(request.method))return null;
 url.pathname=path+'.gz';
 const result=await assets.fetch(new Request(url,{method:request.method}));
 // Source previews contain the ordinary HTML; production contains only gzip.
 if(!result.ok)return null;
 // Assets may infer text/html from index.html.gz. Check the bytes, not MIME.
 let body:ReadableStream<Uint8Array>|null=null;
 if(request.method!=='HEAD'){
  const bytes=new Uint8Array(await result.arrayBuffer());
  if(bytes[0]!==0x1f||bytes[1]!==0x8b)return null;
  body=new Response(bytes).body!.pipeThrough(new DecompressionStream('gzip'));
 }
 return new Response(body,{headers:{
  'Content-Type':path.endsWith('.js')?'text/javascript; charset=utf-8':'text/html; charset=utf-8','Cache-Control':'public, max-age=300',
  'Access-Control-Allow-Origin':'*','Cross-Origin-Resource-Policy':'cross-origin',
  'X-Content-Type-Options':'nosniff',
 }});
}
