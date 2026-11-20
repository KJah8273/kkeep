import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {transformText} from '../worker/gateway.js';

const provider=readFileSync(new URL('./fixtures/app-signout.js',import.meta.url),'utf8')+'\n'+
  readFileSync(new URL('./fixtures/app-launch.js',import.meta.url),'utf8')+'\n'+
  readFileSync(new URL('./fixtures/app-cached-pages.js',import.meta.url),'utf8')+'\n'+
  readFileSync(new URL('./fixtures/app-error-recovery.js',import.meta.url),'utf8');

function harness({patched=true,jar=true,replies=[200],pageReplies=[]}={}){
  const calls=[],messages=[],buttons=[],queries=[];let transitions=0,confirmCalls=0;
  const button=()=>({disabled:false,attributes:new Map(),
    setAttribute(name,value){this.attributes.set(name,value);},
    removeAttribute(name){this.attributes.delete(name);}});
  const scope={JAR:jar,confirm:()=>{confirmCalls++;if(patched)throw new Error('Native dialog must not open');return true;},location:{href:'/unchanged'},
    I:{back:'back',search:'search',x:'x',robux:'robux',logout:'logout'},state:{robux:null},esc:value=>String(value),
    document:{querySelectorAll(selector){assert.equal(selector,'button[onclick="signOut()"]');return buttons;}},
    $page:{set innerHTML(html){render(html);}},URLSearchParams,
    img:()=>'',at:()=>'',fmt:value=>String(value),loading:()=>'<div>Loading</div>',
    api:async path=>{queries.push(path);assert.ok(pageReplies.length);return await pageReplies.shift();},
    apiUrl:path=>'/_rbx/api'+path.replace(/^\/api/,''),
    toast:message=>messages.push(message),toSignIn:()=>{transitions++;},
    fetch:async(url,options)=>{
      calls.push({url,method:options.method});
      assert.ok(replies.length,'fixture supplies every logout response');
      const next=await replies.shift();
      if(next instanceof Error)throw next;
      // A valid 204 must not require a JSON body to confirm the request.
      return new Response(null,{status:next});
    },
  };
  scope.window=scope;
  vm.createContext(scope);
  vm.runInContext(patched?transformText(provider,'/_rbx/app/app.js','https://runtime.example'):provider,scope);
  const render=(html=scope.topRow())=>{
    const current=button();
    const tag=html.match(/<button[^>]+onclick="signOut\(\)"[^>]*>/)?.[0];
    assert.ok(tag,'the actual provider header renders its sign-out control');
    current.disabled=/\sdisabled(?:\s|>)/.test(tag);
    if(tag.includes('aria-busy="true"'))current.setAttribute('aria-busy','true');
    buttons.splice(0,buttons.length,current);
    return html;
  };
  render();
  return {calls,messages,queries,render,signOut:()=>scope.signOut(),get button(){return buttons[0];},
    search:tab=>scope.pageSearch(new URLSearchParams({q:'fixture',tab})),profile:()=>scope.pageUser('123'),
    get confirmCalls(){return confirmCalls;},get transitions(){return transitions;},get location(){return scope.location.href;}};
}

test('actual provider sign-out reproduces a false transition after failed HTTP or network requests',async()=>{
  for(const reply of [503,new TypeError('fixture request failure')]){
    const h=harness({patched:false,replies:[reply]});
    await h.signOut();
    assert.equal(h.transitions,1);assert.equal(h.messages.length,0);assert.equal(h.calls.length,1);
    assert.equal(h.confirmCalls,1);
  }
});

test('failed logout stays in the catalog with a fixed retry message and no automatic DELETE replay',async()=>{
  for(const reply of [401,403,429,500,503,new TypeError('fixture request failure')]){
    const h=harness({replies:[reply]});
    await h.signOut();await Promise.resolve();
    assert.equal(h.transitions,0);assert.equal(h.location,'/unchanged');
    assert.equal(h.confirmCalls,0);assert.equal(h.button.disabled,false);assert.equal(h.button.attributes.has('aria-busy'),false);
    assert.deepEqual(h.calls,[{url:'/_rbx/api/session',method:'DELETE'}]);
    assert.deepEqual(h.messages,['Sign-out could not be confirmed. Check your connection and try again.']);
  }
});

test('successful 200 and empty 204 logout responses retain the normal sign-in transition',async()=>{
  for(const status of [200,204]){
    const h=harness({replies:[status]});
    await h.signOut();
    assert.equal(h.transitions,1);assert.equal(h.messages.length,0);assert.equal(h.calls.length,1);
    assert.equal(h.confirmCalls,0);assert.equal(h.button.disabled,true);
    assert.equal(h.button.attributes.get('aria-busy'),'true');
  }
});

test('a user can retry a failed logout manually without a native confirmation dialog',async()=>{
  const retry=harness({replies:[503,204]});
  await retry.signOut();assert.equal(retry.transitions,0);assert.equal(retry.calls.length,1);
  await retry.signOut();assert.equal(retry.transitions,1);assert.equal(retry.calls.length,2);
  assert.equal(retry.confirmCalls,0);
});

test('rapid repeat actions issue one DELETE and keep the control disabled through a successful transition',async()=>{
  let complete;const reply=new Promise(resolve=>complete=resolve);
  const h=harness({replies:[reply]});
  const first=h.signOut(),second=h.signOut();
  assert.equal(h.calls.length,1);assert.equal(h.button.disabled,true);assert.equal(h.confirmCalls,0);
  assert.equal(h.button.attributes.get('aria-busy'),'true');
  await second;assert.equal(h.transitions,0);
  h.render();assert.equal(h.button.disabled,false,'cached header markup must not contain a pending snapshot');
  await h.signOut();assert.equal(h.calls.length,1);assert.equal(h.button.disabled,true);
  assert.equal(h.button.attributes.get('aria-busy'),'true');
  complete(204);await first;
  assert.equal(h.transitions,1);assert.equal(h.button.disabled,true);
  h.render();await h.signOut();
  assert.equal(h.calls.length,1);assert.equal(h.transitions,1);assert.equal(h.button.disabled,true);
});

test('failure re-enables the current header after catalog navigation replaced the clicked control',async()=>{
  for(const response of [503,new TypeError('fixture request failure')]){
    let complete;const reply=new Promise(resolve=>complete=resolve);
    const h=harness({replies:[reply,204]});
    const old=h.button,request=h.signOut();
    assert.equal(old.disabled,true);
    h.render();assert.notEqual(h.button,old);assert.equal(h.button.disabled,false);
    await h.signOut();assert.equal(h.button.disabled,true);assert.equal(h.calls.length,1);
    complete(response);await request;
    assert.equal(h.button.disabled,false);assert.equal(h.button.attributes.has('aria-busy'),false);
    assert.equal(h.transitions,0);assert.equal(h.calls.length,1);assert.equal(h.messages.length,1);
    h.render();assert.equal(h.button.disabled,false);assert.equal(h.button.attributes.has('aria-busy'),false);
    await h.signOut();assert.equal(h.transitions,1);assert.equal(h.calls.length,2);
  }
});

test('actual async search and profile pages cannot restore stale disabled markup after a failed logout',async()=>{
  for(const kind of ['experiences','people','profile'])for(const pageCompletesFirst of [false,true]){
    let endLogout,endPage;
    const logout=new Promise(resolve=>endLogout=resolve),page=new Promise(resolve=>endPage=resolve);
    const h=harness({replies:[logout,204],pageReplies:[page]});
    const request=h.signOut();
    const navigation=kind==='profile'?h.profile():h.search(kind);
    assert.equal(h.queries.length,1);assert.equal(h.button.disabled,false);
    await h.signOut();assert.equal(h.button.disabled,true);assert.equal(h.calls.length,1);
    const data=kind==='profile'?{id:123,name:'Fixture',status:'You'}:{users:[],games:[]};
    if(pageCompletesFirst){
      endPage(data);await navigation;
      assert.equal(h.button.disabled,false);
      await h.signOut();assert.equal(h.button.disabled,true);assert.equal(h.calls.length,1);
      endLogout(503);await request;
    }else{
      endLogout(503);await request;assert.equal(h.button.disabled,false);
      endPage(data);await navigation;
    }
    assert.equal(h.button.disabled,false,'cached pre-await header remains usable after failure');
    assert.equal(h.button.attributes.has('aria-busy'),false);
    assert.equal(h.transitions,0);assert.equal(h.calls.length,1);assert.equal(h.messages.length,1);
    await h.signOut();assert.equal(h.transitions,1);assert.equal(h.calls.length,2);
  }
});

test('the standalone provider destination remains unchanged after a confirmed logout',async()=>{
  const h=harness({jar:false,replies:[204]});
  await h.signOut();
  assert.equal(h.transitions,0);assert.equal(h.location,'/');assert.equal(h.calls.length,1);
});

test('changed or duplicate sign-out contracts fail closed without changing other app sources',()=>{
  for(const changed of [provider.replace('method: "DELETE"','method: "POST"'),provider.replace('if (JAR)','if (OTHER)'),
    provider.replace('onclick="signOut()"','onclick="changedSignOut()"'),provider+provider]){
    assert.throws(()=>transformText(changed,'/_rbx/app/app.js','https://runtime.example'),/Provider sign-out handling changed/);
  }
  assert.equal(transformText(provider,'/unrelated.js','https://runtime.example'),provider);
});
