import type {BrowserDB} from './browser-data';
type Member={id:string;room:string;name:string;seen:number;joined:number};
type Room={code:string;host:string;name:string;private:number;updated:number};
const ttl=90000;
// The inspected Unity transport accepts 256 KiB binary packets (base64 on this wire).
export const MAX_STICK_PACKET=4*Math.ceil(262144/3);
export const cleanName=(v:unknown)=>typeof v==='string'?v.replace(/[\x00-\x1f\x7f]/g,'').trim().slice(0,20)||'Player':'Player';
export function cleanPacket(v:unknown){
 if(!v||typeof v!=='object')return null;
 const p=v as Record<string,unknown>;
 if(p.type==='packet'&&typeof p.data==='string'&&p.data.length<=MAX_STICK_PACKET&&typeof p.to==='string'&&/^(?:[0-9]{1,20}|\*|all)$/.test(p.to)&&Number.isInteger(p.channel)&&Number(p.channel)>=0&&Number(p.channel)<=255)return {type:'packet',to:p.to,data:p.data,channel:p.channel,...(typeof p.packetId==='string'&&/^\d{1,16}$/.test(p.packetId)?{packetId:p.packetId}:{})};
 if(p.type==='signal'&&typeof p.to==='string'&&/^[0-9]{1,20}$/.test(p.to)&&p.signal&&typeof p.signal==='object'){
  const s=p.signal as Record<string,unknown>;
  if(['offer','answer'].includes(String(s.type))&&typeof s.sdp==='string'&&s.sdp.length<16000)return {type:'signal',to:p.to,signal:{type:s.type,sdp:s.sdp}};
 }
 return null;
}
export async function stickRooms(request:Request,db?:BrowserDB){
 const reply=(v:unknown,status=200)=>Response.json(v,{status,headers:{'Cache-Control':'no-store'}});
 const origin=new URL(request.url).origin;
 if(request.method!=='POST')return reply({error:'POST required'},405);
 if(request.headers.get('Origin')!==origin||request.headers.get('X-Kkeep-Room')!=='1')return reply({error:'Open Stick Fight in Kkeep'},403);
 if(!db)return reply({error:'Room service unavailable'},503);
 const token=request.headers.get('Authorization')?.replace(/^Bearer /,'')||'';
 if(!/^[a-f0-9]{64}$/.test(token))return reply({error:'Invalid session'},401);
 const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token))),x=>x.toString(16).padStart(2,'0')).join('');
 const id=BigInt('0x'+digest.slice(0,15)).toString();
 const q=(sql:string,...args:unknown[])=>db.prepare(sql).bind(...args);
 const all=async<T>(sql:string,...args:unknown[])=>(await q(sql,...args).all()).results as T[];
 try{
  const reader=request.body?.getReader();if(!reader)return reply({error:'Missing request'},400);
  let text='',size=0;const decoder=new TextDecoder();
  for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>600000){await reader.cancel();return reply({error:'Packet batch too large'},413);}text+=decoder.decode(value,{stream:true});}
  text+=decoder.decode();const data=JSON.parse(text),now=Date.now();
  if(!data||!Array.isArray(data.commands)||data.commands.length>40)return reply({error:'Invalid commands'},400);
  let member=(await all<Member>('SELECT * FROM stick_members WHERE id=?',id))[0];
  const events:unknown[]=[];
  for(const cmd of data.commands){
   if(!cmd||typeof cmd!=='object')continue;
   if(cmd.type==='leave'){
    await db.batch([q('DELETE FROM stick_rooms WHERE host=?',id),q('DELETE FROM stick_members WHERE id=?',id),q('DELETE FROM stick_messages WHERE recipient=?',id)]);member=undefined!;continue;
   }
   if(cmd.type==='list'){
    const rooms=await all<{code:string;name:string;count:number}>('SELECT r.code,r.name,count(m.id) as count FROM stick_rooms r JOIN stick_members h ON h.id=r.host AND h.seen>? LEFT JOIN stick_members m ON m.room=r.code AND m.seen>? WHERE r.private=0 GROUP BY r.code HAVING count(m.id)<4 LIMIT 50',now-ttl,now-ttl);
    events.push({type:'list',rooms});continue;
   }
   if(cmd.type==='create'||cmd.type==='join'){
    if(member){
     // A double tap or a retried request must not turn a successful join into an error.
     const sameJoin=cmd.type==='join'&&String(cmd.code||'').replace(/[\s-]/g,'').toUpperCase()===member.room;
     const sameHost=cmd.type==='create'&&(await all<Room>('SELECT * FROM stick_rooms WHERE code=? AND host=?',member.room,id)).length>0;
     if(sameJoin||sameHost)continue;
     events.push({type:'error',message:'Leave your current room before joining another.'});continue;
    }
    if(cmd.type==='create'){
     // Bound public room capacity, purge only expired game transport records.
     await db.batch([q('DELETE FROM stick_messages WHERE created<?',now-30000),q('DELETE FROM stick_members WHERE seen<?',now-ttl),q('DELETE FROM stick_rooms WHERE host NOT IN (SELECT id FROM stick_members)')]);
     const count=await all<{n:number}>('SELECT count(*) as n FROM stick_rooms');if(count[0].n>=50){events.push({type:'error',message:'Rooms are busy. Please try again shortly.'});continue;}
     const code=crypto.randomUUID().replace(/-/g,'').slice(0,8).toUpperCase();
     const result=await q('INSERT OR IGNORE INTO stick_rooms(code,host,name,private,updated) VALUES(?,?,?,?,?)',code,id,cleanName(cmd.name),cmd.visibility==='private'?1:0,now).run();
     if(!result.meta.changes){events.push({type:'error',message:'Please try creating the room again.'});continue;}
     await q('INSERT INTO stick_members(id,room,name,seen,joined) VALUES(?,?,?,?,?)',id,code,cleanName(cmd.name),now,now).run();
    }else{
     const code=String(cmd.code||'').replace(/[\s-]/g,'').toUpperCase();
     if(!/^[A-F0-9]{8}$/.test(code)){events.push({type:'error',message:'Enter the 8-character room code.'});continue;}
     // Admission is one SQL statement, including the capacity check.
     const result=await q('INSERT OR IGNORE INTO stick_members(id,room,name,seen,joined) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM stick_rooms r JOIN stick_members h ON h.id=r.host WHERE r.code=? AND h.seen>?) AND (SELECT count(*) FROM stick_members WHERE room=? AND seen>?)<4',id,code,cleanName(cmd.name),now,now,code,now-ttl,code,now-ttl).run();
     if(!result.meta.changes){events.push({type:'error',message:'Room not found, full, or closed.'});continue;}
    }
    member=(await all<Member>('SELECT * FROM stick_members WHERE id=?',id))[0];
   }
  }
  if(!member)return reply({events,room:null,cursor:0});
  const room=(await all<Room>('SELECT r.* FROM stick_rooms r JOIN stick_members h ON h.id=r.host WHERE r.code=? AND h.seen>?',member.room,now-ttl))[0];
  if(!room){await q('DELETE FROM stick_members WHERE id=?',id).run();return reply({events:[...events,{type:'closed',message:'The host left. Create or join another room.'}],room:null,cursor:0});}
  if(now-member.seen>10000)await q('UPDATE stick_members SET seen=? WHERE id=?',now,id).run();
  let members=await all<Member>('SELECT * FROM stick_members WHERE room=? AND seen>? ORDER BY joined,id',room.code,now-ttl);
  const writes=[];
  const perPeer=new Map<string,unknown[]>();
  for(const value of data.commands){const p=cleanPacket(value);if(!p)continue;
   const targets=members.filter(m=>m.id!==id&&(p.to===m.id||p.to==='*'||p.to==='all'||p.to==='0'));
   for(const target of targets){const outgoing=perPeer.get(target.id)||[];outgoing.push({...p,from:id});perPeer.set(target.id,outgoing);}
  }
  for(const [peer,packets]of perPeer)writes.push(q('INSERT INTO stick_messages(room,recipient,payload,created) VALUES(?,?,?,?)',room.code,peer,JSON.stringify(packets),now));
  const cursor=Number.isSafeInteger(data.cursor)&&data.cursor>=0?data.cursor:0;
  if(cursor)writes.push(q('DELETE FROM stick_messages WHERE recipient=? AND id<=?',id,cursor));
  if(now-member.seen>10000)writes.push(q('DELETE FROM stick_messages WHERE created<?',now-30000));
  if(writes.length)await db.batch(writes);
  const messages=await all<{id:number;payload:string}>('SELECT id,payload FROM stick_messages WHERE recipient=? AND room=? AND id>? AND created>? ORDER BY id LIMIT 8',id,room.code,cursor,now-30000);
  for(const message of messages)events.push(...JSON.parse(message.payload));
  // A peer may join between the member query and inbox query. The game and RTC
  // adapter reject unknown senders, so announce membership before their first packet/offer.
  if(events.some(event=>event&&typeof event==='object'&&'from' in event&&!members.some(m=>m.id===event.from))){
   members=await all<Member>('SELECT * FROM stick_members WHERE room=? AND seen>? ORDER BY joined,id',room.code,now-ttl);
  }
  return reply({events,room:{type:'room',code:room.code,self:id,host:room.host,isPrivate:!!room.private,members:members.map(m=>({id:m.id,name:m.name}))},cursor:messages.at(-1)?.id||cursor});
 }catch{return reply({error:'Room connection failed. Please retry.'},500);}
}
