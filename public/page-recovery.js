/* Recover an older Kkeep shell whose versioned files disappeared after an update. */
(()=>{
  let scheduled=false;
  const key='kkeep-page-recovery-at';
  const recover=()=>{
    if(scheduled||navigator.onLine===false)return;
    try{
      const previous=Number(sessionStorage.getItem(key)||0);
      if(Date.now()-previous<60000)return;
      sessionStorage.setItem(key,String(Date.now()));
    }catch{return;}
    scheduled=true;
    // Preserve Home Screen launch paths and the user's current destination.
    const url=new URL(location.href);
    url.searchParams.set('_kkeep_refresh',String(Date.now()));
    location.replace(url.href);
  };
  addEventListener('error',event=>{
    const target=event.target;
    const file=target?.tagName==='SCRIPT'?target.src:target?.tagName==='LINK'?target.href:null;
    if(!file)return;
    try{const url=new URL(file,location.href);if(url.origin===location.origin&&url.pathname.startsWith('/assets/'))recover();}catch{}
  },true);
  addEventListener('vite:preloadError',recover);
})();
