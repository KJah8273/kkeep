import test from 'node:test';
import assert from 'node:assert/strict';
import {sportsEmbed,sportGroup} from '../lib/sports.ts';
import {broadcasterLink,channelLogo,sportsPhoto} from '../lib/sports-media.ts';
import {existsSync} from 'node:fs';
import {normalizeEvents,normalizeChannels,sportsApi} from '../worker/sports.ts';
const sample={id:'123',home:'Team A',away:'Team B',sport:'Soccer',kickoff:1793030400,live:false,embed_url:'https://matchora.to/embed/match/123',home_badge:'https://evil.test/tracker',channels:[{name:'Channel',embed_url:'https://matchora.to/embed/channel/456'}]};
test('failed Abu Dhabi feeds use the matching broadcaster; premium and unknown channels are not misrouted',()=>{
 assert.equal(broadcasterLink('Abu Dhabi Sports 2 · Arabic'),'https://starzplay.com/en/admn/movies/abu-dhabi-sports-2/720335400127');
 assert.match(broadcasterLink('Abu Dhabi Sports 1'),/1\/720335400126$/);
 for(const name of ['Abu Dhabi Sports Premium 1','Abu Dhabi Sports 3','ESPN','javascript:bad']) assert.equal(broadcasterLink(name),'');
});
test('match and channel artwork resolves to existing local images',()=>{
 for(const sport of ['Football','UFC & MMA','Basketball']) assert.ok(existsSync(new URL('../public'+sportsPhoto(sport),import.meta.url)));
 for(const channel of ['Abu Dhabi Sports','ESPN','Arena Sport 1 RS']) assert.ok(existsSync(new URL('../public'+channelLogo(channel),import.meta.url)));
 assert.equal(channelLogo('Unknown channel'),'');
});
test('only documented HTTPS embeds are accepted; scripts, external origins and credentials are rejected',()=>{
 assert.equal(sportsEmbed(sample.embed_url),sample.embed_url);
 for(const u of ['javascript:alert(1)','https://matchora.to.evil/embed/match/1','https://evil.test/embed/match/1','https://user@matchora.to/embed/match/1','https://matchora.to/embed/match/1?redirect=https://evil.test','http://matchora.to/embed/match/1'])assert.equal(sportsEmbed(u),'');
});
test('schedule retains genuine live states, channels and times; no invented fixtures',()=>{
 const events=normalizeEvents({events:[sample,{...sample,id:'124',live:true},{...sample,id:'bad',embed_url:'https://evil.test'}]});
 assert.equal(events.length,2);assert.equal(events[0].live,false);assert.equal(events[1].live,true);assert.equal(events[0].homeBadge,'');assert.equal(events[0].feeds.length,1);assert.equal(events[0].kickoff,sample.kickoff);
 assert.equal(sportGroup(events[0]),'Football');assert.equal(sportGroup({...events[0],home:'Washington Commanders',sport:'American Football'}),'American Football');assert.equal(sportGroup({...events[0],home:'UFC Fight Night',sport:'Fighting'}),'UFC & MMA');
});
test('channel entries with no valid feeds are dropped',()=>{
 const channels=normalizeChannels({channels:[{name:'Sports TV',feeds:[{label:'Feed',embed_url:'https://matchora.to/embed/channel/456'}]},{name:'Bad',feeds:[{embed_url:'https://evil.test'}]}]});assert.equal(channels.length,1);assert.equal(channels[0].id,'456');
});
test('server route never fetches a client target; uses documented feed and cache headers',async()=>{
 let target;const response=await sportsApi(new Request('https://kkeep.fun/api/sports/schedule?url=https://evil.test'),undefined,async u=>{target=u;return Response.json({events:[sample]});});assert.equal(target,'https://matchora.to/api/v1/schedule?watchable=1');assert.equal(response.status,200);assert.match(response.headers.get('cache-control'),/max-age=60/);assert.equal((await response.json()).items.length,1);
});
test('invalid endpoints, methods and upstream failures return clear failures',async()=>{
 let called=0;const fetcher=async()=>{called++;throw Error('offline');};
 assert.equal((await sportsApi(new Request('https://kkeep.fun/api/sports/unknown'),undefined,fetcher)).status,404);
 assert.equal((await sportsApi(new Request('https://kkeep.fun/api/sports/schedule',{method:'POST'}),undefined,fetcher)).status,405);assert.equal(called,0);
 const r=await sportsApi(new Request('https://kkeep.fun/api/sports/schedule'),undefined,fetcher);assert.equal(r.status,502);assert.equal(r.headers.get('cache-control'),'no-store');
 assert.throws(()=>normalizeEvents({html:'bad'}));
});
