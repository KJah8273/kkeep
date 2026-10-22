/* Kkeep's loader; the official game's code, assets and controls stay intact. */
(()=>{
 'use strict';
 let instance,finished=false,failed=false;
 const send=(event,message={})=>parent.postMessage({event,message},location.origin);
 const fail=()=>{if(failed||finished)return;failed=true;send('error');};
 window.addEventListener('unhandledrejection',fail);
 window.addEventListener('error',fail);
 async function start(){
  send('stage',{text:'Preparing Stick Fight…'});
  const response=await fetch('/api/stick-build',{cache:new URLSearchParams(location.search).has('retry')?'reload':'default',signal:AbortSignal.timeout(25000)});
  if(!response.ok)throw new Error('Build unavailable');
  const {loaderUrl,config}=await response.json();
  const local=url=>'/api/stick-asset?url='+encodeURIComponent(url);
  for(const key of ['dataUrl','codeUrl'])config[key]=local(config[key]);
  send('stage',{text:'Loading the game engine…'});
  await new Promise((resolve,reject)=>{
   const script=document.createElement('script');const timer=setTimeout(()=>{script.remove();reject(new Error('Loader timed out'));},45000);
   script.src=local(loaderUrl);script.crossOrigin='anonymous';
   script.onload=()=>{clearTimeout(timer);resolve();};script.onerror=()=>{clearTimeout(timer);reject(new Error('Loader unavailable'));};document.head.append(script);
  });
  if(failed)return;
  send('stage',{text:'Loading Stick Fight… The first download may take a while.'});
  // Render fewer pixels on touch screens; do not pretend to change the game's assets.
  config.devicePixelRatio=matchMedia('(pointer: coarse)').matches?1:Math.min(devicePixelRatio,1.5);
  config.cacheControl=url=>url===config.dataUrl||url===config.codeUrl?'immutable':'no-store';
  instance=await createUnityInstance(document.querySelector('canvas'),config,progress=>{
   if(!failed)send('progress',{progress});
  });
  if(failed){await instance.Quit();return;}
  finished=true;send('ready');document.querySelector('canvas').focus({preventScroll:true});
 }
 window.addEventListener('pagehide',()=>{if(instance)instance.Quit().catch(()=>{});},{once:true});
 start().catch(fail);
})();
