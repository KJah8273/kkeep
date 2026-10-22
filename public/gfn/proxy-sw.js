/* Scramjet V2 is scoped to /gfn/; other Kkeep apps retain their worker. */
importScripts('/gfn/engine/controller.sw.js?v=2');
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('fetch',event=>{
  if($scramjetController.shouldRoute(event))event.respondWith($scramjetController.route(event).then(response=>response.headers.get('X-Kkeep-Session')==='expired'?recover(event.request):response).catch(()=>recover(event.request)));
  else if(new URL(event.request.url).pathname.startsWith('/gfn/browse/'))event.respondWith(recover(event.request));
});
function recover(request){
  const url=new URL(request.url);
  if(request.mode==='navigate'||['document','iframe'].includes(request.destination))return Response.redirect(new URL('/recover.html?from='+encodeURIComponent(url.pathname+url.search),url.origin).href,302);
  return new Response('Proxy session ended. Reopen GeForce NOW.',{status:410,headers:{'Cache-Control':'no-store'}});
}
