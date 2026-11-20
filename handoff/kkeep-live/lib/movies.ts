import {validMoviePayload} from './movie-payload.ts';
export type MediaType = 'movie' | 'tv';
export type Movie = {
  id:number; title?:string; name?:string; overview?:string; poster_path?:string|null;
  backdrop_path?:string|null; release_date?:string; first_air_date?:string;
  vote_average?:number; media_type?:MediaType; adult?:boolean; runtime?:number;
  genres?:{id:number;name:string}[]; seasons?:{season_number:number;name:string;episode_count:number}[];
};
export type MovieList = {results:Movie[];page?:number;total_pages?:number};
export type Episode = {id:number;episode_number:number;name:string;overview?:string;still_path?:string|null};
export type RecentMovie = {item:Movie;type:MediaType;season:number;episode:number;time:number;duration:number};
export type StreamSource = {url:string;proxyUrl?:string;direct?:boolean;quality?:string;type?:string};
export const MOVIE_SERVICE = 'https://racialequityleadership.com';
export const movieTitle = (item:Movie) => item.title || item.name || 'Untitled';
export const movieYear = (item:Movie) => (item.release_date || item.first_air_date || '').slice(0,4);
export function movieImage(path:string|null|undefined,size='w780') {
  return path && /^\/[a-zA-Z0-9_-]+\.(?:jpg|png|webp)$/.test(path)
    ? '/api/movies/img?path='+encodeURIComponent(size+path) : '';
}
export function publicMediaUrl(value:string):string|null {
  try {
    const url=new URL(value);
    if(url.protocol!=='https:'||url.username||url.password||url.port||!url.hostname.includes('.')||/^(?:\d|\[)/.test(url.hostname)||/\.(?:localhost|local|internal)$/.test(url.hostname))return null;
    return url.href;
  } catch { return null; }
}
export function streamUrl(source:StreamSource):string|null {
  if(source.direct)return publicMediaUrl(source.url);
  if(source.proxyUrl){
    try {
      const proxy=new URL(source.proxyUrl,MOVIE_SERVICE);
      if(proxy.origin===MOVIE_SERVICE&&/^\/api\/movies\/[a-z0-9-]+$/.test(proxy.pathname)&&!proxy.username&&!proxy.password)return proxy.href;
    }catch{}
    return null;
  }
  const url=publicMediaUrl(source.url);
  return url?MOVIE_SERVICE+'/api/movies/stream?url='+encodeURIComponent(url):null;
}
export const movieServers = [
  {id:'miami',label:'Miami',endpoint:'movybz-sources',server:'miami'},
  {id:'boise',label:'Boise',endpoint:'movybz-sources',server:'boise'},
  {id:'lisbon',label:'Lisbon',endpoint:'shegu-sources',server:'Lisbon'},
  {id:'vixsrc',label:'VixSrc',endpoint:'vixsrc-sources',server:''},
] as const;
export const unavailableMovieServers = [
  {id:'vidrock',label:'Vidrock'},
  {id:'2embed',label:'2Embed'},
] as const;
export type MovieServerChoice = 'auto' | typeof movieServers[number]['id'];
export class MovieServiceError extends Error{
  code:string;
  constructor(message:string,code='MOVIE_UPSTREAM_ERROR'){super(message);this.name='MovieServiceError';this.code=code;}
}
export async function movieRequest<T>(endpoint:string,params:Record<string,string|number>={},signal?:AbortSignal):Promise<T>{
  const query=new URLSearchParams(Object.entries(params).map(([key,value])=>[key,String(value)]));
  const controller=new AbortController();
  const abort=()=>controller.abort(signal?.reason);
  if(signal?.aborted)abort();else signal?.addEventListener('abort',abort,{once:true});
  let timedOut=false;
  const timer=setTimeout(()=>{timedOut=true;controller.abort();},endpoint.endsWith('-sources')?28000:20000);
  try{
    const response=await fetch('/api/movies/'+endpoint+'?'+query,{signal:controller.signal});
    const body=await response.json().catch(()=>null);
    if(!response.ok||!validMoviePayload(endpoint,body))throw new MovieServiceError(typeof body?.error==='string'?body.error:'The movie service is temporarily unavailable. Please retry.',typeof body?.code==='string'?body.code:undefined);
    return body as T;
  }catch(error){
    if(timedOut)throw new MovieServiceError('The movie service took too long to respond. Retry or choose another source.','MOVIE_TIMEOUT');
    throw error;
  }finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
}
export const RECENT_MOVIES_KEY='kkeep-movie-progress-v1';
export function readRecentMovies():RecentMovie[]{
  try {
    const data=JSON.parse(localStorage.getItem(RECENT_MOVIES_KEY)||'[]');
    if(!Array.isArray(data))return [];
    return data.filter((x:RecentMovie)=>x&&x.item&&Number.isSafeInteger(x.item.id)&&['movie','tv'].includes(x.type)&&Number.isFinite(x.time)&&x.time>0&&Number.isFinite(x.duration)&&x.duration>0&&Number.isSafeInteger(x.season)&&x.season>0&&Number.isSafeInteger(x.episode)&&x.episode>0).slice(0,20);
  }catch{return [];}
}
