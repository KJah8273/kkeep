import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import * as recovery from '../lib/tiktok-recovery.ts';
import * as desktop from '../lib/tiktok-desktop.ts';
import * as app from '../lib/tiktok-app.ts';

test('public TikTok startup gets one landing retry, including a client-side /404 route',()=>{
 const flow=recovery.createTikTokStartupRecovery();
 assert.deepEqual(flow.navigate(recovery.TIKTOK_HOME),{unavailable:false});
 flow.navigate('https://www.tiktok.com/foryou?lang=en');
 assert.deepEqual(flow.navigate('https://www.tiktok.com/404/?from=feed'),{retry:recovery.TIKTOK_HOME,unavailable:false});
 flow.navigate(recovery.TIKTOK_HOME);
 assert.deepEqual(flow.navigate('https://www.tiktok.com/404'),{unavailable:true});
 assert.deepEqual(flow.navigate('https://www.tiktok.com/404'),{unavailable:true},'Repeated notifications cannot create a retry loop');
 flow.reset();flow.navigate(recovery.TIKTOK_HOME);
 assert.equal(flow.navigate('https://www.tiktok.com/404').retry,recovery.TIKTOK_HOME,'Only an explicit reconnect resets the retry allowance');
});

test('missing video pages, login and verification flows are never automatically replaced',()=>{
 for(const url of ['https://www.tiktok.com/@example/video/123','https://www.tiktok.com/login','https://www.tiktok.com/verify','https://www.tiktok.com/?code=fixture&state=fixture','https://www.tiktok.com/foryou?verifyFp=fixture','https://www.tiktok.com/#access_token=fixture','https://accounts.google.com/signin']){
  const flow=recovery.createTikTokStartupRecovery();flow.navigate(url);
  assert.deepEqual(flow.navigate('https://www.tiktok.com/404'),{unavailable:true},url);
 }
 for(const url of ['https://login-us.www.tiktok.com/404','https://tiktok.com.evil.example/404','https://user:password@www.tiktok.com/404','javascript:alert(1)']){
  assert.equal(recovery.isTikTokUnavailable(url),false,url);
  assert.equal(recovery.createTikTokStartupRecovery().navigate(url).retry,undefined);
 }
});

// Exercise the actual component callbacks. A document-load-only test misses
// the history navigation that caused the startup recovery gap.
async function player(){
 const refs=[],states=[],effects=[],navigations=[];let ri=0,si=0,callbacks;
 const react={useRef(value){return refs[ri++]??=( {current:value} );},useState(value){const index=si++;if(!(index in states))states[index]=value;return [states[index],next=>{states[index]=typeof next==='function'?next(states[index]):next;}];},useEffect(callback){effects.push(callback);}};
 const session={go(url){navigations.push(url);callbacks.onNavigate(url);},reload(){},destroy(){}};
 const modules={
  react,'react/jsx-runtime':{jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})},
  '@/lib/proxy-client':{mountProxy:async(_element,handlers)=>{callbacks=handlers;return session;},prepareProxy(){},setLiteMode(){}},
  '@/lib/tiktok-recovery':recovery,'@/lib/tiktok-desktop':desktop,'@/lib/tiktok-app':app,
  '@/lib/tiktok-view':{focusTikTok(){throw Error('Unexpected video adapter');}},'@/lib/analytics-client':{setAnalyticsSurface(){}},
 };
 const code=ts.transpileModule(readFileSync(new URL('../components/tiktok-player.tsx',import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 const context=vm.createContext({exports:{},require:name=>{if(!modules[name])throw Error(name);return modules[name];},window:{innerHeight:900},ResizeObserver:class{observe(){}disconnect(){}},queueMicrotask,URL});
 vm.runInContext(code,context);
 const render=()=>{ri=0;si=0;effects.length=0;return context.exports.default();};
 const nodes=tree=>!tree||typeof tree!=='object'?[]:[tree,...[tree.props?.children].flat(Infinity).flatMap(nodes)];
 let tree=render();nodes(tree).find(node=>node.props?.className==='tiktok-mount').props.ref.current={querySelector:()=>null,parentElement:{style:{setProperty(){}}}};
 let cleanup=effects[0]();await new Promise(resolve=>setImmediate(resolve));
 return {navigations,get callbacks(){return callbacks;},render,nodes,async remount(){cleanup();tree=render();cleanup=effects[0]();await new Promise(resolve=>setImmediate(resolve));},close(){cleanup();}};
}

test('TikTok component recovers SPA 404 without a new document, then keeps repeated failure visible',async()=>{
 const p=await player();
 try{
  assert.deepEqual(p.navigations,[recovery.TIKTOK_HOME],'Fresh visitors use the canonical public landing');
  p.callbacks.onNavigate('https://www.tiktok.com/foryou');
  p.callbacks.onNavigate('https://www.tiktok.com/404');
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(p.navigations,[recovery.TIKTOK_HOME,recovery.TIKTOK_HOME]);
  p.callbacks.onNavigate('https://www.tiktok.com/404/');
  p.callbacks.onLoaded();p.callbacks.onWarning('');
  let nodes=p.nodes(p.render());
  assert(nodes.some(node=>node.props?.children===recovery.TIKTOK_UNAVAILABLE),'A late load event cannot hide the provider-unavailable explanation');
  nodes.find(node=>node.type==='button'&&node.props.children==='Reconnect').props.onClick();
  await p.remount();assert.equal(p.navigations.at(-1),recovery.TIKTOK_HOME,'Reconnect must not reopen the error URL');
 }finally{p.close();}
});

test('a queued startup retry is cancelled when the user navigates into sign-in',async()=>{
 const p=await player();
 try{
  p.callbacks.onNavigate('https://www.tiktok.com/404');
  p.callbacks.onNavigate('https://www.tiktok.com/login');
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(p.navigations,[recovery.TIKTOK_HOME],'Do not interrupt a newer login navigation');
 }finally{p.close();}
});
