/* kkeep. Scramjet routes only /browse/ requests; the dashboard stays outside its route. */
importScripts('/engine/controller.sw.js?v=6');
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', event => {
  if ($scramjetController.shouldRoute(event)) {
    event.respondWith($scramjetController.route(event).catch(()=>recover(event.request)));
  } else if (new URL(event.request.url).pathname.startsWith('/browse/')) {
    event.respondWith(recover(event.request));
  }
});

function recover(request){
  const url=new URL(request.url);
  if(request.mode==='navigate'||['document','iframe'].includes(request.destination))return Response.redirect(new URL('/recover.html?from='+encodeURIComponent(url.pathname+url.search),url.origin).href,302);
  return new Response('Proxy session ended. Reopen the page.',{status:410,headers:{'Cache-Control':'no-store'}});
}
