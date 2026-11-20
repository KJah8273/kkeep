// Only resolve this game's official, expiring build URLs. Never execute remote HTML.
export const HGOLA_PAGE='https://play.unity.com/en/games/48d6dff8-fc06-4898-af57-aa06155944fe/hgola-altara';
export const HGOLA_ID='48d6dff8-fc06-4898-af57-aa06155944fe';
export const HGOLA_FRAME=`https://play.unity.com/api/v1/games/game/${HGOLA_ID}/build/latest/frame`;
export function parseHgolaBuild(html:string){
 const sources=[...html.matchAll(/https:\/\/cdn\.play\.unity\.com\/[^"\s<>]+/g)].map(m=>m[0]);
 const file=(name:string)=>{
  const url=sources.map(s=>new URL(s)).find(u=>u.pathname.startsWith(`/games/${HGOLA_ID}/`)&&u.pathname.endsWith('/'+name));
  if(!url||!/^\/games\/[a-f0-9-]+\/[a-f0-9-]+\/[^/]+$/.test(url.pathname))throw new Error('Unsupported game build');
  return url.href;
 };
 const loaderUrl=file('loader.js'),build=new URL(loaderUrl).pathname.split('/')[3];
 const config={dataUrl:file('game.data.gz'),frameworkUrl:file('framework.js.gz'),codeUrl:file('game.wasm.gz'),streamingAssetsUrl:`https://play-prod.struckd.com/api/v1/games/game/${HGOLA_ID}/build/${build}/streaming`,companyName:'play.unity.com',productName:'Unity Play Project',productVersion:build};
 if([config.dataUrl,config.frameworkUrl,config.codeUrl].some(u=>new URL(u).pathname.split('/')[3]!==build))throw new Error('Mixed game build');
 return {loaderUrl,config};
}
export async function hgolaBuild(request:Request,fetcher:typeof fetch=fetch){
 if(request.method!=='GET')return new Response('Method not allowed',{status:405});
 try{
  const response=await fetcher(HGOLA_FRAME,{signal:AbortSignal.timeout(20000),cache:'no-store'});
  if(!response.ok)throw new Error('Game unavailable');
  const text=await response.text();
  if(text.length>200000)throw new Error('Invalid build');
  return Response.json(parseHgolaBuild(text),{headers:{'Cache-Control':'private, max-age=120','X-Content-Type-Options':'nosniff'}});
 }catch{return Response.json({error:'Game files are temporarily unavailable'},{status:502,headers:{'Cache-Control':'no-store'}});}
}

const hgolaFiles=new Set(['loader.js','game.data.gz','framework.js.gz','game.wasm.gz']);
export function allowedHgolaAsset(value:string){
 try{const u=new URL(value);return u.protocol==='https:'&&u.hostname==='cdn.play.unity.com'&&!u.port&&!u.username&&!u.password&&u.pathname.startsWith(`/games/${HGOLA_ID}/`)&&/^\/games\/[a-f0-9-]+\/[a-f0-9-]+\/[^/]+$/.test(u.pathname)&&hgolaFiles.has(u.pathname.split('/').at(-1)!);}catch{return false;}
}
export async function hgolaAsset(request:Request,fetcher:typeof fetch=fetch){
 const source=new URL(request.url).searchParams.get('url')||'';
 if(request.method!=='GET'||!allowedHgolaAsset(source))return new Response('Not found',{status:404});
 try{
  // Stream, never buffer the large Unity data/wasm in Worker memory.
  const response=await fetcher(source,{redirect:'manual',headers:{'User-Agent':'Mozilla/5.0','Origin':'https://play-prod.struckd.com','Referer':HGOLA_FRAME},signal:AbortSignal.timeout(180000)});
  if(!response.ok||!response.body)return new Response('Game download unavailable ('+response.status+')',{status:502});
  const headers=new Headers({'Content-Type':response.headers.get('Content-Type')||'application/octet-stream','Cache-Control':'private, max-age=3600','X-Content-Type-Options':'nosniff'});
  // Match the working relay: fetch exposes decoded bytes; do not forward compression headers.
  if(!response.headers.has('Content-Encoding')&&response.headers.has('Content-Length'))headers.set('Content-Length',response.headers.get('Content-Length')!);
  return new Response(response.body,{headers});
 }catch{return new Response('Game download unavailable',{status:502,headers:{'Cache-Control':'no-store'}});}
}
