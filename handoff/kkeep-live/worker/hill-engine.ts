import manifest from '../public/games/ipad-imports/assets/hill-compat.json' with {type:'json'};
type Env={ASSETS:{fetch(request:Request):Promise<Response>}};
const cors={'Access-Control-Allow-Origin':'*','Cross-Origin-Resource-Policy':'cross-origin'};
export async function hillEngine(request:Request,env:Env){
 const url=new URL(request.url),engine=manifest.wasm;
 if(url.pathname!==engine.url)return new Response('Unknown game engine',{status:404,headers:cors});
 if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405,headers:cors});
 // Fetch the packed bytes internally; the browser performs standard HTTP
 // decompression, including Safari versions without DecompressionStream.
 const asset=await env.ASSETS.fetch(new Request(new URL(engine.file,url.origin),{method:request.method,headers:{'Accept-Encoding':'identity'}}));
 if(!asset.ok||/text\/html/i.test(asset.headers.get('Content-Type')||'')){
  await asset.body?.cancel();
  return new Response('Game engine unavailable. Please retry.',{status:503,headers:{...cors,'Cache-Control':'no-store'}});
 }
 const headers={...cors,'Content-Type':'application/wasm','Content-Encoding':'br','Cache-Control':'public, max-age=31536000, immutable',
  'ETag':'"'+engine.compressedSha256+'"','X-Kkeep-Decoded-Length':String(engine.size),'X-Content-Type-Options':'nosniff'};
 // Cloudflare must not re-compress bytes that are already Brotli encoded.
 return new Response(request.method==='HEAD'?null:asset.body,{headers,encodeBody:'manual'} as ResponseInit);
}
