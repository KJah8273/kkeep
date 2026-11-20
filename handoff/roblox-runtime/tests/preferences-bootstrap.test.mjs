import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {preferencesBootstrap} from '../worker/preferences.js';
import {transformText,responseHeaders,UPSTREAM} from '../worker/gateway.js';
import worker from '../worker/index.js';

const origin='https://runtime.example';
const catalog='/_rbx/app/';
const game='/_/cGxheS5yb2Jsb3guY29t/games/start';
const ipad={userAgent:'Mozilla/5.0 Macintosh Safari',platform:'MacIntel',maxTouchPoints:5};
const hook=transformText(readFileSync(new URL('./fixtures/hook.js',import.meta.url),'utf8'),'/hook.js',origin);
const profileStart=hook.indexOf('  function setupPerf() {');
const profileEnd=hook.indexOf('    // Only the game page gets the engine tweaks;',profileStart);
assert.ok(profileStart>=0&&profileEnd>profileStart);
const fixture=name=>readFileSync(new URL('./fixtures/'+name,import.meta.url),'utf8');
const catalogSource=fixture('app-signout.js')+'\n'+fixture('app-error-recovery.js')+'\n'+fixture('app-launch.js');

function browser({device=ipad,storage='available',cookies='available',initial={},initialCookies={}}={}){
  const values=new Map(Object.entries(initial)),jar=new Map(Object.entries(initialCookies));
  const localStorage={
    getItem(key){if(storage==='blocked')throw new Error('Storage unavailable');return values.get(key)??null;},
    setItem(key,value){if(storage!=='available')throw new Error('Storage unavailable');values.set(key,value);},
    removeItem(key){if(storage!=='available')throw new Error('Storage unavailable');values.delete(key);},
  };
  function open(path){
    const replaced=[],navigations=[],requests=[],messages=[],document={referrer:''};
    let location=new URL(path,origin);
    const browserLocation={get href(){return location.href;},set href(value){navigations.push(value);location=new URL(value,location);},get search(){return location.search;}};
    Object.defineProperty(document,'cookie',{
      get(){if(cookies==='throws')throw new Error('Cookies unavailable');return cookies==='blocked'?'':[...jar].map(([key,value])=>key+'='+value).join('; ');},
      set(value){if(cookies==='throws')throw new Error('Cookies unavailable');if(cookies!=='available')return;const pair=value.split(';')[0],at=pair.indexOf('=');jar.set(pair.slice(0,at),pair.slice(at+1));},
    });
    const context=vm.createContext({URL,URLSearchParams,document,location:browserLocation,localStorage,
      navigator:{...device,hardwareConcurrency:6,gpu:{}},sessionStorage:{getItem:()=>null},
      history:{state:{keep:true},replaceState(state,title,url){replaced.push({state,title,url});location=new URL(url,location);}},
      setupPacer(){throw new Error('Preference bootstrap must not start frame pacing');},
      fetch(){throw new Error('Preference bootstrap must not make requests');},
    });
    context.window=context;
    return {get location(){return location;},replaced,navigations,requests,messages,
      bootstrap(){vm.runInContext('('+preferencesBootstrap.toString()+')()',context);},
      profile(){vm.runInContext(hook.slice(profileStart,profileEnd)+'\n};setupPerf();',context);return context.__rbxPerf;},
      launch({returned='/play/123?job=chosen-server',placeId='123',job='chosen-server',patched=true}={}){
        context.JAR=true;context.framed=false;context.toast=message=>messages.push(message);
        context.api=async path=>{requests.push(path);if(returned instanceof Error)throw returned;return {url:returned};};
        vm.runInContext(patched?transformText(catalogSource,'/_rbx/app/app.js',origin):catalogSource,context);
        return context.launch(placeId,job,{disabled:false,textContent:''});
      },
    };
  }
  return {open,values,jar};
}

test('the catalog selection reaches the first provider join before its hook without replaying that join',()=>{
  const b=browser({initial:{'rbxweb.fps':'60'}});
  const menu=b.open(catalog+'?fps=30');menu.bootstrap();
  assert.equal(menu.replaced.length,0);
  assert.equal(b.values.get('rbxweb.fps'),'30','the main selection replaces the older automatic runtime default');
  const page=b.open(game+'?placeId=123&job=selected-server&launchId=original');
  page.bootstrap();
  assert.equal(page.replaced.length,1,'one in-place history update, no second game document');
  assert.equal(page.location.searchParams.get('placeId'),'123');
  assert.equal(page.location.searchParams.get('job'),'selected-server');
  assert.equal(page.location.searchParams.get('launchId'),'original');
  assert.equal(page.location.searchParams.get('fps'),'30');
  assert.equal(page.profile().fps,'30','the actual transformed provider hook receives the same cap');
});

test('an unconfigured iPad defaults to 30 while other device defaults remain 60',()=>{
  for(const [device,expected] of [
    [ipad,'30'],[{userAgent:'iPad Safari',platform:'iPad',maxTouchPoints:5},'30'],
    [{userAgent:'iPhone Safari',platform:'iPhone',maxTouchPoints:5},'60'],
    [{userAgent:'Android Chrome',platform:'Linux armv8l',maxTouchPoints:5},'60'],
    [{userAgent:'Windows Chrome',platform:'Win32',maxTouchPoints:10},'60'],
    [{userAgent:'Macintosh Safari',platform:'MacIntel',maxTouchPoints:0},'60'],
  ]){
    const page=browser({device}).open(game+'?placeId=123');page.bootstrap();
    assert.equal(page.profile().fps,expected);
  }
});

test('an explicit current game FPS overrides stored preferences',()=>{
  for(const fps of ['30','60']){
    const other=fps==='30'?'60':'30';
    const page=browser({initial:{'rbxweb.fps':other},initialCookies:{rbxfps:other}}).open(game+'?placeId=123&fps='+fps);
    page.bootstrap();assert.equal(page.profile().fps,fps);
  }
});

test('the actual catalog, public redirect and provider hook retain FPS with no referrer and unavailable storage',async t=>{
  const delivered=[];
  t.mock.method(globalThis,'fetch',async(url)=>{delivered.push(new URL(url));return new Response(null,{status:302,headers:{location:game+'?placeId=123&launchId=original'}});});
  const job='11111111-1111-4111-8111-111111111111';
  for(const storage of ['blocked','readonly'])for(const cookies of ['available','blocked','readonly'])for(const fps of ['30','60']){
    const other=fps==='30'?'60':'30';
    const b=browser({storage,cookies,initial:{'rbxweb.fps':other},initialCookies:{rbxfps:other}});
    const menu=b.open(catalog+'?fps='+fps);menu.bootstrap();
    await menu.launch({returned:'/play/123?job='+job,job});
    assert.deepEqual(menu.requests,['/api/launch?placeId=123&job='+job],'the original account API is called exactly once');
    assert.equal(menu.navigations.length,1,'one existing navigation, no preference reload');
    const play=new URL(menu.navigations[0]);
    assert.equal(play.pathname,'/play/123','the browser worker still sees its server-selection step');
    assert.equal(play.searchParams.get('job'),job);
    assert.equal(play.searchParams.get('fps'),fps);
    const redirect=await worker.fetch(new Request(play));
    assert.equal(redirect.status,302);assert.equal(redirect.headers.get('referrer-policy'),'no-referrer');
    const page=b.open(redirect.headers.get('location'));page.bootstrap();
    assert.equal(page.location.searchParams.get('fps'),fps);
    assert.equal(page.profile().fps,fps);
    assert.equal(page.replaced.length,1);
    assert.equal(page.navigations.length,0);
    assert.equal(page.location.searchParams.get('placeId'),'123');
    assert.equal(page.location.searchParams.get('launchId'),'original');
  }
  assert.equal(delivered.length,12,'no hidden redirect or API retries');
  assert.ok(delivered.every(url=>url.origin===UPSTREAM&&url.pathname==='/play/123'&&url.searchParams.get('job')===job));
});

test('the original no-referrer launch loses an explicit 60 FPS choice when all persistence is blocked',async()=>{
  for(const patched of [false,true]){
    const b=browser({storage:'blocked',cookies:'blocked'}),menu=b.open(catalog+'?fps=60');menu.bootstrap();
    await menu.launch({patched});
    const redirected=responseHeaders({location:game+'?placeId=123'},origin,new URL(menu.navigations[0],origin));
    assert.equal(redirected.get('referrer-policy'),'no-referrer');
    const page=b.open(redirected.get('location'));page.bootstrap();
    assert.equal(page.profile().fps,patched?'60':'30');
    assert.equal(menu.requests.length,1);assert.equal(menu.navigations.length,1);
  }
});

test('catalog launch uses its resolved in-memory FPS without a query or writable storage',async()=>{
  for(const fps of ['30','60']){
    const menu=browser({storage:'readonly',cookies:'blocked',initial:{'rbxweb.fps':fps}}).open(catalog);
    menu.bootstrap();await menu.launch();
    assert.equal(new URL(menu.navigations[0]).searchParams.get('fps'),fps);
  }
});

test('catalog launch preserves valid returned FPS and leaves foreign or invalid destinations unchanged',async()=>{
  for(const returned of [
    '/play/123?job=original&fps=60',game+'?placeId=123&fps=60',
    'https://foreign.example/play/123','https://foreign.example'+game+'?placeId=123',
    origin+'/_rbx/signin',origin+game+'/other?placeId=123',origin+game+'?placeId=invalid',
    '/play/0','/play/123/','javascript:void(0)','not a URL',
  ]){
    const menu=browser({storage:'blocked',cookies:'blocked'}).open(catalog+'?fps=30');menu.bootstrap();
    await menu.launch({returned});assert.deepEqual(menu.navigations,[returned]);assert.equal(menu.requests.length,1);
  }
});

test('redirect FPS inheritance requires the exact same game and preserves an explicit returned cap',()=>{
  const request=new URL(origin+'/play/123?fps=30');
  for(const [destination,source,expected] of [
    [game+'?placeId=123',request,'30'],[game+'?placeId=123&fps=60',request,'60'],
    [game+'?placeId=456',request,null],[game+'?placeId=123',new URL(origin+'/other?fps=30'),null],
    [game+'?placeId=123',new URL('https://foreign.example/play/123?fps=30'),null],
    [game+'?placeId=123',new URL(origin+'/play/123?fps=45'),null],
    [game+'/other?placeId=123',request,null],['https://foreign.example'+game+'?placeId=123',request,null],
  ]){
    const headers=responseHeaders({location:destination},origin,source);
    assert.equal(new URL(headers.get('location'),origin).searchParams.get('fps'),expected);
    assert.equal(headers.get('referrer-policy'),'no-referrer');
  }
});

test('catalog launch errors stay on the existing page with no retry or navigation',async()=>{
  const menu=browser().open(catalog+'?fps=30');menu.bootstrap();
  await menu.launch({returned:new Error('Fixture unavailable')});
  assert.equal(menu.requests.length,1);assert.deepEqual(menu.navigations,[]);assert.deepEqual(menu.messages,['Fixture unavailable']);
});

test('changed or duplicated provider launch assignments fail closed',()=>{
  const changed=catalogSource.replace('try { location.href = (await api(', 'try { location.href=(await api(');
  for(const source of [changed,catalogSource+'\n'+fixture('app-launch.js')])assert.throws(()=>transformText(source,'/_rbx/app/app.js',origin),/Provider catalog launch changed/);
});

test('saved explicit choices stay intact when no current launch choice exists, with cookie fallback if storage is unavailable',()=>{
  for(const fps of ['30','60']){
    const other=fps==='30'?'60':'30';
    const saved=browser({initial:{'rbxweb.fps':fps},initialCookies:{rbxfps:other}}).open(game+'?placeId=123');
    saved.bootstrap();assert.equal(saved.profile().fps,fps);
    const cookie=browser({storage:'blocked',initialCookies:{rbxfps:fps}}).open(game+'?placeId=123');
    cookie.bootstrap();assert.equal(cookie.profile().fps,fps);
  }
});

test('throwing cookie and storage access cannot prevent explicit settings from reaching the same game document',()=>{
  const page=browser({storage:'blocked',cookies:'throws'}).open(game+'?placeId=123&job=unchanged&fps=60');
  assert.doesNotThrow(()=>page.bootstrap());
  assert.equal(page.replaced.length,1);
  assert.equal(page.location.searchParams.get('job'),'unchanged');
  assert.equal(page.location.searchParams.get('fps'),'60');
  assert.equal(page.location.searchParams.get('perf'),'performance');
});
