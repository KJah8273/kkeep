import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {transformSync} from 'esbuild';

function loadTs(file,require){
  const module={exports:{}};
  vm.runInNewContext(transformSync(readFileSync(new URL(file,import.meta.url),'utf8'),{loader:'ts',format:'cjs'}).code,{module,exports:module.exports,URL,require});
  return module.exports;
}
const providers=loadTs('../lib/touch/providers.ts');
const robloxPlayer=loadTs('../lib/roblox-player.ts');
const {apps,gamingDestination}=loadTs('../lib/apps.ts',path=>path==='./roblox-player'?robloxPlayer:providers);

test('Roblox, Clash Royale and GhostCloud have separate cloud shortcuts',()=>{
  assert.deepEqual(Array.from(apps.filter(app=>app.cloud),app=>app.cloud),['roblox','clash','ghost']);
  assert.deepEqual(Array.from(providers.cloudProviders,app=>app.id),['ghost','roblox','clash']);
  assert.equal(providers.cloudProviderForUrl('https://saugatr-pencil735366.agrointegral.cl/games'),undefined);
  assert.equal(providers.cloudProviderForUrl('https://figurecc.cine-softwares.workers.dev/'),undefined);
});
test('Roblox opens the fullscreen local shell with the isolated Kkeep runtime',()=>{
  const roblox=apps.find(app=>app.cloud==='roblox');
  assert.equal(roblox.name,'Roblox');
  assert.equal(roblox.url,'https://kkeep-roblox-runtime.kha971.chatgpt.site/_rbx/app/');
  assert.equal(roblox.url,robloxPlayer.robloxLaunchUrl);
  assert.equal(roblox.path,'/roblox');
  assert.equal(roblox.external,false);
  assert.equal(roblox.native,true);
  assert.equal(gamingDestination(roblox.url),'/roblox');
  assert.equal(gamingDestination('https://kkeep-roblox-runtime.kha971.chatgpt.site/_rbx/app/'),'/roblox');
  assert.equal(gamingDestination('https://kkeep-roblox-runtime.kha971.chatgpt.site/_rbx/app/'),'/roblox');
  for(const url of ['https://kkeep-roblox-runtime.kha971.chatgpt.site/','https://kkeep-roblox-runtime.kha971.chatgpt.site.evil.test/_rbx/app/','https://user:secret@api.spf50krem.com/_rbx/app/'])assert.equal(gamingDestination(url),null);
  assert.equal(providers.supportsTouchControls('roblox'),false);
});
test('Clash Royale opens the standalone player with no proxy touch controller',()=>{
  const clash=apps.find(app=>app.cloud==='clash');
  assert.equal(clash.url,'https://kkeep-clash-royale.testerqrr1.chatgpt.site/');
  assert.equal(clash.name,'Clash Royale');
  assert.equal(clash.path,'/clash-royale');
  assert.equal(clash.external,true);
  assert.equal(gamingDestination(clash.url),clash.url);
  assert.equal(providers.supportsTouchControls('clash'),false);
});
test('Roblox accepts lifecycle messages only from its exact live provider frame',()=>{
  const frame={},otherFrame={};
  const event={origin:'https://kkeep-roblox-runtime.kha971.chatgpt.site',source:frame,data:{type:'webblox:stat',e:'play'}};
  assert.equal(robloxPlayer.robloxPlayerEvent(event,frame),'play');
  assert.equal(robloxPlayer.robloxPlayerEvent({...event,data:{type:'webblox:stat',e:'exit'}},frame),'exit');
  assert.equal(robloxPlayer.robloxPlayerEvent({...event,data:{type:'webblox:signed-out'}},frame),'signed-out');
  assert.equal(robloxPlayer.robloxPlayerEvent(event,otherFrame),null);
  assert.equal(robloxPlayer.robloxPlayerEvent(event,null),null);
  assert.equal(robloxPlayer.robloxPlayerEvent({...event,origin:'https://kkeep-roblox-runtime.kha971.chatgpt.site.evil.test'},frame),null);
  for(const data of [null,'play',{type:'jar:set'},{type:'webblox:stat',e:'unexpected'}]){
    assert.equal(robloxPlayer.robloxPlayerEvent({...event,data},frame),null);
  }
});
test('Roblox frame CSS fills its host while the runtime controls rendering resolution',()=>{
  const css=readFileSync(new URL('../app/roblox/roblox.css',import.meta.url),'utf8');
  const declarations=selector=>{
    const rule=css.match(new RegExp('\\.'+selector+'\\{([^}]+)\\}'));
    assert.ok(rule,'stylesheet contains '+selector);
    return Object.fromEntries([...rule[1].matchAll(/([\w-]+):([^;]+);/g)].map(([,name,value])=>[name,value.trim()]));
  };
  const host=declarations('roblox-player'),frame=declarations('roblox-frame');
  assert.equal(host.position,'fixed');assert.equal(host.inset,'0');
  assert.equal(host.width,'100%');assert.equal(host.height,'100dvh');
  assert.equal(frame.width,'100%');assert.equal(frame.height,'100%');
  assert.equal(frame.border,'0');assert.equal(frame.transform,undefined);
});
test('Roblox mobile detection includes iPad desktop Safari without classifying a touch PC as mobile',()=>{
  assert.equal(robloxPlayer.isRobloxMobileDevice({userAgent:'Mozilla/5.0 Macintosh Safari',platform:'MacIntel',maxTouchPoints:5}),true);
  assert.equal(robloxPlayer.isRobloxMobileDevice({userAgent:'Mozilla/5.0 iPhone Safari',platform:'iPhone',maxTouchPoints:5}),true);
  assert.equal(robloxPlayer.isRobloxMobileDevice({userAgent:'Windows Chrome',platform:'Win32',maxTouchPoints:10}),false);
  assert.equal(robloxPlayer.isRobloxMobileDevice({userAgent:'Macintosh Safari',platform:'MacIntel',maxTouchPoints:0}),false);
});
test('Roblox performance preferences reach the actual game hook endpoint',()=>{
  for(const fps of [30,60]){
    const url=new URL(robloxPlayer.robloxGameUrl('71424152509812',fps));
    assert.equal(url.origin,robloxPlayer.robloxOrigin);
    assert.equal(url.pathname,'/_/cGxheS5yb2Jsb3guY29t/games/start');
    assert.equal(url.searchParams.get('placeId'),'71424152509812');
    assert.equal(url.searchParams.get('perf'),'performance');
    assert.equal(url.searchParams.get('fps'),String(fps));
    assert.equal(url.searchParams.get('res'),'auto');
  }
  assert.equal(new URL(robloxPlayer.robloxGameUrl('123')).searchParams.has('perf'),false);
  for(const id of ['0','-1','12&fps=999','https://evil.test','123.4','1'.repeat(21),''])assert.equal(robloxPlayer.robloxGameUrl(id,30),null);
});
test('only a trusted current-frame start event can select the experience for retry',()=>{
  const frame={};
  const event={origin:robloxPlayer.robloxOrigin,source:frame,data:{type:'webblox:stat',e:'play',p:'71424152509812'}};
  assert.equal(robloxPlayer.robloxGamePlaceId(event,frame),'71424152509812');
  assert.equal(robloxPlayer.robloxGamePlaceId(event,{}),null);
  assert.equal(robloxPlayer.robloxGamePlaceId({...event,origin:'https://evil.test'},frame),null);
  assert.equal(robloxPlayer.robloxGamePlaceId({...event,data:{...event.data,e:'exit'}},frame),null);
  for(const p of [1,null,'1&job=bad','-1'])assert.equal(robloxPlayer.robloxGamePlaceId({...event,data:{...event.data,p}},frame),null);
});
test('GhostCloud keeps touch controls and provider detection',()=>{
  assert.equal(providers.cloudProviderForUrl('https://ghost-mathmulti.zeoghost.workers.dev/').id,'ghost');
  assert.equal(providers.supportsTouchControls('ghost'),true);
  assert.equal(providers.supportsTouchControls(undefined),false);
});
test('launches do not import or render a setup prompt',()=>{
  const source=readFileSync(new URL('../components/proxy-browser.tsx',import.meta.url),'utf8');
  assert.doesNotMatch(source,/CloudLaunchGuide|setCloudLaunch|Playing on iPad|BookmarkSetupSteps/);
  assert.match(source,/const openApp=useCallback\(\(app:App,url=app.url\)=>\{setTouchTab\(null\);setLiteMode\(false\);setLite\(false\);open\(url,app\);setExpanded\(true\);\}/);
});

test('runtime failure messages require the exact current Kkeep frame',()=>{
  const frame={};
  const event={source:frame,origin:robloxPlayer.robloxOrigin,data:{type:'kkeep:roblox-runtime',stage:'failed',detail:'memory'}};
  assert.equal(robloxPlayer.robloxRuntimeEvent(event,frame).detail,'memory');
  assert.equal(robloxPlayer.robloxRuntimeEvent({...event,origin:'https://evil.test'},frame),null);
  assert.equal(robloxPlayer.robloxRuntimeEvent({...event,source:{}},frame),null);
  assert.equal(robloxPlayer.robloxRuntimeEvent({...event,data:{...event.data,detail:'private data'}},frame).detail,'');
});
