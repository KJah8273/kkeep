/* First-party app/game launch counts. No cookies or storage IDs are created. */
(() => {
  'use strict';
  if (typeof crypto.randomUUID !== 'function' || window.top !== window.self || navigator.webdriver || navigator.doNotTrack === '1' || navigator.globalPrivacyControl === true) return;
  const allowed = new Set(['home','web','youtube','tiktok','snapchat','roblox','clash','ghost','gfn','xbox']);
  const paths = {'/':'home','/youtube':'youtube','/tiktok':'tiktok','/snapchat':'snapchat','/roblox':'roblox','/clash-royale':'clash','/gfn/index.html':'gfn','/xbox/index.html':'xbox'};
  const gamePath=/^\/play\/([a-z0-9-]+)\/?$/.exec(location.pathname)?.[1] || ({'/stick-fight':'stick-fight','/hgola-altara':'hgola-altara','/party-games':'party-games'})[location.pathname];
  const valid=value=>allowed.has(value)||typeof value==='string'&&/^game:[a-z0-9-]{1,80}$/.test(value);
  let surface = gamePath?'game:'+gamePath:document.documentElement.dataset.kkeepAnalyticsSurface || paths[location.pathname];
  let timer, sent = false, permitted = false, stopped = false;
  const ipad = /iPad/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
  const excluded = () => {try {return localStorage.getItem('kkeep-analytics-exclude') === '1';}catch{return false;}};
  function schedule() {
    clearTimeout(timer);
    if (!permitted || stopped || sent || excluded() || !valid(surface) || document.visibilityState !== 'visible') return;
    timer = setTimeout(() => {
      if (document.visibilityState !== 'visible' || excluded() || stopped) return;
      sent = true;
      // This whitelist is the complete payload. Never include location, document.title or referrer.
      const event = crypto.randomUUID();
      fetch('/api/analytics/collect', {method:'POST',credentials:'same-origin',keepalive:true,
        headers:{'Content-Type':'application/json','X-Kkeep-Analytics':'1'},body:JSON.stringify({surface,event,ipad})}).catch(()=>{});
    }, 2000);
  }
  function change(event) {
    const next = event.detail;
    if (!valid(next) || next === surface) return;
    surface = next; sent = false; schedule();
  }
  const abort = new AbortController();
  const deadline = setTimeout(()=>abort.abort(),5000);
  fetch('/api/analytics/preference',{credentials:'same-origin',cache:'no-store',signal:abort.signal})
    .then(response=>response.ok?response.json():null)
    .then(value=>{permitted=!!value&&!value.excluded&&!value.owner&&!value.privacySignal;schedule();})
    .catch(()=>{}).finally(()=>clearTimeout(deadline));
  document.addEventListener('visibilitychange',schedule);
  window.addEventListener('kkeep-analytics-surface',change);
  window.addEventListener('kkeep-analytics-preference',schedule);
  window.addEventListener('pagehide',()=>{stopped=true;clearTimeout(timer);});
  window.addEventListener('pageshow',()=>{stopped=false;schedule();});
})();
