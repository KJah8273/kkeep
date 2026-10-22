/** Reversible video focus: keep TikTok's own player and media session in place. */
export function focusTikTok(doc: Document, notice: (message: string) => void) {
  let selected: HTMLVideoElement | null = null;
  let ancestors: Element[] = [];
  let controls = false;
  const style = doc.createElement('style');
  style.textContent = `html.kkeep-video body{background:#000!important}html.kkeep-video body *{visibility:hidden!important}html.kkeep-video video[data-kkeep-focus]{visibility:visible!important;position:fixed!important;inset:0!important;width:100vw!important;height:calc(100dvh - 88px)!important;max-width:none!important;max-height:none!important;object-fit:contain!important;z-index:2147483646!important;background:#000!important;touch-action:none!important}html.kkeep-video [data-kkeep-parent]{transform:none!important;filter:none!important;perspective:none!important;contain:none!important;overflow:visible!important}`;
  doc.head.append(style);
  function release() {
    if (selected) { selected.removeAttribute('data-kkeep-focus'); selected.controls = controls; }
    ancestors.forEach(el => el.removeAttribute('data-kkeep-parent'));
    ancestors = [];
    doc.documentElement.classList.remove('kkeep-video');
  }
  function candidates() {
    return Array.from(doc.querySelectorAll('video')).filter(v => {
      const r = v.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    });
  }
  function choose(video?: HTMLVideoElement) {
    const list = candidates();
    video ||= list.find(v => !v.paused && !v.ended) || list.find(v => {
      const r = v.getBoundingClientRect(); return r.top < (doc.defaultView?.innerHeight || 800) && r.bottom > 0;
    });
    if (!video) return false;
    release(); selected = video; controls = video.controls; video.controls = true;
    let parent = video.parentElement;
    while (parent && parent !== doc.documentElement) { ancestors.push(parent); parent.setAttribute('data-kkeep-parent',''); parent = parent.parentElement; }
    video.setAttribute('data-kkeep-focus',''); doc.documentElement.classList.add('kkeep-video');
    return true;
  }
  let pending: ReturnType<typeof setTimeout> | undefined;
  function step(direction: number) {
    release();
    const selectors = direction > 0
      ? '[data-e2e="arrow-right"],[data-e2e="browse-video-next"],button[aria-label="Next video"],button[aria-label="Go to next video"]'
      : '[data-e2e="arrow-left"],[data-e2e="browse-video-prev"],button[aria-label="Previous video"],button[aria-label="Go to previous video"]';
    const native = doc.querySelector<HTMLElement>(selectors);
    const list = candidates(); const index = selected ? list.indexOf(selected) : -1;
    const next = index >= 0 ? list[index + direction] : undefined;
    if (native) native.click();
    else if (next) { selected?.pause(); next.scrollIntoView({block:'center'}); choose(next); next.play().catch(()=>{}); return; }
    else {
      let scroll = selected?.parentElement;
      while (scroll && scroll.scrollHeight <= scroll.clientHeight + 10) scroll = scroll.parentElement;
      const target = scroll || doc.scrollingElement;
      target?.scrollBy({top: direction * (doc.defaultView?.innerHeight || 800), behavior:'instant'});
    }
    clearTimeout(pending);
    pending = setTimeout(() => {
      if (!choose()) notice('Open a TikTok video first, then tap Video view.');
      else if (!native && !next) notice('If no next video appears, open TikTok’s For You feed.');
    }, 650);
  }
  let start: {x:number;y:number} | null = null;
  const touchStart = (e: TouchEvent) => { if(e.touches.length===1 && e.target===selected) start={x:e.touches[0].clientX,y:e.touches[0].clientY}; else start=null; };
  const touchMove = (e: TouchEvent) => {if(start && Math.abs(e.touches[0].clientY-start.y)>20)e.preventDefault();};
  const touchEnd = (e: TouchEvent) => {if(!start)return; const t=e.changedTouches[0];const dy=t.clientY-start.y;const dx=t.clientX-start.x;start=null;if(Math.abs(dy)>65 && Math.abs(dy)>Math.abs(dx)*1.3){e.preventDefault();step(dy<0?1:-1);}};
  doc.addEventListener('touchstart',touchStart,{passive:true});
  doc.addEventListener('touchmove',touchMove,{passive:false});
  doc.addEventListener('touchend',touchEnd,{passive:false});
  const timer=setInterval(()=>{if(!selected?.isConnected)choose();},750);
  if(!choose()) notice('Open a TikTok video first. Video view will start when it loads.');
  return {step, destroy(){clearInterval(timer);clearTimeout(pending);release();style.remove();doc.removeEventListener('touchstart',touchStart);doc.removeEventListener('touchmove',touchMove);doc.removeEventListener('touchend',touchEnd);}};
}
