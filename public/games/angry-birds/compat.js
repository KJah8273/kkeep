// Legacy PlayN still owns all touch events and draws its own game controls.
window._gaq=[];
(() => {
 const contexts=new Set(),Audio=window.AudioContext||window.webkitAudioContext;
 if(Audio){class GestureAudio extends Audio{constructor(...args){super(...args);contexts.add(this);}}window.AudioContext=window.webkitAudioContext=GestureAudio;}
 const resume=()=>{for(const context of contexts)if(context.state==='suspended')context.resume().catch(()=>{});};
 document.addEventListener('pointerdown',resume,{capture:true,passive:true});document.addEventListener('touchstart',resume,{capture:true,passive:true});
 const channel='kkeep-arcade-player',origin=location.origin;
 window.addEventListener('message',e=>{if(e.source!==parent||e.origin!==origin||e.data?.channel!==channel)return;if(e.data.type==='focus'){window.focus();document.querySelector('canvas')?.focus({preventScroll:true});}});
 if(parent!==window)parent.postMessage({channel,type:'ready'},origin);
 document.querySelector('#retry').onclick=()=>location.reload();
 const failure=event=>{if(!/\.js(?:$|\?)/.test(event.target?.src||''))return;const status=document.querySelector('#loading');if(status)status.textContent='A game file could not load. Please retry.';document.querySelector('#retry').hidden=false;};
 window.addEventListener('error',failure,true);
})();
