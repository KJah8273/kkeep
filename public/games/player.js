import {createFishControls} from './how-to-fish/controls.js?v=1';
const fish=document.body.dataset.game==='fish',canvas=document.querySelector('canvas');
const toolbar=document.createElement('nav');toolbar.className='game-toolbar';toolbar.setAttribute('aria-label','Game controls');
toolbar.innerHTML=(fish?'<button id="game-menu" aria-label="Show Kkeep game menu" aria-expanded="false">K</button>':'')+'<a href="/">← Kkeep</a><button id="game-reload">Reload</button><button id="game-fullscreen">Full screen</button><button id="game-help">'+(fish?'Controls':'Help')+'</button>'+(fish?'<button id="game-touch" aria-pressed="false">Play controls</button>':'');document.body.append(toolbar);
let expanded=!fish;
function setMenu(show){expanded=show;toolbar.querySelector('#game-menu')?.setAttribute('aria-expanded',String(show));[...toolbar.children].forEach(el=>{if(!['game-menu','game-touch'].includes(el.id))el.hidden=!show;});}
if(fish){setMenu(false);toolbar.querySelector('#game-menu').onclick=()=>setMenu(!expanded);}
function attachDisplay(){if(window.kkeepGameDisplay){const label=window.kkeepGameDisplay.control;label.hidden=!expanded;toolbar.insertBefore(label,toolbar.querySelector('#game-touch'));}}
attachDisplay();window.addEventListener('kkeep-display-ready',attachDisplay,{once:true});
document.querySelector('#game-reload').onclick=()=>location.reload();
document.querySelector('#game-fullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else if(document.documentElement.requestFullscreen)await document.documentElement.requestFullscreen();else notice('Turn your iPad sideways and hide Safari’s toolbar for a larger view.');}catch{notice('Use landscape mode for a larger view.');}};
const help=document.createElement('dialog');help.className='game-help';
help.innerHTML='<h2>'+ (fish?'How to Fish':'Stick War: Legacy')+'</h2><p>'+(fish?'Start or join a game. Touch controls appear when the game captures the camera; Play controls also turns them on. Move with your left thumb and drag the right side to look. You can also drag Cast, Reel or Throw to aim while holding it. Hold Throw to charge, then release. Tap Run once to run, and again to walk. Menus restores direct taps.':'Use the game’s touch buttons. This build is single-player. Progress is saved on this device when browser storage is available.')+'</p>'+(fish?'<label class="control-setting">Control visibility <input id="control-opacity" type="range" min="25" max="80" step="5" value="55"><output id="opacity-value">55%</output></label><label class="control-setting">Camera sensitivity <input id="look-speed" type="range" min="0.3" max="2" step="0.05" value="0.85"></label><p>Tools contains bait, empty hands, inspect, reload, crouch and inventory slots. Graphics are set automatically at launch: ambient occlusion, decorations and decals off; shadows Low. The K menu’s Quality option changes resolution only.</p>':'')+'<form method="dialog"><button>Done</button></form>';document.body.append(help);
let resetControls=()=>{};
document.querySelector('#game-help').onclick=()=>{resetControls();help.showModal();};
let noticeTimer;function notice(text){let box=document.querySelector('.game-notice');if(!box){box=document.createElement('p');box.className='game-notice';box.setAttribute('role','status');document.body.append(box);}box.textContent=text;clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>box.remove(),4500);}
if(fish)resetControls=createFishControls({canvas,toggle:document.querySelector('#game-touch'),help,setMenu,notice});

document.querySelector('.noah-wmk')?.remove();
