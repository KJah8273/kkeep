import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {transformSync} from 'esbuild';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
function loadTs(file,require){const module={exports:{}};vm.runInNewContext(transformSync(read(file),{loader:'ts',format:'cjs'}).code,{module,exports:module.exports,URL,require});return module.exports;}
const providers=loadTs('lib/touch/providers.ts'),robloxPlayer=loadTs('lib/roblox-player.ts'),{apps,gamingDestination}=loadTs('lib/apps.ts',path=>path==='./roblox-player'?robloxPlayer:providers);

test('Xbox tile and typed cloud URLs always use the isolated V2 launcher',()=>{
  const app=apps.find(item=>item.name==='Xbox Cloud');
  assert.equal(app.url,'https://www.xbox.com/en-us/play');assert.equal(app.engine,'scramjet-v2');assert.equal(app.path,'/xbox/index.html');
  for(const target of ['https://www.xbox.com/en-us/play','https://xbox.com/play','https://www.xbox.com/ar-AE/play/games/fortnite/fixture?source=home'])assert.equal(gamingDestination(target),'/xbox/index.html?launch='+encodeURIComponent(target));
  assert.match(gamingDestination('https://play.geforcenow.com/mall/'),/^\/gfn\/index.html/);
  for(const target of ['https://www.xbox.com.evil.test/en-us/play','https://www.xbox.com/store','https://login.live.com/','https://user:secret@www.xbox.com/en-us/play','http://www.xbox.com/en-us/play'])assert.equal(gamingDestination(target),null);
});
test('Xbox cookie persistence and controller lifecycle cannot select a GeForce session',async()=>{
  for(const file of ['controller.api.js']){
    const source=read('public/xbox/engine/'+file);assert.ok(source.includes('__kkeep_xbox_controller_v2'));assert.ok(!source.includes('__kkeep_gfn_controller_v2'));
  }
  const source=read('public/xbox/engine/controller.sw.js');
  // Read the generated lifecycle itself, including its escaped Xbox route.
  const start=source.indexOf('globalThis.__kkeepCreateXboxLifecycle');
  const end=source.indexOf('\n};',start)+4;assert.ok(start>0&&end>start);
  const context={URL,Map,Promise,setTimeout,clearTimeout,self:{location:new URL('https://kkeep.test/xbox/proxy-sw.js'),clients:{matchAll:async()=>[]}}};context.globalThis=context;
  vm.runInNewContext(source.slice(start,end),context);
  const xbox={id:'same-id',prefix:'/xbox/browse/same-id/'};
  const gfn={id:'same-id',prefix:'/gfn/browse/same-id/'};
  const lifecycle=context.__kkeepCreateXboxLifecycle(()=>[gfn,xbox]);
  assert.equal(lifecycle.find('https://kkeep.test/xbox/browse/same-id/frame/url'),xbox);
  assert.equal(lifecycle.claims('https://kkeep.test/gfn/browse/same-id/frame/url'),false);
  assert.equal(lifecycle.claims('https://other.test/xbox/browse/same-id/frame/url'),false);
});
test('iPad media hook applies to existing and later videos and removes all observers',()=>{
  const listeners=new Map();let observed,disconnected=0;
  const video=()=>({tagName:'VIDEO',attrs:new Map(),setAttribute(k,v){this.attrs.set(k,v);}});
  const first=video(),later=video(),eventVideo=video();
  const doc={querySelectorAll:()=>[first],addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:name=>listeners.delete(name)};
  const window={};class MutationObserver{constructor(fn){observed=fn;}observe(){}disconnect(){disconnected++;}}
  vm.runInNewContext(read('public/xbox/media-compat.js'),{window,MutationObserver});
  const cleanup=window.KkeepXboxMedia.install(doc);
  assert.equal(first.playsInline,true);assert.equal(first.attrs.has('playsinline'),true);
  observed([{addedNodes:[{querySelectorAll:()=>[later]}]}]);assert.equal(later.playsInline,true);
  listeners.get('loadedmetadata')({target:eventVideo});assert.equal(eventVideo.playsInline,true);
  assert.equal(first.muted,undefined,'do not override Xbox audio');
  cleanup();assert.equal(listeners.size,0);assert.equal(disconnected,1);
});

function launcher({secure=true,failOnce=false,launch=''}={}){
  const nodes=new Map(),events={},bodyClasses=new Set(),destinations=[],handles=[];let mounts=0,callbacks;
  const node=id=>{if(!nodes.has(id))nodes.set(id,{hidden:id==='error'||id==='exit-fullscreen',addEventListener(name,fn){this[name]=fn;}});return nodes.get(id);};
  const document={getElementById:node,body:{classList:{toggle(name,value){if(value)bodyClasses.add(name);else bodyClasses.delete(name);}}},documentElement:{},addEventListener(name,fn){events['doc:'+name]=fn;}};
  const window={isSecureContext:secure,$scramjet:{},$scramjetController:{},KkeepXboxMedia:{},KkeepXboxSignIn:{},KkeepXboxSignInStatus:{},KkeepXboxSignInWindow:{isMicrosoft:value=>new URL(value).hostname==='login.live.com'},addEventListener(name,fn){events[name]=fn;},KHAProxy:{setLite(value){assert.equal(value,false);},setAdBlock(){},async mount(_container,c){mounts++;callbacks=c;if(failOnce&&mounts===1)throw Error('Fixture connection failed');const h={go(url){destinations.push(url);c.onNavigate(url);},openSignIn(){this.signins=(this.signins||0)+1;},reload(){this.reloads=(this.reloads||0)+1;},destroy(){this.destroyed=true;}};handles.push(h);return h;}}};
  const history={replaceState(){}};
  vm.runInNewContext(read('public/xbox/app.js'),{window,document,navigator:{serviceWorker:{}},URL,URLSearchParams,location:{origin:'https://kkeep.test',pathname:'/xbox/index.html',search:launch?'?launch='+encodeURIComponent(launch):''},history,localStorage:{getItem:()=>null},Date});
  return {nodes,node,events,bodyClasses,destinations,handles,get mounts(){return mounts;},get callbacks(){return callbacks;}};
}
const settle=()=>new Promise(resolve=>setImmediate(resolve));
test('Xbox startup, Retry, normal scale fullscreen fallback and page restoration',async()=>{
  const h=launcher({failOnce:true});await settle();assert.equal(h.node('error').hidden,false);
  h.node('retry').click();await settle();assert.equal(h.mounts,2);assert.deepEqual(h.destinations,['https://www.xbox.com/en-us/play']);
  h.callbacks.onLoaded();assert.equal(h.node('loading').hidden,true);assert.equal(h.node('error').hidden,true);
  h.node('fullscreen').click();assert.equal(h.bodyClasses.has('immersive'),true);assert.equal(h.node('exit-fullscreen').hidden,false);
  h.node('exit-fullscreen').click();assert.equal(h.bodyClasses.has('immersive'),false);
  h.node('reload').click();assert.equal(h.handles[0].reloads,1);
  h.events.pagehide();assert.equal(h.handles[0].destroyed,true);
  h.events.pageshow({persisted:true});await settle();assert.equal(h.mounts,3);
});
test('Microsoft callback URLs preserve their state and never become a direct-site fallback',async()=>{
  const callback='https://www.xbox.com/auth/msa?code=fixture&state=fixture-state&returnUrl=%2Fen-us%2Fplay';
  const h=launcher({launch:callback});await settle();assert.deepEqual(h.destinations,[callback]);
  h.callbacks.onNavigate(callback);h.node('retry').click();assert.equal(h.handles[0].reloads,1);
  const invalid=launcher({launch:'javascript:alert(1)'});await settle();assert.deepEqual(invalid.destinations,['https://www.xbox.com/en-us/play']);
});
test('insecure preview has a useful error instead of an endless Xbox spinner',async()=>{
  const h=launcher({secure:false});await settle();assert.equal(h.mounts,0);assert.equal(h.node('loading').hidden,true);assert.match(h.node('error-message').textContent,/HTTPS/);
});
test('Microsoft offers the proxy window and a safe startup report without showing tools on Xbox itself',async()=>{
  const h=launcher();await settle();assert.equal(h.node('signin-window').hidden,true);
  h.callbacks.onNavigate('https://login.live.com/oauth20_authorize.srf?state=fixture');
  assert.equal(h.node('signin-window').hidden,false);h.node('signin-window').click();assert.equal(h.handles[0].signins,1);
  h.callbacks.onSignInWindow(true);assert.equal(h.node('signin-note').hidden,false);assert.equal(h.node('loading').hidden,true);
  h.callbacks.onSignInStatus({surface:'frame',kind:'blank',script:'page',rootEmpty:true});assert.match(h.node('connection-report').textContent,/Form container: empty/);
  h.node('return-xbox').click();assert.equal(h.node('signin-window').hidden,true);assert.equal(h.node('signin-note').hidden,true);
});
