/* AGPL-3.0-only. Xbox Cloud Gaming launcher; navigation stays in Scramjet. */
(()=>{
  'use strict';
  const byId=id=>document.getElementById(id);
  const loading=byId('loading'),error=byId('error'),container=byId('frame');
  let handle,current='https://www.xbox.com/en-us/play',starting=false,lastRecovery=0,disposed=false;
  try{const input=new URLSearchParams(location.search).get('launch');if(input){const url=new URL(input);if(['https:','http:'].includes(url.protocol)&&!url.username&&!url.password&&url.origin!==location.origin)current=url.href;}}catch{}
  if(location.search)history.replaceState(null,'',location.pathname);
  const pending=()=>{loading.hidden=false;error.hidden=true;};
  function signInTools(url){const show=window.KkeepXboxSignInWindow?.isMicrosoft(url)===true;byId('signin-window').hidden=!show;byId('signin-retry').hidden=!show;document.body.classList.toggle('signing-in',show);}
  function failed(message){loading.hidden=true;byId('error-message').textContent=message;error.hidden=false;}
  async function start(){
    if(starting)return;
    starting=true;disposed=false;pending();
    try{
      if(!window.isSecureContext||!('serviceWorker' in navigator))throw Error('This connection needs HTTPS. Open the published Kkeep link in Safari or Chrome.');
      if(!window.KHAProxy||!window.$scramjetController||!window.$scramjet||!window.KkeepXboxMedia||!window.KkeepXboxSignIn||!window.KkeepXboxSignInWindow||!window.KkeepXboxSignInStatus)throw Error('The Xbox engine did not download completely. Reload this page to try again.');
      handle?.destroy();handle=undefined;
      window.KHAProxy.setLite(false);
      try{window.KHAProxy.setAdBlock(localStorage.getItem('kkeep-ads')!=='false');}catch{}
      const next=await window.KHAProxy.mount(container,{
        onNavigate(url){current=url;signInTools(url);byId('connection-details').hidden=true;pending();},
        onTitle(title){document.title=title+' · Kkeep';},
        onLoaded(){loading.hidden=true;error.hidden=true;},
        onSignInWindow(active){loading.hidden=true;error.hidden=true;byId('signin-note').hidden=!active;},
        onSignInStatus(report){
          byId('connection-report').textContent=['Xbox connection 5',report.surface==='window'?'Sign-in window':'Embedded sign-in','Status: '+report.kind,'Script: '+report.script,...(report.line?['Position: '+report.line+':'+(report.column||0)]:[]),...(typeof report.rootEmpty==='boolean'?['Form container: '+(report.rootEmpty?'empty':'present')]:[])].join('\n');
          byId('connection-details').hidden=false;
        },
        onError:failed,
        onOpen(url){handle?.go(url);},
        onRecover(){if(Date.now()-lastRecovery<15000){failed('The Xbox connection stopped. Tap Retry to reconnect.');return;}lastRecovery=Date.now();start();}
      });
      if(disposed){next.destroy();return;}
      handle=next;handle.go(current);
    }catch(e){if(!disposed)failed(e instanceof Error?e.message:'The Xbox connection could not start.');}
    finally{starting=false;}
  }
  function retry(){if(handle){pending();handle.reload();}else if(window.KHAProxy)start();else location.reload();}
  byId('reload').addEventListener('click',retry);
  byId('retry').addEventListener('click',retry);
  byId('wait').addEventListener('click',()=>{error.hidden=true;});
  for(const id of ['signin-window','signin-retry','signin-focus'])byId(id).addEventListener('click',()=>handle?.openSignIn());
  byId('return-xbox').addEventListener('click',()=>{byId('signin-note').hidden=true;handle?.go('https://www.xbox.com/en-us/play');});
  function immersive(value){document.body.classList.toggle('immersive',value);byId('exit-fullscreen').hidden=!value;}
  byId('fullscreen').addEventListener('click',()=>{immersive(true);document.documentElement.requestFullscreen?.().catch(()=>{});});
  byId('exit-fullscreen').addEventListener('click',()=>{immersive(false);if(document.fullscreenElement)document.exitFullscreen?.().catch(()=>{});});
  document.addEventListener('fullscreenchange',()=>{if(!document.fullscreenElement)immersive(false);});
  document.addEventListener('keydown',event=>{if(event.key==='Escape')immersive(false);});
  window.addEventListener('pagehide',()=>{disposed=true;handle?.destroy();handle=undefined;});
  window.addEventListener('pageshow',event=>{if(event.persisted)start();});
  start();
})();
