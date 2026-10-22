import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {normalizeXboxStatus,xboxStatus} from '../worker/xbox-diagnostics.ts';
const read=file=>readFileSync(new URL('../public/xbox/'+file,import.meta.url),'utf8');
const prefix='https://kkeep.test/xbox/browse/controller/frame/';

function setup({blocked=false}={}){
  const opened=[],states=[],errors=[];let tick,returns=0;
  const child={location:{href:'about:blank'},document:{readyState:'complete'},closed:false,focus(){this.focused=true;},close(){this.closed=true;}};
  const context={window:{open(...args){opened.push(args);return blocked?null:child;}},location:new URL('https://kkeep.test/xbox/'),URL,clearInterval(){tick=undefined;},setInterval(fn){tick=fn;return 1;}};
  vm.runInNewContext(read('signin-window.js'),context);
  const url='https://login.live.com/oauth20_authorize.srf?state=fixture-state&redirect_uri=https%3A%2F%2Fwww.xbox.com%2Fauth%2Fmsa&code_challenge=fixture-challenge#fixture-fragment';
  const handle=context.window.KkeepXboxSignInWindow.create({prefix,encode:encodeURIComponent,decode:decodeURIComponent,current:()=>url,onChange:v=>states.push(v),onReturn:()=>returns++,onError:e=>errors.push(e)});
  return {handle,context,url,opened,child,states,errors,get returns(){return returns;},tick(){tick?.();},get polling(){return !!tick;}};
}
test('sign-in window stays in the exact Xbox proxy route and preserves the entire OAuth request',()=>{
  const h=setup();assert.equal(h.handle.open(),true);
  assert.equal(h.opened[0][0],prefix+encodeURIComponent(h.url));assert.equal(h.opened[0][1],'_blank');
  assert.equal(h.opened[0].length,2,'Keep the opener/sessionStorage relationship');
  assert.equal(h.handle.owns(h.child),true);h.handle.open();assert.equal(h.opened.length,1);assert.equal(h.child.focused,true);
  for(const url of ['https://www.xbox.com/auth/msa#code=fixture-code&state=fixture-state','https://www.xbox.com/play#code=fixture-code','https://www.xbox.com.evil.test/play']){
    h.child.location.href=prefix+encodeURIComponent(url);h.tick();assert.equal(h.returns,0);assert.equal(h.child.closed,false);
  }
  h.child.location.href=prefix+encodeURIComponent('https://www.xbox.com/en-us/play');h.child.document.readyState='loading';h.tick();assert.equal(h.returns,0);
  h.child.document.readyState='complete';h.tick();assert.equal(h.returns,1);assert.equal(h.child.closed,true);assert.equal(h.polling,false);assert.deepEqual(h.states,[true,false]);
});
test('blocked or closed pop-ups recover without navigating directly or losing the launcher',()=>{
  const blocked=setup({blocked:true});assert.equal(blocked.handle.open(),false);assert.match(blocked.errors[0],/Allow pop-ups for Kkeep/);assert.equal(blocked.polling,false);
  const h=setup();h.handle.open();h.child.closed=true;h.tick();assert.deepEqual(h.states,[true,false]);assert.equal(h.returns,0);assert.equal(h.polling,false);
  h.child.closed=false;h.handle.open();h.handle.destroy();assert.equal(h.polling,false);assert.equal(h.child.closed,false,'Do not close an unfinished sign-in on launcher cleanup');assert.equal(h.handle.open(),false);
  const api=h.context.window.KkeepXboxSignInWindow;
  for(const url of ['https://login.live.com.evil.test','http://login.live.com','https://user:secret@login.live.com','javascript:alert(1)'])assert.equal(api.isMicrosoft(url),false);
});
test('diagnostic reports contain only fixed codes and bounded numeric positions',async()=>{
  const context={window:{},URL,document:{}};vm.runInNewContext(read('signin-status.js'),context);
  const raw={type:'kkeep-xbox-signin',revision:5,surface:'frame',kind:'syntax',script:'main',line:2,column:234,bodyHidden:false,rootEmpty:true,message:'private-password',url:'https://login.live.com/?state=private-state',stack:'private-stack',cookies:'private-cookie'};
  const client=context.window.KkeepXboxSignInStatus.normalize(raw);
  assert.doesNotMatch(JSON.stringify(client),/private|password|https/);
  const server=normalizeXboxStatus({...client,surface:'frame'});assert.doesNotMatch(JSON.stringify(server),/private|password|https/);
  for(const key of ['kind','script','surface'])assert.equal(normalizeXboxStatus({...raw,[key]:'private-data'}),null);
  const nativeWarn=console.warn,logs=[];console.warn=(...args)=>logs.push(args);
  const request=body=>new Request('https://kkeep.test/api/xbox-status',{method:'POST',headers:{Origin:'https://kkeep.test','X-Kkeep-Xbox-Status':'1'},body});
  try{
    assert.equal((await xboxStatus(request(JSON.stringify(raw)))).status,204);
    assert.equal((await xboxStatus(request(JSON.stringify(raw)))).status,204);assert.equal(logs.length,1);
    assert.doesNotMatch(JSON.stringify(logs),/private|password|https/);
    assert.equal((await xboxStatus(request('x'.repeat(2049)))).status,413);
    assert.equal((await xboxStatus(request('not-json'))).status,400);
    assert.equal((await xboxStatus(new Request('https://kkeep.test/api/xbox-status',{method:'POST',headers:{Origin:'https://other.test','X-Kkeep-Xbox-Status':'1'},body:JSON.stringify(raw)}))).status,403);
  }finally{console.warn=nativeWarn;}
});
