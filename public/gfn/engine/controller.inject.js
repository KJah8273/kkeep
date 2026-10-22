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

var $scramjetController;(()=>{var e={286(e,t,o){o.d(t,{I:()=>r});let r=Symbol.for("controller frame handle")},805(e,t,o){o.d(t,{C:()=>r});class r{methods;id;sendRaw;counter=0;promiseCallbacks=new Map;constructor(e,t,o){this.methods=e,this.id=t,this.sendRaw=(d,x)=>{const [p,q]=globalThis.__kkeepStreams.pack(d,x);o(p,q)}}recieve(e){e=globalThis.__kkeepStreams.unpack(e);if(null==e||"object"!=typeof e)return;let t=e[this.id];if(null==t||"object"!=typeof t)return;let o=t.$type;if("response"===o){let e=t.$token,o=t.$data,r=t.$error,i=this.promiseCallbacks.get(e);if(!i)return;this.promiseCallbacks.delete(e),void 0!==r?i.reject(Error(r)):i.resolve(o)}else if("request"===o){let e=t.$method,o=t.$args;this.methods[e](o).then(e=>{this.sendRaw({[this.id]:{$type:"response",$token:t.$token,$data:e?.[0]}},e?.[1])}).catch(e=>{console.error(e),this.sendRaw({[this.id]:{$type:"response",$token:t.$token,$error:e?.toString()||"Unknown error"}},[])})}}call(e,t,o=[]){let r=this.counter++;return new Promise((i,s)=>{this.promiseCallbacks.set(r,{resolve:i,reject:s}),this.sendRaw({[this.id]:{$type:"request",$method:e,$args:t,$token:r}},o)})}}},423(e,t,o){o.d(t,{Cx:()=>f,bw:()=>l,cP:()=>i,ht:()=>N,pX:()=>a});let{BareResponse:r,CookieJar:i,IncrementalHtmlRewriter:s,Plugin:n,SCRAMJETCLIENT:a,SCRAMJETCLIENTNAME:c,ScramjetClient:l,ScramjetFetchHandler:h,ScramjetFetchTrackedClient:d,ScramjetHeaders:p,Tap:f,createLocationProxy:k,defaultConfig:g,defaultConfigDev:y,flagEnabled:m,getOwnPropertyDescriptorHandler:u,getRewriter:w,getScriptBlockTypeString:b,htmlRules:$,isArchiveMimeType:v,isAudioOrVideoMimeType:C,isFontMimeType:S,isHtmlMimeType:j,isImageMimeType:M,isInlineDisplayableMimeType:x,isJavascriptMimeType:P,isJavascriptMimeTypeEssenceMatch:A,isModuleScriptType:R,isScriptType:W,isScriptableMimeType:E,isXmlMimeType:J,isZipBasedMimeType:I,isdedicated:T,isshared:D,issw:O,iswindow:q,isworker:H,parseMimeType:X,rewriteBlob:U,rewriteCss:B,rewriteHtml:L,rewriteJs:_,rewriteJsInner:F,rewriteSrcset:G,rewriteUrl:z,rewriteWorkers:K,setWasm:N,unrewriteBlob:Q,unrewriteCss:V,unrewriteHtml:Y,unrewriteUrl:Z,versionInfo:ee}=globalThis.$scramjet}},t={};function o(r){var i=t[r];if(void 0!==i)return i.exports;var s=t[r]={exports:{}};return e[r](s,s.exports,o),s.exports}o.d=(e,t)=>{for(var r in t)o.o(t,r)&&!o.o(e,r)&&Object.defineProperty(e,r,{enumerable:!0,get:t[r]})},o.o=(e,t)=>Object.prototype.hasOwnProperty.call(e,t),o.r=e=>{"undefined"!=typeof Symbol&&Symbol.toStringTag&&Object.defineProperty(e,Symbol.toStringTag,{value:"Module"}),Object.defineProperty(e,"__esModule",{value:!0})};var r={};(()=>{o.r(r),o.d(r,{load:()=>l});var e=o(805),t=o(286),i=o(423);let s=MessagePort.prototype.postMessage,n=(e,t,o)=>{s.call(e,t,o)};class a{port;readyResolve;readyPromise=new Promise(e=>{this.readyResolve=e});ready=!1;async init(){await this.readyPromise,this.ready=!0}rpc;constructor(t){this.port=t,this.rpc=new e.C({ready:async()=>{this.readyResolve()}},"transport",(e,o)=>{n(t,e,o)}),t.onmessageerror=e=>{console.error("onmessageerror (this should never happen!)",e)},t.onmessage=e=>{this.rpc.recieve(e.data)},t.start()}connect(e,t,o,r,i,s,a){let c=new MessageChannel,l=c.port1;return console.warn("connecting"),this.rpc.call("connect",{url:e.href,protocols:t,requestHeaders:o,port:c.port2},[c.port2]).then(e=>{console.log(e),"success"===e.result?r(e.protocol,e.extensions):a(e.error)}),l.onmessage=e=>{let t=e.data;"data"===t.type?i(t.data):"close"===t.type&&s(t.code,t.reason)},l.onmessageerror=e=>{console.error("onmessageerror (this should never happen!)",e),a("Message error in transport port")},[e=>{n(l,{type:"data",data:e},e instanceof ArrayBuffer?[e]:[])},e=>{n(l,{type:"close",code:e})}]}async request(e,t,o,r,i){return await this.rpc.call("request",{remote:e.href,method:t,body:o,headers:r})}async sendSetCookie(e,t={}){await this.rpc.call("sendSetCookie",{cookies:e.map(({url:e,cookie:t})=>({url:e.href,cookie:t})),options:t})}}let c=(globalThis[i.pX]?.serviceWorker||navigator.serviceWorker)?.controller;function l(e){if(i.pX in globalThis)return void globalThis[i.pX].syncDocumentInit({initHeaders:e.initHeaders,history:e.history,cookies:e.cookies});if(!("WASM"in self))throw Error("WASM not found in global scope!");let t=Uint8Array.from(atob(self.WASM),e=>e.charCodeAt(0));delete self.WASM,(0,i.ht)(t),new h(globalThis,e)}class h{global;init;client;cookieJar;transport;handleServiceWorkerCookieMessage;constructor(e,t){this.global=e,this.init=t;const o=new MessageChannel;this.transport=new a(o.port1),c?.postMessage({$sw$initRemoteTransport:{port:o.port2,prefix:this.init.prefix.href}},[o.port2]),this.cookieJar=new i.cP,this.cookieJar.load(this.init.cookies),this.handleServiceWorkerCookieMessage=e=>{if(!e.data?.$controller$setCookie||"object"!=typeof e.data.$controller$setCookie)return;let t=e.data.$controller$setCookie;if(t.options?.clear&&this.cookieJar.clear(),Array.isArray(t.cookies)){for(let e of t.cookies)if("string"==typeof e?.url&&"string"==typeof e.cookie)try{this.cookieJar.setCookies(e.cookie,new URL(e.url))}catch{console.error("Failed to set cookie",e)}}if("string"==typeof t.id){let e=navigator.serviceWorker?.controller??c;e?.postMessage({$sw$setCookieDone:{id:t.id}})}},navigator.serviceWorker?.addEventListener("message",this.handleServiceWorkerCookieMessage),this.injectScramjet()}injectScramjet(){let e=this.global.frameElement;e&&!e.name&&(window.name=e.name=`${Array(8).fill(0).map(()=>Math.floor(36*Math.random()).toString(36)).join("")}`);let o=e?.[t.I],r=!0;if(!o){r=!1;let e=this.global.window;for(;e.parent!==e;){let r=e[i.pX];if(!r){e=e.parent.window;continue}let s=r.descriptors.get("window.frameElement",e);if(s&&s[t.I]){o=s[t.I];break}e=e.parent.window}}let s={config:this.init.sjconfig,prefix:this.init.prefix,cookieJar:this.cookieJar,interface:{getInjectScripts:this.init.yieldGetInjectScripts(this.init.config,this.init.sjconfig,this.init.prefix,this.cookieJar,this.init.codecEncode,this.init.codecDecode),codecEncode:this.init.codecEncode,codecDecode:this.init.codecDecode}};this.client=new i.bw(this.global,{context:s,transport:this.transport,sendSetCookie:async(e,t)=>{await this.transport.sendSetCookie(e,t)},shouldBlockMessageEvent:()=>!1,hookSubcontext:e=>new h(e,{...this.init,cookies:this.cookieJar.dump()}).client,initHeaders:this.init.initHeaders,history:this.init.history});let n={window:this.global.window,client:this.client,isTopLevel:r};o&&i.Cx.dispatch(o.hooks.init.pre,n,{}),this.client.hook(),o&&i.Cx.dispatch(o.hooks.init.post,n,{})}}})(),$scramjetController=r})();
//# sourceMappingURL=controller.inject.js.map