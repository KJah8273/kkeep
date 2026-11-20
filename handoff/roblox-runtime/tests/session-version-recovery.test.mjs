import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {transformText} from '../worker/gateway.js';

const origin='https://runtime.example';
const path='/_rbx/app/app.js';
const exact='Browser session is not ready (session-version)';
const provider=readFileSync(new URL('./fixtures/app-signout.js',import.meta.url),'utf8')+'\n'+
  readFileSync(new URL('./fixtures/app-launch.js',import.meta.url),'utf8')+'\n'+
  readFileSync(new URL('./fixtures/app-error-recovery.js',import.meta.url),'utf8');

// Execute the actual provider error renderer through its actual route catch.
// Only the page request and DOM/location are stand-ins; no account is used.
function harness({patched=true,message=exact,page,topLevel=false,postFailure=false}={}){
  let html='',requests=0;
  const reloads=[],messages=[];
  const location=new URL(origin+'/_rbx/app/?fps=30#/search?q=fixture&tab=people');
  const initialUrl=location.href;
  location.reload=()=>reloads.push(location.href);
  location.replace=()=>{throw new Error('Recovery must retain the current document URL');};
  const failPage=async()=>{requests++;if(page)return page(requests);throw new TypeError(message);};
  const scope={URLSearchParams,location,
    document:{title:''},$page:{set innerHTML(value){html=value;}},
    I:{back:'back',search:'search',x:'x',robux:'robux',logout:'logout'},state:{robux:null},
    pageHome:failPage,pageFriends:failPage,pageSearch:failPage,pageGame:failPage,pageUser:failPage,
    scrollTo(){},
    parent:{location:{reload(){throw new Error('Recovery must not reload the parent');}},
      postMessage(data,target){if(postFailure)throw new Error('Parent not available');messages.push({data:JSON.parse(JSON.stringify(data)),target});}},
    fetch(){throw new Error('Rendering recovery must not send account requests');},
    indexedDB:{open(){throw new Error('Recovery must not change account storage');}},
    localStorage:{clear(){throw new Error('Recovery must not clear storage');}},
  };
  scope.window=scope;
  if(topLevel)scope.parent=scope;
  const context=vm.createContext(scope);
  vm.runInContext(patched?transformText(provider,path,origin):provider,context);
  return {reloads,messages,initialUrl,get html(){return html;},get requests(){return requests;},
    get url(){return location.href;},render:()=>scope.route(),
    setHash(value){location.hash=value;},
    click(label){
      const button=[...html.matchAll(/<button\b[^>]*onclick="([^"]+)"[^>]*>([^<]*)<\/button>/g)]
        .find(match=>match[2]===label);
      assert.ok(button,'rendered recovery action exists: '+label);
      return vm.runInContext(button[1],context);
    }};
}

test('the original provider repeats route-only recovery for the exact version mismatch',async()=>{
  const h=harness({patched:false});await h.render();
  assert.match(h.html,/Browser session is not ready \(session-version\)/);
  await h.click('Try again');
  assert.equal(h.requests,2);assert.deepEqual(h.reloads,[]);
});

test('the exact version mismatch offers only an explicit reload of the current iframe URL',async()=>{
  const h=harness();await h.render();
  assert.match(h.html,/This Roblox page needs an update\.<\/b> Reload to continue\./);
  assert.ok(!h.html.includes('session-version'));
  assert.ok(!h.html.includes('>Try again</button>'));
  assert.equal(h.requests,1);assert.deepEqual(h.reloads,[],'rendering never reloads automatically');
  await h.render();assert.equal(h.requests,2);assert.deepEqual(h.reloads,[]);
  h.click('Reload Roblox');
  assert.deepEqual(h.reloads,[h.initialUrl]);
  assert.equal(h.url,h.initialUrl);assert.equal(h.requests,2,'click reloads instead of replaying an API request');
});

test('ordinary errors and version-message lookalikes retain the original route-only retry',async()=>{
  for(const message of ['session-timeout','Session setup timed out','Browser session is not ready (session-inactive)',
    'Browser session could not control this page','Network request failed','session-version',
    exact+' ',exact+'\n','prefix '+exact,exact.replace('session-version','session-Version')]){
    const h=harness({message}),original=harness({patched:false,message});
    await h.render();await original.render();
    assert.equal(h.html,original.html,'ordinary error output remains unchanged: '+message);
    assert.ok(!h.html.includes('>Reload Roblox</button>'));
    await h.click('Try again');assert.equal(h.requests,2);
    assert.deepEqual(h.reloads,[]);assert.equal(h.url,h.initialUrl);
  }
});

test('ordinary error details keep the provider escaping and cannot introduce another click action',async()=>{
  const message='<img src=x onerror="location.reload()"> & \'fixture\'';
  const h=harness({message});await h.render();
  assert.ok(!h.html.includes('<img'));
  assert.match(h.html,/&lt;img src=x onerror=&quot;location\.reload\(\)&quot;&gt; &amp; &#39;fixture&#39;/);
  assert.deepEqual(h.reloads,[]);
  await h.click('Try again');assert.equal(h.requests,2);assert.deepEqual(h.reloads,[]);
});

test('current catalog errors notify only the approved parents with a bounded reason',async()=>{
  const cases=[
    [exact,'version'],
    ['session-timeout','connection'],
    ['session-request','connection'],
    ['Session setup timed out','connection'],
    ['Service worker unavailable','connection'],
    ['Browser session is not ready (session-inactive)','connection'],
    ['Browser session is not ready (session-timeout)','connection'],
    ['Browser session response failed','connection'],
    ['Browser session could not control this page','connection'],
    ['Network request failed','connection'],
    ['Failed to fetch','connection'],
    ['Load failed','connection'],
    ["couldn't reach Roblox",'connection'],
    ['request failed (403)','catalog'],
    [exact+' ','catalog'],
    ['private fixture data https://fixture.invalid/?token=do-not-forward','catalog'],
  ];
  for(const [message,detail] of cases){
    const h=harness({message});await h.render();
    assert.deepEqual(h.messages,[
      {data:{type:'kkeep:roblox-runtime',stage:'catalog-failed',detail},target:'https://kkeep.fun'},
      {data:{type:'kkeep:roblox-runtime',stage:'catalog-failed',detail},target:'https://kkeep.kha971.chatgpt.site'},
    ]);
    assert.equal(h.requests,1,'reporting does not replay the route or an account request');
    assert.deepEqual(h.reloads,[]);assert.equal(h.url,h.initialUrl);
  }
});

test('a successful current route reports catalog readiness after the request completes',async()=>{
  let resolvePage;
  const h=harness({page:()=>new Promise(resolve=>{resolvePage=resolve;})});
  const pending=h.render();
  assert.deepEqual(h.messages,[],'a started request is not a ready catalog');
  resolvePage();await pending;
  assert.deepEqual(h.messages.map(message=>message.data),[
    {type:'kkeep:roblox-runtime',stage:'catalog-ready',detail:''},
    {type:'kkeep:roblox-runtime',stage:'catalog-ready',detail:''},
  ]);
  assert.equal(h.requests,1);assert.deepEqual(h.reloads,[]);
});

test('an explicit route retry can clear a catalog failure without any automatic request',async()=>{
  const h=harness({page:request=>{if(request===1)throw new TypeError('Network request failed');}});
  await h.render();
  assert.equal(h.requests,1);assert.deepEqual(h.messages.map(message=>message.data.stage),['catalog-failed','catalog-failed']);
  await h.click('Try again');
  assert.equal(h.requests,2);assert.deepEqual(h.messages.map(message=>message.data.stage),['catalog-failed','catalog-failed','catalog-ready','catalog-ready']);
  assert.deepEqual(h.reloads,[]);
});

test('a late earlier route cannot announce readiness, failure or replace the current error',async()=>{
  for(const sameHash of [false,true])for(const oldFails of [false,true]){
    const pendingPages=[];
    const h=harness({page:()=>new Promise((resolve,reject)=>pendingPages.push({resolve,reject}))});
    const oldRoute=h.render();
    if(!sameHash)h.setHash('#/friends');
    const currentRoute=h.render();
    pendingPages[1].reject(new Error('current route failed'));
    await currentRoute;
    const currentHtml=h.html,currentMessages=JSON.stringify(h.messages);
    if(oldFails)pendingPages[0].reject(new Error('obsolete route failed'));
    else pendingPages[0].resolve();
    await oldRoute;
    assert.equal(h.html,currentHtml);assert.equal(JSON.stringify(h.messages),currentMessages);
    assert.equal(h.requests,2);assert.deepEqual(h.reloads,[]);
  }
});

test('a changed hash suppresses the old outcome before the next route callback starts',async()=>{
  for(const fails of [false,true]){
    let complete,reject;
    const h=harness({page:()=>new Promise((resolve,no)=>{complete=resolve;reject=no;})});
    const pending=h.render();h.setHash('#/friends');
    if(fails)reject(new Error('obsolete error'));else complete();
    await pending;
    assert.deepEqual(h.messages,[]);assert.equal(h.html,'');assert.equal(h.requests,1);
  }
});

test('sign-out transitions, top-level pages and unavailable parents do not create recovery side effects',async()=>{
  const signedOut=harness({message:'signed out'});await signedOut.render();
  assert.deepEqual(signedOut.messages,[]);assert.equal(signedOut.html,'');
  for(const options of [{topLevel:true},{postFailure:true}]){
    const h=harness(options);await h.render();
    assert.deepEqual(h.messages,[]);assert.match(h.html,/This Roblox page needs an update/);
    assert.equal(h.requests,1);assert.deepEqual(h.reloads,[]);
  }
});

test('a changed or duplicate provider recovery contract fails closed and unrelated scripts stay unchanged',()=>{
  const renderer=provider.split('\n').find(line=>line.startsWith('const failed = '));
  assert.ok(renderer);
  for(const changed of [provider.replace('onclick="route()"','onclick="changedRoute()"'),provider+'\n'+renderer]){
    assert.throws(()=>transformText(changed,path,origin),/Provider session recovery changed/);
  }
  const route=provider.slice(provider.indexOf('async function route() {'),provider.indexOf('window.route = route;'));
  for(const changed of [provider.replace('else await pageHome();','else await changedPageHome();'),provider+'\n'+route]){
    assert.throws(()=>transformText(changed,path,origin),/Provider catalog status changed/);
  }
  assert.equal(transformText(provider,'/unrelated.js',origin),provider);
});
