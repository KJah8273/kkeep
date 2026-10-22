import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {collectAnalytics,analyticsReport,analyticsPreference,analyticsDocument,coarseDevice,coarseBrowser,reportRange,dubaiDay} from '../worker/analytics.ts';
import {analyticsSurfaceForUrl} from '../lib/analytics-client.ts';
const now=Date.parse('2026-10-06T04:00:00Z');
const owner='owner@example.test';
function database(){const sql=new DatabaseSync(':memory:');for(const f of readdirSync(new URL('../drizzle/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort())sql.exec(readFileSync(new URL('../drizzle/'+f,import.meta.url),'utf8'));const db={prepare(query){let args=[];return {bind(...values){args=values;return this;},async all(){return {results:sql.prepare(query).all(...args)};},async run(){return {meta:{changes:Number(sql.prepare(query).run(...args).changes)}};}};}};return {sql,env:{DB:db,KKEEP_ANALYTICS_OWNER_EMAIL:owner,KKEEP_ANALYTICS_SECRET:'test-only-secret-never-used-in-production',KKEEP_ANALYTICS_STARTED_AT:new Date(now).toISOString()}};}
function event(surface='home',overrides={}){return {surface,event:randomUUID(),...overrides};}
function req(path='/api/analytics/collect',data=event(),headers={}){return new Request('https://kkeep.test'+path,{method:data===null?'GET':'POST',headers:{origin:'https://kkeep.test','x-kkeep-analytics':'1','user-agent':'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) Version/18.0 Safari/605.1','cf-connecting-ip':'192.0.2.10','cf-ipcountry':'AE',...headers},...(data===null?{}:{body:typeof data==='string'?data:JSON.stringify(data)})});}
const ownerReq=(query='30')=>req('/api/analytics/report?days='+query,null,{'oai-authenticated-user-email':owner});
test('anonymous and non-owner accounts cannot read analytics; access is checked before querying data',async()=>{
 const {sql,env}=database();try{
  for(const email of ['', 'not-owner@example.test']){
   const request=req('/api/analytics/report',null,{'oai-authenticated-user-email':email});
   assert.equal((await analyticsReport(request,env,now)).status,403);
   const page=analyticsDocument(req('/analytics',null,{'oai-authenticated-user-email':email}),env);const html=await page.text();
   assert.doesNotMatch(html,/total-visitors|dashboard\.js/);assert.match(html,email?/Switch account/:/Sign in with ChatGPT/);
  }
  const page=analyticsDocument(req('/analytics',null,{'oai-authenticated-user-email':owner}),env);
  assert.match(await page.text(),/Who’s here/);assert.equal(page.headers.get('x-frame-options'),'DENY');assert.match(page.headers.get('cache-control'),/no-store/);
  assert.equal((await analyticsReport(ownerReq(),{DB:env.DB},now)).status,403);
 }finally{sql.close();}
});
test('page opens deduplicate retries and visitors, classify iPad, and never store private payloads',async()=>{
 const {sql,env}=database();try{
  const first=event('youtube',{ipad:true});
  await collectAnalytics(req(undefined,first),env,now);await collectAnalytics(req(undefined,first),env,now+10);
  await collectAnalytics(req(undefined,event('tiktok',{ipad:true})),env,now+100);
  await collectAnalytics(req(undefined,event('youtube'),{'cf-connecting-ip':'198.51.100.20','cf-ipcountry':'GB','user-agent':'Mozilla/5.0 (Windows NT 10.0) Chrome/120.0'}),env,now+200);
  const data=await (await analyticsReport(ownerReq(),env,now+1000)).json();
  assert.deepEqual(data.totals,{views:3,visitors:2,countries:2});assert.equal(data.countries[0].name,'AE');assert.equal(data.devices[0].name,'iPad');
  const rows=sql.prepare('SELECT * FROM analytics_events').all();assert.equal(rows.length,3);assert.equal(rows[0].visitor,rows[1].visitor);
  assert.doesNotMatch(JSON.stringify(rows),/192\.0\.2|198\.51|Safari\/|owner@|https:/);
  assert.doesNotMatch(JSON.stringify(data),/"visitor":|"id":|192\.0\.2/);
  assert.match((await analyticsReport(ownerReq(),env,now)).headers.get('cache-control'),/no-store/);
 }finally{sql.close();}
});
test('bots, privacy signals, owner traffic, excluded browsers and missing edge addresses are not counted',async()=>{
 const {sql,env}=database();try{
  for(const headers of [{'user-agent':'Googlebot/2.1'},{'user-agent':'HeadlessChrome/120'},{dnt:'1'},{'sec-gpc':'1'},{'oai-authenticated-user-email':owner},{cookie:'__Host-kkeep-analytics-exclude=1'},{'cf-connecting-ip':''}])assert.equal((await collectAnalytics(req(undefined,event(),headers),env,now)).status,204);
  const edge=req();edge.cf={botManagement:{verifiedBot:true}};await collectAnalytics(edge,env,now);
  assert.equal(sql.prepare('select count(*) as n from analytics_events').get().n,0);
  const saved=await analyticsPreference(req('/api/analytics/preference',{excluded:true}),env);assert.match(saved.headers.get('set-cookie'),/Secure; HttpOnly; SameSite=Strict/);
  const preference=await (await analyticsPreference(req('/api/analytics/preference',null,{cookie:'__Host-kkeep-analytics-exclude=1'}),env)).json();assert.equal(preference.excluded,true);
  assert.equal((await analyticsPreference(req('/api/analytics/preference',{excluded:false},{origin:'https://foreign.test'}),env)).status,403);
 }finally{sql.close();}
});
test('collector rejects cross-origin, oversized, unknown and sensitive fields; ignores client country claims',async()=>{
 const {sql,env}=database();try{
  assert.equal((await collectAnalytics(req(undefined,event(),{origin:'https://foreign.test'}),env,now)).status,403);
  for(const value of [event('not-an-app'),event('home',{url:'https://secret.test/search?q=private'}),event('home',{country:'US'}),event('home',{ipad:'yes'}),'x'.repeat(513),'bad json'])assert.equal((await collectAnalytics(req(undefined,value),env,now)).status,400);
  assert.equal((await analyticsReport(ownerReq('365'),env,now)).status,400);
  assert.equal(sql.prepare('select count(*) as n from analytics_events').get().n,0);
  const r=req(undefined,event(),{'cf-ipcountry':'US'});r.cf={country:'AE'};await collectAnalytics(r,env,now);
  assert.equal(sql.prepare('select country from analytics_events').get().country,'AE');
 }finally{sql.close();}
});
test('visitor estimate is deduplicated over 30 days; UAE midnight and date boundaries are exact',async()=>{
 assert.equal(dubaiDay(Date.parse('2026-10-05T20:00:00Z')),'2026-10-06');
 const range=reportRange(now,30);assert.equal(range.startDay,'2026-09-07');assert.equal(new Date(range.from).toISOString(),'2026-09-06T20:00:00.000Z');
 const {sql,env}=database();try{
  await collectAnalytics(req(),env,now-86400000);await collectAnalytics(req(),env,now);
  const data=await (await analyticsReport(ownerReq(),env,now)).json();assert.equal(data.totals.visitors,1);assert.equal(data.totals.views,2);assert.equal(data.daily.length,2);
  const today=await (await analyticsReport(ownerReq('1'),env,now)).json();assert.equal(today.totals.views,1);
 }finally{sql.close();}
});
test('count limits and retention keep the public collector bounded',async()=>{
 const {sql,env}=database();try{
  for(let i=0;i<25;i++)await collectAnalytics(req(),env,now+i);
  assert.equal(sql.prepare('select count(*) as n from analytics_events').get().n,20);
  await collectAnalytics(req(),env,now+36*86400000);
  assert.equal(sql.prepare('select count(*) as n from analytics_events').get().n,1);
 }finally{sql.close();}
});
test('surface labels cannot expose search terms, auth callbacks, paths or unknown websites',()=>{
 assert.equal(analyticsSurfaceForUrl('https://www.youtube.com/watch?v=private'),'youtube');
 assert.equal(analyticsSurfaceForUrl('https://www.tiktok.com/@private'),'tiktok');
 assert.equal(analyticsSurfaceForUrl('https://example.com/?search=secret#token'),'web');
 assert.equal(analyticsSurfaceForUrl('https://youtube.com.evil.test/'),'web');
 assert.equal(coarseDevice('Macintosh',true),'iPad');assert.equal(coarseDevice('Macintosh'),'Mac');assert.equal(coarseBrowser('Edg/120 Chrome/120'),'Edge');
});
