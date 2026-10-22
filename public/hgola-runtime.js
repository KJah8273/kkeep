/* Original Unity build; stable asset addresses and save identity across updates. */
import {prepareBackup} from './hgola-saves.js';
const BUILD='2b6f1ee8-4d7e-4e17-9a9c-4a5c390d703b';
const config={dataUrl:`/api/hgola-files/${BUILD}/game.data`,codeUrl:`/api/hgola-files/${BUILD}/game.wasm`,frameworkUrl:`/games/hgola/${BUILD}/framework-save3.js`,streamingAssetsUrl:`https://play-prod.struckd.com/api/v1/games/game/48d6dff8-fc06-4898-af57-aa06155944fe/build/${BUILD}/streaming`,companyName:'play.unity.com',productName:'Unity Play Project',productVersion:BUILD,autoSyncPersistentDataPath:true,onPersistentStorageError:()=>{const error=Error('Unable to read saved progress. Retry without clearing website data.');error.code='storage';fail(error);}};
let instance,backup,finished=false,failed=false;
const safeMode=new URLSearchParams(location.search).get('safe')==='1';
if(safeMode){
 config.autoSyncPersistentDataPath=false;
 // Explicit temporary session: no mount or sync can touch the saved database.
 config.kkeepTemporarySession=true;
}
config.webglContextAttributes={preserveDrawingBuffer:false,powerPreference:'high-performance'};
config.onRuntimeInitialized=()=>{state.stage='جاري تشغيل اللعبة…';send('stage',{text:state.stage});};
const started=performance.now(),state={stage:'جاري تحميل محرك اللعبة…',progress:0,status:'loading'};
const send=(event,message={})=>parent.postMessage({event,message},location.origin);
const fail=error=>{if(failed||finished)return;failed=true;state.status='error';state.reason=error?.code==='storage'?'storage':'engine';console.error('[Kkeep Hgola] startup failed:',error?.message||error?.reason?.message||String(error?.reason||error||'Engine unavailable'));send('error',{reason:state.reason});};
window.addEventListener('unhandledrejection',fail);
window.addEventListener('error',event=>{if(event.target?.tagName==='LINK')return;fail(event.error||event);});
window.addEventListener('message',event=>{if(event.origin!==location.origin||event.source!==parent||event.data?.event!=='hgola-state')return;send('stage',{text:state.stage});send('progress',{progress:state.progress});if(state.status!=='loading')send(state.status,{reason:state.reason});});
async function start(){
 send('stage',{text:state.stage});
 const saveReady=safeMode?Promise.resolve({start(){},save(){},stop(){}}):prepareBackup(status=>send('save-status',{status}));
 // Persistent storage is a request, not a guarantee. Never clear it on retry.
 if(navigator.storage?.persist)void navigator.storage.persist().catch(()=>{});
 // Preload only the small framework. Unity owns its large-file cache: blindly
 // preloading data/wasm would redownload them even when Unity already has them.
 const hint=document.createElement('link');hint.rel='preload';hint.as='script';hint.href=config.frameworkUrl;document.head.append(hint);
 await new Promise((resolve,reject)=>{
  const script=document.createElement('script'),timer=setTimeout(()=>reject(Error('Loader timed out')),45000);
  script.src=`/games/hgola/${BUILD}/loader.js`;
  script.onload=()=>{clearTimeout(timer);resolve();};script.onerror=()=>{clearTimeout(timer);reject(Error('Loader unavailable'));};document.head.append(script);
 });
 // Recovery completes before Unity mounts the existing /idbfs database.
 backup=await saveReady;
 if(failed)return;
 state.stage='جاري تحميل اللعبة… يتم الاحتفاظ بالملفات للمرات القادمة';send('stage',{text:state.stage});
 config.monitorRunDependencies=count=>{if(count>0&&state.progress>=.89){state.stage='جاري تجهيز ملفات اللعبة…';send('stage',{text:state.stage});}};
 config.devicePixelRatio=matchMedia('(pointer: coarse)').matches?1:Math.min(devicePixelRatio,1.5);
 config.cacheControl=url=>url===config.dataUrl||url===config.codeUrl?'immutable':'no-store';
 instance=await createUnityInstance(document.getElementById('game'),config,progress=>{state.progress=progress;if(!failed)send('progress',{progress});});
 if(failed){await instance.Quit();return;}
 finished=true;state.status='ready';backup.start();
 const elapsed=Math.round(performance.now()-started);document.getElementById('game').dataset.readyMs=String(elapsed);
 console.info('[Kkeep Hgola] engine ready in '+elapsed+' ms');send('ready',{elapsed});document.getElementById('game').focus({preventScroll:true});
}
// Do not Quit on pagehide: it kills bfcache restores and is too late to save.
// Unity auto-persists changes during play; the backup runs while the page is alive.
window.addEventListener('pagehide',event=>{void backup?.save();if(!event.persisted)backup?.stop();});
start().catch(fail);
