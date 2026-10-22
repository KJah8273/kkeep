/* AGPL-3.0-only. Keep interactive Microsoft sign-in in a top-level proxy window. */
(()=>{
  'use strict';
  const microsoft=value=>{try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&['login.live.com','login.microsoftonline.com','account.live.com'].includes(u.hostname);}catch{return false;}};
  function create({prefix,encode,decode,current,onChange,onReturn,onError}){
    const base=new URL(prefix,location.href);
    if(base.origin!==location.origin||!base.pathname.endsWith('/'))throw Error('Invalid sign-in proxy route');
    let popup,timer,returned=false,stopped=false;
    const stopTimer=()=>{clearInterval(timer);timer=undefined;};
    const check=()=>{
      if(stopped||!popup)return;
      if(popup.closed){stopTimer();popup=undefined;onChange(false);return;}
      try{
        const at=new URL(popup.location.href);
        if(at.origin!==base.origin||!at.pathname.startsWith(base.pathname))return;
        const target=new URL(decode(at.pathname.slice(base.pathname.length)));
        // Wait until Xbox has processed its callback. Never strip or replay
        // authorization fragments, or treat the callback itself as completion.
        if(target.protocol!=='https:'||target.hostname!=='www.xbox.com'||!/^\/(?:[a-z]{2}-[a-z]{2}\/)?play(?:\/|$)/i.test(target.pathname)||/[#&?](?:code|access_token|id_token|error)=/i.test(target.href+at.hash))return;
        if(popup.document.readyState!=='complete'||returned)return;
        returned=true;stopTimer();onChange(false);onReturn();
        popup.close();popup=undefined;
      }catch{ /* Navigation can temporarily replace a window's document. */ }
    };
    return {
      open(){
        if(stopped)return false;
        if(popup&&!popup.closed){popup.focus();return true;}
        const target=current();if(!microsoft(target))return false;
        // Synchronous user gesture: iPad Safari must not wait on an async task
        // before window.open. Keep the opener for the controller and the native
        // sessionStorage copy, without reading or copying credentials ourselves.
        popup=window.open(base.href+encode(target),'_blank');
        if(!popup){onError('The sign-in window was blocked. Allow pop-ups for Kkeep, then tap Sign-in window again.');return false;}
        returned=false;onChange(true);stopTimer();timer=setInterval(check,750);return true;
      },
      owns(source){return !!popup&&source===popup;},
      destroy(){stopped=true;stopTimer();popup=undefined;}
    };
  }
  window.KkeepXboxSignInWindow={create,isMicrosoft:microsoft};
})();
