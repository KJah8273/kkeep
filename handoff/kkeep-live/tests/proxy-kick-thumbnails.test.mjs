import test from 'node:test';
import assert from 'node:assert/strict';
import {attachKickThumbnails,isKickThumbnail,isKickPage} from '../lib/kick-thumbnails.ts';

function harness(t){
 let now=100000,id=0,mutation;const timers=new Map(),listeners=new Map(),images=[];
 t.mock.method(Date,'now',()=>now);
 class Element{
  parentElement=null;css={visibility:'visible',overflowX:'visible'};
  rect={left:0,right:400,top:100,bottom:325,width:400,height:225};
  getBoundingClientRect(){return this.rect;}closest(){return null;}querySelector(){return null;}matches(){return false;}
 }
 const doc={body:new Element(),documentElement:new Element(),visibilityState:'visible',querySelectorAll:()=>images,addEventListener:(n,f)=>listeners.set(n,f),removeEventListener:n=>listeners.delete(n)};
 const win={Element,innerWidth:1024,innerHeight:768,getComputedStyle:e=>e.css,MutationObserver:class{constructor(fn){mutation=fn;}observe(){}disconnect(){mutation=null;}},setTimeout:(fn,ms)=>{const n=++id;timers.set(n,{fn,due:now+ms});return n;},clearTimeout:n=>timers.delete(n),addEventListener:(n,f)=>listeners.set(n,f),removeEventListener:n=>listeners.delete(n)};doc.defaultView=win;
 function photo({channel=1,left=0,top=100,complete=false,width=0,url}={}){
  const img=new Element(),original=url||`https://web.kick.com/api/v1/channels/${channel}/thumbnail.jpeg`;
  const attrs={src:'https://kkeep.test/browse/frame/id/'+encodeURIComponent(original),'scramjet-attr-src':original};
  Object.assign(img,{parentElement:doc.body,complete,naturalWidth:width,isConnected:true,loading:'lazy',writes:[],getAttribute:n=>attrs[n]??null,setAttribute:(n,v)=>{attrs[n]=v;img.writes.push({n,v});}});
  img.rect={left,right:left+400,top,bottom:top+225,width:400,height:225};images.push(img);return img;
 }
 function advance(ms){now+=ms;for(let n=0;n<20;n++){const ready=[...timers].filter(([,v])=>v.due<=now);if(!ready.length)return;for(const [key,timer]of ready){timers.delete(key);timer.fn();}}throw new Error('Unexpected retry loop');}
 return {doc,win,photo,advance,timers,listeners,get now(){return now;},mutation:r=>mutation?.(r)};
}

test('only visible Kick preview images load eagerly, keeping original proxied URLs and offscreen cards untouched',t=>{
 const h=harness(t),visible=h.photo(),below=h.photo({top:1500}),right=h.photo({left:1500}),avatar=h.photo({url:'https://files.kick.com/images/profile.webp'}),loaded=h.photo({width:640});
 const attachment=attachKickThumbnails(h.doc);try{
  h.advance(80);assert.equal(visible.loading,'eager');assert.equal(below.loading,'lazy');assert.equal(right.loading,'lazy');assert.equal(avatar.loading,'lazy');assert.equal(loaded.loading,'lazy');assert.deepEqual(visible.writes,[]);
  below.rect={...below.rect,top:300,bottom:525};h.listeners.get('scroll')();h.advance(80);assert.equal(below.loading,'eager');
 }finally{attachment.destroy();}
});

test('failed preview retries once at the original URL, after the full rate-limit deadline',t=>{
 const h=harness(t),img=h.photo({complete:true});const source=img.getAttribute('src');
 const attachment=attachKickThumbnails(h.doc);try{
  h.advance(80);attachment.setRateLimit(h.now+120000);h.advance(60000);assert.deepEqual(img.writes,[]);
  h.advance(60000);assert.deepEqual(img.writes,[{n:'src',v:source}]);
  h.listeners.get('error')();h.advance(300000);assert.equal(img.writes.length,1);
 }finally{attachment.destroy();}
});

test('hidden tabs do not load previews, and teardown removes observers, timers and listeners',t=>{
 const h=harness(t),img=h.photo({complete:true});h.doc.visibilityState='hidden';
 const attachment=attachKickThumbnails(h.doc);h.advance(80);assert.equal(img.loading,'lazy');
 h.doc.visibilityState='visible';h.listeners.get('visibilitychange')();h.advance(80);assert.equal(img.loading,'eager');
 attachment.destroy();h.advance(120000);assert.deepEqual(img.writes,[]);assert.equal(h.listeners.size,0);assert.equal(h.timers.size,0);
});

test('horizontal carousel clipping prevents eager requests for clipped cards',t=>{
 const h=harness(t),img=h.photo({left:700});const clip=new h.win.Element();clip.parentElement=h.doc.body;clip.css.overflowX='auto';clip.rect.right=600;img.parentElement=clip;
 const attachment=attachKickThumbnails(h.doc);try{h.advance(80);assert.equal(img.loading,'lazy');}finally{attachment.destroy();}
});

test('thumbnail repair accepts only the observed public preview route',()=>{
 assert.equal(isKickPage('https://kick.com/'),true);assert.equal(isKickPage('https://kick.com.example.org/'),false);
 assert.equal(isKickThumbnail('https://web.kick.com/api/v1/channels/1941319/thumbnail.jpeg'),true);
 for(const url of ['https://web.kick.com.example.org/api/v1/channels/1/thumbnail.jpeg','http://web.kick.com/api/v1/channels/1/thumbnail.jpeg','https://web.kick.com/api/v1/login','https://web.kick.com/api/v1/channels/private/thumbnail.jpeg','https://name:password@web.kick.com/api/v1/channels/1/thumbnail.jpeg'])assert.equal(isKickThumbnail(url),false,url);
});
