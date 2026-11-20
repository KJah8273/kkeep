// Development-only controlled error-state preview. Do not expose from worker/index.js.
// Route at a local path ending in /games/start, with placeId=123&wt=relay&fps=30,
// so the real runtime's manual compatibility link can retain those choices.
import {readFileSync} from 'node:fs';
import {transformText} from '../worker/gateway.js';
import {runtimeBootstrap} from '../worker/runtime.js';

export function engineFailurePreview(origin) {
  const base='/_/c2V0dXAucmJ4Y2RuLmNvbQ/webclient/version-1ef59424f70d4932-RobloxWebClient/';
  const player=transformText(readFileSync(new URL('../tests/fixtures/WasmPlayer-1ef.js',import.meta.url),'utf8'),base+'WasmPlayer.js',origin);
  const engine=transformText(readFileSync(new URL('../tests/fixtures/WebClient-1ef.js',import.meta.url),'utf8'),base+'WebClient.js',origin);
  const between=(source,from,to)=>{
    const start=source.indexOf(from),end=source.indexOf(to,start);
    if(start<0||end<=start)throw new Error('Controlled player fixture changed');
    return source.slice(start,end);
  };
  const code=`
    // Emulate only iPad feature selection for this explicitly labeled fixture.
    Object.defineProperty(navigator,'platform',{configurable:true,get:()=> 'MacIntel'});
    Object.defineProperty(navigator,'maxTouchPoints',{configurable:true,get:()=>5});
    const query=new URLSearchParams(location.search);
    window.__rbxPerf={gpu:query.get('gpu')==='webgl'?'webgl':'webgpu'};
    // Keep synthetic diagnostic events out of production logs.
    const nativeFetch=window.fetch;
    window.fetch=(input,init)=>/\\/_kkeep\\/(failure|connection)$/.test(new URL(String(input),location.href).pathname)
      ?Promise.resolve(new Response('{}',{headers:{'Content-Type':'application/json'}})):nativeFetch(input,init);
    (${runtimeBootstrap.toString()})();
    (function(){
      ${between(player,'var be=','function xe(')}
      ${between(player,'var ae=class','var ve=')}
      addEventListener('DOMContentLoaded',()=>{
      const f=new ae(),s={};
      ${between(player,'window.onerror=',',window.Module=s;')};
      ${between(player,'window.__onEngineLoadingStatus=',';function _e()')};
      window.__onDefaultLoadingScreenRemoved=()=>f.dismissAfterRenderedFrame();
      let pending=false;
      window.Module={_main_loop_iteration:async()=>{
        await new Promise(resolve=>setTimeout(resolve,16));
        if(pending){pending=false;throw new TypeError('Controlled frame failure');}
      },reportEngineError(){}};
      (function(f){${between(engine,'function la(){','la.sig="v";')};la();})(window.Module);
        f.prepare(123);
        document.getElementById('choices').textContent='Graphics: '+window.__rbxPerf.gpu+' · Transport: '+(query.get('wt')||'auto')+' · FPS: '+(query.get('fps')||'default');
        const canvas=document.getElementById('canvas');canvas.width=960;canvas.height=540;
        const paint=canvas.getContext('2d');paint.fillStyle='#132137';paint.fillRect(0,0,960,540);
        paint.fillStyle='#8bb4e8';paint.font='28px system-ui';paint.fillText('Controlled scene — no Roblox game',220,270);
        document.getElementById('simulate-frame-failure').onclick=event=>{
          event.currentTarget.disabled=true;paint.fillStyle='#000';paint.fillRect(0,0,960,540);pending=true;
        };
        setTimeout(()=>window.__onDefaultLoadingScreenRemoved(),150);
      },{once:true});
    })();
  `.replace(/<\/script/gi,'<\\/script');
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Controlled engine failure test — no Roblox game</title><style>
      *{box-sizing:border-box}html,body{margin:0;min-height:100%;background:#06090f;color:white;font:16px/1.5 system-ui}
      header{position:relative;z-index:10;padding:20px;background:#111925}h1{margin:0;font-size:21px}p{margin:8px 0}
      button{font:inherit;padding:12px 20px;border:0;border-radius:12px;background:#c5b7ff;color:#171329;cursor:pointer}button:disabled{opacity:.55}
      #canvas{display:block;width:100%;height:calc(100dvh - 190px);object-fit:contain}#loading-overlay{position:fixed;inset:190px 0 0;background:#080b12ed;display:grid;place-content:center;text-align:center;padding:28px}
      #loading-overlay.loading-exiting{opacity:0;transition:opacity .6s}.loading-error-panel{max-width:650px;background:#202838;border-radius:18px;padding:28px}
      [hidden]{display:none!important}.loading-failed #status,.loading-failed #loading-experience-title{display:none}#loading-error-title{font-size:25px;margin:0 0 18px}
    </style><script>${code}</script></head><body>
    <header><h1>Controlled engine failure test — no Roblox game</h1><p>This simulates iPad error handling using the inspected player and frame-loop code.</p>
      <p id="choices"></p><button id="simulate-frame-failure">Trigger controlled engine failure</button></header>
    <canvas id="canvas"></canvas><div id="loading-overlay"><h2 id="loading-experience-title">Preparing controlled scene</h2><p id="status"></p>
      <section class="loading-error-panel" hidden><h2 id="loading-error-title"></h2><p id="loading-error-message"></p><p id="loading-error-code"></p><button id="loading-error-leave">Leave</button></section>
    </div></body></html>`;
}
