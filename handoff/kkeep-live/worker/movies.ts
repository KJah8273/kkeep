// A bounded adapter for the catalogue used by the requested reference website.
// No arbitrary target URL, client credentials, cookies, or upstream HTML is relayed.
import {validMoviePayload} from '../lib/movie-payload.ts';
const SERVICE='https://racialequityleadership.com';
const metadata=new Set(['trending','top-rated','discover','genres','search','info','season']);
const sources=new Set(['movybz-sources','shegu-sources','vixsrc-sources']);
export function movieUpstream(input:URL):{url:URL;image:boolean;source:boolean}|null{
  const endpoint=input.pathname.slice('/api/movies/'.length),p=input.searchParams;
  if(endpoint==='img'){
    const path=p.get('path')||'';
    if(!/^(?:w185|w300|w500|w780|w1280|original)\/[a-zA-Z0-9_-]+\.(?:jpg|png|webp)$/.test(path))return null;
    return {url:new URL('https://image.tmdb.org/t/p/'+path),image:true,source:false};
  }
  if(!metadata.has(endpoint)&&!sources.has(endpoint))return null;
  const url=new URL('/api/movies/'+endpoint,SERVICE);
  const type=p.get('type')||'movie';
  if(!['movie','tv'].includes(type))return null;
  url.searchParams.set('type',type);
  const integer=(key:string,fallback:string|null=null,max=1000000000)=>{
    const value=p.get(key)||fallback;
    if(value===null)return true;
    if(!/^[1-9]\d{0,9}$/.test(value)||Number(value)>max)return false;
    url.searchParams.set(key,value);return true;
  };
  if(['info','season',...sources].includes(endpoint)&&!p.get('tmdbId'))return null;
  if(!integer('tmdbId')||!integer('page',null,500))return null;
  if(endpoint==='search'){
    const query=(p.get('q')||'').trim();if(!query||query.length>120)return null;
    url.searchParams.set('q',query);
  }
  if(endpoint==='discover'&&(!integer('genre')||!integer('provider')))return null;
  if(endpoint==='season'&&!integer('s','1',1000))return null;
  if(sources.has(endpoint)){
    if(!integer('season','1',1000)||!integer('episode','1',10000))return null;
    const server=p.get('server')||'';
    if(endpoint==='movybz-sources'&&!['miami','boise'].includes(server))return null;
    if(endpoint==='shegu-sources'&&server!=='Lisbon')return null;
    if(server)url.searchParams.set('server',server);
  }
  return {url,image:false,source:sources.has(endpoint)};
}
type MovieContext={waitUntil(promise:Promise<unknown>):void};
export async function movieApi(request:Request,ctx?:MovieContext,fetcher:typeof fetch=fetch):Promise<Response>{
  if(request.method!=='GET'&&request.method!=='HEAD')return new Response('Method not allowed',{status:405,headers:{Allow:'GET, HEAD'}});
  const upstream=movieUpstream(new URL(request.url));
  if(!upstream)return Response.json({error:'Invalid movie request.'},{status:400});
  const cache=(globalThis as unknown as {caches?:{default?:Cache}}).caches?.default;
  const key=new Request(new URL('/api/movies/'+upstream.url.pathname.split('/').pop()+upstream.url.search,request.url),{method:'GET'});
  // Keep image sizes distinct and normalize only supported metadata parameters.
  const cacheKey=upstream.image?new Request(request.url,{method:'GET'}):key;
  if(cache&&!upstream.source){try{const hit=await cache.match(cacheKey);if(hit)return request.method==='HEAD'?new Response(null,hit):hit;}catch{}}
  let serviceUnavailable=false;
  try{
    const result=await fetcher(upstream.url.href,{headers:{Accept:upstream.image?'image/*':'application/json'},redirect:'manual',signal:AbortSignal.timeout(upstream.source?22000:15000)});
    if(!result.ok)throw new Error('Upstream HTTP '+result.status);
    const headers=new Headers({'X-Content-Type-Options':'nosniff','Cache-Control':upstream.source?'no-store':upstream.image?'public, max-age=86400':'public, max-age=300'});
    let response:Response;
    if(upstream.image){
      const type=result.headers.get('Content-Type')||'';
      if(!/^image\/(?:jpeg|png|webp)/i.test(type))throw new Error('Invalid image');
      headers.set('Content-Type',type);response=new Response(result.body,{headers});
    }else{
      // The provider currently serves a 200 HTML maintenance page for every
      // API route. All playback choices share that provider, so retrying each
      // one cannot help. Return a distinct signal for a useful recovery path.
      const contentType=result.headers.get('Content-Type')||'';
      if(!/^application\/(?:[a-z0-9.+-]*\+)?json\b/i.test(contentType)){serviceUnavailable=true;throw new Error('Expected JSON, received '+contentType);}
      if(Number(result.headers.get('Content-Length'))>2000000)throw new Error('Response too large');
      const body=await result.text();if(body.length>2000000)throw new Error('Response too large');
      const data=JSON.parse(body);
      if(!validMoviePayload(upstream.url.pathname.split('/').pop()||'',data))throw new Error('Invalid movie data');
      if(upstream.source&&(!Array.isArray(data.sources)||!data.sources.length))throw new Error('No stream');
      if(Array.isArray(data.results))data.results=data.results.filter((item:{adult?:boolean;softcore?:boolean})=>!item.adult&&!item.softcore);
      response=Response.json(data,{headers});
    }
    if(cache&&!upstream.source&&ctx)ctx.waitUntil(cache.put(cacheKey,response.clone()).catch(()=>{}));
    return request.method==='HEAD'?new Response(null,response):response;
  }catch(error){
    console.warn('Movie request failed',upstream.url.pathname,error instanceof Error?error.message:'Unknown upstream error');
    return Response.json({error:upstream.source?'This playback server is unavailable. Try another server.':'The movie catalogue is temporarily unavailable. Please retry.',code:serviceUnavailable?'MOVIE_SERVICE_UNAVAILABLE':'MOVIE_UPSTREAM_ERROR'},{status:502,headers:{'Cache-Control':'no-store'}});
  }
}
