/* Browser-compatible adapter for the game's existing room protocol. */
(()=>{
 'use strict';
 const MAX_PACKET=349528,MAX_BATCH=500000,MAX_QUEUE=2097152,CHUNK=12000;
 const sockets=new Set();
 class RoomSocket{
  constructor(){
   sockets.add(this);
   this.readyState=0;this.bufferedAmount=0;this.queue=[];this.cursor=0;this.peers=new Map();this.room=null;this.signature='';this.failures=0;this.packetNumber=0;this.seen=new Map();
   this.token=Array.from(crypto.getRandomValues(new Uint8Array(32)),x=>x.toString(16).padStart(2,'0')).join('');
   queueMicrotask(()=>this.poll());
  }
  event(data){
   if(data.type==='packet'&&data.packetId){
    const key=data.from+':'+data.packetId;if(this.seen.has(key))return;
    this.seen.set(key,true);if(this.seen.size>1024)this.seen.delete(this.seen.keys().next().value);
   }
   if(this.readyState===1)this.onmessage?.({data:JSON.stringify(data)});
  }
  send(raw){
   if(this.readyState!==1)return;
   let message;try{message=JSON.parse(raw);}catch{return;}
   if(message.type==='packet'&&this.room){
    if(typeof message.data!=='string'||message.data.length>MAX_PACKET)return;
    message.packetId=String(++this.packetNumber);
    const targets=this.room.members.filter(m=>m.id!==this.room.self&&[m.id,'0','*','all'].includes(message.to));
    for(const peer of targets){const channel=this.peers.get(peer.id)?.channel;
     if(channel?.readyState==='open'&&channel.bufferedAmount+message.data.length<1048576){try{this.sendDirect(channel,message);continue;}catch{}}
     this.enqueue({...message,to:peer.id});
    }
   }else this.enqueue(message);
  }
  enqueue(message){
   const bytes=JSON.stringify(message).length;
   if(bytes>MAX_BATCH){this.event({type:'error',message:'This game packet is too large to send.'});return;}
   if(this.bufferedAmount+bytes>MAX_QUEUE){this.event({type:'closed',message:'Connection too slow. Please rejoin the room.'});this.close();return;}
   this.queue.push(message);this.bufferedAmount+=bytes;
   if(this.timer){clearTimeout(this.timer);this.timer=setTimeout(()=>this.poll(),0);}
  }
  async poll(){
   if(this.busy||this.readyState===3)return;this.busy=true;this.timer=null;
   const commands=[];let bytes=0;
   while(this.queue.length&&commands.length<32&&bytes+JSON.stringify(this.queue[0]).length<=MAX_BATCH){const m=this.queue.shift();const n=JSON.stringify(m).length;commands.push(m);bytes+=n;this.bufferedAmount-=n;}
   this.controller=new AbortController();const timeout=setTimeout(()=>this.controller.abort(),12000);
   try{
    const r=await fetch('/api/stick-rooms',{method:'POST',headers:{'Content-Type':'application/json','X-Kkeep-Room':'1','Authorization':'Bearer '+this.token},body:JSON.stringify({commands,cursor:this.cursor}),signal:this.controller.signal,cache:'no-store'});
    if(!r.ok)throw Error('Room service unavailable');const data=await r.json();this.failures=0;if(this.readyState===3)return;
    if(this.readyState===0){this.readyState=1;this.onopen?.({});}
    this.cursor=data.cursor||0;
    const signature=JSON.stringify(data.room);
    if(data.room&&signature!==this.signature){this.room=data.room;this.signature=signature;this.event(data.room);try{this.syncPeers();}catch{this.clearPeers();}}
    if(!data.room&&this.room){this.room=null;this.signature='';this.clearPeers();}
    for(const event of data.events||[]){if(event.type==='signal')this.signal(event).catch(()=>{});else this.event(event);}
   }catch{
    if(this.readyState===3)return;
    // Do not replay create/join or gameplay commands: the response may have been lost after commit.
    this.failures++;if(this.failures>=3){this.onerror?.({});this.event({type:'closed',message:'Connection lost. Reopen Online to reconnect.'});this.close();return;}
    // Create and join are idempotent at the service. Retry them promptly, without replaying game packets.
    this.queue.unshift(...commands.filter(m=>['create','join','list','leave'].includes(m.type)));
    this.bufferedAmount=this.queue.reduce((sum,m)=>sum+JSON.stringify(m).length,0);
    this.event({type:'error',message:'Reconnecting to the room service…'});
   }finally{
    clearTimeout(timeout);this.busy=false;
    const peers=this.room?.members.filter(m=>m.id!==this.room.self)||[];
    const direct=peers.length&&peers.every(m=>this.peers.get(m.id)?.channel?.readyState==='open');
    if(this.readyState!==3)this.timer=setTimeout(()=>this.poll(),this.failures?500:this.queue.length?30:peers.length&&!direct?120:this.room?1000:15000);
   }
  }
  clearPeers(){for(const p of this.peers.values())p.pc.close();this.peers.clear();}
  syncPeers(){
   if(!globalThis.RTCPeerConnection||!this.room)return;
   for(const [id,p]of this.peers)if(!this.room.members.some(m=>m.id===id)){p.pc.close();this.peers.delete(id);}
   for(const m of this.room.members)if(m.id!==this.room.self&&!this.peers.has(m.id)){
    const p=this.peer(m.id);
    if(this.room.self<m.id){this.bindChannel(m.id,p.pc.createDataChannel('game'));this.offer(m.id).catch(()=>{});}
   }
  }
  peer(id){
   if(this.peers.has(id))return this.peers.get(id);
   const pc=new RTCPeerConnection({iceServers:[{urls:'stun:stun.cloudflare.com:3478'}]});const p={pc,channel:null,fragments:new Map()};this.peers.set(id,p);
   pc.ondatachannel=e=>this.bindChannel(id,e.channel);return p;
  }
  bindChannel(id,channel){
   const p=this.peers.get(id);if(!p)return; p.channel=channel;
   channel.onmessage=e=>{if(typeof e.data!=='string'||e.data.length>MAX_PACKET+512)return;try{
    const m=JSON.parse(e.data);
    if(typeof m.data!=='string'||!Number.isInteger(m.channel)||m.channel<0||m.channel>255)return;
    if(m.type==='packet'&&m.data.length<=MAX_PACKET){this.event({...m,from:id});return;}
    if(m.type!=='fragment'||!/^\d{1,16}$/.test(m.packetId)||!Number.isInteger(m.part)||!Number.isInteger(m.parts)||m.parts<1||m.parts>Math.ceil(MAX_PACKET/CHUNK)||m.part<0||m.part>=m.parts||m.data.length>CHUNK)return;
    const now=Date.now();for(const [key,f]of p.fragments)if(now-f.time>10000)p.fragments.delete(key);
    if(!p.fragments.has(m.packetId)){if(p.fragments.size>=4)return;p.fragments.set(m.packetId,{time:now,parts:m.parts,channel:m.channel,chunks:new Map()});}
    const f=p.fragments.get(m.packetId);if(f.parts!==m.parts||f.channel!==m.channel)return;
    f.chunks.set(m.part,m.data);
    if(f.chunks.size===f.parts){p.fragments.delete(m.packetId);const data=Array.from({length:f.parts},(_,i)=>f.chunks.get(i)).join('');if(data.length<=MAX_PACKET)this.event({type:'packet',data,channel:f.channel,packetId:m.packetId,from:id});}
   }catch{}};
  }
  sendDirect(channel,message){
   if(message.data.length<=CHUNK){channel.send(JSON.stringify({...message,to:undefined}));return;}
   const parts=Math.ceil(message.data.length/CHUNK);
   for(let part=0;part<parts;part++)channel.send(JSON.stringify({type:'fragment',packetId:message.packetId,part,parts,data:message.data.slice(part*CHUNK,(part+1)*CHUNK),channel:message.channel}));
  }
  async description(pc,value){
   await pc.setLocalDescription(value);
   if(pc.iceGatheringState!=='complete')await new Promise(resolve=>{const finish=()=>{clearTimeout(timer);pc.removeEventListener('icegatheringstatechange',check);resolve();};const check=()=>{if(pc.iceGatheringState==='complete')finish();};const timer=setTimeout(finish,3500);pc.addEventListener('icegatheringstatechange',check);});
   return {type:pc.localDescription.type,sdp:pc.localDescription.sdp};
  }
  async offer(id){const p=this.peers.get(id);const signal=await this.description(p.pc,await p.pc.createOffer());if(this.room&&this.peers.get(id)===p)this.enqueue({type:'signal',to:id,signal});}
  async signal(m){
   if(!globalThis.RTCPeerConnection||!this.room?.members.some(p=>p.id===m.from)||m.from===this.room.self)return;
   const p=this.peer(m.from);if(m.signal.type==='offer'){
    await p.pc.setRemoteDescription(m.signal);const signal=await this.description(p.pc,await p.pc.createAnswer());if(this.room)this.enqueue({type:'signal',to:m.from,signal});
   }else if(m.signal.type==='answer'&&p.pc.signalingState==='have-local-offer')await p.pc.setRemoteDescription(m.signal);
  }
  close(){
   if(this.readyState===3)return;this.readyState=3;sockets.delete(this);clearTimeout(this.timer);this.controller?.abort();this.clearPeers();this.queue=[];this.bufferedAmount=0;
   fetch('/api/stick-rooms',{method:'POST',headers:{'Content-Type':'application/json','X-Kkeep-Room':'1','Authorization':'Bearer '+this.token},body:JSON.stringify({commands:[{type:'leave'}]}),keepalive:true}).catch(()=>{});this.onclose?.({});
  }
 }
 window.KkeepRoomSocket=RoomSocket;
 window.addEventListener('pagehide',()=>{for(const socket of sockets)socket.close();});
})();
