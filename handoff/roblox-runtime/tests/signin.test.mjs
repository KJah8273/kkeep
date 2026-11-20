import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {signinBootstrap} from '../worker/signin.js';
import {transformText} from '../worker/gateway.js';

const provider=fs.readFileSync(new URL('./fixtures/signin.html',import.meta.url),'utf8');
const controllerSource=fs.readFileSync(new URL('./fixtures/controller.api.js',import.meta.url),'utf8');
const go=controllerSource.match(/go\(e\)\{let t=\(0,i\.Oy\)\(e,this\.context,\{origin:new URL\(location\.href\),base:new URL\(location\.href\)\}\);this\.element\.src=t\}/)?.[0];
assert.ok(go,'execute the actual provider frame navigation method');
const transformed=transformText(provider,'/_rbx/signin','https://runtime.example');
const initialNavigation=transformed.match(/^  window\.__kkeepSignIn\.navigate\(frame\);$/m)?.[0];
const backNavigation=transformed.match(/        back\.onclick = \(\) => \{[\s\S]*?\n        \};/)?.[0];
assert.ok(initialNavigation&&backNavigation,'execute both real transformed navigation call sites');

function harness(ready=async()=>{}) {
 let time=0, next=0, reloads=0, valueReads=0;
 const timers=new Map(), elements=[], events=[], calls=[], swListeners={}, pageListeners={}, navigations=[];
 function element(tag,id='') {
  const classes=new Set(), listeners=new Map();
  const node={tag,id,isConnected:true,style:{},children:[],listeners,classList:{add:v=>classes.add(v),remove:v=>classes.delete(v),contains:v=>classes.has(v)},
   append(...items){this.children.push(...items);},querySelector(){return this.children.find(n=>n.classList.contains('spin'));},
   remove(){this.isConnected=false;},addEventListener(type,fn){if(!listeners.has(type))listeners.set(type,new Set());listeners.get(type).add(fn);},
   removeEventListener(type,fn){listeners.get(type)?.delete(fn);},emit(type){for(const fn of [...listeners.get(type)||[]])fn();}};
  elements.push(node);return node;
 }
 function frameDocument({form=true,readyState='complete',url='https://www.roblox.com/login'}={}) {
  const controls={}, listeners=new Map();
  const doc={URL:url,readyState,getElementById:id=>controls[id],
   querySelectorAll:()=>Object.values(controls),
   addEventListener(type,fn){if(!listeners.has(type))listeners.set(type,new Set());listeners.get(type).add(fn);},
   removeEventListener(type,fn){listeners.get(type)?.delete(fn);},
   emit(type){for(const fn of [...listeners.get(type)||[]])fn();}};
  if(form) {
   const formNode={ownerDocument:doc,querySelectorAll:selector=>selector==='button[type="submit"]'&&controls.submit.type==='submit'?[controls.submit]:[]};
   const control=(props)=>({ownerDocument:doc,isConnected:true,form:formNode,disabled:false,readOnly:false,
    getBoundingClientRect:()=>({width:320,height:20}),...props});
   controls['login-username']=control({name:'username',type:'text'});
   controls['login-password']=control({name:'password',type:'password'});
   controls.submit=control({tagName:'BUTTON',id:'login-button',type:'button',disabled:true,textContent:'Localized login label'});
   controls['login-button']=controls.submit;
   for(const item of new Set(Object.values(controls)))Object.defineProperty(item,'value',{get(){valueReads++;throw new Error('Input values must not be read');}});
  }
  return Object.assign(doc,{controls});
 }
 const loading=element('div','loading'), message=element('p','msg'), spinner=element('div');
 spinner.classList.add('spin');loading.append(spinner,message);
 const frameElement=element('iframe','frame');frameElement.contentWindow={};frameElement.src='about:blank';frameElement.contentDocument=frameDocument({form:false,url:'about:blank'});
 const signing=element('div','signing');element('p','smsg');
 const frame={element:frameElement,context:{}};
 const document={readyState:'complete',getElementById:id=>elements.find(n=>n.id===id&&n.isConnected),createElement:element,addEventListener:(type,fn)=>{pageListeners[type]=fn;}};
 const serviceWorker={controller:{scriptURL:'https://runtime.example/_jar/sw.js?kk=join18'},addEventListener:(type,fn)=>{swListeners[type]=fn;}};
 const scope={document,navigator:{serviceWorker},parent:{postMessage:(data,target)=>events.push({data,target})},
  location:{origin:'https://runtime.example',href:'https://runtime.example/_rbx/signin',reload:()=>reloads++},
  addEventListener:(type,fn)=>{pageListeners[type]=fn;},__kkeepSessionReady:async controlled=>{calls.push(controlled);return ready();}};
 const back={};
 const context={scope,window:scope,frame,back,location:scope.location,URL,$:id=>document.getElementById(id),
  i:{Oy:url=>{navigations.push(url);return '/~/sj/owned123/frame123/'+encodeURIComponent(url);}},
  setTimeout:(fn,ms)=>{const id=++next;timers.set(id,{fn,at:time+ms});return id;},clearTimeout:id=>timers.delete(id)};
 vm.createContext(context);
 vm.runInContext('frame.go=({'+go+'}).go;\n('+signinBootstrap.toString()+')(scope);\n'+backNavigation,context);
 async function advance(ms) {
  for(let i=0;i<40;i++)await Promise.resolve();
  const end=time+ms;
  for(;;){
   const due=[...timers].filter(([,t])=>t.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];
   if(!due)break;
   time=due[1].at;timers.delete(due[0]);due[1].fn();
   for(let i=0;i<40;i++)await Promise.resolve();
  }
  time=end;
  for(let i=0;i<40;i++)await Promise.resolve();
 }
 return {scope,events,calls,loading,message,spinner,elements,advance,serviceWorker,swListeners,pageListeners,frame,frameDocument,navigations,timers,
  get reloads(){return reloads;},get valueReads(){return valueReads;},
  setDocument(doc,{load=true}={}){frameElement.contentDocument=doc;if(load)frameElement.emit('load');},
  async start(controller={wait:async()=>{}}){await scope.__kkeepSignIn.prepare();await scope.__kkeepSignIn.connect(controller);vm.runInContext(initialNavigation,context);},
  back(){signing.classList.add('on');back.onclick();},
 };
}

test('sign-in waits for document control and reports actual startup without claiming authentication',async()=>{
 const h=harness();
 await h.start();
 assert.deepEqual(h.calls,[true]);
 assert.ok(h.events.every(e=>e.data.stage==='session-ready'&&e.data.detail===''));
 assert.ok(h.events.every(e=>['https://kkeep.fun','https://kkeep.kha971.chatgpt.site'].includes(e.target)));
 h.setDocument(h.frameDocument());await h.advance(90000);
 assert.equal(h.loading.classList.contains('done'),true);
 assert.equal(h.reloads,0);
 assert.equal(h.events.some(e=>e.data.stage==='session-failed'),false);
 assert.equal(h.valueReads,0);
 assert.equal(h.timers.size,0,'a ready form releases all startup observers');
});

test('a stalled service-worker setup reaches recovery without reload or storage reset',async()=>{
 const h=harness(()=>new Promise(()=>{}));
 const failure=assert.rejects(h.scope.__kkeepSignIn.prepare(),/timed out/);
 await h.advance(139000);await failure;
 assert.equal(h.reloads,0);
 assert.equal(h.loading.classList.contains('done'),false);
 assert.equal(h.spinner.style.display,'none');
 assert.equal(h.events.at(-1).data.detail,'service-worker');
 assert.ok(h.message.textContent.includes('browser session'));
 const actions=h.elements.find(n=>n.id==='kkeep-signin-recovery');
 assert.equal(actions.children.length,2);
 const [retry,open]=actions.children;
 assert.equal(open.href,'/_rbx/app/');assert.equal(open.target,'_blank');
 assert.equal(open.rel,'noopener noreferrer');
 retry.onclick();assert.equal(h.reloads,1);
});

test('a stalled sign-in transport shows a connection failure and cannot become false success',async()=>{
 const h=harness();await h.scope.__kkeepSignIn.prepare();
 const failure=assert.rejects(h.scope.__kkeepSignIn.connect({wait:()=>new Promise(()=>{})}),/timed out/);
 await h.advance(64000);await failure;
 assert.equal(h.events.at(-1).data.detail,'connection');
 h.setDocument(h.frameDocument());h.scope.__kkeepSignIn.loaded();
 assert.equal(h.loading.classList.contains('done'),false);
 assert.equal(h.reloads,0);
});

test('failed module loading cannot leave the sign-in spinner indefinitely',async()=>{
 const h=harness();h.scope.document.readyState='loading';await h.advance(60000);
 assert.equal(h.events.at(-1).data.stage,'session-failed');
 assert.equal(h.events.at(-1).data.detail,'session');
 assert.equal(h.spinner.style.display,'none');
});

test('a controller upgrade reattaches the existing sign-in controller without reloading its form',async()=>{
 const h=harness(), ports=[], cookieJar={}, frames=[];
 const controller={prefix:'/~/sj/owned123/',cookieJar,frames,serviceWorkerController:h.serviceWorker.controller,
  wait:async()=>{},setupMessagePort(){ports.push(this.serviceWorkerController);}};
 await h.start(controller);h.setDocument(h.frameDocument());
 const next={scriptURL:'https://runtime.example/_jar/sw.js?kk=join18'};
 h.serviceWorker.controller=next;h.swListeners.controllerchange();
 assert.deepEqual(ports,[next]);assert.equal(controller.serviceWorkerController,next);
 assert.equal(controller.cookieJar,cookieJar);assert.equal(controller.frames,frames);assert.equal(h.reloads,0);
 assert.equal(h.loading.classList.contains('done'),true);
});

test('only the current worker can wake the exact controller owned by this sign-in page',async()=>{
 const h=harness(), ports=[];
 const controller={prefix:'/~/sj/owned123/',serviceWorkerController:h.serviceWorker.controller,wait:async()=>{},setupMessagePort(){ports.push(true);}};
 await h.scope.__kkeepSignIn.connect(controller);
 const wake=prefix=>({type:'kkeep:signin-route-wake',prefix});
 h.swListeners.message({source:{},data:wake(controller.prefix)});
 h.swListeners.message({source:h.serviceWorker.controller,data:wake('/~/sj/another1/')});
 h.swListeners.message({source:h.serviceWorker.controller,data:wake('/~/sj/owned123/../')});
 h.swListeners.message({source:h.serviceWorker.controller,data:{type:'arbitrary'}});
 assert.equal(ports.length,0);
 h.swListeners.message({source:h.serviceWorker.controller,data:wake(controller.prefix)});
 assert.equal(ports.length,1);assert.equal(h.reloads,0);
 h.serviceWorker.controller={scriptURL:'https://elsewhere.example/_jar/sw.js'};h.swListeners.controllerchange();
 assert.equal(ports.length,1);
});

test('a failed port reattach offers bounded connection help without covering or reloading the form',async()=>{
 const h=harness();let attempts=0;
 const controller={prefix:'/~/sj/owned123/',serviceWorkerController:h.serviceWorker.controller,wait:async()=>{},
  setupMessagePort(){attempts++;throw new DOMException('Port is closed','InvalidStateError');}};
 await h.start(controller);const doc=h.frameDocument();h.setDocument(doc);
 h.serviceWorker.controller={scriptURL:'https://runtime.example/_jar/sw.js?kk=join18'};
 assert.doesNotThrow(()=>h.swListeners.controllerchange());
 assert.equal(attempts,1);assert.equal(h.events.at(-1).data.detail,'connection');
 assert.equal(h.events.at(-1).data.stage,'session-recovering');
 await h.advance(4000);
 assert.equal(h.loading.classList.contains('done'),true);
 assert.equal(h.events.at(-1).data.stage,'session-help');assert.equal(h.events.at(-1).data.detail,'connection');
 await h.advance(90000);assert.equal(attempts,3);assert.equal(h.reloads,0);
 assert.equal(h.events.some(e=>e.data.stage==='session-failed'),false);
 assert.equal(h.frame.element.contentDocument,doc);assert.equal(h.navigations.length,1);
});

test('a completed blank or navigation-only document never claims that the sign-in form is ready',async()=>{
 const h=harness();await h.start();
 const readyEvents=h.events.length;
 h.frame.element.emit('load');
 h.setDocument(h.frameDocument({form:false}));
 h.setDocument(h.frameDocument({url:'about:blank'}));
 await h.advance(59000);
 assert.equal(h.loading.classList.contains('done'),false);
 assert.equal(h.events.length,readyEvents);
 await h.advance(65000);
 assert.equal(h.events.at(-1).data.stage,'session-failed');
 assert.equal(h.events.at(-1).data.detail,'connection');
 assert.equal(h.navigations.length,1,'watching a slow page never repeats navigation');
});

test('form readiness requires current visible editable controls in one form, without reading values or a localized label',async()=>{
 const h=harness();await h.start();
 const cases=[
  doc=>{doc.readyState='loading';},
    doc=>{doc.controls['login-username'].disabled=true;},
  doc=>{doc.controls['login-password'].readOnly=true;},
  doc=>{doc.controls['login-password'].getBoundingClientRect=()=>({width:0,height:0});},
  doc=>{doc.controls['login-password'].form={};},
  doc=>{doc.controls.submit.form={};},
  doc=>{doc.controls.submit.getBoundingClientRect=()=>({width:0,height:0});},
  doc=>{doc.controls['login-username'].ownerDocument={};},
 ];
 for(const change of cases){
  const doc=h.frameDocument();change(doc);h.setDocument(doc);
  assert.equal(h.loading.classList.contains('done'),false);
 }
 const current=h.frameDocument();
 assert.equal(current.controls.submit.disabled,true,'an empty form normally disables its submit button');
 h.setDocument(current);
 assert.equal(h.loading.classList.contains('done'),true);
 assert.equal(h.valueReads,0);
 assert.ok(h.events.every(event=>event.data.stage==='session-ready'&&event.data.detail===''));
 assert.equal(h.frame.element.listeners.get('load').size,0);
 assert.equal(h.timers.size,0);
});

test('a slow current form clears only its page timeout and notifies the parent without claiming authentication',async()=>{
 const h=harness();await h.start();
 h.setDocument(h.frameDocument({form:false}));
 await h.advance(125000);
 assert.equal(h.loading.classList.contains('done'),false);
 assert.equal(h.events.at(-1).data.stage,'session-failed');
 const before=h.events.length;
 // The real form can finish without a new outer load event after the first
 // navigation-only document. Readiness observes only this current document.
 h.setDocument(h.frameDocument(),{load:false});
 await h.advance(2000);
 assert.equal(h.loading.classList.contains('done'),true);
 assert.equal(h.events.length,before+2);
 assert.ok(h.events.slice(before).every(event=>event.data.stage==='session-ready'&&event.data.detail===''));
 assert.equal(h.navigations.length,1);assert.equal(h.reloads,0);assert.equal(h.valueReads,0);
 assert.equal(h.timers.size,0);
});

test('the actual Back handler starts one fresh bounded attempt and ignores the old document, callback and deadline',async()=>{
 const h=harness();await h.start();
 const oldLoad=[...h.frame.element.listeners.get('load')][0];
 const oldDeadline=[...h.timers.values()].find(timer=>timer.at===60000).fn;
 await h.advance(1000);
 const previous=h.frameDocument();h.setDocument(previous,{load:false});
 h.back();
 assert.deepEqual(h.navigations,['https://www.roblox.com/login','https://www.roblox.com/login']);
 oldLoad();oldDeadline();h.frame.element.emit('load');
 assert.equal(h.loading.classList.contains('done'),false,'the old complete form is not the new navigation');
 assert.equal(h.events.some(event=>event.data.stage==='session-failed'),false);
 await h.advance(59000);
 assert.equal(h.events.some(event=>event.data.stage==='session-failed'),false,'the previous deadline cannot shorten the new attempt');
 await h.advance(65000);
 assert.equal(h.events.at(-1).data.stage,'session-failed');
 h.setDocument(h.frameDocument(),{load:false});
 oldLoad();assert.equal(h.loading.classList.contains('done'),false,'an obsolete callback cannot finish the newer attempt');
 await h.advance(2000);
 assert.equal(h.loading.classList.contains('done'),true);
 assert.equal(h.navigations.length,2);assert.equal(h.valueReads,0);
});

test('Back after a page-only timeout resets its visible loading UI without announcing readiness early',async()=>{
 const h=harness();await h.start();await h.advance(125000);
 const before=h.events.length;
 h.back();
 assert.equal(h.events.length,before);
 assert.equal(h.message.textContent,'Loading sign-in…');
 assert.equal(h.spinner.style.display,'');
 assert.equal(h.scope.document.getElementById('kkeep-signin-recovery'),undefined);
 assert.equal(h.loading.classList.contains('done'),false);
 await h.advance(59999);assert.equal(h.events.length,before);
 await h.advance(65001);
 assert.equal(h.events.at(-1).data.stage,'session-failed');
});

test('late service-worker and controller resolutions never allow a form to clear hard failures',async()=>{
 for(const phase of ['prepare','connect']){
  let resolve;
  const pending=new Promise(done=>{resolve=done;});
  const h=harness(phase==='prepare'?()=>pending:async()=>{});
  if(phase==='connect')await h.scope.__kkeepSignIn.prepare();
  const operation=phase==='prepare'?h.scope.__kkeepSignIn.prepare():h.scope.__kkeepSignIn.connect({wait:()=>pending});
  const failure=assert.rejects(operation,/timed out/);
  await h.advance(phase==='prepare'?139000:64000);await failure;
  const before=h.events.length;
  resolve();await h.advance(5000);
  h.setDocument(h.frameDocument());h.scope.__kkeepSignIn.loaded();
  assert.throws(()=>h.scope.__kkeepSignIn.navigate(h.frame),/not ready/);
  assert.equal(h.loading.classList.contains('done'),false);
  assert.equal(h.events.length,before);
  assert.equal(h.navigations.length,0);
 }
});

test('a port failure supersedes a page timeout and cannot be cleared by its late form or Back action',async()=>{
 const h=harness();
 const controller={prefix:'/~/sj/owned123/',serviceWorkerController:h.serviceWorker.controller,wait:async()=>{},
  setupMessagePort(){throw new Error('Private transport failure');}};
 await h.start(controller);await h.advance(125000);
 const oldLoad=[...h.frame.element.listeners.get('load')][0];
 h.serviceWorker.controller={scriptURL:'https://runtime.example/_jar/sw.js?kk=join18'};h.swListeners.controllerchange();
 await h.advance(0);
 const before=h.events.length;
 h.setDocument(h.frameDocument());oldLoad();h.scope.__kkeepSignIn.loaded();h.back();
 await h.advance(90000);
 assert.equal(h.loading.classList.contains('done'),false);
 assert.equal(h.events.length,before);
 assert.equal(h.events.at(-1).data.stage,'session-failed');
 assert.equal(h.navigations.length,1);assert.equal(h.reloads,0);
 assert.equal(h.timers.size,0);
});

test('frame replacement and page exit retire their readiness observers',async()=>{
 for(const kind of ['detached','source-changed','page-exit']){
  const h=harness();await h.start();
  if(kind==='detached')h.frame.element.isConnected=false;
  else if(kind==='source-changed')h.frame.element.src='/different-frame';
  else h.pageListeners.pagehide({persisted:false});
  await h.advance(500);
  assert.equal(h.timers.size,0,kind);
  assert.equal(h.frame.element.listeners.get('load').size,0,kind);
  h.setDocument(h.frameDocument());h.scope.__kkeepSignIn.loaded();
  assert.equal(h.loading.classList.contains('done'),false,kind);
  assert.equal(h.navigations.length,1,kind);
 }
});

test('changed provider navigation contracts fail closed',()=>{
 for(const changed of [provider.replace('  frame.go("https://www.roblox.com/login");','  frame.navigate("https://www.roblox.com/login");'),
  provider.replace('$("loading").classList.add("done"); step("login page loaded");','step("page now ready");')]){
  assert.throws(()=>transformText(changed,'/_rbx/signin','https://runtime.example'),/Provider sign-in startup changed/);
 }
});

function ownedController(h, setup=()=>{}) {
 return {prefix:'/~/sj/owned123/',serviceWorkerController:h.serviceWorker.controller,wait:async()=>{},setupMessagePort:setup};
}
function missingControl(h, options={}) {
 const doc=h.frameDocument({form:false});
 doc.controls['kkeep-signin-control-missing']={};
 h.setDocument(doc);
 h.pageListeners.message({source:h.frame.element.contentWindow,origin:h.scope.location.origin,
  data:{type:'kkeep:signin-control-missing'},...options});
 return doc;
}

test('a transient browser setup failure recovers automatically without repeating authentication or reloading',async()=>{
 let attempts=0;
 const h=harness(async()=>{if(++attempts===1)throw new TypeError('temporary');});
 const starting=h.start();await h.advance(0);await h.advance(1000);await starting;
 assert.equal(attempts,2);assert.equal(h.navigations.length,1);assert.equal(h.reloads,0);
 assert.ok(h.events.some(event=>event.data.stage==='session-recovering'&&event.data.detail==='service-worker'));
 assert.ok(h.events.every(event=>event.data.preserveForm===undefined));
 assert.equal(h.events.some(event=>event.data.stage==='session-failed'),false);
 h.setDocument(h.frameDocument());assert.equal(h.timers.size,0);assert.equal(h.valueReads,0);
});

test('the initial login GET repairs missing browser interception at most twice and ignores its previous document',async()=>{
 const h=harness();let ports=0;await h.start(ownedController(h,()=>ports++));
 missingControl(h);assert.equal(h.events.at(-1).data.stage,'session-recovering');
 await h.advance(1000);
 assert.equal(h.navigations.length,2);assert.equal(ports,1);assert.deepEqual(h.calls,[true,true]);
 // The WindowProxy survives navigation. The exact old document must not be
 // able to trigger a second recovery of the new attempt.
 h.pageListeners.message({source:h.frame.element.contentWindow,origin:h.scope.location.origin,data:{type:'kkeep:signin-control-missing'}});
 await h.advance(3000);assert.equal(h.navigations.length,2);
 missingControl(h);await h.advance(3000);
 assert.equal(h.navigations.length,3);assert.equal(ports,2);
 missingControl(h);await h.advance(10000);
 assert.equal(h.navigations.length,3);assert.equal(ports,2);
 assert.equal(h.events.at(-1).data.stage,'session-failed');assert.equal(h.reloads,0);assert.equal(h.valueReads,0);
 assert.ok(h.navigations.every(url=>url==='https://www.roblox.com/login'));
});

test('missing-control repair requires exact origin, current owned frame, route prefix and explicit document marker',async()=>{
 for(const invalid of ['origin','source','marker','prefix']){
  const h=harness();const controller=ownedController(h);await h.start(controller);
  const doc=h.frameDocument({form:false});if(invalid!=='marker')doc.controls['kkeep-signin-control-missing']={};
  h.setDocument(doc);if(invalid==='prefix')controller.prefix='/~/sj/another/';
  h.pageListeners.message({source:invalid==='source'?{}:h.frame.element.contentWindow,
   origin:invalid==='origin'?'https://other.example':h.scope.location.origin,data:{type:'kkeep:signin-control-missing'}});
  await h.advance(4000);assert.equal(h.navigations.length,1,invalid);assert.equal(h.calls.length,1,invalid);
 }
});

test('a structurally usable interactive login is revealed without waiting for optional page resources',async()=>{
 const h=harness();await h.start();h.setDocument(h.frameDocument({readyState:'interactive'}));
 assert.equal(h.loading.classList.contains('done'),true);assert.equal(h.events.at(-1).data.stage,'session-ready');
 await h.advance(180000);assert.equal(h.navigations.length,1);assert.equal(h.timers.size,0);assert.equal(h.valueReads,0);
});

test('an incomplete interactive form or challenge is preserved and offered to the user without automatic navigation',async()=>{
 for(const kind of ['loading-form','challenge']){
  const h=harness();await h.start(ownedController(h));
  const doc=h.frameDocument({form:kind==='loading-form',readyState:kind==='loading-form'?'loading':'complete'});
  if(kind==='challenge')doc.controls.challenge={ownerDocument:doc,isConnected:true,getBoundingClientRect:()=>({width:320,height:320})};
  h.setDocument(doc);await h.advance(180000);
  assert.equal(h.events.at(-1).data.stage,'session-help',kind);assert.equal(h.events.at(-1).data.detail,'input',kind);
  assert.equal(h.loading.classList.contains('done'),true,kind);assert.equal(h.navigations.length,1,kind);assert.equal(h.calls.length,1,kind);
  assert.equal(h.events.some(event=>event.data.stage==='session-failed'),false,kind);assert.equal(h.valueReads,0,kind);
 }
});

test('observed interaction stays protected even after the form disappears into a verification navigation',async()=>{
 const h=harness();await h.start(ownedController(h));
 const doc=h.frameDocument({form:false});h.setDocument(doc);doc.emit('pointerdown');
 missingControl(h);await h.advance(180000);
 assert.equal(h.navigations.length,1);assert.equal(h.calls.length,1);assert.equal(h.events.at(-1).data.stage,'session-help');
});

test('offline recovery waits for online and uses one bounded attempt when the connection returns',async()=>{
 const h=harness();await h.start(ownedController(h));h.scope.navigator.onLine=false;missingControl(h);
 await h.advance(300000);assert.equal(h.events.at(-1).data.stage,'session-waiting');assert.equal(h.events.at(-1).data.detail,'offline');
 assert.equal(h.calls.length,1);assert.equal(h.navigations.length,1);
 h.scope.navigator.onLine=true;h.pageListeners.online();await h.advance(0);
 // Flush the read-only worker handshake without advancing to the next timeout.
 for(let i=0;i<40;i++)await Promise.resolve();
 assert.equal(h.calls.length,2);assert.equal(h.navigations.length,2);assert.equal(h.reloads,0);
});

test('only the approved direct parent can stop automatic recovery and a late result cannot restart it',async()=>{
 for(const pauseDuring of ['delay','offline','operation']){
  const h=harness();let ports=0,finish;await h.start(ownedController(h,()=>ports++));
  if(pauseDuring==='operation')h.scope.__kkeepSessionReady=()=>new Promise(resolve=>{finish=resolve;});
  if(pauseDuring==='offline')h.scope.navigator.onLine=false;
  missingControl(h);
  h.pageListeners.message({source:{},origin:'https://kkeep.fun',data:{type:'kkeep:roblox-recovery',action:'stop'}});
  h.pageListeners.message({source:h.scope.parent,origin:'https://other.example',data:{type:'kkeep:roblox-recovery',action:'stop'}});
  assert.equal(h.events.at(-1).data.stage,'session-recovering');
  if(pauseDuring!=='delay')await h.advance(1000);
  h.pageListeners.message({source:h.scope.parent,origin:'https://kkeep.fun',data:{type:'kkeep:roblox-recovery',action:'stop'}});
  assert.equal(h.events.at(-1).data.stage,'session-paused');
  finish?.();h.scope.navigator.onLine=true;h.pageListeners.online();await h.advance(180000);
  assert.equal(h.navigations.length,1,pauseDuring);assert.equal(h.reloads,0,pauseDuring);
  assert.equal(ports,0,pauseDuring);
  assert.equal(h.events.at(-1).data.stage,'session-paused',pauseDuring);
 }
});

test('a form arriving during backoff cancels automatic recovery and no login values are inspected',async()=>{
 const h=harness();await h.start(ownedController(h));missingControl(h);
 h.setDocument(h.frameDocument());await h.advance(180000);
 assert.equal(h.loading.classList.contains('done'),true);assert.equal(h.navigations.length,1);
 assert.equal(h.calls.length,1);assert.equal(h.timers.size,0);assert.equal(h.valueReads,0);
});

test('a transient local port failure repairs the same ready form and coalesces repeated wake notices',async()=>{
 const h=harness();let ports=0;const controller=ownedController(h,()=>{if(++ports===1)throw new Error('temporary port');});
 await h.start(controller);const doc=h.frameDocument();h.setDocument(doc);
 h.serviceWorker.controller={scriptURL:'https://runtime.example/_jar/sw.js?kk=join18'};h.swListeners.controllerchange();
 await h.advance(1000);
 assert.equal(ports,2);assert.equal(h.frame.element.contentDocument,doc);assert.equal(h.navigations.length,1);
 assert.equal(h.loading.classList.contains('done'),true);assert.equal(h.events.at(-1).data.stage,'session-ready');
 assert.equal(h.valueReads,0);assert.equal(h.reloads,0);
});


test('a missing-control notice arriving during a generic repair is retained and opens only its still-current failed GET',async()=>{
 for(const changed of [false,true]){
  const h=harness();await h.start(ownedController(h));let finish;
  h.scope.__kkeepSessionReady=()=>new Promise(resolve=>{finish=resolve;});
  await h.advance(61000);assert.equal(typeof finish,'function');
  missingControl(h);
  if(changed)h.setDocument(h.frameDocument({form:false}));
  finish();await h.advance(0);
  assert.equal(h.navigations.length,changed?1:2);
  assert.equal(h.events.some(event=>event.data.stage==='session-failed'),false);
 }
});

test('stopping a startup retry cannot be overwritten by its provider catch or late promise',async()=>{
 for(const phase of ['prepare','connect']){
  const h=harness(async()=>{throw new TypeError('temporary');});
  if(phase==='connect')h.scope.__kkeepSessionReady=async()=>{};
  if(phase==='connect')await h.scope.__kkeepSignIn.prepare();
  const controller=ownedController(h);controller.wait=async()=>{throw new TypeError('temporary');};
  const operation=phase==='prepare'?h.scope.__kkeepSignIn.prepare():h.scope.__kkeepSignIn.connect(controller);
  const caught=operation.catch(()=>h.scope.__kkeepSignIn.fail('session'));
  await h.advance(0);
  assert.equal(h.events.at(-1).data.stage,'session-recovering');
  h.pageListeners.message({source:h.scope.parent,origin:'https://kkeep.fun',data:{type:'kkeep:roblox-recovery',action:'stop'}});
  await h.advance(5000);await caught;
  assert.equal(h.events.at(-1).data.stage,'session-paused');
  assert.equal(h.events.some(event=>event.data.stage==='session-failed'),false);
  assert.equal(h.navigations.length,0);assert.equal(h.reloads,0);
 }
});


test('the observed Roblox type=button login control is accepted only by exact identity and same form',async()=>{
 const h=harness();await h.start();
 for(const change of [
  doc=>{delete doc.controls['login-button'];},
  doc=>{doc.controls.submit.tagName='INPUT';},
  doc=>{doc.controls.submit.type='reset';},
  doc=>{doc.controls.submit.form={};},
  doc=>{doc.controls.submit.getBoundingClientRect=()=>({width:0,height:0});},
 ]){
  const doc=h.frameDocument();change(doc);h.setDocument(doc);
  assert.equal(h.loading.classList.contains('done'),false);
 }
 const doc=h.frameDocument();assert.equal(doc.controls['login-button'].type,'button');h.setDocument(doc);
 assert.equal(h.loading.classList.contains('done'),true);assert.equal(h.events.at(-1).data.stage,'session-ready');
 assert.equal(h.valueReads,0);
});

test('online and visibility events cannot skip backoff or strand a later offline wait',async()=>{
 const h=harness();await h.start(ownedController(h));missingControl(h);
 h.pageListeners.online();h.pageListeners.visibilitychange();await h.advance(500);
 assert.equal(h.calls.length,1);assert.equal(h.navigations.length,1);
 h.scope.navigator.onLine=false;await h.advance(500);assert.equal(h.events.at(-1).data.stage,'session-waiting');
 await h.advance(5000);assert.equal(h.navigations.length,1);
 h.scope.navigator.onLine=true;h.pageListeners.online();await h.advance(0);
 assert.equal(h.calls.length,2);assert.equal(h.navigations.length,2);
});


test('the provider verification overlay prevents a missing-control retry from replacing its authentication flow',async()=>{
 const h=harness();await h.start(ownedController(h));
 h.scope.document.getElementById('signing').classList.add('on');
 missingControl(h);await h.advance(180000);
 assert.equal(h.navigations.length,1);assert.equal(h.calls.length,1);assert.equal(h.events.at(-1).data.stage,'session-help');
 assert.equal(h.scope.document.getElementById('signing').classList.contains('on'),true);
});

test('losing the current worker repairs the same visible sign-in or challenge instead of silently returning',async()=>{
 for(const kind of ['form','challenge']){
  const h=harness();let ports=0;
  const controller=ownedController(h,()=>ports++);const cookieJar={};controller.cookieJar=cookieJar;
  await h.start(controller);h.setDocument(h.frameDocument());
  const doc=kind==='form'?h.frame.element.contentDocument:h.frameDocument({form:false,url:'https://www.roblox.com/challenge'});
  h.setDocument(doc);
  const next={scriptURL:'https://runtime.example/_jar/sw.js?kk=join18'};
  h.scope.__kkeepSessionReady=async controlled=>{h.calls.push(controlled);h.serviceWorker.controller=next;};
  h.serviceWorker.controller=null;
  h.swListeners.controllerchange();h.swListeners.controllerchange();
  assert.equal(h.events.at(-1).data.stage,'session-recovering',kind);
  assert.equal(h.events.at(-1).data.preserveForm,true,kind);
  assert.equal(h.loading.classList.contains('done'),true,kind);
  await h.advance(1000);
  assert.deepEqual(h.calls,[true,true],kind);assert.equal(ports,1,kind);
  assert.equal(controller.serviceWorkerController,next,kind);assert.equal(controller.cookieJar,cookieJar,kind);
  assert.equal(h.frame.element.contentDocument,doc,kind);assert.equal(h.navigations.length,1,kind);
  assert.equal(h.events.at(-1).data.stage,'session-ready',kind);assert.equal(h.loading.classList.contains('done'),true,kind);
  assert.equal(h.reloads,0,kind);assert.equal(h.valueReads,0,kind);assert.equal(h.timers.size,0,kind);
 }
});

test('a missing or hung worker exhausts the shared two-repair budget and opens help while keeping the form available',async()=>{
 for(const kind of ['missing','hung']){
  const h=harness();let ports=0;
  await h.start(ownedController(h,()=>ports++));const doc=h.frameDocument();h.setDocument(doc);
  if(kind==='hung')h.scope.__kkeepSessionReady=controlled=>{h.calls.push(controlled);return new Promise(()=>{});};
  h.serviceWorker.controller=null;h.swListeners.controllerchange();
  await h.advance(kind==='hung'?94000:4000);
  assert.deepEqual(h.calls,[true,true,true],kind);assert.equal(ports,0,kind);
  assert.equal(h.events.at(-1).data.stage,'session-help',kind);assert.equal(h.events.at(-1).data.detail,'connection',kind);
  assert.equal(h.loading.classList.contains('done'),true,kind);assert.equal(h.frame.element.contentDocument,doc,kind);
  h.swListeners.controllerchange();h.swListeners.controllerchange();await h.advance(180000);
  assert.equal(h.calls.length,3,kind);assert.equal(h.events.some(event=>event.data.stage==='session-failed'),false,kind);
  assert.equal(h.navigations.length,1,kind);assert.equal(h.reloads,0,kind);assert.equal(h.valueReads,0,kind);assert.equal(h.timers.size,0,kind);
 }
});

test('repairing one controller loss does not reset the budget for a later loss on the same form',async()=>{
 const h=harness();let ports=0;
 await h.start(ownedController(h,()=>ports++));const doc=h.frameDocument();h.setDocument(doc);
 h.scope.__kkeepSessionReady=async controlled=>{
  h.calls.push(controlled);
  if(h.calls.length===2)h.serviceWorker.controller={scriptURL:'https://runtime.example/_jar/sw.js?kk=join18'};
 };
 h.serviceWorker.controller=null;h.swListeners.controllerchange();await h.advance(1000);
 assert.equal(h.events.at(-1).data.stage,'session-ready');assert.equal(ports,1);
 h.serviceWorker.controller=null;h.swListeners.controllerchange();await h.advance(2999);
 assert.equal(h.calls.length,2);await h.advance(1);
 assert.equal(h.calls.length,3);assert.equal(h.events.at(-1).data.stage,'session-help');
 h.swListeners.controllerchange();await h.advance(180000);
 assert.equal(h.calls.length,3);assert.equal(ports,1);assert.equal(h.frame.element.contentDocument,doc);
 assert.equal(h.loading.classList.contains('done'),true);assert.equal(h.navigations.length,1);assert.equal(h.reloads,0);
});

test('a preserved sign-in waits offline and in the background before reclaiming its missing worker',async()=>{
 const h=harness();let ports=0;
 await h.start(ownedController(h,()=>ports++));const doc=h.frameDocument();h.setDocument(doc);
 h.scope.__kkeepSessionReady=async controlled=>{h.calls.push(controlled);h.serviceWorker.controller={scriptURL:'https://runtime.example/_jar/sw.js?kk=join18'};};
 h.scope.navigator.onLine=false;h.scope.document.hidden=true;
 h.serviceWorker.controller=null;h.swListeners.controllerchange();await h.advance(180000);
 assert.equal(h.events.at(-1).data.stage,'session-waiting');assert.equal(h.events.at(-1).data.preserveForm,true);
 assert.equal(h.calls.length,1);assert.equal(ports,0);assert.equal(h.loading.classList.contains('done'),true);
 h.scope.navigator.onLine=true;h.pageListeners.online();await h.advance(180000);
 assert.equal(h.calls.length,1,'an online event does not run recovery in a background document');
 h.scope.document.hidden=false;h.pageListeners.visibilitychange();await h.advance(0);
 assert.equal(h.calls.length,2);assert.equal(ports,1);assert.equal(h.events.at(-1).data.stage,'session-ready');
 assert.equal(h.frame.element.contentDocument,doc);assert.equal(h.navigations.length,1);assert.equal(h.reloads,0);assert.equal(h.timers.size,0);
});

test('Stop preserves the form and prevents delayed controller repairs and readiness messages in every recovery phase',async()=>{
 for(const phase of ['delay','offline','operation']){
  const h=harness();let ports=0,finish;
  await h.start(ownedController(h,()=>ports++));const doc=h.frameDocument();h.setDocument(doc);
  h.scope.__kkeepSessionReady=controlled=>{
   h.calls.push(controlled);
   return new Promise(resolve=>{finish=resolve;});
  };
  if(phase==='offline')h.scope.navigator.onLine=false;
  h.serviceWorker.controller=null;h.swListeners.controllerchange();
  if(phase!=='delay')await h.advance(1000);
  h.pageListeners.message({source:h.scope.parent,origin:'https://kkeep.fun',data:{type:'kkeep:roblox-recovery',action:'stop'}});
  assert.equal(h.events.at(-1).data.stage,'session-paused',phase);assert.equal(h.loading.classList.contains('done'),true,phase);
  const paused=h.events.length;
  h.scope.__kkeepSignIn.fail('session');
  h.serviceWorker.controller={scriptURL:'https://runtime.example/_jar/sw.js?kk=join18'};
  finish?.();h.scope.navigator.onLine=true;h.pageListeners.online();h.pageListeners.visibilitychange();h.swListeners.controllerchange();
  await h.advance(180000);
  assert.equal(ports,0,phase);assert.equal(h.frame.element.contentDocument,doc,phase);assert.equal(h.loading.classList.contains('done'),true,phase);
  assert.ok(h.events.slice(paused).every(event=>event.data.stage==='session-paused'),phase);
  assert.equal(h.navigations.length,1,phase);assert.equal(h.reloads,0,phase);assert.equal(h.valueReads,0,phase);assert.equal(h.timers.size,0,phase);
 }
});

test('an in-flight worker reclaim cannot attach a port or report readiness after its frame is replaced or page discarded',async()=>{
 for(const kind of ['detached','source-changed','page-exit']){
  const h=harness();let ports=0,finish;
  await h.start(ownedController(h,()=>ports++));h.setDocument(h.frameDocument());
  h.scope.__kkeepSessionReady=()=>new Promise(resolve=>{finish=resolve;});
  h.serviceWorker.controller=null;h.swListeners.controllerchange();await h.advance(1000);
  assert.equal(typeof finish,'function',kind);const before=h.events.length;
  if(kind==='detached')h.frame.element.isConnected=false;
  else if(kind==='source-changed')h.frame.element.src='/different-frame';
  else h.pageListeners.pagehide({persisted:false});
  h.serviceWorker.controller={scriptURL:'https://runtime.example/_jar/sw.js?kk=join18'};
  finish();await h.advance(0);h.swListeners.controllerchange();await h.advance(180000);
  assert.equal(ports,0,kind);assert.equal(h.events.length,before,kind);assert.equal(h.navigations.length,1,kind);
  assert.equal(h.reloads,0,kind);assert.equal(h.timers.size,0,kind);
 }
});

test('a visible verification flow can regain its worker before a full login form is ready without replacing the document',async()=>{
 const h=harness();let ports=0;
 await h.start(ownedController(h,()=>ports++));
 const doc=h.frameDocument({form:false,url:'https://www.roblox.com/challenge'});
 doc.controls.challenge={ownerDocument:doc,isConnected:true,getBoundingClientRect:()=>({width:320,height:320})};
 h.setDocument(doc);
 h.scope.__kkeepSessionReady=async controlled=>{h.calls.push(controlled);h.serviceWorker.controller={scriptURL:'https://runtime.example/_jar/sw.js?kk=join18'};};
 h.serviceWorker.controller=null;h.swListeners.controllerchange();
 assert.equal(h.events.at(-1).data.preserveForm,true);assert.equal(h.loading.classList.contains('done'),true);
 await h.advance(1000);
 assert.equal(h.events.at(-1).data.stage,'session-help');assert.equal(h.events.at(-1).data.detail,'input');
 assert.equal(h.frame.element.contentDocument,doc);assert.equal(ports,1);assert.equal(h.calls.length,2);
 h.setDocument(h.frameDocument());await h.advance(180000);
 assert.equal(h.events.at(-1).data.stage,'session-ready');assert.equal(h.navigations.length,1);assert.equal(h.reloads,0);
 assert.equal(h.valueReads,0);assert.equal(h.timers.size,0);
});

test('a form appearing during missing-controller recovery moves to in-place repair using only the remaining budget',async()=>{
 for(const phase of ['delay','operation']){
  const h=harness();let ports=0,finish;
  await h.start(ownedController(h,()=>ports++));
  h.scope.__kkeepSessionReady=controlled=>{
   h.calls.push(controlled);
   if(phase==='operation'&&h.calls.length===2)return new Promise(resolve=>{finish=()=>{h.serviceWorker.controller={scriptURL:'https://runtime.example/_jar/sw.js?kk=join18'};resolve();};});
   h.serviceWorker.controller={scriptURL:'https://runtime.example/_jar/sw.js?kk=join18'};
   return Promise.resolve();
  };
  h.serviceWorker.controller=null;h.swListeners.controllerchange();
  if(phase==='operation')await h.advance(1000);
  const doc=h.frameDocument({form:phase==='delay',url:phase==='operation'?'https://www.roblox.com/challenge':'https://www.roblox.com/login'});
  if(phase==='operation')doc.controls.challenge={ownerDocument:doc,isConnected:true,getBoundingClientRect:()=>({width:320,height:320})};
  h.setDocument(doc);finish?.();await h.advance(phase==='delay'?1000:0);
  assert.equal(ports,0,phase,'a pending page repair must not attach after visible input takes over');
  assert.equal(h.loading.classList.contains('done'),true,phase);
  assert.equal(h.events.at(-1).data.stage,'session-recovering',phase);assert.equal(h.events.at(-1).data.preserveForm,true,phase);
  await h.advance(3000);
  assert.equal(ports,1,phase);assert.equal(h.calls.length,phase==='delay'?2:3,phase);
  assert.equal(h.frame.element.contentDocument,doc,phase);assert.equal(h.navigations.length,1,phase);assert.equal(h.reloads,0,phase);
  assert.equal(h.events.at(-1).data.stage,phase==='delay'?'session-ready':'session-help',phase);
  h.setDocument(h.frameDocument());await h.advance(180000);
  assert.equal(h.timers.size,0,phase);assert.equal(h.valueReads,0,phase);
 }
});

test('a slow-page worker claim cannot attach after Stop or after verification takes over the current document',async()=>{
 for(const kind of ['stop','challenge']){
  const h=harness();let ports=0,finish;
  await h.start(ownedController(h,()=>ports++));
  h.scope.__kkeepSessionReady=()=>new Promise(resolve=>{finish=resolve;});
  await h.advance(61000);assert.equal(typeof finish,'function',kind);
  let doc=h.frame.element.contentDocument;
  if(kind==='stop')h.pageListeners.message({source:h.scope.parent,origin:'https://kkeep.fun',data:{type:'kkeep:roblox-recovery',action:'stop'}});
  else {
   doc=h.frameDocument({form:false,url:'https://www.roblox.com/challenge'});
   doc.controls.challenge={ownerDocument:doc,isConnected:true,getBoundingClientRect:()=>({width:320,height:320})};
   h.setDocument(doc);
  }
  finish();await h.advance(0);
  assert.equal(ports,0,kind);assert.equal(h.frame.element.contentDocument,doc,kind);
  assert.equal(h.events.at(-1).data.stage,kind==='stop'?'session-paused':'session-help',kind);
  assert.equal(h.navigations.length,1,kind);assert.equal(h.reloads,0,kind);
 }
});
