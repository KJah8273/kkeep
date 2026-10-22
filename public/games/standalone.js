// Keep Kkeep's menu in a separate document from each game's native input.
const game=window.kkeepGame,frame=document.querySelector('#game-frame');
const origin=location.origin,playerUrl=new URL(game.player,location.href);
const local=playerUrl.origin===origin,channel=game.channel||'kkeep-arcade-player';
const menu=document.createElement('nav');menu.className='game-menu';menu.setAttribute('aria-label','Kkeep game menu');
const toggle=document.createElement('button');toggle.className='menu-toggle';toggle.textContent='K';toggle.setAttribute('aria-label','Open game menu');toggle.setAttribute('aria-expanded','false');
const tools=document.createElement('div');tools.className='menu-tools';tools.hidden=true;menu.append(toggle,tools);document.body.append(menu);
const send=(type,value)=>{if(local)frame.contentWindow?.postMessage({channel,type,value},origin);};
const focus=()=>{frame.focus({preventScroll:true});if(local)send('focus');};
toggle.onclick=()=>{tools.hidden=!tools.hidden;toggle.setAttribute('aria-expanded',String(!tools.hidden));toggle.setAttribute('aria-label',tools.hidden?'Open game menu':'Close game menu');send('menu',!tools.hidden);if(tools.hidden)focus();};
function button(label,fn){const b=document.createElement('button');b.type='button';b.textContent=label;b.onclick=fn;tools.append(b);return b;}
const home=document.createElement('a');home.href='/';home.textContent='Kkeep';tools.append(home);
button('Reload',()=>{frame.src=playerUrl.href;});
let noticeTimer;
function notice(text){let box=document.querySelector('.game-notice');if(!box){box=document.createElement('p');box.className='game-notice';box.setAttribute('role','status');document.body.append(box);}box.textContent=text;clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>box.remove(),5000);}
button('Full screen',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else if(document.documentElement.requestFullscreen)await document.documentElement.requestFullscreen();else notice('Turn your iPad sideways for a wider view.');}catch{notice('Turn your iPad sideways for a wider view.');}});
const help=document.createElement('dialog');help.className='game-help';
const heading=document.createElement('h2');heading.textContent=game.title;const text=document.createElement('p');text.textContent=game.help;
const close=document.createElement('button');close.textContent='Back to game';close.onclick=()=>help.close();help.append(heading,text,close);document.body.append(help);
button('Help',()=>{send('menu',true);help.showModal();});help.addEventListener('close',()=>{send('menu',!tools.hidden);if(tools.hidden)focus();});
let quality='low',controls=navigator.maxTouchPoints>0,opacity=.45;
try{quality=localStorage.getItem(`kkeep.${game.slug}.quality`)||'low';opacity=Number(localStorage.getItem(`kkeep.${game.slug}.opacity`))||.45;}catch{}
if(['low','balanced','high'].includes(game.startQuality))quality=game.startQuality;
if(!['low','balanced','high'].includes(quality))quality='low';opacity=Math.min(.85,Math.max(.2,opacity));
if(game.quality){
 const label=document.createElement('label');label.className='game-quality';label.textContent='Quality';const select=document.createElement('select');select.setAttribute('aria-label','Game quality');
 for(const [value,title] of [['low','Low · iPad'],['balanced','Balanced'],['high','High']]){const option=new Option(title,value);select.append(option);}select.value=quality;
 select.onchange=()=>{quality=select.value;try{localStorage.setItem(`kkeep.${game.slug}.quality`,quality);}catch{}send('quality',quality);};label.append(select);tools.append(label);
}
if(game.controls){
 const control=button('Touch controls',()=>{controls=!controls;control.setAttribute('aria-pressed',String(controls));send('controls',controls);});control.setAttribute('aria-pressed',String(controls));
 const label=document.createElement('label');label.className='control-opacity';label.textContent='Opacity';const range=document.createElement('input');range.type='range';range.min='20';range.max='85';range.value=String(opacity*100);range.setAttribute('aria-label','Control opacity');range.oninput=()=>{opacity=Number(range.value)/100;try{localStorage.setItem(`kkeep.${game.slug}.opacity`,opacity);}catch{}send('opacity',opacity);};label.append(range);tools.append(label);
}
window.addEventListener('message',event=>{if(!local||event.origin!==origin||event.source!==frame.contentWindow||event.data?.channel!==channel)return;if(event.data.type==='ready'){send('quality',quality);send('controls',controls);send('opacity',opacity);send('menu',!tools.hidden);}});
// Navigate once after installing listeners; menu actions never restart the game.
frame.src=playerUrl.href;
