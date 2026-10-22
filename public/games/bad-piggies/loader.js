import {playerTools,loadScript} from '../native-player.js';
import {isIPad} from '../unity-display.js?v=3';
// The legacy engine creates its own canvas. Keep the toolbar out of its document.
const container=document.querySelector('#unity-container'),placeholder=document.querySelector('canvas'),ui=playerTools(placeholder,'bad-piggies');
async function start(){
 await loadScript('./engine.loader.js');
 if(isIPad())UnityLoader.SystemInfo.mobile=true;
 placeholder.remove();
 const base='https://raw.githubusercontent.com/67-Factory/web-ports/62bc8f50d2b2c6e02ca6f4ed2e3136773f32f698/badpiggies/StreamingAssets/';
 const open=XMLHttpRequest.prototype.open;
 XMLHttpRequest.prototype.open=function(method,url,...rest){const target=new URL(url,location.href);if(target.origin===location.origin&&target.pathname.startsWith('/games/bad-piggies/StreamingAssets/'))url=base+target.pathname.split('/StreamingAssets/')[1];return open.call(this,method,url,...rest);};
 let ready=false;
 window.gameInstance=UnityLoader.instantiate('unity-container','./build.json',{
  compatibilityCheck:(instance,yes,no)=>{if(!UnityLoader.SystemInfo.hasWebGL){ui.fail('This browser could not start WebGL.');no?.();return;}yes();},
  onProgress:(instance,value)=>{ui.update('Loading Bad Piggies · '+Math.floor(value*100)+'%',value);if(value===1&&!ready){ready=true;resize();ui.ready();}},
  Module:{streamingAssetsUrl:base,webglContextAttributes:{antialias:false,preserveDrawingBuffer:false},onAbort:ui.fail},
 });
 function resize(){const canvas=container.querySelector('canvas');if(!canvas)return;const scale=ui.display.ratio();window.gameInstance.Module.setCanvasSize?.(Math.max(1,Math.round(innerWidth*scale)),Math.max(1,Math.round(innerHeight*scale)));canvas.style.width='100%';canvas.style.height='100%';canvas.tabIndex=0;}
 window.addEventListener('resize',resize);window.addEventListener('kkeep-player-setting',e=>{if(e.detail.type==='quality')resize();if(e.detail.type==='focus')container.querySelector('canvas')?.focus({preventScroll:true});});
}
start().catch(ui.fail);
