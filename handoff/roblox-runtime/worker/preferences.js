// Apply performance preferences before the provider hook/engine, without a
// navigation. This preserves a chosen server/job and its first join request.
export function preferencesBootstrap() {
  try{
    const url=new URL(location.href);
    const valid=value=>value==='30'||value==='60'?value:null;
    const game=url.pathname.endsWith('/games/start');
    let saved=null,cookie=null;
    try{saved=valid(localStorage.getItem('rbxweb.fps'));}catch{}
    try{cookie=/(?:^|;\s*)rbxfps=(30|60)(?:;|$)/.exec(document.cookie||'')?.[1]||null;}catch{}
    const ipad=typeof navigator!=='undefined'&&(/iPad/i.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1));
    // Legacy runtime preferences were sometimes written automatically. A
    // current main/catalog selection wins; an otherwise saved 60 stays intact.
    const fps=valid(url.searchParams.get('fps'))||saved||cookie||(ipad?'30':'60');
    // The catalog adds this public scalar to its existing launch navigation.
    // Keep it available even when both cookies and persistent storage fail.
    globalThis.__kkeepFps=fps;
    try{localStorage.setItem('rbxweb.fps',fps);localStorage.setItem('rbxweb.perf','performance');}catch{}
    try{document.cookie='rbxfps='+fps+'; Path=/; SameSite=Lax; Secure';}catch{}
    try{document.cookie='rbxperf=performance; Path=/; SameSite=Lax; Secure';}catch{}
    if(game){
      url.searchParams.set('perf','performance');url.searchParams.set('fps',fps);url.searchParams.set('res','auto');
      history.replaceState(history.state,'',url.href);
    }
  }catch{ /* Storage restrictions must not interrupt a join. */ }
}

// Serialized at the inspected catalog's one existing launch assignment.
// Preserve its /play step, where the browser worker records a selected server.
export function catalogLaunchUrl(value) {
  if(typeof value!=='string')return value;
  try{
    const page=new URL(location.href),url=new URL(value,page);
    const play=/^\/play\/[1-9]\d{0,19}$/.test(url.pathname);
    const game=url.pathname==='/_/cGxheS5yb2Jsb3guY29t/games/start'&&/^[1-9]\d{0,19}$/.test(url.searchParams.get('placeId')||'');
    if(url.origin!==page.origin||url.username||url.password||(!play&&!game))return value;
    const valid=fps=>fps==='30'||fps==='60';
    if(valid(url.searchParams.get('fps')))return value;
    const requested=page.searchParams.get('fps');
    const fps=valid(requested)?requested:globalThis.__kkeepFps;
    if(!valid(fps))return value;
    url.searchParams.set('fps',fps);
    return url.href;
  }catch{return value;}
}
