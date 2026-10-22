export function isIPad(nav=globalThis.navigator) {
  return /iPad/i.test(nav?.userAgent||'') || (/Mac/.test(nav?.platform||'') && nav?.maxTouchPoints>1);
}
export function renderScale(width,height,quality) {
  const longest=quality==='low'?960:quality==='balanced'?1280:1920;
  return Math.min(quality==='high'?1.5:1,longest/Math.max(width,height,1));
}
export function createDisplay(canvas,game) {
  const key=`kkeep.${game}.quality`;let quality='low',module=null;
  try{const saved=localStorage.getItem(key)||localStorage.getItem('kkeep.game.quality');if(['low','balanced','high'].includes(saved))quality=saved;}catch{}
  const ratio=()=>renderScale(canvas.clientWidth||innerWidth,canvas.clientHeight||innerHeight,quality);
  const apply=()=>{if(module)module.devicePixelRatio=ratio();};
  window.addEventListener('resize',apply);window.visualViewport?.addEventListener('resize',apply);
  const control=document.createElement('label');control.className='game-quality';control.append(document.createTextNode('Quality '));
  const select=document.createElement('select');select.setAttribute('aria-label','Game quality');
  for(const [value,title] of [['low','Low · iPad'],['balanced','Balanced'],['high','High']]){const option=document.createElement('option');option.value=value;option.textContent=title;select.append(option);}
  const setQuality=value=>{if(!['low','balanced','high'].includes(value))return;quality=value;select.value=value;try{localStorage.setItem(key,quality);}catch{}apply();};
  select.value=quality;select.onchange=()=>setQuality(select.value);control.append(select);
  return {control,ratio,quality:()=>quality,setQuality,attach(value){module=value;apply();},preRun(value){module=value;apply();if(isIPad())module.SystemInfo.mobile=true;}};
}
