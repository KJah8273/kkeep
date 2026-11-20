import {normalizeEvents,normalizeChannels} from '../lib/sports.ts';
export {normalizeEvents,normalizeChannels} from '../lib/sports.ts';
export async function sportsApi(request:Request,ctx?:{waitUntil(p:Promise<unknown>):void},fetcher:typeof fetch=fetch){
 const name=new URL(request.url).pathname.slice('/api/sports/'.length);
 if(request.method!=='GET')return new Response('Method not allowed',{status:405,headers:{Allow:'GET'}});
 if(!['schedule','channels'].includes(name))return new Response('Not found',{status:404});
 const key=new Request(new URL('/api/sports/'+name,request.url));
 const cache=(globalThis as unknown as {caches?:{default?:Cache}}).caches?.default;
 try{const hit=await cache?.match(key);if(hit)return hit;}catch{}
 try{
  const response=await fetcher('https://matchora.to/api/v1/'+name+(name==='schedule'?'?watchable=1':''),{headers:{Accept:'application/json'},redirect:'manual',signal:AbortSignal.timeout(18000)});
  if(!response.ok)throw Error('Feed unavailable '+response.status);
  const body=await response.text();if(body.length>4000000)throw Error('Feed too large');
  const data=JSON.parse(body),items=name==='schedule'?normalizeEvents(data):normalizeChannels(data);
  const result=Response.json({items,updatedAt:new Date().toISOString()},{headers:{'Cache-Control':'public, max-age=60','X-Content-Type-Options':'nosniff'}});
  if(cache&&ctx)ctx.waitUntil(cache.put(key,result.clone()).catch(()=>{}));return result;
 }catch(error){console.warn('Sports feed failed',error instanceof Error?error.message:'Unknown error');return Response.json({error:'The sports feed is temporarily unavailable. Please retry.'},{status:502,headers:{'Cache-Control':'no-store'}});}
}
