export async function compressedGame(request:Request,assets:{fetch(request:Request):Promise<Response>}){
 const url=new URL(request.url);const wasm=url.pathname.endsWith('.wasm');url.pathname='/games/among-us-old/Build/'+(wasm?'game.wasm':'game.data')+'.gz';
 const r=await assets.fetch(new Request(url));
 if(!r.ok||!r.body)return r;
 return new Response(request.method==='HEAD'?null:r.body.pipeThrough(new DecompressionStream('gzip')),{headers:{'Content-Type':wasm?'application/wasm':'application/octet-stream','Access-Control-Allow-Origin':'*','Cache-Control':'public, max-age=3600'}});
}
