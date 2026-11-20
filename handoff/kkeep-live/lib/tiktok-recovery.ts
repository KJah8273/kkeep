/** Startup recovery follows TikTok navigation, including client-side history changes. */
export const TIKTOK_HOME='https://www.tiktok.com/';
export const TIKTOK_UNAVAILABLE='TikTok returned its unavailable page. Reconnect to try the page again. If this repeats, TikTok is not serving this page to the proxy session.';

function publicPage(value:string){
 try{
  const url=new URL(value);
  if(url.protocol!=='https:'||url.username||url.password||url.port||!['tiktok.com','www.tiktok.com','m.tiktok.com'].includes(url.hostname))return null;
  return {href:url.href,path:url.pathname.replace(/\/+$/,'')||'/',search:url.searchParams,hash:url.hash};
 }catch{return null;}
}

export function isTikTokLanding(value:string){
 const page=publicPage(value);
 // A provider can return authentication/verification data to its root route.
 // Only plain public landings and their language setting are safe to reopen.
 return !!page&&['/','/foryou'].includes(page.path)&&!page.hash&&Array.from(page.search.keys()).every(name=>name==='lang');
}
export const isTikTokUnavailable=(value:string)=>publicPage(value)?.path==='/404';

/** A manual reconnect can restore an observed content route without replaying
 * a sign-in callback or challenge. Keep the original URL bytes/encoding; never
 * invent a profile, friends or account URL from a label or guessed username. */
function reconnectPage(value:string){
 const page=publicPage(value);
 if(!page||page.hash||page.path==='/404')return null;
 let path:string;
 try{path=decodeURIComponent(page.path);}catch{return null;}
 // The signed-out Profile control has an empty /@ href and opens TikTok's
 // login dialog through its own click handler. It is not a real profile URL.
 if(path==='/@'||/%[a-f0-9]{2}/i.test(path))return null;
 if(/(?:^|\/)(?:log-?in|sign-?in|sign-?up|register|auth|oauth|sso|passport|verify|verification|challenge|captcha|callback|redirect|consent)(?:\/|$)/i.test(path))return null;
 // Query-bearing authentication, verification and signed links must remain
 // opaque to recovery. Only an ordinary language setting/search is retained.
 const allowed=page.path==='/search'?new Set(['lang','q']):new Set(['lang']);
 if(!Array.from(page.search.keys()).every(name=>allowed.has(name)))return null;
 return page.href;
}

/** Retry the public landing once; never replay a login, challenge or deep link. */
export function createTikTokStartupRecovery(){
 let landing=true,retried=false,reconnect=TIKTOK_HOME;
 return {
  navigate(value:string):{retry?:string;unavailable:boolean}{
   if(isTikTokUnavailable(value)){
    if(landing&&!retried){retried=true;return {retry:TIKTOK_HOME,unavailable:false};}
    return {unavailable:true};
   }
   reconnect=reconnectPage(value)||TIKTOK_HOME;
   landing=isTikTokLanding(value);
   return {unavailable:false};
  },
  reconnectUrl(){return reconnect;},
  reset(){landing=true;retried=false;reconnect=TIKTOK_HOME;},
 };
}
