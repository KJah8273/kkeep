import {TouchInput} from './touch-input.js';
const {slug,title,profile}=window.kkeepArcade;
const bar=document.createElement('nav');bar.className='kk-game-bar';bar.setAttribute('aria-label','Kkeep game toolbar');
const toggle=document.createElement('button');toggle.className='kk-toggle';toggle.textContent='K';toggle.setAttribute('aria-label','Show Kkeep game menu');toggle.setAttribute('aria-expanded','false');bar.append(toggle);
function tool(label,handler){const b=document.createElement('button');b.textContent=label;b.onclick=handler;b.hidden=true;bar.append(b);return b;}
const home=document.createElement('a');home.href=location.origin+'/';home.textContent='Kkeep';home.hidden=true;bar.append(home);
tool('Reload',()=>location.reload());
tool('Full screen',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else if(document.documentElement.requestFullscreen)await document.documentElement.requestFullscreen();else notice('Turn your iPad sideways for a larger view.');}catch{notice('Use landscape mode for a larger view.');}});
const nativeHelp={
 'geometry-dash':'Tap and hold to jump or fly. Release to drop. Use the game’s pause button for settings.',
 'idle-mining-empire':'Tap your miners, elevator, warehouse and upgrade buttons. Turn your iPad sideways if the game asks you to rotate.',
 'solar-smash':'Tap weapons and planets. Drag to turn the planet. Try Mouse touch mode in the Kkeep menu if this build does not respond to your finger.',
 'kick-the-buddy':'Tap or drag Buddy and use the game’s item buttons. Try Mouse touch mode in the Kkeep menu if dragging does not respond.',
 'tomb-of-the-mask':'Swipe in the game or use the arrow buttons. Tap Touch controls to hide or show the buttons.',
 'subway-surfers':'Swipe to change lanes, jump or roll. You can also use the arrow buttons. Board sends Space. Tap Touch controls to hide the buttons.',
};
const help=document.createElement('dialog');help.className='kk-game-help';const h=document.createElement('h2');h.textContent=title;const p=document.createElement('p');p.textContent=nativeHelp[slug];help.append(h,p);const form=document.createElement('form');form.method='dialog';const done=document.createElement('button');done.textContent='Done';form.append(done);help.append(form);
document.body.append(help);
tool('Help',()=>{input.reset();help.showModal();});
toggle.onclick=()=>{const show=toggle.getAttribute('aria-expanded')!=='true';toggle.setAttribute('aria-expanded',String(show));toggle.setAttribute('aria-label',show?'Hide Kkeep game menu':'Show Kkeep game menu');[...bar.children].slice(1).forEach(el=>el.hidden=!show);window.dispatchEvent(new CustomEvent('kkeep-menu-change',{detail:{open:show}}));};
help.addEventListener('close',()=>window.dispatchEvent(new Event('kkeep-game-focus')));
document.body.append(bar);
let timer;function notice(message){let box=document.querySelector('.kk-notice');if(!box){box=document.createElement('p');box.className='kk-notice';box.setAttribute('role','status');document.body.append(box);}box.textContent=message;clearTimeout(timer);timer=setTimeout(()=>box.remove(),5500);}
function gameCanvas(){return document.querySelector('canvas');}
// Legacy Unity loaders create the canvas after their downloads, so resolve it on each event.
const target={focus:options=>gameCanvas()?.focus(options),dispatchEvent:event=>gameCanvas()?.dispatchEvent(event),getBoundingClientRect:()=>gameCanvas()?.getBoundingClientRect()||{left:0,top:0,width:innerWidth,height:innerHeight}};
const input=new TouchInput(target);
const isTouch=navigator.maxTouchPoints>0;
if(profile==='arrows'||profile==='runner'){
 const pad=document.createElement('div');pad.className='kk-pad';let enabled=isTouch;pad.hidden=!enabled;const controls=tool('Touch controls',()=>{enabled=!enabled;input.reset();pad.hidden=!enabled;controls.setAttribute('aria-pressed',String(enabled));});controls.setAttribute('aria-pressed',String(enabled));
 function button(label,key,container){const b=document.createElement('button');b.type='button';b.textContent=label;b.setAttribute('aria-label',label);b.onpointerdown=e=>{e.preventDefault();b.setPointerCapture(e.pointerId);b.dataset.held='true';input.set('button-'+e.pointerId,[key]);};const up=e=>{input.release('button-'+e.pointerId);delete b.dataset.held;};b.onpointerup=b.onpointercancel=b.onlostpointercapture=up;container.append(b);}
  const arrows=document.createElement('div');arrows.className='kk-direction';button('↑','ArrowUp',arrows);button('←','ArrowLeft',arrows);button('↓','ArrowDown',arrows);button('→','ArrowRight',arrows);pad.append(arrows);
 const actions=document.createElement('div');actions.className='kk-actions';pad.append(actions);
 if(profile==='runner')button('Board','Space',actions);
 button('Pause','Escape',actions);
 pad.addEventListener('contextmenu',e=>e.preventDefault());pad.addEventListener('touchstart',e=>e.preventDefault(),{passive:false});document.body.append(pad);
 const reset=()=>{input.reset();pad.querySelectorAll('[data-held]').forEach(el=>delete el.dataset.held);};window.addEventListener('blur',reset);document.addEventListener('visibilitychange',()=>{if(document.hidden)reset();});
}
// Optional mouse bridge for desktop-only drag mechanics; native touch stays enabled by default.
if(['solar-smash','kick-the-buddy'].includes(slug)){
 let mouseMode=false,pointer=null,lastX=0,lastY=0;
 const mouseToggle=tool('Mouse touch',()=>{releaseMouse();mouseMode=!mouseMode;mouseToggle.setAttribute('aria-pressed',String(mouseMode));notice(mouseMode?'Touch now acts as a mouse. Tap and drag in the game.':'Game’s native touch restored.');});mouseToggle.setAttribute('aria-pressed','false');
 function emit(type,x,y,dx=0,dy=0){const c=gameCanvas();if(!c)return;c.focus();const event=new MouseEvent(type,{bubbles:true,cancelable:true,button:0,buttons:type==='mouseup'?0:1,clientX:x,clientY:y});Object.defineProperties(event,{movementX:{value:dx},movementY:{value:dy}});c.dispatchEvent(event);}
 function releaseMouse(){if(pointer!==null){emit('mouseup',lastX,lastY);pointer=null;}}
 document.addEventListener('pointerdown',e=>{if(!mouseMode||e.pointerType==='mouse'||e.target!==gameCanvas())return;e.preventDefault();e.stopImmediatePropagation();if(pointer!==null)return;pointer=e.pointerId;lastX=e.clientX;lastY=e.clientY;e.target.setPointerCapture(pointer);emit('mousemove',lastX,lastY);emit('mousedown',lastX,lastY);},true);
 document.addEventListener('pointermove',e=>{if(!mouseMode||e.pointerId!==pointer)return;e.preventDefault();e.stopImmediatePropagation();emit('mousemove',e.clientX,e.clientY,e.clientX-lastX,e.clientY-lastY);lastX=e.clientX;lastY=e.clientY;},true);
 for(const type of ['pointerup','pointercancel','lostpointercapture'])document.addEventListener(type,e=>{if(e.pointerId===pointer){e.preventDefault();e.stopImmediatePropagation();releaseMouse();}},true);
 for(const type of ['touchstart','touchmove','touchend'])document.addEventListener(type,e=>{if(mouseMode&&e.target===gameCanvas()){e.preventDefault();e.stopImmediatePropagation();}},{capture:true,passive:false});
 window.addEventListener('blur',releaseMouse);document.addEventListener('visibilitychange',()=>{if(document.hidden)releaseMouse();});
}
// Prevent browser text selection during play without interfering with native game touches.
document.addEventListener('contextmenu',e=>{if(e.target===gameCanvas())e.preventDefault();});
window.addEventListener('kkeep-download',e=>{if(!document.querySelector('#progress-bar'))notice(e.detail);});

window.dispatchEvent(new Event('kkeep-arcade-ready'));
