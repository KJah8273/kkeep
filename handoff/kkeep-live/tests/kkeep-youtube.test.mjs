import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {kkeepYoutube,backendOrigin,streamTarget} from '../worker/kkeep-youtube.ts';
import {digest} from '../worker/profile.ts';
import {cards,duration} from '../lib/kkeep-youtube/model.ts';

const origin='https://kkeep.test',backend='https://videos.kkeep.test',id='abcdefghijk',other='abcdefghij2',channel='UC'+'a'.repeat(22);
const raw={videoId:id,title:'A public video',author:'A channel',authorId:channel,lengthSeconds:240,viewCount:1500,publishedText:'today',description:'Video description',recommendedVideos:[{videoId:other,title:'Related'}],formatStreams:[{itag:'18',type:'video/mp4; codecs="avc1, mp4a"',qualityLabel:'360p',url:backend+'/videoplayback?id='+id}]};
function database(){const sql=new DatabaseSync(':memory:');for(const file of ['0005_lonely_landau.sql','0008_perpetual_the_liberteens.sql'])sql.exec(readFileSync(new URL('../drizzle/'+file,import.meta.url),'utf8'));return{sql,prepare(query){let args=[];const statement={bind(...values){args=values;return statement;},async all(){return{results:sql.prepare(query).all(...args)};},async run(){return{meta:sql.prepare(query).run(...args)};}};return statement;}};}
async function fixture(){const DB=database();for(const [name,token] of [['a','a'],['b','b']]){DB.sql.prepare('INSERT INTO kkeep_accounts VALUES (?,?,?,?,?)').run(name,name,name,'test hash',Date.now());DB.sql.prepare('INSERT INTO kkeep_sessions VALUES (?,?,?)').run(await digest(token.repeat(64)),name,Date.now()+60000);}return{DB,INVIDIOUS_URL:backend,INVIDIOUS_API_KEY:'server-only-test-key'};}
function request(path='status',{user='a',body,headers={},method}={}){return new Request(origin+'/api/kkeep-youtube/'+path,{method:method||(body!==undefined?'POST':'GET'),headers:{'X-Kkeep-Video':'1',Origin:origin,...(user?{Cookie:'__Host-kkeep-profile='+user.repeat(64)}:{}),...headers},...(body!==undefined?{body:JSON.stringify(body)}:{})});}
const context={waitUntil(){}};
async function upstream(url,options){const u=new URL(url);if(u.pathname.startsWith('/api/v1/videos/'))return Response.json({...raw,videoId:u.pathname.split('/').at(-1)});if(u.pathname.includes('/channels/'))return Response.json(u.pathname.endsWith('/videos')?{videos:[raw]}:{author:'Canonical channel'});if(u.pathname==='/api/v1/search'||u.pathname==='/api/v1/trending')return Response.json([raw]);if(u.hostname==='i.ytimg.com')return new Response('image',{headers:{'Content-Type':'image/jpeg'}});if(u.pathname==='/videoplayback')return new Response(options?.method==='HEAD'?null:'1234',{status:206,headers:{'Content-Type':'video/mp4','Accept-Ranges':'bytes','Content-Range':'bytes 0-3/100','Content-Length':'4'}});throw Error('Unexpected upstream '+url);}
const call=(env,path,options,fetcher=upstream)=>kkeepYoutube(request(path,options),env,context,fetcher);
const action=(env,body,user='a')=>call(env,'action',{user,body:{scope:user,id,...body}});
const json=async response=>await(await response).json();

test('Kkeep Profile is required for video content, thumbnails, media, and library',async()=>{
 const env=await fixture();assert.deepEqual(await json(call(env,'status',{user:''})),{account:null,configured:true});
 for(const path of ['state','browse','video?id='+id,'image?id='+id,'stream?id='+id+'&itag=18'])assert.equal((await call(env,path,{user:''})).status,401,path);
 assert.equal((await action(env,{action:'save',value:true},'')).status,401);
 assert.equal((await call(env,'browse',{headers:{Origin:'https://external.test'}})).status,403);
 assert.equal((await call(env,'state',{headers:{'X-Kkeep-Video':''}})).status,403);
 assert.equal((await call(env,'image?id='+id,{headers:{'Sec-Fetch-Site':'cross-site'}})).status,403);
 assert.equal((await call(env,'state',{method:'DELETE'})).status,405);
});
test('likes, watch later, subscriptions and resume sync to the same Profile but not another',async()=>{
 const env=await fixture();assert.equal((await action(env,{action:'save',value:true,title:'Client cannot replace title'})).status,200);await action(env,{action:'like',value:true});await action(env,{action:'subscribe',id:channel,value:true});
 const start=await json(action(env,{action:'start'}));assert.equal(start.position,0);await action(env,{action:'progress',session:start.session,seq:1,position:65,duration:240});
 env.DB.sql.prepare('INSERT INTO kkeep_sessions VALUES (?,?,?)').run(await digest('c'.repeat(64)),'a',Date.now()+60000);
 const second=await json(call(env,'state',{user:'c'}));assert.equal(second.account.id,'a');assert.equal(second.history[0].position,65);assert.equal(second.saved[0].title,'A public video');assert.equal(second.liked[0].id,id);assert.equal(second.subscriptions[0].name,'Canonical channel');
 const another=await json(call(env,'state',{user:'b'}));for(const field of ['history','saved','liked','subscriptions'])assert.deepEqual(another[field],[]);
 assert.equal((await call(env,'action',{user:'b',body:{scope:'a',action:'save',id,value:true}})).status,409);
 assert.equal((await json(action(env,{action:'start'},'a'))).position,65);
});
test('out-of-order progress cannot rewind playback, and a new player fences an old one',async()=>{
 const env=await fixture(),first=await json(action(env,{action:'start'}));
 await action(env,{action:'progress',session:first.session,seq:3,position:90,duration:240});
 assert.deepEqual(await json(action(env,{action:'progress',session:first.session,seq:2,position:30,duration:240})),{ok:true,ignored:true});
 assert.equal((await json(call(env,'state'))).history[0].position,90);
 const second=await json(action(env,{action:'start'}));assert.equal(second.position,90);
 assert.equal((await action(env,{action:'progress',session:first.session,seq:4,position:10,duration:240})).status,409);
 await action(env,{action:'progress',session:second.session,seq:1,position:110,duration:240});
 assert.equal((await json(call(env,'state'))).history[0].position,110);
});
test('removing history preserves likes and Watch later and invalidates old playback writes',async()=>{
 const env=await fixture(),start=await json(action(env,{action:'start'}));await action(env,{action:'save',value:true});await action(env,{action:'like',value:true});await action(env,{action:'progress',session:start.session,seq:1,position:40,duration:240});await action(env,{action:'remove-history'});
 const result=await json(call(env,'state'));assert.deepEqual(result.history,[]);assert.equal(result.saved.length,1);assert.equal(result.liked.length,1);
 assert.equal((await action(env,{action:'progress',session:start.session,seq:2,position:80,duration:240})).status,409);
 await action(env,{action:'save',value:false});await action(env,{action:'like',value:false});assert.deepEqual((await json(call(env,'state'))).saved,[]);
});
test('recommendations use own watched videos and search/channel feeds normalize upstream data',async()=>{
 const env=await fixture(),start=await json(action(env,{action:'start'}));await action(env,{action:'progress',session:start.session,seq:1,position:20,duration:240});
 assert.deepEqual((await json(call(env,'browse'))).videos.map(v=>v.id),[other,id]);assert.deepEqual((await json(call(env,'browse',{user:'b'}))).videos.map(v=>v.id),[id]);
 let search;await call(env,'browse?q=space%20science&page=2',undefined,async(u,o)=>{search=new URL(u);return upstream(u,o);});assert.equal(search.searchParams.get('q'),'space science');assert.equal(search.searchParams.get('type'),'video');assert.equal(search.searchParams.get('page'),'2');
 await action(env,{action:'subscribe',id:channel,value:true});assert.equal((await json(call(env,'browse?type=subscriptions'))).videos[0].id,id);assert.equal((await json(call(env,'browse?type=channel&channel='+channel))).channel.name,'Canonical channel');
 assert.equal((await call(env,'browse?type=channel&channel=../../bad')).status,400);assert.equal((await call(env,'browse?page=100')).status,400);
 assert.equal(cards([raw,raw,{...raw,videoId:other,premium:true},{}]).length,1);assert.equal(duration(3700),'1:01:40');
});
test('native MP4 seeking and HEAD preserve media headers without leaking Profile cookies',async()=>{
 const env=await fixture(),calls=[];const fetcher=async(u,o)=>{calls.push({url:u,...o});return upstream(u,o);};
 const details=await json(call(env,'video?id='+id,undefined,fetcher));assert.equal(details.formats[0].itag,'18');assert.equal(JSON.stringify(details).includes('server-only-test-key'),false);assert.equal(JSON.stringify(details).includes('/videoplayback'),false);
 const response=await call(env,'stream?id='+id+'&itag=18',{headers:{Range:'bytes=0-3'}},fetcher);assert.equal(response.status,206);assert.equal(response.headers.get('Content-Range'),'bytes 0-3/100');assert.equal(await response.text(),'1234');
 const media=calls.at(-1);assert.deepEqual(media.headers,{Range:'bytes=0-3','X-Kkeep-Backend-Key':'server-only-test-key'});assert.equal(media.credentials,'omit');assert.equal(media.redirect,'manual');
 const head=await call(env,'stream?id='+id+'&itag=18',{method:'HEAD'},fetcher);assert.equal(head.status,206);assert.equal(await head.text(),'');assert.equal(calls.at(-1).method,'HEAD');
 assert.equal((await call(env,'stream?id='+id+'&itag=18',{headers:{Range:'bytes=-'}})).status,416);
 for(const r of calls)assert.equal(JSON.stringify(r.headers).includes('__Host-kkeep'),false);
});
test('the connection timeout does not terminate an already streaming video',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});const env=await fixture();let streamSignal;
 const fetcher=async(u,o)=>{if(new URL(u).pathname==='/videoplayback')streamSignal=o.signal;return upstream(u,o);};
 const response=await call(env,'stream?id='+id+'&itag=18',undefined,fetcher);assert.equal(response.status,206);
 t.mock.timers.tick(31000);assert.equal(streamSignal.aborted,false);assert.equal(await response.text(),'1234');
});
test('only fixed media origins are accepted, redirects fail closed, and errors contain no secrets',async()=>{
 const env=await fixture();for(const u of ['http://videos.kkeep.test','https://user:secret@videos.kkeep.test','https://videos.kkeep.test/a','https://videos.kkeep.test:444'])assert.equal(backendOrigin(u),null);
 for(const u of ['http://127.0.0.1/videoplayback','https://evil.test/videoplayback','https://rr1.googlevideo.com.evil.test/videoplayback',backend+'/admin',backend+'/api/v1/videos/'+id])assert.equal(streamTarget(u,env),null);
 assert.equal(streamTarget(backend+'/videoplayback?id=x',env).origin,backend);
 let mediaOptions;const google=async(u,o)=>{if(new URL(u).pathname.startsWith('/api/v1/'))return Response.json({...raw,formatStreams:[{...raw.formatStreams[0],url:'https://rr1.googlevideo.com/videoplayback?id=x'}]});mediaOptions=o;return upstream(backend+'/videoplayback',o);};
 assert.equal((await call(env,'stream?id='+id+'&itag=18',undefined,google)).status,206);assert.deepEqual(mediaOptions.headers,{});
 const redirect=async(u,o)=>new URL(u).pathname.startsWith('/api/v1/')?upstream(u,o):new Response(null,{status:302,headers:{Location:'https://evil.test'}});
 assert.equal((await call(env,'stream?id='+id+'&itag=18',undefined,redirect)).status,502);
 const broken=await call(env,'browse',undefined,async()=>new Response('SERVER_SECRET',{status:500}));assert.equal(broken.status,502);assert.equal((await broken.text()).includes('SERVER_SECRET'),false);
 assert.equal((await call({...env,INVIDIOUS_URL:undefined},'browse')).status,503);
 const badFormat=await json(call(env,'video?id='+id,undefined,async()=>Response.json({...raw,formatStreams:[{...raw.formatStreams[0],url:'https://evil.test/videoplayback'}]})));assert.deepEqual(badFormat.formats,[]);
});
test('malformed progress and actions cannot mutate saved libraries',async()=>{
 const env=await fixture();for(const body of [null,[],{scope:'a',action:'unknown',id},{scope:'a',action:'save',id,value:'yes'},{scope:'a',action:'subscribe',id:'bad',value:true},{scope:'a',action:'progress',id,position:-1,duration:240,seq:1,session:'bad'}])assert.equal((await call(env,'action',{body})).status,400);
 assert.equal((await call(env,'video?id=bad')).status,400);assert.equal((await call(env,'stream?id='+id+'&itag=abc')).status,400);
 assert.equal(env.DB.sql.prepare('SELECT count(*) AS n FROM kkeep_video_items').get().n,0);
});
