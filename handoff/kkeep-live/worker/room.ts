// Only resolve this game's official, expiring build URLs. Never execute remote HTML.
export const ROOM_ID='b93b3829-4bc5-4f15-9367-252792447239';
export const ROOM_FRAME=`https://play.unity.com/api/v1/games/game/${ROOM_ID}/build/latest/frame`;
export function parseRoomBuild(html:string){
 const sources=[...html.matchAll(/https:\/\/cdn\.play\.unity\.com\/[^"\s<>]+/g)].map(m=>m[0]);
 const file=(name:string)=>{
  const url=sources.map(s=>new URL(s)).find(u=>u.pathname.startsWith(`/games/${ROOM_ID}/`)&&u.pathname.endsWith('/'+name));
  if(!url||!/^\/games\/[a-f0-9-]+\/[a-f0-9-]+\/[^/]+$/.test(url.pathname))throw new Error('Unsupported game build');
  return url.href;
 };
 const loaderUrl=file('loader.js'),build=new URL(loaderUrl).pathname.split('/')[3];
 const config={dataUrl:file('game.data'),frameworkUrl:file('framework.js'),codeUrl:file('game.wasm'),streamingAssetsUrl:`https://play-prod.struckd.com/api/v1/games/game/${ROOM_ID}/build/${build}/streaming`,companyName:'play.unity.com',productName:'Unity Play Project',productVersion:build};
 if([config.dataUrl,config.frameworkUrl,config.codeUrl].some(u=>new URL(u).pathname.split('/')[3]!==build))throw new Error('Mixed game build');
 return {loaderUrl,config};
}
export async function roomBuild(request:Request,fetcher:typeof fetch=fetch){
 if(request.method!=='GET')return new Response('Method not allowed',{status:405});
 try{
  const response=await fetcher(ROOM_FRAME+'?kkeep='+Math.floor(Date.now()/60000),{signal:AbortSignal.timeout(20000),cache:'no-store'});
  if(!response.ok)throw new Error('Game unavailable');
  const text=await response.text();
  if(text.length>200000)throw new Error('Invalid build');
  return Response.json(parseRoomBuild(text),{headers:{'Cache-Control':'private, max-age=120','X-Content-Type-Options':'nosniff'}});
 }catch{return Response.json({error:'Game files are temporarily unavailable'},{status:502,headers:{'Cache-Control':'no-store'}});}
}

const roomFiles=new Set(['loader.js','game.data','framework.js','game.wasm']);
export function allowedRoomAsset(value:string){
 try{const u=new URL(value);return u.protocol==='https:'&&u.hostname==='cdn.play.unity.com'&&!u.port&&!u.username&&!u.password&&u.pathname.startsWith(`/games/${ROOM_ID}/`)&&/^\/games\/[a-f0-9-]+\/[a-f0-9-]+\/[^/]+$/.test(u.pathname)&&roomFiles.has(u.pathname.split('/').at(-1)!);}catch{return false;}
}
export async function roomAsset(request:Request,fetcher:typeof fetch=fetch){
 const source=new URL(request.url).searchParams.get('url')||'';
 if(request.method!=='GET'||!allowedRoomAsset(source))return new Response('Not found',{status:404});
 try{
  // Stream, never buffer the large Unity data/wasm in Worker memory.
  const response=await fetcher(source,{redirect:'manual',headers:{'User-Agent':'Mozilla/5.0','Origin':'https://play-prod.struckd.com','Referer':ROOM_FRAME},signal:AbortSignal.timeout(180000)});
  if(!response.ok||!response.body)return new Response('Game download unavailable ('+response.status+')',{status:502});
  const headers=new Headers({'Content-Type':response.headers.get('Content-Type')||'application/octet-stream','Cache-Control':'private, max-age=3600','X-Content-Type-Options':'nosniff'});
  // Match the working relay: fetch exposes decoded bytes; do not forward compression headers.
  if(!response.headers.has('Content-Encoding')&&response.headers.has('Content-Length'))headers.set('Content-Length',response.headers.get('Content-Length')!);
  return new Response(response.body,{headers});
 }catch{return new Response('Game download unavailable',{status:502,headers:{'Cache-Control':'no-store'}});}
}

// This Unity upload contains a launcher, not the game itself. Its jslib fetches
// StreamingAssets/Game/play.html. Serve that game directly on our origin: the
// CDN has no CORS header on these files and labels every file octet-stream.
export function roomContentSource(pathname:string){
 const match=/^\/api\/room-content\/([a-f0-9-]{36})\/(.+)$/.exec(pathname);
 if(!match||!/^\w{8}-\w{4}-\w{4}-\w{4}-\w{12}$/.test(match[1]))return null;
 const file=match[2];
 if(!file.split('/').every(part=>/^[a-zA-Z0-9_][a-zA-Z0-9_. -]*$/.test(part)&&!part.includes('..')))return null;
 if(file!=='play.html'&&!/\.(js|json|bin|apk|png|jpe?g|webp|ogg|wav|mp3|droid|ini|webmanifest)$/.test(file))return null;
 return {build:match[1],file,url:`https://play-prod.struckd.com/api/v1/games/game/${ROOM_ID}/build/${match[1]}/streaming/Game/${file.split('/').map(encodeURIComponent).join('/')}`};
}
export function roomContentType(file:string){
 if(/^engine(?:-asyncify)?\.bin$/.test(file))return 'application/wasm';
 const ext=file.split('.').pop();
 return ({html:'text/html; charset=utf-8',js:'application/javascript; charset=utf-8',json:'application/json',webmanifest:'application/manifest+json',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',ogg:'audio/ogg',wav:'audio/wav',mp3:'audio/mpeg'} as Record<string,string>)[ext!]||'application/octet-stream';
}
export function adaptRoomPage(html:string){
 if(!html.includes('id="canvas"')||!html.includes('src="game.js"'))throw Error('Unsupported game page');
 return html.replace('<head>','<head><script src="/room-bridge.js?v=2"></script>')
  .replace('<h1>غرفه و نص</h1>','<h1>Kkeep</h1>')
  .replace('<p dir="ltr">port by kkeep.fun</p>','<p dir="rtl">غرفه ونص 1</p>');
}
function roomPageFailure(){
 return new Response('<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><script src="/room-bridge.js?v=2"></script></head><body data-room-error="تعذّر تحميل ملفات اللعبة. اضغط إعادة المحاولة.">تعذّر تحميل ملفات اللعبة.</body></html>',{status:502,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}});
}
export async function roomPlay(request:Request,fetcher:typeof fetch=fetch){
 const response=await roomBuild(request,fetcher);
 if(!response.ok)return roomPageFailure();
 const {config}=await response.json() as {config:{productVersion:string}};
 const target=new URL(`/api/room-content/${config.productVersion}/play.html`,request.url);
 // Safari uses Asyncify automatically; keep the choice in the game's own loader.
 if(new URL(request.url).searchParams.has('retry'))target.searchParams.set('retry','1');
 return new Response(null,{status:302,headers:{Location:target.href,'Cache-Control':'no-store'}});
}
export async function roomContent(request:Request,fetcher:typeof fetch=fetch){
 const source=roomContentSource(new URL(request.url).pathname);
 if(request.method!=='GET'||!source)return new Response('Not found',{status:404});
 try{
  let response=await fetcher(source.url,{redirect:'manual',signal:AbortSignal.timeout(30000)});
  if([301,302,303,307,308].includes(response.status)){
   const next=new URL(response.headers.get('Location')||'',source.url);
   const expected=`/games/${ROOM_ID}/${source.build}/StreamingAssets/Game/${source.file.split('/').map(encodeURIComponent).join('/')}`;
   if(next.protocol!=='https:'||next.hostname!=='cdn.play.unity.com'||next.port||next.username||next.password||next.pathname!==expected)throw Error('Invalid game redirect');
   response=await fetcher(next.href,{redirect:'manual',signal:AbortSignal.timeout(180000)});
  }
  if(!response.ok||!response.body)throw Error('Game file unavailable');
  const headers=new Headers({'Content-Type':roomContentType(source.file),'Cache-Control':source.file==='play.html'?'no-cache':'public, max-age=86400, immutable','X-Content-Type-Options':'nosniff'});
  if(source.file==='play.html'){
   const html=await response.text();if(html.length>100000)throw Error('Invalid game page');
   return new Response(adaptRoomPage(html),{headers});
  }
  if(!response.headers.has('Content-Encoding')&&response.headers.has('Content-Length')){
   headers.set('Content-Length',response.headers.get('Content-Length')!);
   headers.set('X-Uncompressed-Length',response.headers.get('Content-Length')!);
  }
  return new Response(response.body,{headers});
 }catch{if(source.file==='play.html')return roomPageFailure();return new Response('The game file could not be loaded. Please retry.',{status:502,headers:{'Cache-Control':'no-store'}});}
}
