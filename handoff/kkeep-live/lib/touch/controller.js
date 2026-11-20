import {createPad,attachGamepad,stickVector,clamp} from './gamepad.mjs';
import css from './controller.css';

let pendingDetach;
export function mountController(options={}){
  // A new controller must not inherit an adapter waiting to be detached.
  pendingDetach?.();
  if(window.__kkeepTouch){window.__kkeepTouch.show();return window.__kkeepTouch;}
  const embedded=!!options.frame;
  const demo=!!document.querySelector('[data-kkeep-touch-demo]');
  const supported=['ghost-mathmulti.zeoghost.workers.dev'];
  if(!embedded&&!demo&&!supported.includes(location.hostname)){alert('Open a cloud game in Kkeep, then tap Controls.');return;}
  const controller=options.controller||createPad(),pad=controller.pad,bridges=new Map(),pointers=new Map(),groups=new Map();
  const storageKey=options.storageKey||'kkeep-touch-v1';
  const defaults={size:100,opacity:75,deadzone:12,profile:options.profile||'standard',leftHanded:false,positions:{}};
  let saved={};try{saved=JSON.parse(localStorage.getItem(storageKey)||'{}');}catch{}
  const settings={...defaults,...saved,positions:saved.positions&&typeof saved.positions==='object'?saved.positions:{}};
  settings.size=clamp(Number(settings.size)||100,75,125);settings.opacity=clamp(Number(settings.opacity)||75,35,100);settings.deadzone=clamp(Number(settings.deadzone)||12,5,30);
  if(!['standard','gta','racing','cod'].includes(settings.profile))settings.profile=defaults.profile;
  let hidden=false,editing=false,closed=false,lastRead=0,lastAnnounced=0,activeRealm=options.frame?.contentWindow||window,lastVideo=null;
  const keys=new Map(),cleanups=[];
  const host=document.createElement('div');host.id='kkeep-touch';host.style.cssText='position:fixed;inset:0;z-index:2147483647;pointer-events:none;';
  const shadow=host.attachShadow({mode:'open'});
  const style=document.createElement('style');style.textContent=css;shadow.append(style);
  const root=document.createElement('section');root.className='pad';root.setAttribute('aria-label','Kkeep touch controller');shadow.append(root);
  const el=(tag,className,text)=>{const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node;};
  function on(target,type,handler,options){target.addEventListener(type,handler,options);cleanups.push(()=>target.removeEventListener(type,handler,options));}
  function save(){try{localStorage.setItem(storageKey,JSON.stringify(settings));}catch{}}
  function consume(event){event.preventDefault();event.stopPropagation();}
  function focusPlayer(){if(embedded)try{options.frame.contentWindow.focus();}catch{}}
  function readableName(){if(embedded)return options.name||'Cloud game';return demo?'Controller test':'GhostCloud';}
  const bar=el('div','bar'),brand=el('span','brand','kkeep'),status=el('span','status','Waiting for the player');
  bar.append(brand,status);root.append(bar);
  function action(parent,text,label,callback,className='tool'){
    const button=el('button',className,text);button.type='button';button.setAttribute('aria-label',label);
    button.addEventListener('pointerdown',event=>event.stopPropagation());
    button.addEventListener('click',event=>{event.stopPropagation();callback();});parent.append(button);return button;
  }
  const settingsButton=action(bar,'⚙','Controller settings',()=>{releaseAll();panel.hidden=!panel.hidden;});
  action(bar,'Keys','Extra keyboard keys',()=>{releaseAll();keyPanel.hidden=!keyPanel.hidden;});
  action(bar,'⛶','Fullscreen with controls',()=>{releaseAll();if(document.fullscreenElement)document.exitFullscreen?.().catch(()=>{});else document.documentElement.requestFullscreen?.().catch(()=>setHint('Use Safari in landscape. Fullscreen is not available on this device.'));});
  const hideButton=action(bar,'Hide','Hide and pause controls',()=>setHidden(!hidden));
  action(bar,'×','Remove controller',destroy);
  if(options.onBack)action(bar,'Tabs','Back to Kkeep tabs',()=>{releaseAll();options.onBack();});
  const layout=el('div','layout');root.append(layout);
  const hint=el('div','hint');hint.hidden=true;root.append(hint);
  function setHint(text){hint.textContent=text;hint.hidden=!text;}
  function group(id,className){const node=el('div','group '+className);node.dataset.group=id;groups.set(id,node);layout.append(node);return node;}
  const buttonLabels=new Map();
  function gameButton(parent,index,text,title,className=''){
    const button=el('button','game-button '+className,text);button.type='button';button.dataset.button=String(index);button.setAttribute('aria-label',title);button.title=title;parent.append(button);
    buttonLabels.set(index,button);
    on(button,'pointerdown',event=>{
      if(editing||hidden||panel.contains(event.target))return;
      consume(event);if(pointers.has(event.pointerId))return;
      focusPlayer();const owner='pointer-'+event.pointerId;controller.button(owner,index);pointers.set(event.pointerId,{kind:'button',node:button,owner});button.classList.add('pressed');
      button.setPointerCapture?.(event.pointerId);
    });
    return button;
  }
  const shouldersL=group('shouldersL','shoulders left'),shouldersR=group('shouldersR','shoulders right');
  gameButton(shouldersL,4,'LB','Left bumper');gameButton(shouldersL,6,'LT','Left trigger');
  gameButton(shouldersR,7,'RT','Right trigger');gameButton(shouldersR,5,'RB','Right bumper');
  const face=group('face','face');gameButton(face,3,'Y','Y','y');gameButton(face,2,'X','X','x');gameButton(face,1,'B','B','b');gameButton(face,0,'A','A','a');
  const dpad=group('dpad','dpad');gameButton(dpad,12,'↑','D-pad up','up');gameButton(dpad,14,'←','D-pad left','left');gameButton(dpad,15,'→','D-pad right','right');gameButton(dpad,13,'↓','D-pad down','down');
  function joystick(index){
    const node=group('stick'+index,'stick stick-'+index),knob=el('span','knob'),label=el('span','stick-label',index?'LOOK':'MOVE');node.append(knob,label);node.setAttribute('aria-label',index?'Right analog stick':'Left analog stick');node.setAttribute('role','group');
    on(node,'pointerdown',event=>{
      if(editing||hidden)return;consume(event);if([...pointers.values()].some(input=>input.node===node))return;
      focusPlayer();const rect=node.getBoundingClientRect();const input={kind:'stick',node,knob,owner:'pointer-'+event.pointerId,index,cx:rect.left+rect.width/2,cy:rect.top+rect.height/2,radius:rect.width*.35};
      pointers.set(event.pointerId,input);node.classList.add('pressed');node.setPointerCapture?.(event.pointerId);moveStick(input,event);
    });return node;
  }
  joystick(0);joystick(1);
  const stickClicks=group('clicks','stick-clicks');gameButton(stickClicks,10,'L3','Press left stick');gameButton(stickClicks,11,'R3','Press right stick');
  const menus=group('menus','menus');gameButton(menus,8,'View','View / Back');gameButton(menus,9,'Menu','Start / Menu');
  const quick=group('quick','quick');const phone=gameButton(quick,12,'Phone ↑','GTA V phone — D-pad up');buttonLabels.set(12,dpad.querySelector('[data-button="12"]'));
  function moveStick(input,event){
    const x=event.clientX-input.cx,y=event.clientY-input.cy,vector=stickVector(x,y,input.radius,settings.deadzone/100);
    controller.stick(input.owner,input.index,...vector);
    const distance=Math.hypot(x,y)||1,scale=Math.min(1,input.radius/distance);input.knob.style.transform=`translate(${x*scale}px,${y*scale}px)`;
  }
  function releasePointer(id){
    const input=pointers.get(id);if(!input)return;pointers.delete(id);
    if(input.kind==='key')keyUp(input.owner);else controller.release(input.owner);
    if(input.knob)input.knob.style.transform='';
    if(![...pointers.values()].some(other=>other.node===input.node))input.node.classList.remove('pressed');
    if(input.kind==='drag')save();
  }
  on(shadow,'pointermove',event=>{
    const input=pointers.get(event.pointerId);if(!input)return;consume(event);
    if(input.kind==='stick')moveStick(input,event);
    if(input.kind==='drag'){
      const rect=root.getBoundingClientRect(),w=input.node.offsetWidth*settings.size/100,h=input.node.offsetHeight*settings.size/100;
      const x=clamp((event.clientX-input.dx-rect.left)/rect.width,Math.min(.5,w/rect.width/2),Math.max(.5,1-w/rect.width/2));
      const y=clamp((event.clientY-input.dy-rect.top)/rect.height,Math.min(.5,(h/2+65)/rect.height),Math.max(.5,1-h/rect.height/2));
      settings.positions[input.id]=[x,y];positionGroup(input.id,input.node);
    }
  });
  for(const type of ['pointerup','pointercancel','lostpointercapture'])on(shadow,type,event=>{if(pointers.has(event.pointerId)){consume(event);releasePointer(event.pointerId);}});
  on(shadow,'contextmenu',event=>consume(event));
  for(const [id,node] of groups)on(node,'pointerdown',event=>{
    if(!editing)return;consume(event);const r=node.getBoundingClientRect();
    pointers.set(event.pointerId,{kind:'drag',node,id,owner:'drag-'+event.pointerId,dx:event.clientX-r.left-r.width/2,dy:event.clientY-r.top-r.height/2});node.setPointerCapture?.(event.pointerId);
  },true);

  const panel=el('section','panel');panel.hidden=true;panel.setAttribute('aria-label','Controller settings');root.append(panel);
  const panelHeader=el('header');panelHeader.append(el('strong','','Controller'));action(panelHeader,'Done','Close controller settings',()=>panel.hidden=true);panel.append(panelHeader);
  const presetLabel=el('label','field','Layout');const select=el('select');
  for(const [value,label] of [['standard','Standard'],['cod','Call of Duty'],['gta','GTA V'],['racing','Racing']]){const option=el('option','',label);option.value=value;select.append(option);}select.value=settings.profile;presetLabel.append(select);panel.append(presetLabel);
  on(select,'change',()=>{releaseAll();settings.profile=select.value;applySettings();save();});
  function slider(title,key,min,max,suffix){
    const label=el('label','field'),text=el('span','',title),output=el('output','',settings[key]+suffix),input=el('input');input.type='range';input.min=min;input.max=max;input.value=settings[key];input.setAttribute('aria-label',title);label.append(text,output,input);panel.append(label);
    on(input,'input',()=>{releaseAll();settings[key]=Number(input.value);output.textContent=input.value+suffix;applySettings();save();});
  }
  slider('Button size','size',75,125,'%');slider('Opacity','opacity',35,100,'%');slider('Stick deadzone','deadzone',5,30,'%');
  const leftLabel=el('label','check','Left-handed layout'),left=el('input');left.type='checkbox';left.checked=!!settings.leftHanded;leftLabel.prepend(left);panel.append(leftLabel);
  on(left,'change',()=>{releaseAll();settings.leftHanded=left.checked;settings.positions={};applySettings();save();});
  const editButton=action(panel,'Move controls','Reposition touch controls',()=>{releaseAll();editing=!editing;panel.hidden=true;root.classList.toggle('editing',editing);editDone.hidden=!editing;setHint(editing?'Drag each group to a comfortable position. Tap Done when finished.':'');});
  action(panel,'Reset layout','Reset controller layout',()=>{releaseAll();settings.positions={};settings.size=100;settings.opacity=75;settings.leftHanded=false;left.checked=false;applySettings();save();for(const input of panel.querySelectorAll('input[type=range]')){const key=input.getAttribute('aria-label')==='Button size'?'size':input.getAttribute('aria-label')==='Opacity'?'opacity':'deadzone';input.value=settings[key];input.previousElementSibling.textContent=settings[key]+'%';}});
  const profileNote=el('p','note');panel.append(profileNote);
  const editDone=action(bar,'Done','Finish moving controls',()=>{editing=false;releaseAll();root.classList.remove('editing');editDone.hidden=true;setHint('');save();});editDone.hidden=true;

  const keyPanel=el('section','panel keys');keyPanel.hidden=true;root.append(keyPanel);
  const keyHeader=el('header');keyHeader.append(el('strong','','Extra keys'));action(keyHeader,'Done','Close extra keys',()=>{releaseAll();keyPanel.hidden=true;});keyPanel.append(keyHeader);
  keyPanel.append(el('p','note','For game menus. Tap the game once first. These keys only work when the player accepts keyboard input.'));
  const keyGrid=el('div','key-grid');keyPanel.append(keyGrid);
  const keyboard=[['Esc','Escape',27],['Enter','Enter',13],['Tab','Tab',9],['Space','Space',32],['Shift','ShiftLeft',16],['Ctrl','ControlLeft',17],['E','KeyE',69],['F','KeyF',70],['R','KeyR',82],['W','KeyW',87],['A','KeyA',65],['S','KeyS',83],['D','KeyD',68],['↑','ArrowUp',38],['↓','ArrowDown',40],['←','ArrowLeft',37],['→','ArrowRight',39],['1','Digit1',49],['2','Digit2',50],['3','Digit3',51]];
  function keyEvent(info,type){try{
    const target=[...activeRealm.document.querySelectorAll('video,canvas')].sort((a,b)=>b.clientWidth*b.clientHeight-a.clientWidth*a.clientHeight)[0]||activeRealm.document.body;
    const key=info[1]==='Space'?' ':info[0]==='Esc'?'Escape':info[1].startsWith('Arrow')?info[1]:info[0];
    const event=new activeRealm.KeyboardEvent(type,{key,code:info[1],bubbles:true,cancelable:true,shiftKey:info[1]==='ShiftLeft',ctrlKey:info[1]==='ControlLeft'});
    Object.defineProperties(event,{keyCode:{value:info[2]},which:{value:info[2]}});target.dispatchEvent(event);
  }catch{setHint(embedded?'The player does not accept these keys. Use its own game controls.':'This player is in another page. Open its player and run the bookmark there.');}}
  function keyUp(owner){const info=keys.get(owner);if(info){keys.delete(owner);if(![...keys.values()].some(key=>key[1]===info[1]))keyEvent(info,'keyup');}}
  for(const info of keyboard){const button=el('button','key',info[0]);button.type='button';keyGrid.append(button);
    on(button,'pointerdown',event=>{consume(event);const owner='key-'+event.pointerId;keys.set(owner,info);pointers.set(event.pointerId,{kind:'key',owner,node:button});button.classList.add('pressed');button.setPointerCapture?.(event.pointerId);keyEvent(info,'keydown');});
  }
  function releaseAll(){for(const id of [...pointers.keys()])releasePointer(id);for(const owner of [...keys.keys()])keyUp(owner);controller.reset();}
  function positionGroup(id,node){
    const position=settings.positions[id];node.style.left='';node.style.right='';node.style.top='';node.style.bottom='';node.style.transform='';
    if(Array.isArray(position)&&position.length===2&&position.every(Number.isFinite)){node.style.left=clamp(position[0],.05,.95)*100+'%';node.style.top=clamp(position[1],.08,.94)*100+'%';node.style.bottom='auto';node.style.right='auto';node.style.transform='translate(-50%,-50%) scale(var(--scale))';}
  }
  function applySettings(){
    root.style.setProperty('--scale',settings.size/100);root.style.setProperty('--opacity',settings.opacity/100);root.classList.toggle('southpaw',!!settings.leftHanded);
    quick.hidden=settings.profile!=='gta';
    const cod=settings.profile==='cod';root.classList.toggle('cod',cod);
    const labels=cod?{0:'Jump',1:'Crouch',2:'Reload',3:'Swap',4:'Tactical',5:'Lethal',6:'Aim',7:'Fire',8:'Map',9:'Menu',10:'Sprint',11:'Melee'}:{0:'A',1:'B',2:'X',3:'Y',4:'LB',5:'RB',6:settings.profile==='racing'?'Brake':'LT',7:settings.profile==='racing'?'Gas':'RT',8:'View',9:'Menu',10:'L3',11:'R3'};
    for(const [index,label]of Object.entries(labels)){const button=buttonLabels.get(Number(index));button.textContent=label;button.setAttribute('aria-label',label);button.title=label;}
    profileNote.textContent=cod?'Before launching: turn on Kkeep Controls. In Call of Duty, set Aiming Input Device to Controller before joining a match. Labels use the default controller layout; custom game bindings can differ. Close GeForce’s own touch pad to avoid overlapping buttons.':settings.profile==='gta'?'GTA V: tap Phone ↑. Hold LB for the weapon wheel. Use View and Menu for the map and pause menu. Game bindings may differ.':'Use both sticks and hold buttons together. Move controls to adjust their positions.';
    for(const [id,node] of groups)positionGroup(id,node);
    editButton.textContent=editing?'Finish moving':'Move controls';
  }
  function setHidden(value){releaseAll();hidden=value;root.classList.toggle('paused',value);hideButton.textContent=value?'Show':'Hide';hideButton.setAttribute('aria-label',value?'Show and resume controls':'Hide and pause controls');panel.hidden=true;keyPanel.hidden=true;if(value){editing=false;root.classList.remove('editing');editDone.hidden=true;setHint('');}}
  function mount(){const full=document.fullscreenElement;
    if(full&&/^(VIDEO|IFRAME|CANVAS)$/.test(full.tagName)){setHint('Exit the player’s video-only fullscreen to use touch controls.');return;}
    const parent=full||document.body||document.documentElement;if(host.parentNode!==parent)parent.append(host);
  }
  function attach(realm){
    try{
      const doc=realm.document;if(bridges.get(realm)?.doc===doc)return;
      if(bridges.has(realm))releaseAll();
      bridges.get(realm)?.bridge.destroy();
      const bridge=(options.attachGamepad||attachGamepad)(realm,pad,consumer=>{lastRead=Date.now();activeRealm=consumer;});bridges.set(realm,{bridge,doc});bridge.announce();
    }catch{}
  }
  let blockedFrame=null;
  let visited;
  function scan(realm,depth=0){
    if(depth>4)return;attach(realm);
    visited.add(realm);
    try{for(const frame of realm.document.querySelectorAll('iframe')){
      const rect=frame.getBoundingClientRect();if(rect.width<260||rect.height<160)continue;
      try{if(frame.contentWindow.document)scan(frame.contentWindow,depth+1);}
      catch{const src=new URL(frame.src,realm.location.href);if(src.protocol==='https:'&&supported.includes(src.hostname))blockedFrame=src.href;}
    }}catch{}
  }
  const handoff=el('section','handoff');handoff.hidden=true;handoff.append(el('strong','','Open the game player'));handoff.append(el('p','','This game is inside another website. Open its player, then choose your Kkeep Controls bookmark again. Your cloud service still handles the session.'));
  const handoffLink=el('a','handoff-link','Open player');handoff.append(handoffLink);root.append(handoff);
  if(embedded){
    handoff.querySelector('p').textContent='Open this game player in a Kkeep tab, then tap Controls there.';
    on(handoffLink,'click',event=>{event.preventDefault();if(blockedFrame)options.onOpenPlayer?.(blockedFrame);});
  }
  function refresh(){
    if(closed)return;blockedFrame=null;visited=new Set();
    try{const realm=embedded?options.frame.contentWindow:window;if(realm)scan(realm);}catch{}
    // Never send input to a previous tab or an old player document.
    for(const [realm,{bridge,doc}] of bridges){
      let current=false;try{current=visited.has(realm)&&realm.document===doc;}catch{}
      if(!current){releaseAll();bridge.destroy();bridges.delete(realm);if(activeRealm===realm)activeRealm=options.frame?.contentWindow||window;}
    }
    mount();
    let video=null;try{video=[...activeRealm.document.querySelectorAll('video')].find(v=>v.videoWidth>0)||null;}catch{}
    if(video&&video!==lastVideo){lastVideo=video;for(const {bridge} of bridges.values())bridge.announce();lastAnnounced=Date.now();}
    const reading=Date.now()-lastRead<2000;
    if(!reading&&video&&Date.now()-lastAnnounced>5000){for(const {bridge} of bridges.values())bridge.announce();lastAnnounced=Date.now();}
    status.textContent=hidden?'Controls paused':demo?'Test pad':reading?(video?'Player reading controls':'Controller detected'):'Waiting for the player';
    status.classList.toggle('reading',reading&&!hidden);handoff.hidden=!blockedFrame||!!video||hidden;
    if(blockedFrame)handoffLink.href=blockedFrame;
    // Never report unsupported games or an inaccessible frame as connected.
    if(!reading&&!blockedFrame&&!hidden&&!demo&&Date.now()-started>15000)setHint('Start the game, then enable Controller / Gamepad in its controls if available. If this message stays, this player is not reading the touch controller.');
    else if(reading&&!editing)setHint('');
    if(!bridges.size)setHint(embedded?'Waiting for the game page. If the player blocks controller input, use its own touch buttons.':'This page does not allow gamepad input. Open the game player directly and run the bookmark there.');
  }
  const started=Date.now();
  on(window,'blur',releaseAll);on(window,'pagehide',releaseAll);on(document,'visibilitychange',()=>{if(document.hidden)releaseAll();});
  on(window,'resize',()=>{releaseAll();applySettings();});on(window,'orientationchange',releaseAll);on(document,'fullscreenchange',()=>{releaseAll();mount();});
  function destroy(){
    if(closed)return;releaseAll();closed=true;clearInterval(timer);for(const cleanup of cleanups)cleanup();
    // Leave neutral input for a polling frame before removing the device.
    const finish=()=>{clearTimeout(detachTimer);for(const {bridge} of bridges.values())bridge.destroy();bridges.clear();if(pendingDetach===finish)pendingDetach=undefined;};
    const detachTimer=setTimeout(finish,80);pendingDetach=finish;
    host.remove();delete window.__kkeepTouch;
    options.onClose?.();
  }
  window.__kkeepTouch={show(){setHidden(false);panel.hidden=false;},hide(){setHidden(true);},destroy};
  mount();applySettings();refresh();const timer=setInterval(refresh,1000);
  bar.title=readableName();
  return window.__kkeepTouch;
}
