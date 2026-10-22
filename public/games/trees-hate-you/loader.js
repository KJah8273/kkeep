import {GameDownloads} from '../downloads.js?v=7';
import {playerTools,loadScript} from '../native-player.js?v=2';
import {installForestControls} from './controls.js';
import {installForestPreferences} from './preferences.js?v=1';
const canvas=document.querySelector('canvas'),ui=playerTools(canvas,'trees-hate-you');installForestControls(canvas);
// Start every session in the lightest render mode, even after a saved High setting.
ui.display.setQuality('low');
const originalFetch=window.fetch.bind(window);
async function start(){
 const manifest=await originalFetch('./manifest.json').then(r=>{if(!r.ok)throw Error('The game file list could not load.');return r.json();});
 const total=Object.values(manifest.files).reduce((a,b)=>a+b,0);
 const downloads=new GameDownloads({...manifest,cacheKey:'trees-hate-you',fetcher:originalFetch,concurrency:2,lookahead:1,onProgress:({loadedBytes})=>ui.update('Loading Trees Hate You · '+Math.min(99,Math.floor(loadedBytes/total*100))+'%',loadedBytes/total)});
 const parts=type=>Object.entries(manifest.files).filter(([name])=>name.startsWith(`Build/TreesHateYou_Web.${type}.br.part`)).sort(([a],[b])=>a.localeCompare(b,undefined,{numeric:true}));
 // Unity chains .then() for both data reads and streaming WASM compilation.
 window.fetch=async function(resource,options){const url=new URL(typeof resource==='string'?resource:resource.url||resource.href,location.href);const match=url.origin===location.origin&&url.pathname.match(/^\/games\/trees-hate-you\/runtime\/(data|wasm)$/);if(match)return downloads.stream(parts(match[1]),match[1]==='wasm'?'application/wasm':'application/octet-stream',options?.signal||resource?.signal);return originalFetch(resource,options);};
 await loadScript('./engine.loader.js');
 window.unityInstance=await createUnityInstance(canvas,{
  dataUrl:'/games/trees-hate-you/runtime/data',codeUrl:'/games/trees-hate-you/runtime/wasm',frameworkUrl:'./engine.framework.js?v=3',streamingAssetsUrl:`https://raw.githubusercontent.com/${manifest.repo}/${manifest.revision}/StreamingAssets`,
  companyName:'tykenn games',productName:'Trees Hate You',productVersion:'0.1.0',devicePixelRatio:ui.display.ratio(),cacheControl:()=> 'no-store',
  autoSyncPersistentDataPath:true,kkeepPreparePreferences:FS=>installForestPreferences(FS,()=>{window.kkeepForestGraphicsApplied=true;}),
  webglContextAttributes:{antialias:false,preserveDrawingBuffer:false},preRun:[m=>ui.display.preRun(m)],showBanner:(message,type)=>{if(type==='error')ui.fail(message);},onAbort:ui.fail,
 });ui.ready(window.unityInstance.Module);
}
start().catch(ui.fail);
