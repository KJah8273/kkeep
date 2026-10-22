import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../public/analytics/collect.js',import.meta.url),'utf8');
async function browser({owner=false,excluded=false,webdriver=false,framed=false}={}){
 const timers=new Map(),events={},calls=[],storage=new Map();let id=0;
 const window={addEventListener:(name,fn)=>{events[name]=fn;}};window.self=window;window.top=framed?{}:window;
 const document={visibilityState:'visible',documentElement:{dataset:{}},addEventListener:(name,fn)=>{events[name]=fn;}};
 const context={window,document,navigator:{webdriver,maxTouchPoints:5,userAgent:'Macintosh Safari/605'},location:{pathname:'/',search:'?secret=never-record',href:'https://kkeep.test/?secret=never-record'},localStorage:{getItem:key=>storage.get(key)},AbortController,crypto:{randomUUID:()=>`12345678-1234-1234-1234-${String(++id).padStart(12,'0')}`},setTimeout:(fn,ms)=>{timers.set(++id,{fn,ms});return id;},clearTimeout:key=>timers.delete(key),fetch:async(url,options)=>{calls.push({url,options});return {ok:true,json:async()=>({owner,excluded})};}};
 vm.runInNewContext(source,context);await new Promise(r=>setImmediate(r));
 return {events,calls,storage,document,tick(){const active=[...timers.entries()].filter(([,t])=>t.ms===2000);for(const[key,t]of active){timers.delete(key);t.fn();}},get timers(){return timers;}};
}
test('collector sends one visible page opening and only app labels; same app navigations do not inflate counts',async()=>{
 const b=await browser();b.tick();b.tick();
 let posts=b.calls.filter(c=>c.options.method==='POST');assert.equal(posts.length,1);
 const data=JSON.parse(posts[0].options.body);assert.deepEqual(Object.keys(data).sort(),['event','ipad','surface']);assert.equal(data.surface,'home');assert.equal(data.ipad,true);assert.doesNotMatch(posts[0].options.body,/secret|https:/);
 b.events['kkeep-analytics-surface']({detail:'youtube'});b.tick();b.events['kkeep-analytics-surface']({detail:'youtube'});b.tick();
 posts=b.calls.filter(c=>c.options.method==='POST');assert.equal(posts.length,2);
 b.events['kkeep-analytics-surface']({detail:'https://private.test'});b.tick();assert.equal(b.calls.filter(c=>c.options.method==='POST').length,2);
});
test('owner, opt-out, automation and iframe contexts never send collection events',async()=>{
 for(const options of [{owner:true},{excluded:true},{webdriver:true},{framed:true}]){const b=await browser(options);b.tick();assert.equal(b.calls.filter(c=>c.options.method==='POST').length,0);}
 const b=await browser();b.storage.set('kkeep-analytics-exclude','1');b.tick();assert.equal(b.calls.filter(c=>c.options.method==='POST').length,0);
});
test('hidden pages wait for visible time and pagehide cancels a pending event',async()=>{
 const b=await browser();b.document.visibilityState='hidden';b.events.visibilitychange();b.tick();assert.equal(b.calls.filter(c=>c.options.method==='POST').length,0);
 b.document.visibilityState='visible';b.events.visibilitychange();b.tick();assert.equal(b.calls.filter(c=>c.options.method==='POST').length,1);
 b.events['kkeep-analytics-surface']({detail:'tiktok'});b.events.pagehide();b.tick();assert.equal(b.calls.filter(c=>c.options.method==='POST').length,1);
});
