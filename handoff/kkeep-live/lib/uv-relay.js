/* Kkeep Ultraviolet transport. AGPL-3.0-only. Uses the existing filtered relay. */
(()=>{
  const send=globalThis.fetch.bind(globalThis),origin=globalThis.location.origin;
  const Socket=globalThis.WebSocket,proto=Socket?.prototype;
  const socketSend=proto?.send,socketClose=proto?.close;
  const state=proto&&Object.getOwnPropertyDescriptor(proto,'readyState')?.get;
  const binary=proto&&Object.getOwnPropertyDescriptor(proto,'binaryType')?.set;
  const encode=value=>btoa(Array.from(new TextEncoder().encode(JSON.stringify(value)),b=>String.fromCharCode(b)).join(''));
  const decode=value=>JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(value),c=>c.charCodeAt(0))));
  class KkeepBareClient {
    async fetch(input,options={}){
      const url=new URL(String(input));
      if(url.protocol==='blob:'&&url.origin===origin){
        const response=await send(url.href,options);response.rawHeaders=Object.fromEntries(response.headers);response.finalURL=url.href;return response;
      }
      if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw Error('Unsupported proxy address.');
      const headers=Array.from(new Headers(options.headers).entries()),method=options.method||'GET';
      const meta=encode({url:url.href,method,headers});
      if(meta.length>64000)throw Error('This request has too many headers.');
      const response=await send(origin+'/api/relay',{method:'POST',headers:{'X-Kha-Relay':'1','X-Kha-Meta':meta},credentials:'same-origin',cache:'no-store',redirect:'error',body:['GET','HEAD'].includes(method)?undefined:options.body,signal:options.signal});
      if(!response.ok){let message='The proxy connection failed.';try{message=(await response.json()).error||message;}catch{}throw Error(message);}
      const packed=response.headers.get('X-Kha-Response');
      if(!packed)throw Error('The proxy session ended. Reload Kkeep.');
      const result=decode(packed),rawHeaders={};
      for(const [name,value] of result.headers){
        const key=name.toLowerCase();
        if(key==='set-cookie'){rawHeaders[key]??=[];rawHeaders[key].push(value);}
        else rawHeaders[key]=rawHeaders[key]?rawHeaders[key]+', '+value:value;
      }
      const body=method==='HEAD'||[204,205,304].includes(result.status)?null:response.body;
      const output=new Response(body,{status:result.status,statusText:result.statusText,headers:result.headers});
      output.rawHeaders=rawHeaders;output.finalURL=url.href;
      return output;
    }
    createWebSocket(input,protocols=[],_unused,headers={}){
      const remote=new URL(String(input));
      if(!['ws:','wss:'].includes(remote.protocol)||remote.username||remote.password)throw Error('Unsupported socket address.');
      const endpoint=new URL('/api/socket',origin);endpoint.protocol=endpoint.protocol==='https:'?'wss:':'ws:';
      const socket=new Socket(endpoint.href),events=new EventTarget();
      binary?.call(socket,'arraybuffer');
      let connected=false,closed=false;
      socket.addEventListener('open',()=>socketSend.call(socket,JSON.stringify({url:remote.href,protocols:typeof protocols==='string'?[protocols]:protocols,headers:Object.entries(headers)})));
      socket.addEventListener('message',event=>{
        if(!connected){
          try{const message=JSON.parse(event.data);if(message.type==='open'){connected=true;events.dispatchEvent(new Event('open'));return;}}catch{}
          events.dispatchEvent(new Event('error'));socketClose.call(socket,1000);return;
        }
        events.dispatchEvent(new MessageEvent('message',{data:event.data}));
      });
      socket.addEventListener('error',()=>events.dispatchEvent(new Event('error')));
      socket.addEventListener('close',event=>{closed=true;events.dispatchEvent(new CloseEvent('close',{code:event.code,reason:event.reason,wasClean:event.wasClean}));});
      Object.defineProperty(events,'readyState',{get:()=>closed?3:connected?state.call(socket):0});
      events.send=data=>{if(!connected)throw new DOMException('The socket is not open.','InvalidStateError');socketSend.call(socket,data);};
      events.close=(code=1000,reason='')=>socketClose.call(socket,code,reason);
      return events;
    }
  }
  self.Ultraviolet.BareClient=KkeepBareClient;
})();
