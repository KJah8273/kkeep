import {GameDownloads} from '../downloads.js?v=5';
import {createDisplay} from '../unity-display.js?v=2';
import {installFishPreferences,prepareFishFramework} from './preferences.js?v=2';
const canvas=document.querySelector('#unity-canvas'),loading=document.querySelector('#unity-loading-bar'),status=document.querySelector('#unity-status'),progress=document.querySelector('#unity-progress-bar-full'),errorBox=document.querySelector('#unity-error');
const display=createDisplay(canvas,'fish');window.kkeepGameDisplay=display;window.dispatchEvent(new Event('kkeep-display-ready'));
const revision='3e0dbe9fd91c74dd77b3b493564d7c295d6af9e7',repo='NotRexed/HowToFishPort';
const dataParts=Array.from({length:7},(_,i)=>[`Build/WebGL.data.part${i+1}`,i===6?18022369:18022372]);
const wasmParts=Array.from({length:4},(_,i)=>[`Build/WebGL.wasm.${String(i).padStart(3,'0')}`,i===3?16012035:16012037]);
const total=dataParts.concat(wasmParts).reduce((n,part)=>n+part[1],0)+27222+354118;
const downloads=new GameDownloads({repo,revision,cacheKey:'how-to-fish',onProgress:({loadedBytes,networkBytes,retrying})=>{
  progress.style.width=`${Math.min(.9,loadedBytes/total*.9)*100}%`;
  status.textContent=retrying?'Retrying from another download source…':`Loading game… ${Math.floor(loadedBytes/total*100)}% · ${Math.floor(networkBytes/1000000)} MB downloaded`;
}});
let failed=false;const urls=[];
function fail(error){
 if(failed)return;failed=true;downloads.abort.abort();loading.style.display='none';errorBox.style.display='block';errorBox.replaceChildren();
 const message=document.createElement('p');message.textContent=String(error?.message||error);const retry=document.createElement('button');retry.textContent='Retry loading';retry.onclick=()=>location.reload();
 const hint=document.createElement('p');hint.className='game-error-hint';hint.textContent='Completed downloads are saved. Retry continues from those files.';errorBox.append(message,retry,hint);
}
canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();fail('Safari stopped the graphics. Close other game tabs, then retry in Low quality.');});
window.addEventListener('error',event=>{if(event.error instanceof WebAssembly.RuntimeError||/out of memory|memory access out of bounds/i.test(event.message||''))fail('The game ran out of memory. Close other game tabs and retry in Low quality.');});
async function boot(){
 loading.style.display='block';
 downloads.packed=await fetch('/games/how-to-fish/packed.json?v=6').then(r=>r.ok?r.json():{}).catch(()=>({}));
 const packedBytes=total+Object.values(downloads.packed).reduce((n,file)=>n+file.bytes-file.size,0);
 if(packedBytes)document.querySelector('.game-loading-note').textContent='First download: about '+Math.ceil(packedBytes/1000000)+' MB. Saved parts are reused next time.';
 const objectUrl=blob=>{const url=URL.createObjectURL(blob);urls.push(url);return url;};
 const [wasm,data,loader,framework]=await Promise.all([
  downloads.combine(wasmParts,'application/wasm'),downloads.combine(dataParts,'application/octet-stream'),
  downloads.file('Build/WebGL.loader.js',27222,'text/javascript'),downloads.file('Build/WebGL.framework.js',354118,'text/javascript')
 ]);
 if(new Uint8Array(await wasm.slice(0,4).arrayBuffer()).join(',')!=='0,97,115,109')throw new Error('The game engine download is damaged. Please retry.');
 if(await data.slice(0,'UnityWebData1.0'.length).text()!=='UnityWebData1.0')throw new Error('The game data download is damaged. Please retry.');
 status.textContent='Starting How to Fish…';
 await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=objectUrl(loader);script.onload=resolve;script.onerror=()=>reject(new Error('The game engine could not load.'));document.body.append(script);});
 const config={
  devicePixelRatio:display.ratio(),webglContextAttributes:{antialias:false,preserveDrawingBuffer:false,powerPreference:2},
  dataUrl:objectUrl(data),frameworkUrl:objectUrl(new Blob([prepareFishFramework(await framework.text())],{type:'text/javascript'})),codeUrl:objectUrl(wasm),
  streamingAssetsUrl:`https://raw.githubusercontent.com/${repo}/${revision}/StreamingAssets`,
  companyName:'DefaultCompany',productName:'ExportedProject',productVersion:'1.0',autoSyncPersistentDataPath:true,cacheControl:()=> 'no-store',
  preRun:[module=>display.preRun(module)],
  kkeepPreparePreferences:FS=>installFishPreferences(FS,()=>{window.kkeepFishGraphicsApplied=true;},error=>{console.warn('Fishing graphics preset could not be applied:',error);window.kkeepFishGraphicsApplied=false;}),
  showBanner:(message,type)=>{if(type==='error')fail(message);else console.warn(message);},
  printErr:message=>{console.error(message);if(/out of memory|memory access out of bounds/i.test(String(message)))fail(String(message));},
 };
 window.unityInstance=await createUnityInstance(canvas,config,value=>{if(!failed){progress.style.width=`${90+value*10}%`;status.textContent=`Starting How to Fish… ${Math.floor(value*100)}%`;}});
 display.attach(window.unityInstance.Module);if(failed)return;
 loading.style.display='none';urls.forEach(url=>URL.revokeObjectURL(url));urls.length=0;
 window.kkeepGameReady=true;window.dispatchEvent(new Event('kkeep-game-ready'));
}
boot().catch(fail);
