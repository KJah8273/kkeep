// Scramjet's routing table lives in service-worker memory. On a cold start,
// restore the owning sign-in controller before letting its first request go.
// The original request is dispatched once; account requests are never replayed
// or forwarded to the public asset server.
export function proxySessionWorker(scope) {
  const waiting = new Map();
  const origin = scope.location.origin;
  const timeout = 3000;
  const unavailable = () => new Response('The sign-in connection is not ready. Reload Roblox and try again.', {
    status:503, headers:{'Content-Type':'text/plain; charset=utf-8', 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff'}
  });
  async function wakeOwner(prefix, needed) {
    const clients = await scope.clients.matchAll({type:'window', includeUncontrolled:true});
    for (const client of clients) {
      if (!needed()) return;
      let url;
      try { url = new URL(client.url); } catch { continue; }
      if (url.origin !== origin || url.pathname !== '/_rbx/signin') continue;
      // This prefix is a browser-local routing identifier, never a URL or an
      // account token. Other sign-in tabs ignore prefixes they do not own.
      try { client.postMessage({type:'kkeep:signin-route-wake', prefix}); }
      catch { /* A closing sign-in tab must not prevent reaching the owner. */ }
    }
  }
  function waitForOwner(prefix, event, router) {
    if (waiting.has(prefix)) return waiting.get(prefix);
    const work = new Promise(resolve => {
      let finished = false, poll;
      const finish = value => {
        if (finished) return;
        finished = true; clearTimeout(timer); clearTimeout(poll); resolve(value);
      };
      const timer = setTimeout(() => finish(false), timeout);
      const check = () => {
        if (finished) return;
        if (router.shouldRoute(event)) return finish(true);
        poll = setTimeout(check, 25);
      };
      wakeOwner(prefix, () => !finished && !router.shouldRoute(event)).catch(() => {});
      check();
    }).finally(() => waiting.delete(prefix));
    waiting.set(prefix, work);
    return work;
  }
  scope.addEventListener('fetch', event => {
    const url = new URL(event.request.url);
    if (url.origin !== origin) return;
    const match = /^\/~\/sj\/([a-z0-9]{1,32})\/[a-z0-9]{1,32}\//.exec(url.pathname);
    if (!match) return;
    const cancelled = () => new DOMException('Request cancelled', 'AbortError');
    if (event.request.signal.aborted) { event.respondWith(Promise.reject(cancelled())); return; }
    const router = scope.$scramjetController;
    if (!router || typeof router.shouldRoute !== 'function' || typeof router.route !== 'function') {
      event.respondWith(unavailable()); return;
    }
    if (router.shouldRoute(event)) { event.respondWith(router.route(event)); return; }
    const prefix = '/~/sj/' + match[1] + '/';
    event.respondWith((async () => {
      const ready = await waitForOwner(prefix, event, router);
      if (event.request.signal.aborted) throw cancelled();
      if (!ready || !router.shouldRoute(event)) return unavailable();
      return router.route(event);
    })());
  });
}
