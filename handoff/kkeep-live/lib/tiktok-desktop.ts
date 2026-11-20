export const TIKTOK_FEED = 'https://www.tiktok.com/foryou';
export const TIKTOK_LOGIN_LIMIT = 'TikTok has temporarily limited sign-in. Keep this session open and try again later.';

export function isTikTokUrl(value: string) {
  try { const url = new URL(value); return url.protocol === 'https:' && /(^|\.)tiktok\.com$/.test(url.hostname); }
  catch { return false; }
}

export function desktopViewport(width: number, height: number) {
  const scale = Math.min(1, width / 1024);
  return {width: width / scale, height: height / scale, scale};
}

function visible(element: Element) {
  const rect = element.getBoundingClientRect();
  const css = element.ownerDocument.defaultView?.getComputedStyle(element);
  return rect.width > 0 && rect.height > 0 && css?.visibility !== 'hidden' && css?.display !== 'none';
}

export function hasTikTokDialog(doc: Document) {
  return Array.from(doc.querySelectorAll('[role="dialog"],[aria-modal="true"],#loginModalContentContainer,#loginContainer,input[type="password"]')).some(visible);
}

/** Touch navigation uses the existing desktop player; it never fetches a feed or submits a form. */
export function attachTikTokDesktop(doc: Document, onLoginLimit: (limited: boolean) => void, onDialogChange?: (open: boolean) => void) {
  const win = doc.defaultView!;
  let start: {id: number; x: number; y: number; vertical: boolean} | null = null;
  let lastStep = -Infinity;
  let limited = false;
  let dialogOpen: boolean | undefined;
  let pending: ReturnType<typeof setTimeout> | undefined;
  const videos = () => Array.from(doc.querySelectorAll('video')).filter(visible);
  const isBlocked = () => hasTikTokDialog(doc) || doc.documentElement.classList.contains('kkeep-video');

  function step(direction: number) {
    if (isBlocked() || Date.now() - lastStep < 550) return;
    const selectors = direction > 0
      ? '[data-e2e="feed-navigation-next"],[data-e2e="arrow-right"],[data-e2e="browse-video-next"],button[aria-label="Next video"],button[aria-label="Go to next video"]'
      : '[data-e2e="feed-navigation-prev"],[data-e2e="arrow-left"],[data-e2e="browse-video-prev"],button[aria-label="Previous video"],button[aria-label="Go to previous video"]';
    const control = Array.from(doc.querySelectorAll<HTMLElement>(selectors)).find(el => visible(el) && !el.hasAttribute('disabled') && el.getAttribute('aria-disabled') !== 'true');
    if (control) { lastStep = Date.now(); control.click(); return; }
    const list = videos();
    const current = list.find(v => { const r = v.getBoundingClientRect(); return r.top < win.innerHeight / 2 && r.bottom > win.innerHeight / 2; });
    if (!current) return;
    const next = list[list.indexOf(current) + direction];
    if (next) { lastStep = Date.now(); next.scrollIntoView({block: 'center', behavior: 'smooth'}); return; }
    let scroller: Element | null = current.parentElement;
    while (scroller && (scroller.scrollHeight <= scroller.clientHeight + 10 || !/auto|scroll/.test(win.getComputedStyle(scroller).overflowY))) scroller = scroller.parentElement;
    scroller ||= doc.scrollingElement;
    if (scroller) { lastStep = Date.now(); scroller.scrollBy({top: direction * scroller.clientHeight, behavior: 'smooth'}); }
  }

  const touchStart = (event: TouchEvent) => {
    start = null;
    if (event.touches.length !== 1 || isBlocked()) return;
    const target = event.target as Element | null;
    if (target?.closest('input,textarea,select,button,a,[contenteditable="true"],[role="slider"]')) return;
    const touch = event.touches[0];
    if (!videos().some(video => { const r = video.getBoundingClientRect(); return touch.clientX >= r.left && touch.clientX <= r.right && touch.clientY >= r.top && touch.clientY <= r.bottom; })) return;
    start = {id: touch.identifier, x: touch.clientX, y: touch.clientY, vertical: false};
  };
  const touchMove = (event: TouchEvent) => {
    if (!start) return;
    if (event.touches.length !== 1 || isBlocked()) { start = null; return; }
    const touch = Array.from(event.touches).find(t => t.identifier === start!.id);
    if (!touch) { start = null; return; }
    const dx = Math.abs(touch.clientX - start.x), dy = Math.abs(touch.clientY - start.y);
    if (!start.vertical && dx > 16 && dx > dy) { start = null; return; }
    if (dy > 16 && dy > dx * 1.3) start.vertical = true;
    if (start.vertical) { event.preventDefault(); event.stopPropagation(); }
  };
  const touchEnd = (event: TouchEvent) => {
    const gesture = start; start = null;
    if (!gesture || isBlocked()) return;
    const touch = Array.from(event.changedTouches).find(t => t.identifier === gesture.id);
    if (!touch) return;
    const dy = touch.clientY - gesture.y, dx = touch.clientX - gesture.x;
    if (Math.abs(dy) >= 60 && Math.abs(dy) > Math.abs(dx) * 1.3) {
      event.preventDefault(); event.stopPropagation(); step(dy < 0 ? 1 : -1);
    }
  };
  const touchCancel = () => { start = null; };
  function checkLimit() {
    const open=hasTikTokDialog(doc);
    if(open!==dialogOpen){dialogOpen=open;onDialogChange?.(open);}
    // Only inspect rendered error text. Never read or retain credential fields.
    const next = Array.from(doc.querySelectorAll('[role="alert"],[data-e2e="error-message"],[class*="Error"],[class*="error"]'))
      .some(el => visible(el) && /maximum (?:number of |password )?(?:attempts|retries)|too many (?:attempts|retries)/i.test(el.textContent || ''));
    if (next !== limited) { limited = next; onLoginLimit(next); }
  }
  const observer = new win.MutationObserver(() => {
    if (pending !== undefined) return;
    pending = setTimeout(() => { pending = undefined; checkLimit(); }, 150);
  });
  observer.observe(doc.documentElement, {childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['class', 'style', 'hidden']});
  checkLimit();
  doc.addEventListener('touchstart', touchStart, {capture: true, passive: true});
  doc.addEventListener('touchmove', touchMove, {capture: true, passive: false});
  doc.addEventListener('touchend', touchEnd, {capture: true, passive: false});
  doc.addEventListener('touchcancel', touchCancel, true);
  return {step, destroy() {
    observer.disconnect(); clearTimeout(pending);
    doc.removeEventListener('touchstart', touchStart, true); doc.removeEventListener('touchmove', touchMove, true);
    doc.removeEventListener('touchend', touchEnd, true); doc.removeEventListener('touchcancel', touchCancel, true);
  }};
}
