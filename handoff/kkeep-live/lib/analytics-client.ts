export function analyticsSurfaceForUrl(value:string){
 if(!value)return 'home';
 let host='';try{host=new URL(value).hostname.toLowerCase();}catch{return 'web';}
 const is=(name:string)=>host===name||host.endsWith('.'+name);
 if(is('youtube.com')||is('youtu.be'))return 'youtube';
 if(is('tiktok.com'))return 'tiktok';
 if(is('snapchat.com'))return 'snapchat';
 if(is('nowgg.fun')||host==='kkeep-roblox-private.testerqrr1.chatgpt.site')return 'roblox';
 if(host==='kkeep-clash-royale.testerqrr1.chatgpt.site')return 'clash';
 if(host==='ghost-mathmulti.zeoghost.workers.dev')return 'ghost';
 if(is('geforcenow.com'))return 'gfn';
 if(is('xbox.com'))return 'xbox';
 return 'web';
}
export function setAnalyticsSurface(surface:string){
 // Only the coarse app category reaches the collector; the input URL stays local.
 document.documentElement.dataset.kkeepAnalyticsSurface=surface;
 window.dispatchEvent(new CustomEvent('kkeep-analytics-surface',{detail:surface}));
}
