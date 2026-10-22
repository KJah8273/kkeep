// Local implementation of the small Playables API surface used by this build.
// Saves stay on this device; no YouTube login or external SDK is loaded.
(()=>{
  const key='kkeep.stick-war.save.v1';
  const noop=()=>{};
  function subscribe(event,callback,when){const fn=()=>{if(when())callback();};document.addEventListener(event,fn);return()=>document.removeEventListener(event,fn);}
  window.ytgame={IN_PLAYABLES_ENV:true,SDK_VERSION:'kkeep-local-1',
    game:{loadData:async()=>{for(let i=0;i<200&&!window.unityGameInstance;i++)await new Promise(r=>setTimeout(r,50));try{return localStorage.getItem(key)||'';}catch{return '';}},saveData:async(data)=>{localStorage.setItem(key,String(data));},firstFrameReady:noop,gameReady:noop},
    system:{isAudioEnabled:()=>true,onAudioEnabledChange:()=>noop,onPause:fn=>subscribe('visibilitychange',fn,()=>document.hidden),onResume:fn=>subscribe('visibilitychange',fn,()=>!document.hidden)},
    ads:{requestInterstitialAd:async()=>{}},engagement:{sendScore:noop},health:{logError:()=>console.warn('Game reported an error'),logWarning:noop}};
})();
