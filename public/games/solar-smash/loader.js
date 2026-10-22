var unityGameInstance=null;
(async()=>{
 const base='https://cdn.jsdelivr.net/gh/bubbls/youtube-playables@c5eefc5c13316b94c58e63cb5270b99a13c88fea/solar-smash/';
 const status=document.querySelector('#unity-status'),bar=document.querySelector('#unity-progress-bar-full'),canvas=document.querySelector('canvas'),urls=[];
 function fail(error){document.querySelector('#unity-loading-bar').hidden=true;const box=document.querySelector('#unity-error');box.hidden=false;box.textContent='Could not load the game. '+String(error?.message||error)+' Use Reload to try again.';}
 async function unzip(path,mime){
  status.textContent='Downloading '+(path.includes('wasm')?'game engine…':'game content…');
  const response=await fetch(base+'Build/'+path,{signal:AbortSignal.timeout(120000)});
  if(!response.ok)throw Error('Download failed ('+response.status+').');
  const bytes=await kkeepUnzip(await response.blob(),path.replace('.zip',''));
  const url=URL.createObjectURL(new Blob([bytes],{type:mime}));urls.push(url);return url;
 }
 const originalFetch=window.fetch.bind(window);
 window.fetch=(input,options)=>{const url=typeof input==='string'?input:input instanceof URL?input.href:input.url;if(/AssetBundles\/WebGL\/planets2?$/.test(url))return originalFetch(url.replace('https://cdn.jsdelivr.net/gh/bubbls/youtube-playables@','https://raw.githubusercontent.com/bubbls/youtube-playables/'),options);return originalFetch(input,options);};
 try{
  const dataUrl=await unzip('Build.data.zip','application/octet-stream');bar.style.width='25%';
  const codeUrl=await unzip('Build.wasm.zip','application/wasm');bar.style.width='60%';
  await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=base+'Build/Build.loader.js';script.onload=resolve;script.onerror=()=>reject(Error('Engine download failed.'));document.body.append(script);});
  status.textContent='Starting game…';
  unityGameInstance=await createUnityInstance(canvas,{dataUrl,codeUrl,frameworkUrl:base+'Build/Build.framework.js',streamingAssetsUrl:base+'StreamingAssets',companyName:'Paradyme Games',productName:'Live - Solar Smash YouTube',productVersion:'0.1.0',devicePixelRatio:Math.min(devicePixelRatio||1,1.5),autoSyncPersistentDataPath:true,showBanner:(msg,type)=>{if(type==='error')fail(msg);}},p=>bar.style.width=(60+p*40)+'%');
  document.querySelector('#unity-loading-bar').hidden=true;window.dispatchEvent(new Event('kkeep-game-ready'));
 }catch(error){console.error(error);fail(error);}finally{urls.forEach(url=>URL.revokeObjectURL(url));}
})();
