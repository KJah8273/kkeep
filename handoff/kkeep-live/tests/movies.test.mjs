import test from 'node:test';
import assert from 'node:assert/strict';
import {movieUpstream,movieApi} from '../worker/movies.ts';
import {movieServers,unavailableMovieServers,movieImage,streamUrl,readRecentMovies,RECENT_MOVIES_KEY,movieRequest,MovieServiceError} from '../lib/movies.ts';

const request=(path,options)=>new Request('https://kkeep.fun/api/movies/'+path,options);
const upstream=path=>movieUpstream(new URL(request(path).url));

test('catalogue requests use fixed services and only supported query parameters',()=>{
  const result=upstream('discover?type=tv&provider=8&page=2&url=https://elsewhere.example&cookie=secret');
  assert.equal(result.url.href,'https://racialequityleadership.com/api/movies/discover?type=tv&page=2&provider=8');
  for(const path of ['stream?url=https://example.com','../admin','info?tmdbId=-1','info?tmdbId=1.5','info','trending?type=person','search?q=','search?q='+('a'.repeat(121)),'season?tmdbId=1&s=0','discover?provider=NaN'])assert.equal(upstream(path),null,path);
  assert.equal(upstream('search?q=The%20Matrix&type=movie').url.searchParams.get('q'),'The Matrix');
});

test('source requests validate movie, season, episode, and provider independently',()=>{
  assert.equal(upstream('movybz-sources?tmdbId=603&type=movie&server=miami').url.searchParams.get('episode'),'1');
  assert.equal(upstream('shegu-sources?tmdbId=1&type=tv&season=3&episode=8&server=Lisbon').url.searchParams.get('episode'),'8');
  for(const path of ['movybz-sources?tmdbId=1&server=unknown','shegu-sources?tmdbId=1&server=miami','vixsrc-sources?tmdbId=1&episode=0','vixsrc-sources?tmdbId=1&season=1001'])assert.equal(upstream(path),null,path);
});

test('only supported stream servers are eligible for playback',()=>{
  assert.deepEqual(movieServers.map(server=>server.id),['miami','boise','lisbon','vixsrc']);
  assert.deepEqual(unavailableMovieServers.map(server=>server.id),['vidrock','2embed']);
});

test('artwork proxy cannot fetch an arbitrary host, traversal path, or executable content',()=>{
  assert.equal(upstream('img?path=w780%2Fabc123.jpg').url.href,'https://image.tmdb.org/t/p/w780/abc123.jpg');
  for(const path of ['https://elsewhere.example/image.jpg','original/../../private.jpg','w780/image.svg','w999/image.jpg','w780/a.jpg?url=evil'])assert.equal(upstream('img?path='+encodeURIComponent(path)),null,path);
  assert.equal(movieImage('/a.jpg','w500'),'/api/movies/img?path=w500%2Fa.jpg');
  assert.equal(movieImage('javascript:alert(1)'),'');
});

test('metadata omits client credentials, rejects redirects, filters adult titles, and caches public data',async()=>{
  let seen;
  const response=await movieApi(request('trending?type=movie',{headers:{Cookie:'private',Authorization:'private'}}),undefined,async(url,options)=>{
    seen={url,options};return Response.json({results:[{id:1,title:'One'},{id:2,adult:true},{id:3,softcore:true}]});
  });
  assert.equal(response.status,200);
  assert.deepEqual((await response.json()).results,[{id:1,title:'One'}]);
  assert.equal(seen.options.redirect,'manual');
  assert.deepEqual(seen.options.headers,{Accept:'application/json'});
  assert.match(response.headers.get('Cache-Control'),/max-age=300/);
  assert.equal(response.headers.get('X-Content-Type-Options'),'nosniff');
  const redirect=await movieApi(request('trending'),undefined,async()=>new Response(null,{status:302,headers:{Location:'https://elsewhere.example'}}));
  assert.equal(redirect.status,502);
});

test('unsupported methods and malformed upstream data produce recoverable errors',async()=>{
  assert.equal((await movieApi(request('trending',{method:'POST'}))).status,405);
  assert.equal((await movieApi(request('trending?type=invalid'))).status,400);
  for(const result of [new Response('<html>Error</html>'),Response.json({error:'Unavailable'}),new Response('too large',{headers:{'Content-Length':'2000001'}}),new Response('error',{status:503})]){
    const response=await movieApi(request('trending'),undefined,async()=>result);
    assert.equal(response.status,502);assert.equal(response.headers.get('Cache-Control'),'no-store');
    assert.match((await response.json()).error,/retry/i);
  }
  const image=await movieApi(request('img?path=w780/a.jpg'),undefined,async()=>new Response('<script/>',{headers:{'Content-Type':'text/html'}}));
  assert.equal(image.status,502);
});

test('ephemeral stream URLs are never cached, empty sources fail, and HEAD has no body',async()=>{
  const path='movybz-sources?tmdbId=603&server=miami';
  const response=await movieApi(request(path),undefined,async()=>Response.json({sources:[{url:'https://media.example/movie.m3u8',direct:true}]}));
  assert.equal(response.status,200);assert.equal(response.headers.get('Cache-Control'),'no-store');
  assert.equal((await movieApi(request(path),undefined,async()=>Response.json({sources:[]}))).status,502);
  const head=await movieApi(request('trending',{method:'HEAD'}),undefined,async()=>Response.json({results:[]}));
  assert.equal(head.status,200);assert.equal(await head.text(),'');
});

test('playback URLs reject unsafe schemes and off-service relays',()=>{
  assert.equal(streamUrl({url:'https://cdn.example/video.m3u8',direct:true}),'https://cdn.example/video.m3u8');
  assert.equal(streamUrl({url:'https://cdn.example/video.m3u8',proxyUrl:'/api/movies/stream?url=abc'}),'https://racialequityleadership.com/api/movies/stream?url=abc');
  for(const url of ['javascript:alert(1)','http://cdn.example/video','https://127.0.0.1/a','https://localhost/a','https://a:b@cdn.example/a','https://cdn.internal/a'])assert.equal(streamUrl({url,direct:true}),null,url);
  assert.equal(streamUrl({url:'https://cdn.example/a',proxyUrl:'https://other.example/api/movies/stream'}),null);
});

test('saved progress tolerates corrupt or unavailable local storage',()=>{
  const original=globalThis.localStorage;
  try{
    for(const value of ['null','not json','{}','[null,{"item":null}]']){globalThis.localStorage={getItem:()=>value};assert.deepEqual(readRecentMovies(),[]);}
    globalThis.localStorage={getItem:()=>{throw new Error('Denied');}};assert.deepEqual(readRecentMovies(),[]);
    const entry={item:{id:603,title:'The Matrix'},type:'movie',season:1,episode:1,time:30,duration:7200};
    globalThis.localStorage={getItem:key=>key===RECENT_MOVIES_KEY?JSON.stringify([entry,{...entry,time:0}]):null};
    assert.deepEqual(readRecentMovies(),[entry]);
  }finally{if(original===undefined)delete globalThis.localStorage;else globalThis.localStorage=original;}
});

test('HTML maintenance pages distinguish a service outage from a missing stream',async()=>{
  for(const path of ['trending','movybz-sources?tmdbId=603&server=miami']){
    const response=await movieApi(request(path),undefined,async()=>new Response('<h1>Site Unavailable</h1>',{headers:{'Content-Type':'text/html'}}));
    assert.equal(response.status,502);
    assert.equal((await response.json()).code,'MOVIE_SERVICE_UNAVAILABLE');
  }
  const missing=await movieApi(request('movybz-sources?tmdbId=603&server=miami'),undefined,async()=>Response.json({sources:[]}));
  assert.equal((await missing.json()).code,'MOVIE_UPSTREAM_ERROR');
});

test('malformed catalogue shapes never reach the rendering components',async()=>{
  for(const [path,body] of [['trending',{}],['trending',{results:null}],['trending',{results:[null]}],['trending',{results:[{id:1,vote_average:'8.2'}]}],['genres',{genres:{id:1}}],['season?tmdbId=1',{episodes:[{name:'Episode'}]}],['info?tmdbId=1',{id:1,seasons:'broken'}]]){
    const response=await movieApi(request(path),undefined,async()=>Response.json(body));
    assert.equal(response.status,502,path);
  }
});

test('browser requests reject invalid cached payloads and preserve outage codes',async t=>{
  for(const body of [null,[],{}, {results:[null]}, {results:[{id:1,title:{invalid:true}}]}]){
    t.mock.method(globalThis,'fetch',async()=>Response.json(body));
    await assert.rejects(movieRequest('trending'),MovieServiceError);
    t.mock.restoreAll();
  }
  t.mock.method(globalThis,'fetch',async()=>Response.json({error:'Service down',code:'MOVIE_SERVICE_UNAVAILABLE'},{status:502}));
  await assert.rejects(movieRequest('trending'),error=>error instanceof MovieServiceError&&error.code==='MOVIE_SERVICE_UNAVAILABLE');
});

test('browser requests time out and cancel when switching movie sources',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  t.mock.method(globalThis,'fetch',async(_url,{signal})=>new Promise((_resolve,reject)=>{
    if(signal.aborted)reject(signal.reason);
    else signal.addEventListener('abort',()=>reject(signal.reason),{once:true});
  }));
  const timeout=assert.rejects(movieRequest('trending'),error=>error.code==='MOVIE_TIMEOUT');
  t.mock.timers.tick(20000);
  await timeout;
  const controller=new AbortController();
  const cancelled=assert.rejects(movieRequest('trending',{},controller.signal),error=>error.name==='AbortError');
  controller.abort();await cancelled;
  const alreadyAborted=assert.rejects(movieRequest('trending',{},controller.signal),error=>error.name==='AbortError');
  await alreadyAborted;
});
