// Reconstruct split Unity files as a stream instead of keeping a second full-size Blob.
const REV = 'ipad-20261009-2';
const ports = {
 fish: {repo:'NotRexed/HowToFishPort',rev:'3e0dbe9fd91c74dd77b3b493564d7c295d6af9e7',split:{'Build/WebGL.data':[7,126156601,'part',1,1],'Build/WebGL.wasm':[4,64048146,'',0,3]}},
};
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
async function getFile(port,path,signal){
 const roots=[`https://raw.githubusercontent.com/${port.repo}/${port.rev}/`,`https://cdn.jsdelivr.net/gh/${port.repo}@${port.rev}/`,`https://fastly.jsdelivr.net/gh/${port.repo}@${port.rev}/`];
 let last;
 for(const root of roots){
  if(signal.aborted)throw signal.reason;
  const timeout=new AbortController();const timer=setTimeout(()=>timeout.abort(),90000);
  const cancel=()=>timeout.abort();signal.addEventListener('abort',cancel,{once:true});
  try{const response=await fetch(root+path,{signal:timeout.signal,credentials:'omit'});if(response.ok)return response;last=new Error(`HTTP ${response.status}: ${path}`);}
  catch(error){last=error;}
  finally{clearTimeout(timer);signal.removeEventListener('abort',cancel);}
 }
 throw last;
}
function mime(path){return path.endsWith('.js')?'text/javascript':path.endsWith('.json')?'application/json':path.endsWith('.wasm')?'application/wasm':'application/octet-stream';}
async function serve(request,group,path){
 const port=ports[group];if(!port||path.includes('..'))return new Response('Unknown game asset',{status:404});
 const abort=new AbortController();request.signal.addEventListener('abort',()=>abort.abort(),{once:true});
 const spec=port.split[path];
 if(!spec){const res=await getFile(port,path,abort.signal);return new Response(res.body,{headers:{'Content-Type':mime(path),'Cache-Control':'public, max-age=86400'}});}
 let index=0,reader,total=0;
 const body=new ReadableStream({
  async pull(controller){
   try{
    if(!reader){if(index===spec[0]){if(total!==spec[1])throw new Error('Incomplete game file: '+path);controller.close();return;}const suffix='.'+spec[2]+String(index+spec[3]).padStart(spec[4],'0');const response=await getFile(port,path+suffix,abort.signal);reader=response.body.getReader();index++;}
    const result=await reader.read();if(result.done){reader.releaseLock();reader=null;return this.pull(controller);}total+=result.value.byteLength;controller.enqueue(result.value);
   }catch(error){abort.abort();controller.error(error);}
  },cancel(){abort.abort();return reader?.cancel();}
 });
 return new Response(body,{headers:{'Content-Type':mime(path),'Content-Length':String(spec[1]),'Cache-Control':'no-store','X-Kkeep-Assets':REV}});
}
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);const match=url.origin===self.location.origin&&url.pathname.match(/^\/games\/assets\/(fish)\/(.+)$/);
 if(match)event.respondWith(serve(event.request,match[1],match[2]).catch(error=>new Response(error.message,{status:502})));
});
