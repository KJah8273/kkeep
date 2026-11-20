/** Kick's live-card previews are lazy images inside nested scrolling frames. */
export function isKickPage(value:string){
  try{const url=new URL(value);return url.protocol==='https:'&&['kick.com','www.kick.com'].includes(url.hostname);}catch{return false;}
}

export function isKickThumbnail(value:string){
  try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password&&!url.port&&url.hostname==='web.kick.com'&&/^\/api\/v1\/channels\/\d+\/thumbnail\.jpeg$/.test(url.pathname);}catch{return false;}
}

const selector='[data-testid="media-card-thumbnail"] img';
/** Start visible previews explicitly; retry a failed original image once, after cooldown. */
export function attachKickThumbnails(doc:Document){
  const win=doc.defaultView!;
  const failed=new Map<HTMLImageElement,{source:string;due:number}>(),retried=new Set<string>();
  let stopped=false,queued:number|undefined,retryTimer:number|undefined,rateUntil=0;
  const source=(img:HTMLImageElement)=>img.getAttribute('scramjet-attr-src')||img.getAttribute('src')||'';
  function nearby(img:HTMLImageElement){
    const r=img.getBoundingClientRect();
    if(!r.width||!r.height||r.bottom< -160||r.top>win.innerHeight+160||r.right<0||r.left>win.innerWidth)return false;
    if(win.getComputedStyle(img).visibility==='hidden')return false;
    // Respect horizontal carousel clipping so opening Home doesn't fetch every card.
    for(let el=img.parentElement;el&&el!==doc.body;el=el.parentElement){
      const css=win.getComputedStyle(el);
      if(/auto|scroll|hidden|clip/.test(css.overflowX)){
        const clip=el.getBoundingClientRect();if(r.right<=clip.left||r.left>=clip.right)return false;
      }
    }
    return true;
  }
  function scan(){
    if(stopped)return;
    win.clearTimeout(retryTimer);retryTimer=undefined;
    if(doc.visibilityState==='hidden')return;
    const now=Date.now();let next=Infinity;
    for(const [img,entry] of failed)if(!img.isConnected||source(img)!==entry.source||img.naturalWidth>0)failed.delete(img);
    for(const img of doc.querySelectorAll<HTMLImageElement>(selector)){
      const url=source(img);if(!isKickThumbnail(url)||!nearby(img)||img.naturalWidth>0)continue;
      // WebKit can leave absolute-positioned lazy images pending in this carousel.
      // Keep the existing URL and proxy path, and let the native image loader run.
      if(img.loading!=='eager')img.loading='eager';
      if(!img.complete||retried.has(url))continue;
      if(!failed.has(img)&&failed.size<64)failed.set(img,{source:url,due:now+60000});
      const entry=failed.get(img);if(!entry)continue;
      const due=Math.max(entry.due,rateUntil);
      if(due>now){next=Math.min(next,due);continue;}
      if(retried.size>=128)continue;
      retried.add(url);failed.delete(img);
      const current=img.getAttribute('src');if(current)img.setAttribute('src',current);
    }
    if(Number.isFinite(next))retryTimer=win.setTimeout(scan,Math.min(2147483647,Math.max(1,next-now)));
  }
  function queue(){if(!stopped&&queued===undefined)queued=win.setTimeout(()=>{queued=undefined;scan();},80);}
  const observer=new win.MutationObserver(records=>{
    if(records.some(record=>record.target instanceof win.Element&&record.target.closest('[data-testid="media-card-thumbnail"]')||Array.from(record.addedNodes).some(n=>n instanceof win.Element&&(n.matches(selector)||n.querySelector(selector)))))queue();
  });
  observer.observe(doc.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['src','srcset','loading']});
  doc.addEventListener('scroll',queue,true);doc.addEventListener('visibilitychange',queue);
  doc.addEventListener('error',queue,true);doc.addEventListener('load',queue,true);win.addEventListener('resize',queue);
  queue();
  return {setRateLimit(until:number){rateUntil=Math.max(rateUntil,until);queue();},destroy(){
    stopped=true;observer.disconnect();win.clearTimeout(queued);win.clearTimeout(retryTimer);failed.clear();retried.clear();
    doc.removeEventListener('scroll',queue,true);doc.removeEventListener('visibilitychange',queue);
    doc.removeEventListener('error',queue,true);doc.removeEventListener('load',queue,true);win.removeEventListener('resize',queue);
  }};
}
