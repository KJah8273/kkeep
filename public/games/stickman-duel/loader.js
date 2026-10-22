import {GameDownloads} from '../downloads.js?v=7';
import {playerTools,loadScript} from '../native-player.js?v=2';
const canvas=document.querySelector('canvas'),ui=playerTools(canvas,'stickman-duel'),originalFetch=fetch.bind(window);
async function start(){
 const manifest=await originalFetch('./manifest.json').then(r=>{if(!r.ok)throw Error('The game file list could not load.');return r.json();});
 const total=Object.values(manifest.files).reduce((a,b)=>a+b,0);
 const downloads=new GameDownloads({repo:manifest.repo,revision:manifest.revision,cacheKey:'stickman-duel',fetcher:originalFetch,onProgress:({loadedBytes})=>ui.update('Loading Stickman Duel · '+Math.min(99,Math.floor(loadedBytes/total*100))+'%',loadedBytes/total)});
 downloads.sources=path=>[{url:'/games/packed/stickman-duel/'+path}];
 const entries=type=>Object.entries(manifest.files).filter(([name])=>name.startsWith(type+'.part')).sort(([a],[b])=>a.localeCompare(b,undefined,{numeric:true}));
 // fetch always returns a Promise, including responses served from saved parts.
 window.fetch=async(resource,options)=>{const url=new URL(typeof resource==='string'?resource:resource.url||resource.href,location.href);const type=url.origin===location.origin&&url.pathname.match(/^\/games\/stickman-duel\/runtime\/(data|wasm)$/)?.[1];return type?downloads.stream(entries(type),type==='wasm'?'application/wasm':'application/octet-stream',options?.signal||resource?.signal):originalFetch(resource,options);};
 await loadScript('./platform.js');await loadScript('./engine.loader.js');
 window.unityInstance=await createUnityInstance(canvas,{dataUrl:'/games/stickman-duel/runtime/data',codeUrl:'/games/stickman-duel/runtime/wasm',frameworkUrl:'./engine.framework.js',streamingAssetsUrl:'./StreamingAssets',companyName:'Neron’s Brother',productName:'DuelistStickman',productVersion:'1.0.1',devicePixelRatio:ui.display.ratio(),cacheControl:()=> 'no-store',webglContextAttributes:{antialias:false,preserveDrawingBuffer:false},preRun:[m=>ui.display.preRun(m)],showBanner:(message,type)=>{if(type==='error')ui.fail(message);},onAbort:ui.fail});ui.ready(window.unityInstance.Module);
}
start().catch(ui.fail);
