import test from 'node:test';
import assert from 'node:assert/strict';
import {attachTikTokApp,findTikTokAppControl,isTikTokAppFeed} from '../lib/tiktok-app.ts';

function fixture({known=true,video=true,signedOut=false}={}){
 let observer,dialog=false;
 const events=new Map(),windowEvents=new Map(),states=[],clicks=[];
 const doc={addEventListener:(name,fn)=>events.set(name,fn),removeEventListener:name=>events.delete(name)};
 function matches(element,selector){
  selector=selector.trim();
  if(selector.includes(' ')){const at=selector.lastIndexOf(' ');return matches(element,selector.slice(at+1))&&!!element.parentElement?.closest(selector.slice(0,at));}
  const attr=/^([a-z]*)\[([^=\]*]+)(\*?=)?(?:"([^"]*)")?\]$/i.exec(selector);
  if(attr){if(attr[1]&&element.tagName.toLowerCase()!==attr[1])return false;const value=element.getAttribute(attr[2]);return attr[3]==='='?value===attr[4]:attr[3]==='*='?value?.includes(attr[4]):value!==null;}
  const id=/^([a-z]+)#(.+)$/i.exec(selector);if(id)return element.tagName.toLowerCase()===id[1]&&element.getAttribute('id')===id[2];
  return element.tagName.toLowerCase()===selector.toLowerCase();
 }
 class Element {
  constructor(tag,attrs={},text=''){this.tagName=tag.toUpperCase();this.attrs=new Map(Object.entries(attrs));this.children=[];this.ownerDocument=doc;this.textContent=text;this.isConnected=true;this.classes=new Set();this.classList={add:value=>this.classes.add(value),remove:value=>this.classes.delete(value),contains:value=>this.classes.has(value)};}
  getAttribute(name){return this.attrs.get(name)??null;}
  setAttribute(name,value){this.attrs.set(name,value);}
  hasAttribute(name){return this.attrs.has(name);}
  removeAttribute(name){this.attrs.delete(name);}
  append(child){child.parentElement=this;this.children.push(child);}
  remove(){this.isConnected=false;if(this.parentElement)this.parentElement.children=this.parentElement.children.filter(item=>item!==this);}
  contains(item){for(let node=item;node;node=node.parentElement)if(node===this)return true;return false;}
  closest(selector){for(let node=this;node;node=node.parentElement)if(selector.split(',').some(part=>matches(node,part)))return node;return null;}
  querySelectorAll(selector){const found=[];const visit=node=>{for(const child of node.children){if(selector.split(',').some(part=>matches(child,part)))found.push(child);visit(child);}};visit(this);return found;}
  querySelector(selector){return this.querySelectorAll(selector)[0]??null;}
  getBoundingClientRect(){const hidden=this.hasAttribute('hidden')||doc.documentElement.classList.contains('kkeep-tiktok-app')&&this.closest('[data-kkeep-app-hide]');return {width:hidden?0:500,height:hidden?0:800,left:0,right:500,top:0,bottom:800};}
  click(){clicks.push(this.getAttribute('data-e2e'));this.onclick?.();}
  focus(){doc.activeElement=this;}
 }
 const html=new Element('html'),head=new Element('head'),body=new Element('body');html.append(head);html.append(body);
 Object.assign(doc,{documentElement:html,head,body,createElement:tag=>new Element(tag),querySelectorAll:selector=>html.querySelectorAll(selector),querySelector:selector=>html.querySelector(selector)});
 doc.defaultView={getComputedStyle:element=>({visibility:'visible',display:element.hasAttribute('hidden')?'none':'block'}),MutationObserver:class{constructor(callback){observer=callback;}observe(){}disconnect(){observer=null;}},addEventListener:(name,fn)=>windowEvents.set(name,fn),removeEventListener:name=>windowEvents.delete(name)};
 const nav=new Element('nav',{class:'tiktok-DivSideNavContainer'});body.append(nav);
 const home=new Element('a',{'data-e2e':'nav-foryou'}),following=new Element('a',{'data-e2e':'nav-following'}),profile=new Element('a',{'data-e2e':'nav-profile'});
 nav.append(home);nav.append(following);nav.append(profile);
 // The signed-out provider URL is not a usable account destination. Its own
 // click handler must open login; reading/constructing href is deliberately forbidden.
 Object.defineProperty(profile,'href',{get(){throw new Error('Do not synthesize account navigation');}});
 const main=new Element('main',{id:known?'main-content-homepage_hot':'unrecognized-player'}),column=new Element('div',{'data-e2e':'anchoring-player-column'}),article=new Element('article',{'data-e2e':'recommend-list-item-container'}),media=new Element('section',{'data-e2e':'feed-video'});
 body.append(main);main.append(column);column.append(article);article.append(media);if(video)media.append(new Element('video'));
 const social=new Element('div',{'data-e2e':'anchoring-engagement-vertical'});column.append(social);const like=new Element('button',{'data-e2e':'like-icon'},'Like');social.append(like);
 const modal=new Element('div',{role:'dialog',hidden:''});body.append(modal);
 const field=new Element('input',{type:'password'});modal.append(field);field.setAttribute('hidden','');Object.defineProperty(field,'value',{get(){throw new Error('Credentials must never be read');}});
 profile.onclick=()=>{dialog=true;modal.removeAttribute('hidden');};
 if(signedOut){const login=new Element('button',{id:'header-login-button','data-e2e':'login-button'},'Log in');login.onclick=profile.onclick;nav.append(login);}
 return {doc,states,clicks,main,column,media,article,social,like,home,following,profile,nav,events,windowEvents,
  create:()=>attachTikTokApp(doc,'https://www.tiktok.com/',state=>states.push(state)),
  mutate(){observer?.([{type:'childList',target:main}]);},
  closeDialog(){dialog=false;modal.setAttribute('hidden','');this.mutate();},
  get last(){return states.at(-1);},get observerActive(){return !!observer;},get dialog(){return dialog;}};
}

test('app presentation is limited to ordinary TikTok feed locations',()=>{
 for(const url of ['https://www.tiktok.com/','https://www.tiktok.com/foryou?lang=en','https://www.tiktok.com/following'])assert.equal(isTikTokAppFeed(url),true,url);
 for(const url of ['https://www.tiktok.com/@person','https://www.tiktok.com/@','https://www.tiktok.com/login','https://www.tiktok.com/@person/video/123','https://www.tiktok.com/foryou?code=test','https://www.tiktok.com/#access_token=test','https://login.tiktok.com/','https://tiktok.com.evil.example/','https://u:p@www.tiktok.com/'])assert.equal(isTikTokAppFeed(url),false,url);
});

test('recognized feed adapts existing DOM and keeps native video/social nodes in place',()=>{
 const f=fixture(),parents=[f.article.parentElement,f.social.parentElement,f.like.parentElement],app=f.create();
 try{
  assert.equal(f.last.active,true);assert.equal(f.doc.documentElement.classList.contains('kkeep-tiktok-app'),true);
  assert.equal(f.nav.hasAttribute('data-kkeep-app-hide'),true);assert.equal(f.main.hasAttribute('data-kkeep-app-main'),true);
  assert.deepEqual([f.article.parentElement,f.social.parentElement,f.like.parentElement],parents);
  assert.equal(f.last.available.home,true);assert.equal(f.last.available.friends,false);
  assert.equal(app.activate('friends'),false);assert.deepEqual(f.clicks,[]);
  assert.equal(app.activate('following'),true);assert.deepEqual(f.clicks,['nav-following']);
  app.updateUrl('https://www.tiktok.com/following');assert.equal(f.last.tab,'following');
 }finally{app.destroy();}
 assert.equal(f.doc.documentElement.classList.contains('kkeep-tiktok-app'),false);assert.equal(f.nav.hasAttribute('data-kkeep-app-hide'),false);assert.equal(f.main.hasAttribute('data-kkeep-app-main'),false);
 assert.equal(f.doc.head.children.length,0);assert.equal(f.observerActive,false);assert.equal(f.events.size,0);assert.equal(f.windowEvents.size,0);
});

test('native profile click opens the existing login and restores app view after dismissal',t=>{
 t.mock.timers.enable({apis:['setTimeout']});const f=fixture(),app=f.create();
 try{
  assert.equal(app.activate('profile'),true);assert.deepEqual(f.clicks,['nav-profile']);assert.equal(f.dialog,true);assert.equal(f.last.active,false);
  t.mock.timers.tick(251);assert.equal(f.last.active,false);assert.equal(f.nav.hasAttribute('data-kkeep-app-hide'),false);
  f.closeDialog();t.mock.timers.tick(251);assert.equal(f.last.active,true);
 }finally{app.destroy();t.mock.timers.reset();}
});

test('account pages and unknown layouts stay native; explicit website view reverses all adaptation',()=>{
 const f=fixture(),app=f.create();
 try{
  app.updateUrl('https://www.tiktok.com/@person');assert.equal(f.last.active,false);assert.equal(f.main.hasAttribute('data-kkeep-app-main'),false);
  app.updateUrl('https://www.tiktok.com/');assert.equal(f.last.active,true);
  app.setEnabled(false);assert.equal(f.last.active,false);assert.equal(f.nav.hasAttribute('data-kkeep-app-hide'),false);
  app.setEnabled(true);assert.equal(f.last.active,true);
 }finally{app.destroy();}
 for(const options of [{known:false},{video:false}]){const other=fixture(options),view=other.create();try{assert.equal(other.last.active,false);assert.equal(other.nav.hasAttribute('data-kkeep-app-hide'),false);}finally{view.destroy();}}
});

test('native controls can still be found behind only Kkeep-hidden chrome',()=>{
 const f=fixture(),app=f.create();
 try{
  assert.equal(f.home.getBoundingClientRect().width,0);
  assert.equal(findTikTokAppControl(f.doc,'home',true),f.home);
  f.home.setAttribute('disabled','');assert.equal(findTikTokAppControl(f.doc,'home',true),null);
 }finally{app.destroy();}
});

test('signed-out Friends and Inbox use the real provider login control without guessed URLs',()=>{
 const f=fixture({signedOut:true}),app=f.create();
 try{assert.equal(f.last.available.friends,true);assert.equal(f.last.available.inbox,true);assert.equal(f.last.loginRequired.friends,true);assert.equal(app.activate('friends'),true);assert.deepEqual(f.clicks,['login-button']);assert.equal(f.dialog,true);assert.equal(f.last.active,false);}
 finally{app.destroy();}
});

test('a provider layout replacement falls back once instead of resizing in a loop',t=>{
 t.mock.timers.enable({apis:['setTimeout']});const f=fixture(),app=f.create();
 try{
  f.column.remove();f.mutate();t.mock.timers.tick(251);assert.equal(f.last.active,false);
  f.main.append(f.column);f.mutate();t.mock.timers.tick(251);assert.equal(f.last.active,false);
  app.setEnabled(true);assert.equal(f.last.active,true);
 }finally{app.destroy();t.mock.timers.reset();}
});
