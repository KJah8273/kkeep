export async function prepareAssets(){
 if(!('serviceWorker' in navigator))throw new Error('This game needs Safari with service workers enabled. Open Kkeep directly in Safari.');
 const registration=await navigator.serviceWorker.register('/games/asset-worker.js?v=ipad-20261009-2',{scope:'/games/',updateViaCache:'none'});
 await registration.update();
 const pending=registration.installing||registration.waiting;
 if(pending&&pending.state!=='activated')await new Promise((resolve,reject)=>{pending.addEventListener('statechange',()=>{if(pending.state==='activated')resolve();if(pending.state==='redundant')reject(new Error('Game loader update failed. Reload to retry.'));});});
 await navigator.serviceWorker.ready;
 if(!navigator.serviceWorker.controller)await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Game loader did not activate. Tap Reload to retry.')),15000);navigator.serviceWorker.addEventListener('controllerchange',()=>{clearTimeout(timer);resolve();},{once:true});});
}
export async function startUnity({group,build,canvas,onProgress,onError}){
 await prepareAssets();
 const base=location.origin+'/games/assets/'+group+'/';
 await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=base+'Build/'+build+'.loader.js';script.onload=resolve;script.onerror=()=>reject(new Error('Could not load the game engine. Tap Reload to retry.'));document.head.append(script);});
 let low=true;try{low=localStorage.getItem('kkeep.game.quality')!=='balanced';}catch{}
 window.alert=message=>onError(String(message));
 window.addEventListener('error',event=>{if(event.message)onError(event.message);});
 window.addEventListener('unhandledrejection',event=>onError(event.reason?.message||String(event.reason))); 
 const instance=await window.createUnityInstance(canvas,{
  dataUrl:base+'Build/'+build+'.data',codeUrl:base+'Build/'+build+'.wasm',frameworkUrl:base+'Build/'+build+'.framework.js',streamingAssetsUrl:base+'StreamingAssets',
  devicePixelRatio:low?.75:1,webglContextAttributes:{antialias:false,powerPreference:'low-power'},autoSyncPersistentDataPath:true,
  cacheControl:()=> 'no-store',companyName:'DefaultCompany',productName:'ExportedProject',productVersion:'1.0',
  showBanner:(message,type)=>{if(type==='error')onError(message);else console.warn(message);}
 },onProgress);
 window.unityInstance=instance;
 canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();onError('The iPad ran out of graphics resources. Close other game tabs, then reload in Low quality.');});
 window.dispatchEvent(new Event('kkeep-game-ready'));
 return instance;
}
