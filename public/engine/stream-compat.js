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
