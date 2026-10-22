import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {stickRooms,cleanPacket,MAX_STICK_PACKET} from '../worker/stick-rooms.ts';
import {parseStickBuild,allowedStickAsset} from '../worker/stick.ts';
function database(){const sql=new DatabaseSync(':memory:');sql.exec(readFileSync(new URL('../drizzle/0003_great_boomerang.sql',import.meta.url),'utf8'));return {sql,db:{prepare(query){let args=[];return {bind(...v){args=v;return this;},async all(){return {results:sql.prepare(query).all(...args)};},async run(){return {meta:{changes:Number(sql.prepare(query).run(...args).changes)}};}};},async batch(items){sql.exec('BEGIN');try{const r=await Promise.all(items.map(s=>s.run()));sql.exec('COMMIT');return r;}catch(e){sql.exec('ROLLBACK');throw e;}}}};}
const token=n=>n.toString(16).padStart(64,'0');
const request=(n,commands=[],cursor=0)=>new Request('https://kkeep.test/api/stick-rooms',{method:'POST',headers:{Origin:'https://kkeep.test','X-Kkeep-Room':'1',Authorization:'Bearer '+token(n)},body:JSON.stringify({commands,cursor})});
async function send(db,n,commands=[],cursor=0){const r=await stickRooms(request(n,commands,cursor),db);assert.equal(r.status,200,await r.clone().text());return r.json();}
test('private room creation, join, packet relay and host departure preserve game protocol',async()=>{const {db}=database();const host=await send(db,1,[{type:'create',visibility:'private',name:'Host'}]);assert.equal(host.room.isPrivate,true);assert.equal(host.room.host,host.room.self);assert.equal((await send(db,3,[{type:'list'}])).events[0].rooms.length,0);const guest=await send(db,2,[{type:'join',code:host.room.code,name:'Guest'}]);assert.equal(guest.room.members.length,2);await send(db,1,[{type:'packet',to:guest.room.self,data:'dGVzdA==',channel:0}]);const inbox=await send(db,2);assert.equal(inbox.events[0].from,host.room.self);assert.equal(inbox.events[0].data,'dGVzdA==');assert.equal((await send(db,2,[],inbox.cursor)).events.length,0);await send(db,1,[{type:'leave'}]);assert.equal((await send(db,2)).events[0].type,'closed');});
test('room capacity is four and unrelated sessions cannot read or inject packets',async()=>{const {db}=database();const h=await send(db,1,[{type:'create',name:'Host'}]);for(const n of [2,3,4])assert.equal((await send(db,n,[{type:'join',code:h.room.code}])).room.members.length,n);const fifth=await send(db,5,[{type:'join',code:h.room.code}]);assert.equal(fifth.room,null);assert.equal(fifth.events[0].type,'error');await send(db,5,[{type:'packet',to:h.room.self,data:'fake',channel:0}]);assert.equal((await send(db,1)).events.length,0);});
test('relay never accepts a client supplied sender; signaling is limited to members',async()=>{const {db}=database();const h=await send(db,1,[{type:'create'}]);const g=await send(db,2,[{type:'join',code:h.room.code}]);await send(db,2,[{type:'signal',to:h.room.self,from:'fake',signal:{type:'offer',sdp:'v=0'}}]);const x=await send(db,1);assert.equal(x.events[0].from,g.room.self);assert.equal(x.events[0].signal.type,'offer');});
test('stale hosts expire and unsafe requests or oversized packet fields are rejected',async()=>{const {db,sql}=database();const h=await send(db,1,[{type:'create'}]);sql.exec('UPDATE stick_members SET seen=0');assert.equal((await send(db,2,[{type:'join',code:h.room.code}])).room,null);assert.equal(cleanPacket({type:'packet',to:'x',data:'x',channel:0}),null);assert.equal(cleanPacket({type:'packet',to:'1',data:'x'.repeat(MAX_STICK_PACKET+1),channel:0}),null);const r=new Request('https://kkeep.test/api/stick-rooms',{method:'POST',body:'{}'});assert.equal((await stickRooms(r,db)).status,403);});
test('build adapter is pinned to the inspected game and uses the patched framework only',()=>{const base='https://cdn.play.unity.com/games/5b35bbb8-64f5-4e2e-ae44-cdfaac211def/4d572363-7910-4aa0-8c26-7b4d02e01e70/';const html=['loader.js','game.data','framework.js','game.wasm'].map(f=>'"'+base+f+'?sig=a"').join('\n');assert.equal(parseStickBuild(html).config.frameworkUrl,'/games/stick-fight/framework-4d572363.js');assert.throws(()=>parseStickBuild(html.replaceAll('4d572363','00000000')));assert.equal(allowedStickAsset(base+'game.data'),true);assert.equal(allowedStickAsset('https://evil.test/game.data'),false);});
test('socket adapter waits for server readiness and uses HTTP fallback without WebRTC',async()=>{const {db}=database();const sockets=[];function client(){const context={window:{addEventListener(){}},crypto,queueMicrotask,setTimeout,clearTimeout,AbortController,fetch:async(path,opts)=>stickRooms(new Request('https://kkeep.test'+path,{...opts,headers:{...opts.headers,Origin:'https://kkeep.test'}}),db)};vm.runInNewContext(readFileSync(new URL('../public/stick-room-socket.js',import.meta.url),'utf8'),context);const s=new context.window.KkeepRoomSocket();sockets.push(s);return s;}try{const a=client(),b=client();assert.equal(a.readyState,0);await Promise.all([new Promise(r=>a.onopen=r),new Promise(r=>b.onopen=r)]);const event=(s,type)=>new Promise(resolve=>s.onmessage=e=>{const d=JSON.parse(e.data);if(d.type===type)resolve(d);});const room=event(a,'room');a.send(JSON.stringify({type:'create',name:'Test'}));const h=await room;const joined=event(b,'room');b.send(JSON.stringify({type:'join',code:h.code}));const g=await joined;await a.poll();const packet=event(b,'packet');a.send(JSON.stringify({type:'packet',to:g.self,data:'hello',channel:1}));assert.equal((await packet).data,'hello');}finally{for(const s of sockets)s.close();}});

test('the game maximum 256 KiB packet survives the relay unchanged',async()=>{
 const {db}=database();const h=await send(db,11,[{type:'create'}]);const g=await send(db,12,[{type:'join',code:h.room.code}]);
 const payload=Buffer.alloc(262144,123).toString('base64');assert.equal(payload.length,MAX_STICK_PACKET);
 await send(db,11,[{type:'packet',to:g.room.self,data:payload,channel:2,packetId:'7'}]);
 const received=(await send(db,12)).events.find(e=>e.type==='packet');assert.equal(received.data,payload);assert.equal(received.packetId,'7');assert.equal(received.from,h.room.self);
});

test('double taps and retried joins return the same room without an error',async()=>{
 const {db}=database();const h=await send(db,21,[{type:'create',visibility:'private'}]);
 const again=await send(db,21,[{type:'create',visibility:'private'}]);assert.equal(again.room.code,h.room.code);assert.deepEqual(again.events,[]);
 const code=h.room.code.toLowerCase();const pasted=' '+code.slice(0,4)+'-'+code.slice(4)+'\n';
 const g=await send(db,22,[{type:'join',code:pasted},{type:'join',code:pasted}]);assert.equal(g.room.members.length,2);assert.deepEqual(g.events,[]);
});

function adapterClient(db,{fetcher,RTC}={}){
 const context={window:{addEventListener(){}},crypto,queueMicrotask,setTimeout,clearTimeout,AbortController,RTCPeerConnection:RTC,
 fetch:fetcher||((path,opts)=>stickRooms(new Request('https://kkeep.test'+path,{...opts,headers:{...opts.headers,Origin:'https://kkeep.test'}}),db))};
 vm.runInNewContext(readFileSync(new URL('../public/stick-room-socket.js',import.meta.url),'utf8'),context);
 const socket=new context.window.KkeepRoomSocket();const messages=[];socket.onmessage=e=>messages.push(JSON.parse(e.data));
 return {socket,messages,open:new Promise(resolve=>socket.onopen=resolve)};
}
async function until(check){const end=Date.now()+4000;while(!check()){if(Date.now()>end)assert.fail('Expected transport event was not delivered');await new Promise(r=>setTimeout(r,10));}}

test('full-size join data and the next packet drain through the socket queue',async()=>{
 const {db}=database();const a=adapterClient(db),b=adapterClient(db);
 try{
  await Promise.all([a.open,b.open]);a.socket.send(JSON.stringify({type:'create'}));await until(()=>a.socket.room);
  b.socket.send(JSON.stringify({type:'join',code:a.socket.room.code}));await until(()=>b.socket.room);await a.socket.poll();
  const data=Buffer.alloc(262144,5).toString('base64');
  a.socket.send(JSON.stringify({type:'packet',to:b.socket.room.self,data,channel:0}));
  a.socket.send(JSON.stringify({type:'packet',to:b.socket.room.self,data:'next',channel:1}));
  await until(()=>b.messages.filter(m=>m.type==='packet').length===2);
  assert.deepEqual(b.messages.filter(m=>m.type==='packet').map(m=>m.data),[data,'next']);assert.equal(a.socket.bufferedAmount,0);
 }finally{a.socket.close();b.socket.close();}
});

test('a lost join response is retried without duplicate membership',async()=>{
 const {db}=database();const h=await send(db,31,[{type:'create'}]);let lost=false;
 const b=adapterClient(db,{fetcher:async(path,opts)=>{
  const r=await stickRooms(new Request('https://kkeep.test'+path,{...opts,headers:{...opts.headers,Origin:'https://kkeep.test'}}),db);
  if(!lost&&JSON.parse(opts.body).commands.some(m=>m.type==='join')){lost=true;throw Error('response lost');}return r;
 }});
 try{await b.open;b.socket.send(JSON.stringify({type:'join',code:h.room.code}));await until(()=>b.socket.room);assert.equal(b.socket.room.members.length,2);assert(lost);assert(!b.messages.some(m=>m.message?.includes('Leave your current')));}finally{b.socket.close();}
});

test('WebRTC chunks reassemble a full game packet and suppress relay duplicates',async()=>{
 const {db}=database();const a=adapterClient(db,{RTC:class{close(){}}});
 try{
  await a.open;const fragments=[];a.socket.sendDirect({send:raw=>fragments.push(raw)},{data:Buffer.alloc(262144,8).toString('base64'),channel:1,packetId:'9'});
  assert(fragments.length>1);assert(fragments.every(raw=>raw.length<16384));
  const channel={};a.socket.peer('2');a.socket.bindChannel('2',channel);
  for(const raw of fragments.slice().reverse())channel.onmessage({data:raw});
  const packets=a.messages.filter(m=>m.type==='packet');assert.equal(packets.length,1);assert.equal(packets[0].data.length,MAX_STICK_PACKET);assert.equal(packets[0].from,'2');
  a.socket.event({...packets[0]});assert.equal(a.messages.filter(m=>m.type==='packet').length,1);
  channel.onmessage({data:JSON.stringify({type:'fragment',packetId:'10',part:0,parts:1000000,data:'x',channel:0})});assert.equal(a.socket.peers.get('2').fragments.size,0);
 }finally{a.socket.close();}
});

test('the actual embedded game Join button connects and transfers a full packet',async()=>{
 const {db}=database();const live=[];
 const framework=readFileSync(new URL('../public/games/stick-fight/framework-4d572363.js',import.meta.url),'utf8');
 const start=framework.indexOf('window.WEBPORT_ROOM_SERVER=');const end=framework.indexOf('})()}',start)+4;assert(end>start);
 function game(){
  const elements=new Map();const $=id=>{if(!elements.has(id))elements.set(id,{value:id==='room-visibility'?'private':'Player',textContent:'',replaceChildren(){},append(){}});return elements.get(id);};const received=[];
  const context={window:{addEventListener(){},webPort:{send(method,data){received.push({method,data:method.startsWith('Receive')?JSON.parse(data):data});},setMenu(){},notify(){}}},document:{getElementById:$,createElement:()=>({})},location:{hostname:'kkeep.test'},WebSocket:{OPEN:1},crypto,queueMicrotask,setTimeout,clearTimeout,AbortController,fetch:(path,opts)=>stickRooms(new Request('https://kkeep.test'+path,{...opts,headers:{...opts.headers,Origin:'https://kkeep.test'}}),db)};
  vm.runInNewContext(readFileSync(new URL('../public/stick-room-socket.js',import.meta.url),'utf8'),context);
  const Original=context.window.KkeepRoomSocket;context.window.KkeepRoomSocket=class extends Original{constructor(){super();live.push(this);}};
  vm.runInNewContext(framework.slice(start,end),context);return {context,$,received};
 }
 try{
  const host=game(),guest=game();await host.context.window.webRooms.open('host');host.$('create-room').onclick();await until(()=>host.context.window.webRooms.room);
  const code=host.context.window.webRooms.room.code;await guest.context.window.webRooms.open('join');guest.$('room-code').value=code;guest.$('join-code').onclick();guest.$('join-code').onclick();
  await until(()=>guest.context.window.webRooms.room);await live[0].poll();
  const payload=Buffer.alloc(262144,21).toString('base64');host.context.window.webRooms.send(guest.context.window.webRooms.room.self,payload,0);
  await until(()=>guest.received.some(e=>e.method==='ReceivePacket'));assert.equal(guest.received.find(e=>e.method==='ReceivePacket').data.data,payload);
  assert(!guest.$('rooms-status').textContent.includes('Leave your current'));
 }finally{for(const socket of live)socket.close();}
});

test('a join during a host poll announces the new member before its first message',async()=>{
 const {db}=database();const host=await send(db,41,[{type:'create'}]);const original=db.prepare.bind(db);let injected=false;
 db.prepare=query=>{const statement=original(query);const all=statement.all.bind(statement);statement.all=async()=>{
  const result=await all();
  if(!injected&&query.startsWith('SELECT * FROM stick_members WHERE room=')){
   injected=true;await send(db,42,[{type:'join',code:host.room.code}]);
   await send(db,42,[{type:'signal',to:host.room.self,signal:{type:'offer',sdp:'v=0'}},{type:'packet',to:host.room.self,data:'first-handshake',channel:0}]);
  }
  return result;
 };return statement;};
 const response=await send(db,41);assert.equal(response.events.length,2);
 for(const event of response.events)assert(response.room.members.some(m=>m.id===event.from),'A first handshake must not precede room membership');
});
