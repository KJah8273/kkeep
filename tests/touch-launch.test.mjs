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
const {apps,gamingDestination}=loadTs('../lib/apps.ts',()=>providers);

test('Roblox, Clash Royale and GhostCloud have separate cloud shortcuts',()=>{
  assert.deepEqual(Array.from(apps.filter(app=>app.cloud),app=>app.cloud),['roblox','clash','ghost']);
  assert.deepEqual(Array.from(providers.cloudProviders,app=>app.id),['ghost','roblox','clash']);
  assert.equal(providers.cloudProviderForUrl('https://saugatr-pencil735366.agrointegral.cl/games'),undefined);
  assert.equal(providers.cloudProviderForUrl('https://figurecc.cine-softwares.workers.dev/'),undefined);
});
test('Roblox keeps its original player and shortcut',()=>{
  const roblox=apps.find(app=>app.cloud==='roblox');
  assert.equal(roblox.name,'Roblox');
  assert.equal(roblox.url,'https://kkeep-roblox-private.testerqrr1.chatgpt.site/');
  assert.equal(roblox.path,'/roblox');
  assert.equal(roblox.external,true);
  assert.equal(gamingDestination(roblox.url),roblox.url);
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
