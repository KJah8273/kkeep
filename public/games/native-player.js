import {createDisplay} from './unity-display.js?v=3';
export function playerTools(canvas,slug){
 const display=createDisplay(canvas,slug),channel='kkeep-arcade-player',origin=location.origin;
 const status=document.querySelector('#status'),panel=document.querySelector('#status-panel'),progress=document.querySelector('#progress');
 let failed=false;
 const fail=error=>{if(failed)return;failed=true;panel.hidden=false;progress.hidden=true;status.textContent='Could not start '+document.title.split(' · ')[0];document.querySelector('#error').textContent=error?.message||String(error);document.querySelector('#retry').hidden=false;};
 document.querySelector('#retry').onclick=()=>location.reload();
 window.addEventListener('message',e=>{if(e.origin!==origin||e.source!==parent||e.data?.channel!==channel)return;
  if(e.data.type==='quality')display.setQuality(e.data.value);
  if(e.data.type==='focus')canvas.focus({preventScroll:true});
  window.dispatchEvent(new CustomEvent('kkeep-player-setting',{detail:e.data}));
 });
 const announce=()=>{if(parent!==window)parent.postMessage({channel,type:'ready'},origin);};announce();
 canvas.addEventListener('pointerdown',()=>canvas.focus({preventScroll:true}),{passive:true});
 canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();fail('Safari stopped the graphics. Close other game tabs and try Low quality.');});
 return {display,fail,update(label,value){if(failed)return;status.textContent=label;if(value==null)progress.removeAttribute('value');else progress.value=value;},ready(module){if(failed)return;if(module)display.attach(module);panel.hidden=true;announce();window.dispatchEvent(new Event('kkeep-game-ready'));}};
}
export async function loadScript(url){await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=url;s.onload=resolve;s.onerror=()=>reject(new Error('A game script could not load. Please retry.'));document.head.append(s);});}
