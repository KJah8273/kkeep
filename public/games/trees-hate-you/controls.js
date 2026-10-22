import {TouchInput,movement} from '../touch-input.js';
export function installForestControls(canvas){
 const input=new TouchInput(canvas),pad=document.createElement('div');pad.className='forest-pad';pad.hidden=true;
 const stick=document.createElement('div');stick.className='forest-stick';stick.setAttribute('role','group');stick.setAttribute('aria-label','Movement joystick');stick.innerHTML='<i></i><span>MOVE</span>';
 const knob=stick.querySelector('i'),pause=document.createElement('button');pause.className='forest-pause';pause.setAttribute('aria-label','Pause game');pause.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M8 5v14M16 5v14"/></svg>';pad.append(stick,pause);document.body.append(pad);
 let owner=null,ready=false,enabled=navigator.maxTouchPoints>0,menu=false;
 function reset(){input.reset();owner=null;knob.style.transform='translate(-50%,-50%)';delete stick.dataset.held;delete pause.dataset.held;}
 const show=()=>{pad.hidden=!ready||!enabled||menu;if(pad.hidden)reset();};
 function move(e){const r=stick.getBoundingClientRect(),radius=r.width*.33;let x=(e.clientX-r.left-r.width/2)/radius,y=(e.clientY-r.top-r.height/2)/radius;const length=Math.hypot(x,y);if(length>1){x/=length;y/=length;}knob.style.transform=`translate(calc(-50% + ${x*radius}px),calc(-50% + ${y*radius}px))`;input.set('forest-stick',movement(x,y));}
 stick.onpointerdown=e=>{e.preventDefault();e.stopPropagation();if(owner!==null)return;owner=e.pointerId;canvas.focus({preventScroll:true});stick.setPointerCapture(owner);stick.dataset.held='true';move(e);};
 stick.onpointermove=e=>{if(e.pointerId!==owner)return;e.preventDefault();e.stopPropagation();move(e);};
 const release=e=>{if(e.pointerId!==owner)return;input.release('forest-stick');owner=null;delete stick.dataset.held;knob.style.transform='translate(-50%,-50%)';};stick.onpointerup=stick.onpointercancel=stick.onlostpointercapture=release;
 pause.onpointerdown=e=>{e.preventDefault();e.stopPropagation();pause.setPointerCapture(e.pointerId);input.set('pause-'+e.pointerId,['Escape']);pause.dataset.held='true';};
 const up=e=>{input.release('pause-'+e.pointerId,80);delete pause.dataset.held;};pause.onpointerup=pause.onpointercancel=pause.onlostpointercapture=up;
 // These fingers belong to the HUD, not Unity's document-wide touch input.
 for(const type of ['touchstart','touchmove','touchend','touchcancel'])document.addEventListener(type,e=>{if(!pad.contains(e.target))return;e.preventDefault();e.stopImmediatePropagation();},{capture:true,passive:false});
 pad.addEventListener('contextmenu',e=>e.preventDefault());window.addEventListener('blur',reset);document.addEventListener('visibilitychange',()=>{if(document.hidden)reset();});
 window.addEventListener('kkeep-game-ready',()=>{ready=true;show();});
 window.addEventListener('kkeep-player-setting',e=>{const {type,value}=e.detail;if(type==='controls')enabled=value===true;if(type==='menu')menu=value===true;if(type==='opacity'&&Number.isFinite(value))pad.style.setProperty('--opacity',String(Math.max(.2,Math.min(.85,value))));show();});
 return {reset,input,pad};
}
