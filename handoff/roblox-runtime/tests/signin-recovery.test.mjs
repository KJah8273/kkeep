import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {IDBFactory} from 'fake-indexeddb';
import {transformText} from '../worker/gateway.js';
import {sessionStateTransaction} from '../worker/session-state.js';
import {observeSessionDatabase} from './helpers/observe-session-database.mjs';

const provider=fs.readFileSync(new URL('./fixtures/signin.html',import.meta.url),'utf8');
const controller=fs.readFileSync(new URL('./fixtures/controller.api.js',import.meta.url),'utf8');
const go=controller.match(/go\(e\)\{let t=\(0,i\.Oy\)\(e,this\.context,\{origin:new URL\(location\.href\),base:new URL\(location\.href\)\}\);this\.element\.src=t\}/)?.[0];
assert.ok(go,'execute the actual provider frame navigation method');

function harness({patched=true,verification=false,navigationFails=false,onVerify}={}){
  const html=patched?transformText(provider,'/_rbx/signin','https://runtime.example'):provider;
  const start=html.indexOf('  function showSigning('),end=html.indexOf('</script>',start);
  assert.ok(start>=0&&end>start);
  const storageStart=html.indexOf('  function db(name, store)'),storageEnd=html.indexOf('  const tellSw =',storageStart);
  assert.ok(storageStart>=0&&storageEnd>storageStart,'execute the actual provider database helpers');
  let token='fixture-only-rejected-cookie',tick,verifications=0,finished=0;
  const buttons=[],navigations=[],writes=[],timers=[];
  const classes=new Set();
  const signing={classList:{add:value=>classes.add(value),remove:value=>classes.delete(value)},
    querySelector:()=>buttons[0],querySelectorAll:()=>buttons.slice(),appendChild:button=>buttons.push(button)};
  const message={textContent:''},spinner={style:{display:''}};
  const scope={indexedDB:new IDBFactory(),URL,location:{href:'https://runtime.example/_rbx/signin'},
    frame:{context:{},element:{src:'existing-provider-form'}},
    i:{Oy:url=>{if(navigationFails)throw new Error('synthetic private exception');navigations.push(url);return '/~/sj/fixture/frame/'+encodeURIComponent(url);}},
    $:id=>id==='signing'?signing:message,
    document:{querySelector:()=>spinner,createElement:()=>({remove(){const at=buttons.indexOf(this);if(at>=0)buttons.splice(at,1);}})},
    scramjetToken:async()=>token,
    signedInSure:async()=>{verifications++;await onVerify?.(scope);return verification;},
    tellSw(){},step(){},done(){finished++;},
    setInterval:fn=>{tick=fn;return 1;},setTimeout:fn=>{timers.push(fn);return timers.length;},
  };
  // This suite isolates capture/rejection. The bootstrap suite executes this
  // navigation hook with the real owned-frame watchdog and readiness checks.
  scope.window={__kkeepSignIn:{navigate:frame=>frame.go('https://www.roblox.com/login')}};
  vm.createContext(scope);
  vm.runInContext(html.slice(storageStart,storageEnd),scope);
  scope.db=observeSessionDatabase(scope.db,writes);
  vm.runInContext('frame.go=({'+go+'}).go;\n'+html.slice(start,end),scope);
  return {buttons,navigations,writes,timers,
    get overlay(){return classes.has('on');},get text(){return message.textContent;},
    get formSource(){return scope.frame.element.src;},get verifications(){return verifications;},
    get finished(){return finished;},stored:async()=>await scope.kv('get','token')||null,
    tick:()=>tick(),setVerification:value=>{verification=value;},newLogin(value=true){token='fixture-only-new-cookie';verification=value;},
    click(label){const button=buttons.find(button=>button.textContent===label);assert.ok(button,'button exists: '+label);button.onclick();},
  };
}

test('the actual provider rejection overlay hides the login form and only retries the same rejected cookie',async()=>{
  const h=harness({patched:false});
  await h.tick();
  assert.equal(h.overlay,true);assert.deepEqual(h.buttons.map(button=>button.textContent),['Try again']);
  await h.tick();assert.equal(h.verifications,1);assert.equal(h.overlay,true);
});

test('the first authoritative rejection reveals the existing form once without navigating or recapturing its cookie',async()=>{
  const h=harness();await h.tick();
  assert.equal(h.overlay,false);assert.equal(h.finished,0);assert.equal(await h.stored(),null);
  assert.match(h.text,/could not be verified/);
  assert.deepEqual(h.navigations,[]);
  assert.equal(h.formSource,'existing-provider-form','entered fields and an in-flight challenge keep their current document');
  const writes=h.writes.length;
  await h.tick();await h.tick();
  assert.equal(h.overlay,false);assert.equal(h.verifications,1);
  assert.equal(h.writes.length,writes);assert.equal(h.finished,0);
  assert.equal(h.timers.length,0,'the authoritative rejection does not schedule an automatic auth retry');
});

test('a different valid cookie completes login after the automatic overlay dismissal',async()=>{
  const h=harness();await h.tick();assert.equal(h.overlay,false);
  h.newLogin();await h.tick();
  assert.equal(h.finished,1);assert.equal(h.verifications,2);
  assert.equal(h.buttons.length,0,'recovery controls do not leak into the new verification');
  assert.equal(h.navigations.length,0,'revealing and verifying the existing form does not navigate it');
});

test('a later rejection stays visible and its manual Back keeps the rejected cookie blocked',async()=>{
  const h=harness();await h.tick();assert.equal(h.overlay,false);
  h.newLogin(false);await h.tick();assert.equal(h.overlay,true);
  assert.deepEqual(h.navigations,[],'a second rejection never starts an automatic navigation');
  h.click('Back to sign-in');assert.equal(h.overlay,false);
  assert.deepEqual(h.navigations,['https://www.roblox.com/login']);
  assert.equal(h.formSource,'/~/sj/fixture/frame/https%3A%2F%2Fwww.roblox.com%2Flogin');
  const writes=h.writes.length;
  await h.tick();await h.tick();
  assert.equal(h.verifications,2);assert.equal(h.writes.length,writes);assert.equal(h.overlay,false);
});

test('an obsolete connectivity retry cannot recapture the first authoritatively rejected cookie',async()=>{
  const h=harness({verification:null});await h.tick();
  assert.equal(h.timers.length,1);
  h.click('Try again');h.setVerification(false);await h.tick();
  assert.equal(h.overlay,false);
  h.timers[0]();await h.tick();
  assert.equal(h.verifications,2,'the old timer cannot schedule another verification');
  assert.equal(h.overlay,false);assert.equal(h.finished,0);
});

test('navigation failure keeps recovery visible without exposing raw errors or changing account state',async()=>{
  const h=harness({navigationFails:true});await h.tick();
  h.newLogin(false);await h.tick();assert.equal(h.overlay,true);
  const writes=h.writes.length;
  h.click('Back to sign-in');
  assert.equal(h.overlay,true);assert.equal(h.formSource,'existing-provider-form');
  assert.equal(h.text,'The sign-in page could not reopen. Try again.');
  assert.equal(h.writes.length,writes);assert.equal(h.verifications,2);assert.equal(h.finished,0);
});

test('unknown connectivity remains a retry state and does not claim a rejected login',async()=>{
  const h=harness({verification:null});await h.tick();
  assert.equal(h.overlay,true);assert.equal(h.finished,0);
  assert.deepEqual(h.buttons.map(button=>button.textContent),['Try again']);
  assert.equal(h.navigations.length,0);
});

test('the current connectivity retry still runs after its delay when no newer decision supersedes it',async()=>{
  const h=harness({verification:null});await h.tick();
  h.timers[0]();h.setVerification(false);await h.tick();
  assert.equal(h.verifications,2);assert.equal(h.overlay,false,'unknown connectivity did not consume the one-time authoritative recovery');
  assert.equal(h.buttons.some(button=>button.textContent==='Back to sign-in'),true);
  assert.equal(h.navigations.length,0);assert.equal(h.finished,0);
});

test('losing transfer ownership keeps its recovery visible and never dismisses or replaces the newer session',async()=>{
  const h=harness({onVerify:scope=>sessionStateTransaction(()=>scope.db('rbxjar','kv'),'capture',{token:'fixture-only-other-session'})});
  await h.tick();
  assert.equal(h.overlay,true);assert.match(h.text,/session changed/);
  assert.equal(await h.stored(),'fixture-only-other-session');
  assert.deepEqual(h.writes,['put','put']);assert.equal(h.finished,0);assert.equal(h.navigations.length,0);
});

test('changed sign-in recovery contracts fail closed',()=>{
  for(const changed of [provider.replace('function showSigning(msg, retry)','function showSigning(msg)'),provider.replace('querySelector("button")?.remove()', 'removeRecoveryButtons()')]){
    assert.throws(()=>transformText(changed,'/_rbx/signin','https://runtime.example'),/Provider sign-in startup changed/);
  }
});
