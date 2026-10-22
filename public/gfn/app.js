/* AGPL-3.0-only. Kkeep's GeForce NOW launcher; all site navigation uses Scramjet. */
(()=>{
  'use strict';
  const byId=id=>document.getElementById(id);
  const loading=byId('loading'),error=byId('error'),container=byId('frame');
  let handle,current='https://play.geforcenow.com/mall/',starting=false,lastRecovery=0;
  let touchActive=false;
  function touchState(value){touchActive=value;for(const id of ['touch-controls','touch-quick'])byId(id).setAttribute('aria-pressed',String(value));}
  function closeTouch(){window.KkeepGeForceControls?.close();touchState(false);}
  function openTouch(){
    const frame=container.querySelector('iframe');
    if(!frame||new URL(current).origin!=='https://play.geforcenow.com'){failed('Open the GeForce NOW page before turning on Kkeep Controls.');return;}
    if(!window.KkeepGeForceControls){failed('Kkeep Controls could not download. Reload this page and try again.');return;}
    window.KkeepGeForceControls.open(frame,()=>touchState(false));touchState(true);immersive(true);
  }
  try{const input=new URLSearchParams(location.search).get('launch');if(input){const url=new URL(input);if(['https:','http:'].includes(url.protocol)&&!url.username&&!url.password&&url.origin!==location.origin)current=url.href;}}catch{}
  // The destination belongs to this running session, not the launcher's history.
  if(location.search)history.replaceState(null,'',location.pathname);
  const pending=()=>{loading.hidden=false;error.hidden=true;};
  function failed(message){loading.hidden=true;byId('error-message').textContent=message;error.hidden=false;}
  async function start(){
    if(starting)return;
    starting=true;pending();
    try{
      if(!window.isSecureContext||!('serviceWorker' in navigator))throw Error('Open Kkeep in Safari or Chrome to start this connection.');
      if(!window.KHAProxy||!window.$scramjetController||!window.$scramjet)throw Error('The gaming engine did not download completely. Reload this page to try again.');
      window.KkeepGeForceControls?.reset();touchState(false);handle?.destroy();handle=undefined;
      window.KHAProxy.setLite(false);
      try{window.KHAProxy.setAdBlock(localStorage.getItem('kkeep-ads')!=='false');}catch{}
      handle=await window.KHAProxy.mount(container,{
        onNavigate(url){current=url;if(new URL(url).origin!=='https://play.geforcenow.com')closeTouch();pending();},
        onTitle(title){document.title=title+' · Kkeep';},
        onLoaded(){loading.hidden=true;error.hidden=true;},
        onError:failed,
        onOpen(url){handle?.go(url);},
        onRecover(){if(Date.now()-lastRecovery<15000){failed('This browser lost its gaming connection. Tap Retry to reconnect.');return;}lastRecovery=Date.now();start();}
      });
      handle.go(current);
    }catch(e){failed(e instanceof Error?e.message:'The gaming connection could not start.');}
    finally{starting=false;}
  }
  function retry(){if(handle){pending();handle.reload();}else if(window.KHAProxy)start();else location.reload();}
  byId('reload').addEventListener('click',retry);
  byId('retry').addEventListener('click',retry);
  byId('wait').addEventListener('click',()=>{error.hidden=true;});
  byId('touch-controls').addEventListener('click',openTouch);
  byId('touch-quick').addEventListener('click',openTouch);
  function immersive(value){document.body.classList.toggle('immersive',value);byId('play-tools').hidden=!value;}
  byId('fullscreen').addEventListener('click',()=>{immersive(true);document.documentElement.requestFullscreen?.().catch(()=>{});});
  byId('exit-fullscreen').addEventListener('click',()=>{closeTouch();immersive(false);if(document.fullscreenElement)document.exitFullscreen?.().catch(()=>{});});
  document.addEventListener('fullscreenchange',()=>{if(touchActive&&document.fullscreenElement?.tagName==='IFRAME'){document.exitFullscreen?.().catch(()=>{});immersive(true);}else if(!document.fullscreenElement&&!touchActive)immersive(false);});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'){closeTouch();immersive(false);}});
  window.addEventListener('pagehide',()=>{window.KkeepGeForceControls?.reset();touchState(false);handle?.destroy();handle=undefined;});
  window.addEventListener('pageshow',event=>{if(event.persisted)start();});
  start();
})();
