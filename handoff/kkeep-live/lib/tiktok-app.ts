import {hasTikTokDialog} from './tiktok-desktop.ts';

export type TikTokAppAction = 'home'|'following'|'for-you'|'friends'|'create'|'inbox'|'profile'|'search'|'live';
export type TikTokAppState = {active:boolean; tab:'following'|'for-you'; available:Record<TikTokAppAction,boolean>; loginRequired:Partial<Record<TikTokAppAction,boolean>>};
export const TIKTOK_APP_EMPTY:TikTokAppState = {active:false,tab:'for-you',available:{home:false,following:false,'for-you':false,friends:false,create:false,inbox:false,profile:false,search:false,live:false},loginRequired:{}};

/** Only the ordinary feed is restyled. Accounts, videos, challenges and forms retain TikTok's page. */
export function isTikTokAppFeed(value:string) {
 try {
  const url=new URL(value);
  return url.protocol==='https:'&&!url.port&&!url.username&&!url.password&&/^(?:www\.)?tiktok\.com$/.test(url.hostname)&&
   /^\/(?:foryou|following)?\/?$/.test(url.pathname)&&
   ![...url.searchParams.keys()].some(key=>/token|auth|verify|challenge|captcha|^code$|^state$/i.test(key))&&
   !/token|auth|verify|challenge|captcha|code=/i.test(url.hash);
 }catch{return false;}
}

const controls:Record<TikTokAppAction,string>={
 home:'[data-e2e="nav-foryou"]',
 'for-you':'[data-e2e="nav-foryou"]',
 following:'[data-e2e="nav-following"]',
 friends:'[data-e2e="nav-friends"]',
 create:'[data-e2e="upload-icon"],[data-e2e="nav-upload"],[data-e2e="upload-button"]',
 inbox:'[data-e2e="inbox-icon"],[data-e2e="nav-inbox"],[data-e2e="messages-icon"]',
 profile:'[data-e2e="nav-profile"],[data-e2e="profile-icon"]',
 search:'[data-e2e="search-box"],[data-e2e="search-user-input"],[data-e2e="nav-search"],button[aria-label="Search"]',
 live:'[data-e2e="nav-live"]',
};
const names:Record<TikTokAppAction,RegExp>={
 home:/^(?:for you|home|لك|الرئيسية)$/i,'for-you':/^(?:for you|لك)$/i,
 following:/^(?:following|أتابعه|متابَعون|المتابَعون)$/i,friends:/^(?:friends|الأصدقاء)$/i,
 create:/^(?:upload|create|تحميل|إنشاء)$/i,inbox:/^(?:inbox|messages|صندوق الوارد|الرسائل)(?:\s*\d+)?$/i,
 profile:/^(?:profile|view profile|your profile|الملف الشخصي)$/i,search:/^(?:search|بحث)$/i,live:/^(?:live|بث مباشر)$/i,
};

function rendered(element:Element,allowAppHidden=false) {
 const css=element.ownerDocument.defaultView?.getComputedStyle(element);
 if(css?.display==='none'||css?.visibility==='hidden'||element.hasAttribute('hidden'))return false;
 const rect=element.getBoundingClientRect();
 if(rect.width>0&&rect.height>0)return true;
 if(!allowAppHidden||!element.closest('[data-kkeep-app-hide]'))return false;
 // Ignore only the chrome hidden by this adapter, never provider-hidden
 // duplicate controls or an account button that TikTok removed from view.
 for(let parent:Element|null=element;parent;parent=parent.parentElement){
  const view=parent.ownerDocument.defaultView?.getComputedStyle(parent);
  if(parent.hasAttribute('hidden')||view?.visibility==='hidden'||view?.display==='none'&&!parent.hasAttribute('data-kkeep-app-hide'))return false;
 }
 return true;
}
function clickable(element:Element):HTMLElement|null {
 const item=element.closest<HTMLElement>('a,button,[role="button"],[role="link"],input')||element as HTMLElement;
 return typeof item.click==='function'&&!item.hasAttribute('disabled')&&item.getAttribute('aria-disabled')!=='true'?item:null;
}

/** Return an existing provider control; never construct an account URL or substitute a form. */
export function findTikTokAppControl(doc:Document,action:TikTokAppAction,adapted=false):HTMLElement|null {
 for(const element of doc.querySelectorAll(controls[action])){
  const control=clickable(element);
  if(control&&rendered(control,adapted))return control;
 }
 const items=doc.querySelectorAll('nav a,nav button,header a,header button,[role="navigation"] a,[role="navigation"] button,[class*="SideNav"] a,[class*="SideNav"] button');
 for(const element of items){
  const label=(element.getAttribute('aria-label')||element.getAttribute('title')||element.textContent||'').trim().replace(/\s+/g,' ');
  const control=clickable(element);
  if(control&&label.length<80&&names[action].test(label)&&rendered(control,adapted))return control;
 }
 return null;
}

function loginControl(doc:Document,adapted:boolean){
 for(const element of doc.querySelectorAll('[id="header-login-button"],[data-e2e="top-login-button"],[data-e2e="login-button"]')){
  const control=clickable(element);if(control&&rendered(control,adapted))return control;
 }
 return null;
}

// These are the existing TikTok cinema-feed containers. No player, caption,
// account action or social count is cloned, moved, synthesized or replaced.
const appCss=`
html.kkeep-tiktok-app,html.kkeep-tiktok-app body{background:#000!important;color:#fff!important;overflow:hidden!important}
html.kkeep-tiktok-app [data-kkeep-app-hide]{display:none!important}
html.kkeep-tiktok-app [data-kkeep-app-main]{position:fixed!important;inset:0!important;width:100vw!important;height:100dvh!important;max-width:none!important;max-height:none!important;margin:0!important;padding:0!important;background:#000!important;overflow:hidden!important;flex:1!important}
html.kkeep-tiktok-app [data-e2e="anchoring-player-column"]{width:100%!important;max-width:none!important;height:100%!important;margin:0!important;background:#000!important}
html.kkeep-tiktok-app [data-e2e="recommend-list-item-container"]{max-width:none!important;background:#000!important}
html.kkeep-tiktok-app [data-e2e="feed-video"]{background:#000!important}
html.kkeep-tiktok-app [data-e2e="feed-video"] video{object-fit:contain!important;background:#000!important}
html.kkeep-tiktok-app [data-e2e="anchoring-chrome-host"]{inset:0!important;width:100%!important;height:100%!important;max-width:none!important;border-radius:0!important}
html.kkeep-tiktok-app [data-e2e="anchoring-engagement-vertical"]{right:clamp(16px,2.3vw,36px)!important;bottom:clamp(100px,14vh,170px)!important;width:64px!important;height:auto!important;min-height:0!important;max-height:none!important;overflow:visible!important;gap:clamp(12px,2vh,24px)!important;z-index:5!important}
html.kkeep-tiktok-app [data-e2e="anchoring-engagement-vertical"] [class*="SectionActionBar"]{width:64px!important;height:auto!important;min-height:0!important;max-height:none!important;overflow:visible!important;align-items:center!important}
html.kkeep-tiktok-app [data-e2e="anchoring-engagement-vertical"] [class*="DivActionItemAvailability"]{height:auto!important;min-height:64px!important;flex-shrink:0!important}
html.kkeep-tiktok-app [data-e2e="anchoring-engagement-vertical"] :is([data-e2e="like-icon"],[data-e2e="comment-icon"],[data-e2e="favorite-icon"],[data-e2e="share-icon"]){display:flex!important;align-items:center!important;justify-content:center!important;width:44px!important;height:auto!important;min-width:44px!important;min-height:64px!important;flex-shrink:0!important;padding:0!important;overflow:visible!important;touch-action:manipulation!important}
html.kkeep-tiktok-app [data-e2e="anchoring-engagement-vertical"] :is([class*="SpanTuxIconWrapper"],[class*="tux-interaction-container__"],[class*="tux-button__element__"],[class*="tux-button__content__"],[class*="tux-icon-button__"],[class*="HeartWrapper"]){width:32px!important;height:32px!important;min-width:0!important;min-height:0!important;max-width:none!important;max-height:none!important;padding:0!important;overflow:visible!important;line-height:1!important;flex-shrink:0!important}
html.kkeep-tiktok-app [data-e2e="anchoring-engagement-vertical"] svg{display:block!important;width:32px!important;height:32px!important;min-width:32px!important;min-height:32px!important;flex-shrink:0!important}
html.kkeep-tiktok-app [data-e2e="anchoring-engagement-vertical"] :is([data-e2e="like-count"],[data-e2e="comment-count"],[data-e2e="favorite-count"],[data-e2e="share-count"]){display:block!important;font-size:14px!important;line-height:20px!important;height:auto!important;min-height:20px!important;overflow:visible!important;text-align:center!important}
html.kkeep-tiktok-app [data-e2e="anchoring-description-layer"]{position:absolute!important;left:0!important;right:0!important;bottom:48px!important;width:auto!important;height:auto!important;min-height:0!important;max-height:38dvh!important;padding-left:clamp(18px,2.6vw,40px)!important;padding-right:100px!important;padding-bottom:0!important;max-width:100%!important;overflow-y:auto!important;text-shadow:0 1px 4px #0008!important}
html.kkeep-tiktok-app [data-e2e="video-desc"]{font-size:clamp(15px,1.8vw,20px)!important;line-height:1.45!important}
html.kkeep-tiktok-app [data-e2e="anchoring-playback-chrome"]{padding-left:18px!important;padding-right:18px!important}
html.kkeep-tiktok-app [data-e2e="feed-navigation-prev"],html.kkeep-tiktok-app [data-e2e="feed-navigation-next"]{opacity:0!important;pointer-events:none!important}
@media(max-width:600px){html.kkeep-tiktok-app [data-e2e="anchoring-description-layer"]{padding-left:14px!important;padding-right:76px!important}html.kkeep-tiktok-app [data-e2e="anchoring-engagement-vertical"]{right:12px!important;bottom:112px!important;gap:12px!important}}
`;

export function attachTikTokApp(doc:Document,url:string,onState:(state:TikTokAppState)=>void,enabled=true){
 const win=doc.defaultView!;
 const style=doc.createElement('style');style.setAttribute('data-kkeep-tiktok-style','');style.textContent=appCss;doc.head.append(style);
 const marked=new Map<Element,Map<string,string|null>>();
 let active=false,held=false,sawOverlay=false,lostLayout=false,disposed=false,pending:ReturnType<typeof setTimeout>|undefined,last='';
 let targets:Partial<Record<TikTokAppAction,HTMLElement>>={};
 const mark=(element:Element,name:string)=>{
  let previous=marked.get(element);if(!previous){previous=new Map();marked.set(element,previous);}
  if(!previous.has(name))previous.set(name,element.getAttribute(name));
  if(!element.hasAttribute(name))element.setAttribute(name,'');
 };
 const release=()=>{
  doc.documentElement.classList.remove('kkeep-tiktok-app');
  for(const [element,attributes] of marked)for(const [name,value] of attributes){if(value===null)element.removeAttribute(name);else element.setAttribute(name,value);}
  marked.clear();active=false;
 };
 const overlay=()=>hasTikTokDialog(doc)||Array.from(doc.querySelectorAll('[role="menu"]')).some(el=>rendered(el));
 function refresh(){
  pending=undefined;if(disposed)return;
  const open=overlay();
  if(held&&open)sawOverlay=true;
  if(held&&sawOverlay&&!open){held=false;sawOverlay=false;}
  const main=doc.querySelector<HTMLElement>('main#main-content-homepage_hot');
  const column=main?.querySelector('[data-e2e="anchoring-player-column"]');
  const video=column?.querySelector('video');
  // Some responsive site revisions replace their cinema feed at a breakpoint.
  // Fall back once instead of oscillating between desktop and app viewports.
  if(active&&(!main||!column||!video))lostLayout=true;
  const next=!!(enabled&&!held&&!open&&!lostLayout&&isTikTokAppFeed(url)&&main&&column&&video&&(active||rendered(video)));
  if(!next&&active)release();
  targets={};
  const available={...TIKTOK_APP_EMPTY.available};
  const loginRequired:Partial<Record<TikTokAppAction,boolean>>={};
  for(const action of Object.keys(controls) as TikTokAppAction[]){const control=findTikTokAppControl(doc,action,active);if(control){targets[action]=control;available[action]=true;}}
  const login=loginControl(doc,active);
  if(login)for(const action of ['friends','inbox','profile'] as const)if(!targets[action]){targets[action]=login;available[action]=true;loginRequired[action]=true;}
  if(next&&main){
   mark(main,'data-kkeep-app-main');
   const nav=targets.home?.closest('[class*="DivSideNavContainer"]');
   if(nav)mark(nav,'data-kkeep-app-hide');
   for(const header of doc.querySelectorAll('header,[data-e2e="top-header"]'))if((rendered(header)||header.hasAttribute('data-kkeep-app-hide'))&&!header.contains(main)&&!main.contains(header)&&!header.querySelector('[role="dialog"],input[type="password"]'))mark(header,'data-kkeep-app-hide');
   doc.documentElement.classList.add('kkeep-tiktok-app');active=true;
  }
  const state:TikTokAppState={active,available,loginRequired,tab:/\/following\/?(?:\?|$)/.test(url)?'following':'for-you'};
  const signature=JSON.stringify(state);if(signature!==last){last=signature;onState(state);}
 }
 const schedule=()=>{if(!disposed&&pending===undefined)pending=setTimeout(refresh,250);};
 const observer=new win.MutationObserver(records=>{
  if(records.every(record=>record.type==='attributes'&&(record.target===doc.documentElement&&record.attributeName==='class'||record.attributeName==='style'&&(record.target as Element).closest('[data-e2e="anchoring-progress-bar"],[data-e2e="anchoring-playback-time"]'))))return;
  schedule();
 });
 observer.observe(doc.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['class','style','hidden','aria-hidden','aria-selected','aria-current','disabled']});
 doc.addEventListener('loadedmetadata',schedule,true);win.addEventListener('resize',schedule);
 refresh();
 return {
  updateUrl(value:string){if(value!==url){url=value;held=false;sawOverlay=false;lostLayout=false;}refresh();},
  setEnabled(value:boolean){enabled=value;held=false;sawOverlay=false;lostLayout=false;refresh();},
  activate(action:TikTokAppAction){
   refresh();const control=targets[action];if(!control?.isConnected)return false;
   if(!['home','following','for-you'].includes(action)){held=true;sawOverlay=false;release();refresh();}
   control.click();if(action==='search')control.focus();schedule();return true;
  },
  step(direction:number){
   if(!active||overlay())return false;
   const selector=direction>0?'[data-e2e="feed-navigation-next"]':'[data-e2e="feed-navigation-prev"]';
   const control=doc.querySelector<HTMLElement>(selector);
   if(!control||control.hasAttribute('disabled')||control.getAttribute('aria-disabled')==='true')return false;
   control.click();return true;
  },
  destroy(){disposed=true;observer.disconnect();clearTimeout(pending);doc.removeEventListener('loadedmetadata',schedule,true);win.removeEventListener('resize',schedule);release();style.remove();}
 };
}
