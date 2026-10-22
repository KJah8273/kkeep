import {TouchInput,movement} from '../touch-input.js?v=3';
import {actions,FingerLook} from './control-model.js?v=1';

const paths={
 cast:'M5 19 17 7m-7 0h7v7M4 15v5h5M18 3h3v7c0 3-4 3-4 0',
 reel:'M4 12a8 8 0 1 0 3-6M4 4v5h5M12 9v6m-3-3h6',
 throw:'M3 17h5l4-8 3 4h6M16 8l5 5-5 5M7 6h.01',
 use:'M8 13V6a2 2 0 0 1 4 0v6-8a2 2 0 0 1 4 0v8-5a2 2 0 0 1 4 0v9c0 4-3 6-7 6-3 0-5-2-6-4l-4-5a2 2 0 0 1 3-2l2 2',
 jump:'M12 19V5m-6 6 6-6 6 6M5 21h14',
 run:'M14 5h.01M8 9l4-2 4 5h4M12 8l-2 7 5 3v4M10 15l-4 6M4 12h3',
 bag:'M7 7V5a5 5 0 0 1 10 0v2M5 7h14l2 14H3L5 7Z',
 menu:'M8 5v14M16 5v14',
 bait:'M8 4c6-3 13 5 8 9-6 5-13-2-9-6m5 5v7c0 4-6 4-6 0',
 hands:'M4 12h16M8 8l-4 4 4 4m8-8 4 4-4 4',
 inspect:'M10 4a6 6 0 1 0 0 12 6 6 0 0 0 0-12Zm4 10 6 6',
 reload:'M4 10a8 8 0 1 1 1 8M4 4v6h6',
 crouch:'M15 4h.01M14 9l-5 3 5 3-4 5h8M14 9l5 4h3',
 more:'M5 12h.01M12 12h.01M19 12h.01'
};
function icon(id){const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');svg.innerHTML=`<path d="${paths[id]||paths.more}"/>`;return svg;}

export function createFishControls({canvas,toggle,help,setMenu,notice}){
 const input=new TouchInput(canvas),look=new FingerLook((dx,dy)=>input.look(dx,dy));
 const hud=document.createElement('div');hud.className='fish-controls';hud.hidden=true;
 hud.innerHTML='<div class="fish-look" aria-label="Drag to look around"></div><div class="fish-stick" aria-label="Movement joystick"><span></span></div><div class="fish-actions"></div><div class="fish-extra" hidden></div><p class="fish-hint">Move left · Look right · Hold Throw, then release</p>';
 document.body.append(hud);
 const stick=hud.querySelector('.fish-stick'),knob=stick.firstElementChild,lookPad=hud.querySelector('.fish-look'),extra=hud.querySelector('.fish-extra');
 let enabled=false,virtualLock=false,stickId=null,ready=!!window.kkeepGameReady;
 let style={};try{style=JSON.parse(localStorage.getItem('kkeep.fish.touch-v3')||'{}');}catch{}
 let sensitivity=Math.max(.3,Math.min(2,Number(style.sensitivity)||.85));
 const opacity=Math.max(25,Math.min(80,Number(style.opacity)||55));
 hud.style.setProperty('--hud-opacity',opacity/100);
 const toggled=new Set(),held=new Map();let hintTimer;
 function reset(){input.reset();look.reset();held.clear();toggled.clear();stickId=null;knob.style.transform='';hud.querySelectorAll('[data-held]').forEach(b=>delete b.dataset.held);hud.querySelectorAll('[aria-pressed]').forEach(b=>b.setAttribute('aria-pressed','false'));}
 const nativeDescriptor=Object.getOwnPropertyDescriptor(Document.prototype,'pointerLockElement');
 const nativeExit=document.exitPointerLock?.bind(document);
 function lock(value){if(virtualLock===value)return;virtualLock=value;document.dispatchEvent(new Event('pointerlockchange'));}
 function setEnabled(value){
  if(value&&!ready)return;
  enabled=value;reset();hud.hidden=!value;extra.hidden=true;toggle.setAttribute('aria-pressed',String(value));toggle.textContent=value?'Menus':'Play controls';lock(value);
  document.body.classList.toggle('fish-playing',value);
  if(value){canvas.focus({preventScroll:true});setMenu(false);clearTimeout(hintTimer);hud.classList.remove('hint-hidden');hintTimer=setTimeout(()=>hud.classList.add('hint-hidden'),6500);}
 }
 try{
  Object.defineProperty(document,'pointerLockElement',{configurable:true,get:()=>virtualLock?canvas:nativeDescriptor?.get?.call(document)||null});
  for(const target of [canvas,document.body]){
   const native=target.requestPointerLock?.bind(target);
   target.requestPointerLock=(...args)=>{
    if(enabled||(ready&&navigator.maxTouchPoints>0)){if(!enabled)setEnabled(true);else lock(true);return Promise.resolve();}
    return native?.(...args);
   };
  }
  document.exitPointerLock=()=>{if(virtualLock)setEnabled(false);else nativeExit?.();};
 }catch(error){console.warn('Touch pointer lock',error);}
 // Unity listens at document level. Prevent a HUD finger from being seen as a
 // native Touchscreen device and switching away from its Keyboard action map.
 // Pointer events still reach our individual controls and keep finger capture.
 for(const type of ['touchstart','touchmove','touchend','touchcancel'])window.addEventListener(type,event=>{
  if(enabled&&hud.contains(event.target)){event.preventDefault();event.stopImmediatePropagation();}
 },{capture:true,passive:false});
 const capture=(element,event)=>{event.preventDefault();try{element.setPointerCapture(event.pointerId);}catch{}};
 function updateStick(e){const r=stick.getBoundingClientRect(),dx=(e.clientX-r.left-r.width/2)/(r.width*.33),dy=(e.clientY-r.top-r.height/2)/(r.height*.33),length=Math.max(1,Math.hypot(dx,dy));input.set('stick',movement(dx/length,dy/length));knob.style.transform=`translate(${dx/length*r.width*.27}px,${dy/length*r.height*.27}px)`;}
 stick.onpointerdown=e=>{if(!enabled||stickId!==null)return;capture(stick,e);stickId=e.pointerId;stick.dataset.held='true';updateStick(e);};
 stick.onpointermove=e=>{if(e.pointerId===stickId){e.preventDefault();updateStick(e);}};
 stick.onpointerup=stick.onpointercancel=stick.onlostpointercapture=e=>{if(e.pointerId!==stickId)return;stickId=null;input.release('stick');knob.style.transform='';delete stick.dataset.held;};
 lookPad.onpointerdown=e=>{if(!enabled)return;capture(lookPad,e);look.start(e.pointerId,e.clientX,e.clientY);};
 lookPad.onpointermove=e=>{if(enabled){e.preventDefault();look.move(e.pointerId,e.clientX,e.clientY,sensitivity);}};
 lookPad.onpointerup=lookPad.onpointercancel=lookPad.onlostpointercapture=e=>look.end(e.pointerId);
 function makeButton(action,parent){
  const button=document.createElement('button');button.type='button';button.className='fish-action fish-'+action.id;button.setAttribute('aria-label',action.label);button.append(icon(action.id));
  const label=document.createElement('span');label.textContent=action.label;button.append(label);parent.append(button);
  if(action.toggle)button.setAttribute('aria-pressed','false');
  function toggleAction(){const source='toggle-'+action.id;if(toggled.has(action.id)){toggled.delete(action.id);input.release(source);delete button.dataset.held;}else{toggled.add(action.id);input.set(source,[action.code]);button.dataset.held='true';}button.setAttribute('aria-pressed',String(toggled.has(action.id)));}
  button.onpointerdown=e=>{
   if(!enabled)return;capture(button,e);
   if(action.toggle){toggleAction();return;}
   held.set(e.pointerId,action.id);input.set('finger-'+e.pointerId,[action.code]);button.dataset.held='true';
   if(action.look)look.start(e.pointerId,e.clientX,e.clientY);
  };
  button.onpointermove=e=>{if(enabled&&action.look&&held.get(e.pointerId)===action.id){e.preventDefault();look.move(e.pointerId,e.clientX,e.clientY,sensitivity);}};
  const release=e=>{
   if(held.get(e.pointerId)!==action.id)return;held.delete(e.pointerId);look.end(e.pointerId);
   input.release('finger-'+e.pointerId,e.type==='pointerup'?90:0);
   if(![...held.values()].includes(action.id))delete button.dataset.held;
   if(action.menu&&e.type==='pointerup'){
    // Keep the key down across a Unity frame; reset only after it was consumed.
    setTimeout(()=>{if(enabled)setEnabled(false);},120);
   }
  };
  button.onpointerup=button.onpointercancel=button.onlostpointercapture=release;
  button.onclick=e=>{if(e.detail!==0||!enabled)return;if(action.toggle)toggleAction();else{input.set('keyboard-button',[action.code]);input.release('keyboard-button',90);if(action.menu)setTimeout(()=>setEnabled(false),120);}};
  return button;
 }
 for(const action of actions)makeButton(action,action.extra?extra:hud.querySelector('.fish-actions'));
 for(let n=1;n<=9;n++){
  const button=makeButton({id:'slot-'+n,label:String(n),code:'Digit'+n},extra);button.querySelector('svg').remove();button.setAttribute('aria-label','Inventory slot '+n);
 }
 const more=document.createElement('button');more.type='button';more.className='fish-action fish-more';more.append(icon('more'));const moreLabel=document.createElement('span');moreLabel.textContent='Tools';more.append(moreLabel);more.setAttribute('aria-expanded','false');
 const showTools=()=>{extra.hidden=!extra.hidden;more.setAttribute('aria-expanded',String(!extra.hidden));};let toolsPointer=null;
 more.onpointerdown=e=>{capture(more,e);toolsPointer=e.pointerId;};
 more.onpointerup=e=>{if(toolsPointer!==e.pointerId)return;toolsPointer=null;showTools();};
 more.onpointercancel=more.onlostpointercapture=()=>{toolsPointer=null;};
 more.onclick=e=>{if(e.detail===0)showTools();};hud.append(more);
 hud.addEventListener('contextmenu',e=>e.preventDefault());
 toggle.disabled=!ready;toggle.onclick=()=>setEnabled(!enabled);
 const onReady=()=>{ready=true;toggle.disabled=false;};window.addEventListener('kkeep-game-ready',onReady);
 window.addEventListener('blur',reset);window.addEventListener('resize',reset);document.addEventListener('visibilitychange',()=>{if(document.hidden)reset();});
 help.querySelector('#look-speed').value=String(sensitivity);help.querySelector('#look-speed').oninput=e=>{sensitivity=Number(e.target.value);style.sensitivity=sensitivity;saveStyle();};
 const visibility=help.querySelector('#control-opacity'),output=help.querySelector('#opacity-value');visibility.value=String(opacity);output.textContent=opacity+'%';
 visibility.oninput=e=>{const value=Number(e.target.value);hud.style.setProperty('--hud-opacity',value/100);output.textContent=value+'%';style.opacity=value;saveStyle();};
 function saveStyle(){try{localStorage.setItem('kkeep.fish.touch-v3',JSON.stringify(style));}catch{}}
 return ()=>setEnabled(false);
}
