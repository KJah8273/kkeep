/* Xbox-only Microsoft sign-in readiness. No form values or account data read. */
(()=>{
  'use strict';
  const isSignIn=value=>{try{return ['login.live.com','login.microsoftonline.com','account.live.com'].includes(new URL(value).hostname);}catch{return false;}};
  function watch(doc,url,onReady){
    if(!isSignIn(url))return ()=>{};
    let stopped=false,ready=false,pending;
    const check=()=>{
      pending=undefined;if(stopped)return;
      const visible=Array.from(doc.querySelectorAll('input:not([type="hidden"]),button[type="submit"],[role="button"]')).some(node=>!node.hidden&&node.getClientRects().length>0);
      if(visible&&!ready)onReady();
      ready=visible;
    };
    const queue=()=>{if(!stopped&&pending===undefined)pending=setTimeout(check,0);};
    const observer=new MutationObserver(queue);
    observer.observe(doc,{subtree:true,childList:true,attributes:true,attributeFilter:['class','style','hidden','type']});
    doc.addEventListener('load',queue,true);
    check();
    return ()=>{stopped=true;clearTimeout(pending);observer.disconnect();doc.removeEventListener('load',queue,true);};
  }
  window.KkeepXboxSignIn={isSignIn,watch};
})();
