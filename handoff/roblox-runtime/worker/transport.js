// This bootstrap also runs in engine workers. Never record a server URL,
// certificate, session token, request body, or Roblox account information.
export function transportBootstrap() {
  const scope=globalThis;
  if(scope.__kkeepTransportInstalled){scope.__kkeepTransportInstalled.refresh?.();return;}
  // The page installs us before hook.js; WebClient.js calls us again after
  // hook.js replaces WebTransport with RbxWT. Refresh only the transport
  // observer so the adopted relay is covered too, with one Worker bridge.
  scope.__kkeepTransportInstalled={refresh};
  let currentWrapper,currentOwner,observerGeneration=0,connectionGeneration=0;
  const seen=new Set();
  const messageKey='kkeep:transport:v1';
  const stages=new Set(['transport-unavailable','transport-constructor','transport-connecting','transport-native','transport-relay','transport-ready','transport-handshake','transport-closed','transport-lost','transport-stream','transport-stream-ready','transport-datagram']);
  const ownedStages=new Set(['transport-native','transport-relay','transport-ready','transport-lost']);
  const names=new Set(['','TypeError','NotSupportedError','InvalidStateError','NetworkError','WebTransportError','AbortError','SecurityError']);
  let endpoint='';
  try{
    // A blob worker cannot resolve a relative fetch URL. Its origin still is
    // the owning game origin; never use the game-server URL as a report target.
    const origin=new URL(scope.location.origin);
    if(/^https?:$/.test(origin.protocol)&&origin.origin===scope.location.origin)endpoint=new URL('/_kkeep/connection',origin).href;
  }catch{ /* No trusted HTTP origin: retain local reporting only. */ }
  const deliver=(stage,name,owner)=>{
    if(stage==='transport-connecting')currentOwner=owner;
    // The engine reuses its pthread workers. A different worker can own the
    // replacement connection, so ownership must also hold at each relay hop.
    if(ownedStages.has(stage)&&currentOwner!==owner)return false;
    try{
      if(scope.document)scope.__kkeepRuntime?.connection?.(stage,name);
      else if(typeof scope.postMessage==='function')scope.postMessage({key:messageKey,stage,name});
    }catch{ /* Diagnostics must never interrupt engine work. */ }
    return true;
  };
  // Listen only on workers we create. Each nested owner forwards one hop;
  // unrelated engine/session messages and transferred ports stay untouched.
  const NativeWorker=scope.Worker;
  if(typeof NativeWorker==='function')scope.Worker=class extends NativeWorker{
    constructor(...args){
      super(...args);
      let retired=false;
      this.addEventListener('message',event=>{
        const data=event.data;
        if(!data||typeof data!=='object'||Array.isArray(data)||event.ports?.length||
          Object.keys(data).length!==3||data.key!==messageKey||!stages.has(data.stage)||!names.has(data.name))return;
        event.stopImmediatePropagation();
        if(retired)return;
        deliver(data.stage,data.name,this);
      },{capture:true});
      const terminate=this.terminate;
      if(typeof terminate==='function')this.terminate=function(...args){
        retired=true;
        if(currentOwner===this)currentOwner=undefined;
        return terminate.apply(this,args);
      };
    }
  };
  function report(stage,error,owner) {
    const name=names.has(error?.name)?error.name:'';
    const key=stage+name;
    // Each current connection publishes its own selection/readiness/loss.
    // Repeated selection of native after a relay must not leave stale mode.
    if(stage!=='transport-connecting'&&!ownedStages.has(stage)){
      if(seen.has(key))return;seen.add(key);
    }
    if(!deliver(stage,name,owner))return;
    // Fixed enums only; no raw browser exception messages or join URLs.
    try{if(endpoint)scope.fetch(endpoint,{method:'POST',credentials:'omit',mode:'same-origin',redirect:'error',referrerPolicy:'no-referrer',headers:{'Content-Type':'application/json'},body:JSON.stringify({stage,name}),keepalive:true}).catch(()=>{});}catch{}
  }
  function refresh(){
    const Native=scope.WebTransport;
    if(currentWrapper&&Native===currentWrapper)return;
    const observer=++observerGeneration;
    if(typeof Native!=='function'){report('transport-unavailable');return;}
    class KkeepTransport extends Native {
      constructor(url,options) {
        // A provider may construct its native candidate inside super(). Only
        // the newest outer observer owns generations; the old native adapter
        // still supplies writable compatibility without publishing failures.
        const generation=observer===observerGeneration?++connectionGeneration:0;
        const current=()=>observer===observerGeneration&&generation===connectionGeneration;
        const owner={};
        let locallyClosed=false,ready=false,closed=false;
        const notify=(stage,error)=>{if(current()&&!locallyClosed)report(stage,error,owner);};
        try{super(url,options);}catch(error){notify('transport-constructor',error);throw error;}
        notify('transport-connecting');
        const nativeClose=this.close;
        this.close=function(...args){locallyClosed=true;return nativeClose.apply(this,args);};
        // Safari implements createWritable() in place of the old writable property.
        // Keep one native writable per session for engines with the old flag off.
        const adaptDatagrams=()=>{
          try{
            const datagrams=this.datagrams;
            if(datagrams&&!('writable' in datagrams)&&typeof datagrams.createWritable==='function'){
              let writable;
              Object.defineProperty(datagrams,'writable',{configurable:true,get(){return writable??=(datagrams.createWritable());}});
            }
          }catch(error){notify('transport-datagram',error);}
        };
        adaptDatagrams();
        // RbxWT exposes the selected native/relay target only after ready.
        // Adapt before the engine's first synchronous packet send.
        this.ready.then(()=>{
          adaptDatagrams();
          if(!current()||locallyClosed||closed)return;
          ready=true;
          let selected;try{selected=this.how;}catch{}
          if(selected==='native'||selected==='relay')notify('transport-'+selected);
          notify('transport-ready');
        },error=>notify('transport-handshake',error));
        const finish=error=>{
          if(closed)return;
          closed=true;
          notify('transport-closed',error);
          // This is an ended, previously ready session, not a speculative
          // startup failure or a numeric Roblox error-code classification.
          if(ready)notify('transport-lost',error);
        };
        this.closed.then(()=>finish(),finish);
        const nativeStream=this.createUnidirectionalStream;
        this.createUnidirectionalStream=function(...args){
          let stream;
          try{stream=nativeStream.apply(this,args);}catch(error){notify('transport-stream',error);throw error;}
          // Observe without changing native promises, bytes, ordering or backpressure.
          stream.then(()=>notify('transport-stream-ready'),error=>notify('transport-stream',error));
          return stream;
        };
      }
    }
    currentWrapper=KkeepTransport;
    scope.WebTransport=KkeepTransport;
  }
  refresh();
}

export const transportStages=['transport-unavailable','transport-constructor','transport-connecting','transport-native','transport-relay','transport-ready','transport-handshake','transport-closed','transport-lost','transport-stream','transport-stream-ready','transport-datagram'];
