import files from './smash-files.json';
const source='https://play-prod.struckd.com/api/v1/games/game/4c1f3ef1-cd3d-45ff-b914-02a46f54b56b/build/81a435b0-25bc-43ac-8d30-d88c6f6ab545/streaming/smash-hit.bytes';
export async function smashBall(request:Request,fetcher:typeof fetch=fetch){
 const name=new URL(request.url).pathname.slice('/api/smash-ball/'.length);
 const file=Object.hasOwn(files,name)?files[name as keyof typeof files]:null;
 const headers={'Access-Control-Allow-Origin':'*','Access-Control-Expose-Headers':'Content-Length','Cache-Control':'public, max-age=3600'};
 if(!file||!['GET','HEAD'].includes(request.method))return new Response(null,{status:404});
 if(request.method==='HEAD')return new Response(null,{headers:{...headers,'Content-Type':file.type,'Content-Length':String(file.length)}});
 try{
  const end=file.offset+file.length-1;
  const r=await fetcher(source,{headers:{Range:`bytes=${file.offset}-${end}`},signal:AbortSignal.timeout(180000)});
  if(r.status!==206||r.headers.get('Content-Range')!==`bytes ${file.offset}-${end}/82767216`){await r.body?.cancel();throw Error('Invalid asset range');}
  return new Response(r.body,{headers:{...headers,'Content-Type':file.type,'Content-Length':String(file.length)}});
 }catch{return new Response('Game download unavailable. Please retry.',{status:502,headers:{...headers,'Cache-Control':'no-store'}});}
}
