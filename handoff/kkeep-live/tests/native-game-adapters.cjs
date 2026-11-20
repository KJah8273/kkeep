const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
(async function () {
 for (const id of ['cannon-balls-3d','parking-rush','tower-crash-3d']) {
  const dir = __dirname + '/../public/games/' + id + '/';
  const entry=fs.readFileSync(dir+'index.html','utf8');
  assert.ok(entry.includes('/api/game-public/games/'+id+'/v1.js'), id+' must execute the audited local adapter');
  assert.ok(!entry.includes("'html5games/gameapi/v1.js?e='"), id+' must not fall back to the original SDK');
  let saved, ready=0;
  const callbacks={};
  const context={console, URL, location:{href:"https://kkeep.fun/games/save-frame.html"}, Promise, Date, setTimeout, clearTimeout, famobi_gameID: 'test-game',famobi:{adapters:{run(){}},setVolume(){}},SDK_INTERFACE:{init(settings){this.settings=settings;},settings:{interstitial:{}}}};
  context.window=context;
  context.ytgame={SDK_VERSION:'kkeep-test',game:{loadData:()=>Promise.resolve('{"progress":"stage3"}'),saveData:v=>{saved=v;return Promise.resolve();},gameReady:()=>{ready++;}},engagement:{sendScore:()=>Promise.resolve()},system:{isAudioEnabled:()=>true,onAudioEnabledChange:fn=>callbacks.audio=fn,onPause:fn=>callbacks.pause=fn,onResume:fn=>callbacks.resume=fn}};
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(dir+'sdk_interface.js','utf8')+'\nglobalThis.__test={settings:SDK_INTERFACE_SETTINGS,init:SDK_INTERFACE_INIT,overrides:SDK_INTERFACE_OVERRIDES,reward:SDK_INTERFACE_REWARDED_AD};',context);
  vm.runInContext(fs.readFileSync(dir+'sdk_interface_custom.js','utf8'),context);
  await context.__test.init();
  assert.equal(context.__test.overrides.famobi.localStorage.getItem('progress'),'stage3');
  context.__test.overrides.famobi.localStorage.setItem('progress','stage4');
  await Promise.resolve();
  assert.equal(JSON.parse(saved).progress,'stage4');
  context.__test.overrides.famobi.gameReady();
  await Promise.resolve();
  assert.equal(ready,1);
  assert.equal(await context.__test.reward(),false);
  assert.equal(context.__test.settings.isProd,true);
  assert.equal(context.__test.settings.forceMockObject,false);
  assert.equal(context.__test.settings.rewarded.reward,false);
  assert.equal(context.__test.settings.copyright,undefined);
  assert.equal(context.__test.settings.features.copyright,false);
  assert.equal(context.__test.settings.features.credits,false);
  assert.equal(context.__test.settings.show_splash,false);
  assert.equal(context.__test.settings.menuless,true);
  assert.deepEqual(Object.keys(callbacks).sort(),['audio','pause','resume']);
  console.log(id+': save restore/write + ready + no-reward + lifecycle subscriptions PASS');
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
