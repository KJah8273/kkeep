/* kkeep stream-transfer compatibility, AGPL-3.0-only.
 * Carries streams over MessagePort with pull-based backpressure on WebKit
 * versions without native transferable ReadableStream support.
 */
(()=>{
 const root=globalThis;
 if(root.__kkeepStreams)return;
 const RS=ReadableStream,MC=MessageChannel;
 let native=false;
 try{const c=new MC(),s=new RS({start(x){x.close();}});c.port1.postMessage(s,[s]);native=true;c.port1.close();c.port2.close();}catch{}
 const marker='__kkeep_stream_port_v1';
 function pack(data,transfer=[]){

  const out=transfer.filter(x=>!(x instanceof RS));
  const seen=new Map();
  function visit(value){
   if(!value||typeof value!=='object')return value;
   if(seen.has(value))return seen.get(value);
   if(value instanceof RS){
    if(native){if(!out.includes(value))out.push(value);return value;}
    const reader=value.getReader(),channel=new MC();let closed=false,busy=false;
    const finish=()=>{if(closed)return;closed=true;channel.port1.close();reader.releaseLock();};
    channel.port1.onmessage=async({data:message})=>{
     if(closed)return;
     try{
      if(message.type==='cancel'){closed=true;await reader.cancel();channel.port1.close();reader.releaseLock();return;}
      if(message.type!=='pull'||busy)return;
      busy=true;
      // Send the first chunk immediately, then a bounded window without waiting
      // for a page/worker round trip per chunk. Old clients still get one chunk.
      const budget=Math.min(128*1024,Math.max(1,Number(message.bytes)||1));let sent=0,count=0;
      while(!closed){
       const {done,value:chunk}=await reader.read();if(closed)break;
       if(done){channel.port1.postMessage({type:'end'});finish();break;}
       sent+=chunk?.byteLength||1;count++;
       const more=sent<budget&&count<32;
       channel.port1.postMessage({type:'chunk',chunk,more});
       if(!more)break;
      }
     }
     catch(error){try{channel.port1.postMessage({type:'error',message:String(error?.message||error)});}finally{finish();}}
     finally{busy=false;}
    };
    const replacement={[marker]:channel.port2};seen.set(value,replacement);out.push(channel.port2);return replacement;
   }
   if(Array.isArray(value)){const a=[];seen.set(value,a);for(const x of value)a.push(visit(x));return a;}
   if(Object.getPrototypeOf(value)!==Object.prototype&&Object.getPrototypeOf(value)!==null)return value;
   const copy={};seen.set(value,copy);for(const [key,v]of Object.entries(value))Object.defineProperty(copy,key,{value:visit(v),enumerable:true,writable:true,configurable:true});return copy;
  }
  return [visit(data),out];
 }
 function unpack(data){
  const seen=new Map();
  function visit(value){
   if(!value||typeof value!=='object')return value;
   if(seen.has(value))return seen.get(value);
   if(value[marker] instanceof MessagePort){
    const port=value[marker];let pending;
    let canceled=false;
    const stream=new RS({start(controller){port.onmessage=({data:m})=>{if(canceled)return;if(m.type==='chunk')controller.enqueue(m.chunk);else if(m.type==='end'){controller.close();port.close();}else if(m.type==='error'){controller.error(new Error(m.message));port.close();}if(!m.more){const done=pending;pending=undefined;done?.();}};},pull(){return new Promise(resolve=>{pending=resolve;port.postMessage({type:'pull',bytes:128*1024});});},cancel(){canceled=true;port.postMessage({type:'cancel'});port.close();pending?.();pending=undefined;}});
    seen.set(value,stream);return stream;
   }
   if(Array.isArray(value)){seen.set(value,value);for(let i=0;i<value.length;i++)value[i]=visit(value[i]);return value;}
   if(Object.getPrototypeOf(value)!==Object.prototype&&Object.getPrototypeOf(value)!==null)return value;
   seen.set(value,value);for(const key of Object.keys(value))Object.defineProperty(value,key,{value:visit(value[key]),enumerable:true,writable:true,configurable:true});return value;
  }
  return visit(data);
 }
 root.__kkeepStreams={native,pack,unpack};
})();

var $scramjetController;(()=>{var e={805(e,t,r){r.d(t,{C:()=>o});class o{methods;id;sendRaw;counter=0;promiseCallbacks=new Map;constructor(e,t,r){this.methods=e,this.id=t,this.sendRaw=(d,x)=>{const [p,q]=globalThis.__kkeepStreams.pack(d,x);r(p,q)}}recieve(e){e=globalThis.__kkeepStreams.unpack(e);if(null==e||"object"!=typeof e)return;let t=e[this.id];if(null==t||"object"!=typeof t)return;let r=t.$type;if("response"===r){let e=t.$token,r=t.$data,o=t.$error,s=this.promiseCallbacks.get(e);if(!s)return;this.promiseCallbacks.delete(e),void 0!==o?s.reject(Error(o)):s.resolve(r)}else if("request"===r){let e=t.$method,r=t.$args;this.methods[e](r).then(e=>{this.sendRaw({[this.id]:{$type:"response",$token:t.$token,$data:e?.[0]}},e?.[1])}).catch(e=>{console.error(e),this.sendRaw({[this.id]:{$type:"response",$token:t.$token,$error:e?.toString()||"Unknown error"}},[])})}}call(e,t,r=[]){let o=this.counter++;return new Promise((s,i)=>{this.promiseCallbacks.set(o,{resolve:s,reject:i}),this.sendRaw({[this.id]:{$type:"request",$method:e,$args:t,$token:o}},r)})}}}},t={};function r(o){var s=t[o];if(void 0!==s)return s.exports;var i=t[o]={exports:{}};return e[o](i,i.exports,r),i.exports}r.d=(e,t)=>{for(var o in t)r.o(t,o)&&!r.o(e,o)&&Object.defineProperty(e,o,{enumerable:!0,get:t[o]})},r.o=(e,t)=>Object.prototype.hasOwnProperty.call(e,t),r.r=e=>{"undefined"!=typeof Symbol&&Symbol.toStringTag&&Object.defineProperty(e,Symbol.toStringTag,{value:"Module"}),Object.defineProperty(e,"__esModule",{value:!0})};var o={};(()=>{r.r(o),r.d(o,{route:()=>a,shouldRoute:()=>n});var e=r(805);let t={};addEventListener("message",e=>{if(e.data&&"object"==typeof e.data){if(e.data.$sw$setCookieDone&&"object"==typeof e.data.$sw$setCookieDone){let r=e.data.$sw$setCookieDone,o=t[r.id];o&&(o(),delete t[r.id])}if(e.data.$sw$initRemoteTransport&&"object"==typeof e.data.$sw$initRemoteTransport){let{port:t,prefix:r}=e.data.$sw$initRemoteTransport,o=i.find(e=>new URL(r).pathname.startsWith(e.prefix));if(!o)return void console.error("No relevant controller found for transport init");o.rpc.call("initRemoteTransport",t,[t])}}});class s{prefix;id;rpc;constructor(r,o,s){this.prefix=r,this.id=o,this.rpc=new e.C({sendSetCookie:async({cookies:e,options:r})=>{let o=await self.clients.matchAll(),s=[],i=[],n=r?.destination==="document"||r?.destination==="iframe";for(let a of o){let o=Math.random().toString(36).substring(2,10);s.push(o),a.postMessage({$controller$setCookie:{cookies:e,options:r,id:o}}),n||i.push(new Promise(e=>{t[o]=()=>e(o)}))}if(i.length>0){let r,n=!1,a=new Promise(i=>{r=setTimeout(()=>{if(!n){let r=s.filter(e=>void 0!==t[e]);console.error(`timed out waiting for set cookie response (deadlock?): cookies=${e.length} clients=${o.length} pending=${r.length}/${s.length} clientUrls=${o.map(e=>e.url).join(",")}`)}i()},1e3)});try{await Promise.race([a,Promise.any(i).then(()=>{n=!0}).catch(()=>{})])}finally{for(let e of(void 0!==r&&clearTimeout(r),s))delete t[e]}}}},"tabchannel-"+o,(e,t)=>{s.postMessage(e,t)}),s.onmessage=e=>{this.rpc.recieve(e.data)},s.onmessageerror=console.error,this.rpc.call("ready",void 0)}}let i=[];function n(e){let t=new URL(e.request.url);return void 0!==i.find(e=>t.pathname.startsWith(e.prefix))}async function a(e){try{let t=new URL(e.request.url),r=i.find(e=>t.pathname.startsWith(e.prefix)),o=await clients.get(e.clientId),s=[...e.request.headers],n=await r.rpc.call("request",{rawUrl:e.request.url,rawReferrer:e.request.referrer,destination:e.request.destination,mode:e.request.mode,referrer:e.request.referrer,method:e.request.method,body:e.request.body,cache:e.request.cache,forceCrossOriginIsolated:!1,initialHeaders:s,rawClientUrl:o?o.url:void 0,clientId:e.clientId||e.resultingClientId},e.request.body instanceof ReadableStream||e.request.body instanceof ArrayBuffer?[e.request.body]:void 0);return new Response(n.body,{status:n.status,statusText:n.statusText,headers:n.headers})}catch(e){return console.error("Service Worker error:",e),new Response("Internal Service Worker Error: "+e.message,{status:500})}}addEventListener("message",e=>{if(!e.data||"object"!=typeof e.data||!e.data.$controller$init||"object"!=typeof e.data.$controller$init)return;let t=e.data.$controller$init,r=i.findIndex(e=>e.id===t.id);-1!==r&&i.splice(r,1),i.push(new s(t.prefix,t.id,e.ports[0]))}),addEventListener("install",()=>{self.skipWaiting()}),addEventListener("activate",e=>{e.waitUntil(clients.claim())}),setTimeout(async()=>{for(let e of(console.log("service worker activated, notifying clients to revive"),await clients.matchAll()))e.postMessage({$controller$swrevive:{}})},100)})(),$scramjetController=o})();
//# sourceMappingURL=controller.sw.js.map