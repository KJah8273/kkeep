(()=>{
 const slug=location.pathname.split('/').filter(Boolean)[1];
 const titles={'how-to-fish':'How to Fish','stick-war-legacy':'Stick War: Legacy','solar-smash':'Solar Smash','tomb-of-the-mask':'Tomb of the Mask','subway-surfers':'Subway Surfers','kick-the-buddy':'Kick the Buddy','geometry-dash':'Geometry Dash','idle-mining-empire':'Idle Mining Empire'};
 if(!titles[slug])return;
 const origin=location.origin,root=document.documentElement;root.dataset.kkeepGame=slug;root.style.setProperty('--kk-game-art',`url("${origin}/games/covers/${slug}.webp")`);
 const style=document.createElement('link');style.rel='stylesheet';style.href=origin+'/games/loading-screen.css?v=4';document.head.append(style);
 let finished=false,splash,status,bar,poller;
 const api=window.KkeepLoading={
  update(message,value){if(finished)return;if(status)status.textContent=message;if(bar&&Number.isFinite(value)){bar.value=Math.max(0,Math.min(1,value));}else if(bar)bar.removeAttribute('value');},
  finish(){finished=true;splash?.remove();clearInterval(poller);root.classList.add('kk-game-started');},
 };
 window.addEventListener('kkeep-game-ready',()=>api.finish());
 window.addEventListener('kkeep-download',event=>api.update(String(event.detail)));
 function mount(){
  for(const loader of document.querySelectorAll('#loader,#unity-loading-bar')){
   loader.classList.add('kk-art-loader');
   if(loader.id==='loader'){document.querySelector('#loader-box')?.classList.add('kk-load-panel');}
   else{const panel=document.createElement('div');panel.className='kk-load-panel';while(loader.firstChild)panel.append(loader.firstChild);loader.append(panel);}
  }
  if(finished||['how-to-fish','stick-war-legacy','solar-smash'].includes(slug))return;
  splash=document.createElement('div');splash.id='kk-art-splash';splash.className='kk-art-loader';
  const panel=document.createElement('div');panel.className='kk-load-panel';const title=document.createElement('h1');title.textContent=titles[slug];status=document.createElement('p');status.setAttribute('role','status');status.textContent='Loading game…';bar=document.createElement('progress');bar.max=1;
  const reveal=document.createElement('button');reveal.textContent='Show game';reveal.className='kk-show-game';reveal.onclick=()=>api.finish();reveal.hidden=true;
  panel.append(title,status,bar,reveal);splash.append(panel);document.body.append(splash);
  // A manual reveal prevents a third-party port with no ready event from trapping input.
  setTimeout(()=>{reveal.hidden=false;},15000);
  const bound=new WeakSet();
  poller=setInterval(()=>{
   if(slug==='idle-mining-empire'&&window.ig){if(ig.loader)api.update('Loading game…',ig.loader.status);if(ig.game&&ig.loader?.done)api.finish();}
   if(slug==='geometry-dash')for(const game of window.Phaser?.GAMES||[]){
    if(game.scene?.isActive('GameScene')){api.finish();break;}
    const scene=game.scene?.getScene('BootScene');if(scene?.load&&!bound.has(scene.load)){bound.add(scene.load);scene.load.on('progress',value=>api.update('Loading game… '+Math.floor(value*100)+'%',value));}
   }
   const native=document.querySelector('#game-status,#subway-status');if(native?.textContent&&slug!=='geometry-dash')api.update(native.textContent);
  },300);
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
})();
