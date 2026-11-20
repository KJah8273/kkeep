(()=>{
  const input=new URLSearchParams(location.search).get('from')||'';
  let target;
  try{
    const old=new URL(input,location.origin);
    if(old.origin!==location.origin)throw Error();
    const match=/^\/(?:(?:gfn|xbox)\/)?browse\/[^/]+\/[^/]+\/(.+)$/.exec(old.pathname);
    if(!match)throw Error();
    const url=new URL(decodeURIComponent(match[1])+old.search+old.hash);
    if(!['https:','http:'].includes(url.protocol)||url.username||url.password||url.origin===location.origin)throw Error();
    target=(old.pathname.startsWith('/gfn/')?'/gfn/index.html':old.pathname.startsWith('/xbox/')?'/xbox/index.html':'/')+'?launch='+encodeURIComponent(url.href);
  }catch{}
  const link=document.getElementById('reopen');
  if(target){link.href=target;link.textContent='Reopen this page';}
  if(window.parent!==window){window.parent.postMessage({type:'kkeep-session-expired'},location.origin);return;}
  if(!target){document.getElementById('message').textContent='Open Kkeep and enter the website address again.';return;}
  // Prevent repeated redirects if this browser cannot keep a proxy session alive.
  try{const last=Number(sessionStorage.getItem('kkeep-recovery-at')||0);if(Date.now()-last<15000){document.getElementById('message').textContent='Automatic reconnect could not finish. Tap below to try again.';return;}sessionStorage.setItem('kkeep-recovery-at',String(Date.now()));}catch{return;}
  location.replace(target);
})();
