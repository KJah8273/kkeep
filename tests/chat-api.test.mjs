import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes, randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {chatApi, avatarDimensions} from '../worker/chat.ts';
import {digest} from '../worker/profile.ts';
import {env as base} from './chat-environment.mjs';

const origin='https://kkeep.test', ownerEmail='site-owner@example.test';
const env={...base,KKEEP_ANALYTICS_OWNER_EMAIL:ownerEmail};
const ownerHeaders={'oai-authenticated-user-email':ownerEmail};
async function person(name='Player',join=true){
  const id=randomUUID(),token=randomBytes(32).toString('hex'),label=name+randomBytes(3).toString('hex');
  await env.DB.prepare('INSERT INTO kkeep_accounts (id,username,name,password,created) VALUES (?,?,?,?,?)').bind(id,label.toLowerCase(),label,'unused-test-password',Date.now()).run();
  await env.DB.prepare('INSERT INTO kkeep_sessions (token,account,expires) VALUES (?,?,?)').bind(await digest(token),id,Date.now()+3600000).run();
  const who={id,name:label,cookie:'__Host-kkeep-profile='+token};
  if(join)assert.equal((await call('/join',who,'POST',{})).status,200);
  return who;
}
async function call(path,who,method='GET',input,extra={},targetEnv=env){
  const headers={'X-Kkeep-Profile':'1',Origin:origin,...(who?{Cookie:who.cookie}:{}),...extra};
  let body;
  if(input!==undefined){headers['Content-Type']??='application/json';body=headers['Content-Type']==='application/json'?JSON.stringify(input):input;}
  const response=await chatApi(new Request(origin+'/api/chat'+path,{method,headers,body,...(body instanceof ReadableStream?{duplex:'half'}:{})}),targetEnv);
  const type=response.headers.get('Content-Type')||'';
  const data=type.includes('application/json')?await response.json():await response.arrayBuffer();
  return {status:response.status,data,response};
}
async function befriend(a,b){
  const sent=await call('/friends',a,'POST',{accountId:b.id});assert.equal(sent.status,200,JSON.stringify(sent.data));
  const accepted=await call('/friends/'+sent.data.id,b,'POST',{action:'accept'});assert.equal(accepted.status,200,JSON.stringify(accepted.data));
  return sent.data.id;
}
async function dm(a,b){
  await befriend(a,b);
  const made=await call('/conversations',a,'POST',{accountId:b.id});assert.equal(made.status,200,JSON.stringify(made.data));
  return made.data.conversation.id;
}
async function send(who,roomId='public',content='Hello',clientId=randomUUID(),headers={},targetEnv=env){
  return call('/messages',who,'POST',{roomId,text:content,clientId},headers,targetEnv);
}
async function channel(owner,name='room-'+randomBytes(4).toString('hex')){
  const made=await call('/channels',owner,'POST',{name,category:'Chat'},ownerHeaders);
  assert.equal(made.status,201,JSON.stringify(made.data));return made.data.channel;
}
let ownerFixture;
async function siteOwner(){
  if(!ownerFixture){
    ownerFixture=await person('TrustedOwner');
    assert.equal((await call('/owner/claim',ownerFixture,'POST',{},ownerHeaders)).status,200);
  }
  return ownerFixture;
}

test('public chat is readable while participation requires same-origin Profile auth and enrollment',async()=>{
  assert.equal((await call('/messages')).status,200);
  assert.equal((await send(undefined)).status,401);
  assert.equal((await call('/session',undefined,'GET',undefined,{'X-Kkeep-Profile':'0'})).status,403);
  const user=await person('Profile',false),hidden=await person('Hidden',false);
  assert.equal((await call('/session',user)).data.account.id,user.id);
  assert.equal((await call('/session',user)).data.profile,null);
  assert.equal((await call('/messages',user)).status,200);
  assert.equal((await send(user)).data.code,'join_required');
  assert.equal((await call('/join',user,'POST',{}, {Origin:'https://foreign.test'})).status,403);
  assert.equal((await call('/join',user,'POST',{}, {'Sec-Fetch-Site':'cross-site'})).status,403);
  assert.equal((await call('/join',user,'POST',{displayName:'bad<script>'})).status,400);
  const joined=await call('/join',user,'POST',{displayName:'خالد سالم',bio:'Playing with friends.'});
  assert.equal(joined.status,200);assert.equal(joined.data.profile.displayName,'خالد سالم');
  const people=await call('/people',user);
  assert.ok(!people.data.people.some(p=>p.id===hidden.id));
  assert.equal((await call('/profile?id='+hidden.id,user)).status,404);
  assert.equal((await call('/profile',user,'PATCH',{bio:'x'.repeat(161)})).status,400);
  const safe=JSON.stringify(joined.data);
  assert.doesNotMatch(safe,/password|avatarKey|avatar_key|token|search_key/);
  const changed=await call('/profile',user,'PATCH',{displayName:'My Display',bio:'مرحبا',accountId:hidden.id});
  assert.equal(changed.status,200);assert.equal(changed.data.profile.id,user.id);
  assert.equal((await call('/profile',user,'PATCH',{displayName:'K'})).data.profile.displayName,'K');
  assert.equal((await call('/profile',user,'PATCH',{displayName:'星空 لاعب'})).status,200);
  assert.equal((await call('/profile',user,'PATCH',{displayName:'x'.repeat(33)})).status,400);
  const untouched=await env.DB.prepare('SELECT name FROM kkeep_accounts WHERE id=?').bind(user.id).all();
  assert.equal(untouched.results[0].name,user.name);
  assert.equal((await call('/people?q=%25%25',user)).data.people.length,0);
});

test('friend requests enforce recipient ownership, DM membership and retry-safe messages',async()=>{
  const a=await person('Alice'),b=await person('Bob'),c=await person('Carol');
  assert.equal((await call('/friends',a,'POST',{accountId:a.id})).status,400);
  assert.equal((await call('/conversations',a,'POST',{accountId:b.id})).status,403);
  const request=await call('/friends',a,'POST',{accountId:b.id});assert.equal(request.status,200);
  const id=request.data.id;
  assert.equal((await call('/friends/'+id,a,'POST',{action:'accept'})).status,403);
  assert.equal((await call('/friends/'+id,c,'POST',{action:'accept'})).status,404);
  assert.equal((await call('/friends',b,'POST',{accountId:a.id})).status,409);
  assert.equal((await call('/friends',a,'POST',{accountId:b.id})).data.id,id);
  assert.equal((await call('/friends/'+id,b,'POST',{action:'accept'})).status,200);
  assert.equal((await call('/friends',a)).data.friends[0].user.id,b.id);
  const room=(await call('/conversations',a,'POST',{accountId:b.id})).data.conversation.id;
  assert.equal((await call('/conversations',b,'POST',{accountId:a.id})).data.conversation.id,room);
  const nonce=randomUUID(),sent=await send(a,room,'Only friends can read this.',nonce);
  assert.equal(sent.status,201,JSON.stringify(sent.data));
  assert.equal((await send(a,room,'Only friends can read this.',nonce)).data.message.id,sent.data.message.id);
  assert.equal((await send(a,room,'Changed retry contents.',nonce)).status,409);
  assert.equal((await call('/messages?room='+room,c)).status,403);
  assert.equal((await send(c,room,'An intruder')).status,403);
  assert.equal((await call('/messages/'+sent.data.message.id,c,'DELETE')).status,404);
  assert.equal((await call('/reports',c,'POST',{messageId:sent.data.message.id,reason:'Unauthorized peek'})).status,404);
  const received=(await call('/messages?room='+room,b)).data.messages;
  assert.equal(received.length,1);assert.equal(received[0].text,'Only friends can read this.');
  assert.equal(received[0].clientId,undefined);
  assert.equal((await call('/conversations',c)).data.conversations.length,0);
  assert.equal((await call('/friends/'+id,a,'POST',{action:'remove'})).status,200);
  assert.equal((await call('/messages?room='+room,b)).status,403);
  assert.equal((await send(a,room,'After removal')).status,403);
});

test('decline/cancel actions cannot be applied in the opposite direction',async()=>{
  const a=await person(),b=await person();
  let requested=await call('/friends',a,'POST',{accountId:b.id});
  assert.equal((await call('/friends/'+requested.data.id,a,'POST',{action:'decline'})).status,403);
  assert.equal((await call('/friends/'+requested.data.id,b,'POST',{action:'cancel'})).status,403);
  assert.equal((await call('/friends/'+requested.data.id,b,'POST',{action:'decline'})).status,200);
  requested=await call('/friends',a,'POST',{accountId:b.id});
  assert.equal((await call('/friends/'+requested.data.id,a,'POST',{action:'cancel'})).status,200);
});

test('blocking is bilateral for discovery/DM access and an atomic check prevents a send race',async()=>{
  const a=await person(),b=await person(),room=await dm(a,b);
  const initial=await send(a,room,'Before block');assert.equal(initial.status,201);
  let intercepted=false;
  const racing={...env,DB:{...env.DB,async batch(operations){
    if(!intercepted){
      intercepted=true;
      await env.DB.prepare('INSERT INTO kkeep_chat_blocks (blocker,blocked,created) VALUES (?,?,?)').bind(b.id,a.id,Date.now()).run();
      await env.DB.prepare('DELETE FROM kkeep_chat_friends WHERE (sender=? AND receiver=?) OR (sender=? AND receiver=?)').bind(a.id,b.id,b.id,a.id).run();
    }
    return env.DB.batch(operations);
  }}};
  const raced=await send(a,room,'Must not be inserted',randomUUID(),{},racing);
  assert.equal(raced.status,403);
  const stored=await env.DB.prepare('SELECT text FROM kkeep_chat_messages WHERE room=?').bind(room).all();
  assert.deepEqual(stored.results.map(row=>row.text),['Before block']);
  assert.equal((await call('/messages?room='+room,a)).status,403);
  assert.equal((await call('/messages?room='+room,b)).status,403);
  assert.equal((await call('/friends',a,'POST',{accountId:b.id})).status,403);
  assert.equal((await call('/profile?id='+b.id,a)).status,404);
  assert.ok(!(await call('/people',a)).data.people.some(p=>p.id===b.id));
  assert.equal((await call('/blocks/'+a.id,a,'DELETE')).status,200);
  assert.equal((await call('/messages?room='+room,a)).status,403);
  assert.equal((await call('/blocks/'+a.id,b,'DELETE')).status,200);
  assert.equal((await call('/messages?room='+room,a)).status,403,'Unblocking must not restore friendship automatically');
});


test('a public block hides both players and channel archive races cannot insert messages',async()=>{
  const a=await person(),b=await person(),room=(await channel(await siteOwner())).id;
  const first=await send(a,room,'Visible before blocking');assert.equal(first.status,201);
  assert.equal((await call('/blocks',b,'POST',{accountId:a.id})).status,200);
  assert.ok(!(await call('/messages?room='+encodeURIComponent(room),b)).data.messages.some(m=>m.author.id===a.id));
  const blocked=await send(b,room,'Visible to others');assert.equal(blocked.status,201);
  assert.ok(!(await call('/messages?room='+encodeURIComponent(room),a)).data.messages.some(m=>m.author.id===b.id));
  const racing={...env,DB:{...env.DB,async batch(operations){
    await env.DB.prepare('UPDATE kkeep_chat_channels SET archived=1 WHERE id=?').bind(room).run();
    return env.DB.batch(operations);
  }}};
  assert.equal((await send(a,room,'Cannot survive archival',randomUUID(),{},racing)).status,403);
  const count=(await env.DB.prepare('SELECT COUNT(*) AS n FROM kkeep_chat_messages WHERE room=?').bind(room).all()).results[0].n;
  assert.equal(count,2);
});

test('event cursors preserve pagination and propagate author soft-deletes to other clients',async()=>{
  const a=await person(),b=await person(),room=(await channel(await siteOwner())).id;
  const sent=[];
  for(let index=0;index<6;index++){const response=await send(a,room,'History '+index);assert.equal(response.status,201,JSON.stringify(response.data));sent.push(response.data.message);}
  const initial=await call('/messages?room='+encodeURIComponent(room)+'&limit=3',b);
  assert.deepEqual(initial.data.messages.map(m=>m.id),sent.slice(3).map(m=>m.id));
  assert.equal(initial.data.hasMore,true);
  const older=await call('/messages?room='+encodeURIComponent(room)+'&before='+initial.data.oldestId+'&limit=3',b);
  assert.deepEqual(older.data.messages.map(m=>m.id),sent.slice(0,3).map(m=>m.id));
  assert.equal(older.data.hasMore,false);
  assert.equal((await call('/messages/'+sent[4].id,b,'DELETE')).status,404);
  assert.equal((await call('/messages/'+sent[4].id,a,'DELETE')).status,200);
  const tombstones=await call('/messages?room='+encodeURIComponent(room)+'&after='+initial.data.cursor,b);
  assert.equal(tombstones.status,200);assert.equal(tombstones.data.messages[0].deleted,true);
  assert.equal(tombstones.data.messages[0].text,'');assert.equal(tombstones.data.messages[0].id,sent[4].id);
  assert.ok(tombstones.data.cursor>initial.data.cursor);
  assert.equal((await call('/reports',b,'POST',{messageId:sent[2].id,reason:'Please review this message.'})).status,200);
  assert.equal((await call('/reports',b,'POST',{messageId:sent[2].id,reason:'Repeated report.'})).status,200);
  const count=(await env.DB.prepare('SELECT COUNT(*) AS n FROM kkeep_chat_reports WHERE reporter=? AND message=?').bind(b.id,sent[2].id).all()).results[0].n;
  assert.equal(count,1);
  assert.equal((await call('/messages?room='+encodeURIComponent(room)+'&after=1&before=2',b)).status,400);
});

test('durably linked owner manages channels; names, body roles, and other platform users grant nothing',async()=>{
  const owner=await siteOwner(),member=await person('Admin');
  const defaults=await call('/channels');
  assert.equal(defaults.status,200);assert.ok(defaults.data.channels.some(c=>c.id==='public'&&c.name==='general'));
  assert.equal(defaults.data.canManageChannels,false);
  const mine=await call('/channels',owner);
  assert.equal(mine.data.canManageChannels,true);assert.equal(mine.data.ownerConfigured,true);assert.equal(mine.data.ownerSignedIn,true);
  assert.equal((await call('/channels',member,'POST',{name:'forbidden',owner:true,role:'owner'})).status,403);
  assert.equal((await call('/channels',member,'POST',{name:'forbidden'},{'oai-authenticated-user-email':'someone-else@example.test'})).status,403);
  assert.equal((await call('/channels',member,'POST',{name:'forbidden'},ownerHeaders)).status,403);
  assert.equal((await call('/channels',member,'POST',{name:'forbidden'},ownerHeaders,{...env,KKEEP_ANALYTICS_OWNER_EMAIL:undefined})).status,403);
  assert.equal((await send(member,'channel:rules','Cannot post')).data.code,'permission_required');
  assert.equal((await send(owner,'channel:rules','A new owner rule.',randomUUID(),ownerHeaders)).status,201);
  const made=await call('/channels',owner,'POST',{name:'announcements-extra',category:'Kkeep',readOnly:true},ownerHeaders);
  assert.equal(made.status,201);
  const key=made.data.channel.id,path='/channels/'+encodeURIComponent(key);
  assert.equal((await call(path,member,'PATCH',{name:'stolen'})).data.code,'permission_required');
  assert.equal((await call(path,owner,'PATCH',{name:'renamed',readOnly:false},ownerHeaders)).data.channel.name,'renamed');
  const msg=await send(member,key,'An open channel now.');assert.equal(msg.status,201);
  assert.equal((await call(path,owner,'DELETE',undefined,ownerHeaders)).status,200);
  assert.ok(!(await call('/channels')).data.channels.some(c=>c.id===key));
  assert.equal((await call('/messages?room='+encodeURIComponent(key),member)).status,403);
  assert.equal((await send(owner,key,'Archived',randomUUID(),ownerHeaders)).status,403);
  const preserved=(await env.DB.prepare('SELECT text FROM kkeep_chat_messages WHERE id=?').bind(msg.data.message.id).all()).results[0];
  assert.equal(preserved.text,'An open channel now.');
  assert.equal((await call('/channels/'+encodeURIComponent('channel:faq'),owner,'DELETE',undefined,ownerHeaders)).status,200);
  assert.ok(!(await call('/channels')).data.channels.some(c=>c.id==='channel:faq'));
  assert.ok(!(await call('/channels')).data.channels.some(c=>c.id==='channel:faq'),'A second read must not resurrect builtins');
});

test('oversized bodies and message limits are bounded, and successful retry does not resend',async()=>{
  const a=await person(),room=(await channel(await siteOwner())).id;
  assert.equal((await send(a,room,'x'.repeat(2001))).status,400);
  assert.equal((await call('/messages',a,'POST','x'.repeat(13000),{'Content-Type':'application/json'})).status,413);
  const firstNonce=randomUUID(),first=await send(a,room,'Original',firstNonce);
  assert.equal(first.status,201);
  for(let i=1;i<30;i++)assert.equal((await send(a,room,'Message '+i)).status,201);
  const limited=await send(a,room,'Over the limit');
  assert.equal(limited.status,429);assert.ok(Number(limited.response.headers.get('Retry-After'))>0);
  const retried=await send(a,room,'Original',firstNonce);
  assert.equal(retried.status,200);assert.equal(retried.data.message.id,first.data.message.id);
});

const webp=Buffer.from('UklGRroAAABXRUJQVlA4IK4AAAAwEQCdASoAAQABPm02mkmkIyKhICgAgA2JaW7hdrEe3AAAE9gHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snCgAD+/zI3/+pGGLsf/4J6lrd7ra7gQAAAAAAAAAA=','base64');
function mediaEnv(){
  const files=new Map(),observed={transforms:[]};
  return {...env,files,observed,GAME_ASSETS:{
    async put(key,stream,metadata){files.set(key,{body:new Uint8Array(await new Response(stream).arrayBuffer()),metadata});},
    async get(key){const file=files.get(key);return file?{body:new Blob([file.body]).stream(),size:file.body.length,customMetadata:file.metadata.customMetadata}:null;},
    async head(key){const file=files.get(key);return file?{size:file.body.length}:null;},
    async delete(key){files.delete(key);}
  },IMAGES:{input(stream){return {transform(options){observed.transforms.push(options);return {async output(options){await new Response(stream).arrayBuffer();assert.equal(options.anim,false);return {response:()=>new Response(webp,{headers:{'Content-Type':'image/webp'}})};}};}};}}};
}

test('avatars require safe bounded rasters, normalize before storage and never expose wallpaper keys',async()=>{
  const a=await person(),b=await person(),outsider=await person('Outside',false),storage=mediaEnv();
  assert.deepEqual(avatarDimensions(webp,'image/webp'),{width:256,height:256});
  assert.equal((await call('/avatar',a,'PUT','<svg/>',{'Content-Type':'image/svg+xml'},storage)).status,415);
  assert.equal((await call('/avatar',a,'PUT','<script>',{'Content-Type':'image/webp'},storage)).status,415);
  assert.equal((await call('/avatar',a,'PUT',webp,{'Content-Type':'image/webp','Content-Length':String(2*1024*1024+1)},storage)).status,413);
  const tooBig=Buffer.alloc(33);Buffer.from([137,80,78,71,13,10,26,10]).copy(tooBig);tooBig.write('IHDR',12);tooBig.writeUInt32BE(9999,16);tooBig.writeUInt32BE(9999,20);
  assert.equal((await call('/avatar',a,'PUT',tooBig,{'Content-Type':'image/png'},storage)).status,400);
  const result=await call('/avatar',a,'PUT',webp,{'Content-Type':'image/webp'},storage);
  assert.equal(result.status,200,JSON.stringify(result.data));
  assert.match(result.data.profile.avatarUrl,/^\/api\/chat\/avatar\//);
  assert.deepEqual(storage.observed.transforms[0],{width:256,height:256,fit:'cover',metadata:'none'});
  assert.equal(storage.files.size,1);assert.match([...storage.files.keys()][0],new RegExp('^chat-avatars/v1/'+a.id+'/[a-f0-9-]+\\.webp$'));
  const path=result.data.profile.avatarUrl.replace('/api/chat','');
  const image=await call(path,b,'GET',undefined,{'X-Kkeep-Profile':''},storage);
  assert.equal(image.status,200);assert.equal(image.response.headers.get('Content-Type'),'image/webp');
  assert.match(image.response.headers.get('Cache-Control'),/private/);
  assert.equal((await call(path,undefined,'GET',undefined,{'X-Kkeep-Profile':''},storage)).status,200);
  assert.equal((await call(path,outsider,'GET',undefined,{'X-Kkeep-Profile':''},storage)).status,200);
  assert.equal((await call('/avatar/'+encodeURIComponent('../../profile-media/private'),b,'GET',undefined,{'X-Kkeep-Profile':''},storage)).status,400);
  assert.equal((await call('/avatar',a,'PUT',webp,{'Content-Type':'image/webp'},storage)).status,200);
  assert.equal(storage.files.size,1,'Only the current version remains after successful cleanup');
  assert.equal((await call('/avatar',a,'DELETE',undefined,{},storage)).data.profile.avatarUrl,null);
  assert.equal(storage.files.size,0);
  assert.equal((await call(path,b,'GET',undefined,{'X-Kkeep-Profile':''},storage)).status,404);
  assert.equal((await call('/avatar',b,'PUT',webp,{'Content-Type':'image/webp'},env)).status,503);
  const rejects={...storage,IMAGES:{input(){return {transform(){return {async output(){throw Error('Invalid image');}};}};}}};
  assert.equal((await call('/avatar',b,'PUT',webp,{'Content-Type':'image/webp'},rejects)).status,422);
});

const realPng=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAQAAAAEACAYAAABccqhmAAAAG3RFWHRDb21tZW50AHByaXZhdGUtY2FtZXJhLW5vdGUAff9xAAACX0lEQVR42u3UQQEAIAjAQDGjMUxCaShAA+4i7LF4P+sAK10JwAAAAwAMADAAwAAAAwAMADAAwAAAAwAMADAAwAAAAwAMADAAwAAAAwAMADAAwAAAAwAMADAAwAAAAwAMADAAwAAAAwAMADAAwAAAAwAMADAAMADAAAADAAwAMADAAAADAAwAMADAAAADAAwAMADAAAADAAwAMADAAAADAAwAMADAAAADAAwAMADAAAADAAwAMADAAAADAAwAMADAAAADAAwAMAAwAMAAAAMADAAwAMAAAAMADAAwAMAAAAMADAAwAMAAAAMADAAwAMAAAAMADAAwAMAAAAMADAAwAMAAAAMADAAwAMAAAAMADAAwAMAAAAMADAAwADAAwAAAAwAMADAAwAAAAwAMADAAwAAAAwAMADAAwAAAAwAMADAAwAAAAwAMADAAwAAAAwAMADAAwAAAAwAMADAAwAAAAwAMADAAwAAAAwAMADAAMADAAAADAAwAMADAAAADAAwAMADAAAADAAwAMADAAAADAAwAMADAAAADAAwAMADAAAADAAwAMADAAAADAAwAMADAAAADAAwAMADAAAADAAwAMAAwAMAAAAMADAAwAMAAAAMADAAwAMAAAAMADAAwAMAAAAMADAAwAMAAAAMADAAwAMAAAAMADAAwAMAAAAMADAAwAMAAAAMADAAwAMAAAAMADAAwADAAwAAAAwAMADAAwAAAAwAMADAAwAAAAwAMADAAwAAAAwAMADAAwAAAAwAMADAAwAAAAwAMADAAwAAAAwAMADAAwAAAAwAMADAAYNIIzgRJyHkuWwAAAABJRU5ErkJggg==','base64');

test('production-shaped avatars work without IMAGES using a real PNG and strip private metadata',async()=>{
  const a=await person(),b=await person(),storage={...mediaEnv(),IMAGES:undefined};
  const uploaded=await call('/avatar',a,'PUT',realPng,{'Content-Type':'image/png'},storage);
  assert.equal(uploaded.status,200,JSON.stringify(uploaded.data));
  const key=[...storage.files.keys()][0],file=storage.files.get(key);assert.match(key,new RegExp('^chat-avatars/v1/'+a.id+'/[a-f0-9-]+\\.png$'));
  assert.ok(file);assert.equal(file.metadata.customMetadata.type,'image/png');
  assert.ok(!Buffer.from(file.body).includes(Buffer.from('private-camera-note')));
  const path=uploaded.data.profile.avatarUrl.replace('/api/chat','');
  const image=await call(path,b,'GET',undefined,{'X-Kkeep-Profile':''},storage);
  assert.equal(image.status,200);assert.equal(image.response.headers.get('Content-Type'),'image/png');
  assert.deepEqual(avatarDimensions(new Uint8Array(image.data),'image/png'),{width:256,height:256});
  assert.equal((await call('/avatar',b,'PUT',webp,{'Content-Type':'image/webp'},storage)).data.code,'png_required');
  const damaged=Buffer.from(realPng);damaged[damaged.length-1]^=1;
  assert.equal((await call('/avatar',b,'PUT',damaged,{'Content-Type':'image/png'},storage)).status,422);
  assert.equal((await call('/blocks',b,'POST',{accountId:a.id})).status,200);
  assert.equal((await call(path,b,'GET',undefined,{'X-Kkeep-Profile':''},storage)).status,404);
  assert.equal((await call('/avatar',a,'DELETE',undefined,{},storage)).status,200);
  assert.equal(storage.files.size,0);
});

test('failed avatar deletion removes visibility and keeps a durable cleanup retry',async()=>{
  const a=await person(),storage={...mediaEnv(),IMAGES:undefined};
  const saved=await call('/avatar',a,'PUT',realPng,{'Content-Type':'image/png'},storage);
  assert.equal(saved.status,200);
  const unavailable={...storage,GAME_ASSETS:{...storage.GAME_ASSETS,async delete(){throw Error('Temporary object storage outage');}}};
  const removed=await call('/avatar',a,'DELETE',undefined,{},unavailable);
  assert.equal(removed.status,200);assert.equal(removed.data.profile.avatarUrl,null);assert.equal(removed.data.cleanupPending,true);
  assert.equal(storage.files.size,1);
  assert.equal((await call(saved.data.profile.avatarUrl.replace('/api/chat',''),a,'GET',undefined,{},storage)).status,404);
  const queued=(await env.DB.prepare('SELECT COUNT(*) AS n FROM kkeep_chat_avatar_cleanup WHERE account=?').bind(a.id).all()).results[0].n;
  assert.equal(queued,1);
  const retried=await call('/avatar',a,'DELETE',undefined,{},storage);
  assert.equal(retried.status,200);assert.equal(retried.data.cleanupPending,false);assert.equal(storage.files.size,0);
});

test('concurrent avatar upload/delete uses version leases in both directions',async()=>{
  const a=await person(),storage={...mediaEnv(),IMAGES:undefined};
  assert.equal((await call('/avatar',a,'PUT',realPng,{'Content-Type':'image/png'},storage)).status,200);
  let deleteIntercepted=false;
  const delayedUpload={...storage,GAME_ASSETS:{...storage.GAME_ASSETS,async put(key,stream,metadata){
    await storage.GAME_ASSETS.put(key,stream,metadata);
    if(!deleteIntercepted){deleteIntercepted=true;assert.equal((await call('/avatar',a,'DELETE',undefined,{},storage)).status,200);}
  }}};
  const losesUpload=await call('/avatar',a,'PUT',realPng,{'Content-Type':'image/png'},delayedUpload);
  assert.equal(losesUpload.status,409);assert.equal(losesUpload.data.code,'profile_changed');
  assert.equal((await call('/session',a)).data.profile.avatarUrl,null);
  assert.equal(storage.files.size,0,'Unreferenced losing upload must be cleaned');

  assert.equal((await call('/avatar',a,'PUT',realPng,{'Content-Type':'image/png'},storage)).status,200);
  let uploadIntercepted=false,newProfile;
  const delayedDelete={...storage,DB:{...env.DB,async batch(operations){
    if(!uploadIntercepted){
      uploadIntercepted=true;
      const replacement=await call('/avatar',a,'PUT',realPng,{'Content-Type':'image/png'},storage);
      assert.equal(replacement.status,200);newProfile=replacement.data.profile;
    }
    return env.DB.batch(operations);
  }}};
  const losesDelete=await call('/avatar',a,'DELETE',undefined,{},delayedDelete);
  assert.equal(losesDelete.status,409);assert.equal(losesDelete.data.code,'profile_changed');
  assert.equal((await call('/session',a)).data.profile.avatarUrl,newProfile.avatarUrl);
  assert.equal(storage.files.size,1,'A stale delete must never remove the newer avatar object');
  assert.equal((await call(newProfile.avatarUrl.replace('/api/chat',''),a,'GET',undefined,{},storage)).status,200);
});

test('rename that races with archive cannot restore a channel',async()=>{
  const owner=await siteOwner(),created=await channel(owner);
  let archived=false;
  function wrap(query,sql,args=[]){
    return {
      bind(...next){return wrap(query.bind(...next),sql,next);},
      all:()=>query.all(),
      async run(){
        if(!archived&&sql.includes('ON CONFLICT(id) DO UPDATE SET name=')&&args[0]===created.id){
          archived=true;
          assert.equal((await call('/channels/'+encodeURIComponent(created.id),owner,'DELETE',undefined,ownerHeaders)).status,200);
        }
        return query.run();
      }
    };
  }
  const racing={...env,DB:{...env.DB,prepare(sql){return wrap(env.DB.prepare(sql),sql);}}};
  const renamed=await call('/channels/'+encodeURIComponent(created.id),owner,'PATCH',{name:'must-stay-archived'},ownerHeaders,racing);
  assert.equal(renamed.status,409);assert.equal(renamed.data.code,'channel_changed');
  assert.ok(!(await call('/channels')).data.channels.some(item=>item.id===created.id));
  const row=(await env.DB.prepare('SELECT archived FROM kkeep_chat_channels WHERE id=?').bind(created.id).all()).results[0];
  assert.equal(row.archived,1);
});

test('profile colors use safe hex values, preserve account ownership and reach public authors',async()=>{
  const a=await person(),b=await person(),initial=(await call('/profile',a)).data.profile;
  assert.equal(initial.nameColor,'#eeeeee');assert.equal(initial.primaryColor,'#181b22');assert.equal(initial.secondaryColor,'#121212');assert.equal(initial.bannerUrl,null);
  const changed=await call('/profile',a,'PATCH',{nameColor:'#Ab12Ef',primaryColor:'#012ABC',secondaryColor:'#345678',accountId:b.id});
  assert.equal(changed.status,200);assert.equal(changed.data.profile.nameColor,'#ab12ef');assert.equal(changed.data.profile.primaryColor,'#012abc');assert.equal(changed.data.profile.secondaryColor,'#345678');
  assert.equal((await call('/profile',b)).data.profile.nameColor,'#eeeeee');
  for(const value of ['red','#fff','#12345678','var(--secret)','url(https://outside.test/)',null,123]){
    assert.equal((await call('/profile',a,'PATCH',{nameColor:value})).status,400);
  }
  assert.equal((await call('/profile',a,'PATCH',{primaryColor:';color:red'})).status,400);
  assert.equal((await call('/profile',a,'PATCH',{secondaryColor:'#12345g'})).status,400);
  const sent=await send(a,'public','My chosen name color');assert.equal(sent.status,201);
  assert.equal(sent.data.message.author.nameColor,'#ab12ef');
  const otherView=(await call('/profile?id='+a.id,b)).data.profile;
  assert.equal(otherView.primaryColor,'#012abc');assert.equal(otherView.secondaryColor,'#345678');
  assert.doesNotMatch(JSON.stringify(otherView),/bannerKey|banner_key|avatarKey|avatar_key|Version/);
});

const animatedGif=readFileSync(new URL('./fixtures/chat/animated.gif',import.meta.url));
const bannerPng=readFileSync(new URL('./fixtures/chat/banner.png',import.meta.url));

test('static banners accept real 960 by 320 PNGs and keep image ownership and storage namespaces separate',async()=>{
  const a=await person(),b=await person(),outsider=await person('Outside',false),storage={...mediaEnv(),IMAGES:undefined};
  const ownAvatar=await call('/avatar',a,'PUT',realPng,{'Content-Type':'image/png'},storage);assert.equal(ownAvatar.status,200);
  const uploaded=await call('/banner',a,'PUT',bannerPng,{'Content-Type':'image/png'},storage);
  assert.equal(uploaded.status,200,JSON.stringify(uploaded.data));
  assert.equal(uploaded.data.profile.avatarUrl,ownAvatar.data.profile.avatarUrl);
  const path=uploaded.data.profile.bannerUrl.replace('/api/chat',''),key=[...storage.files.keys()].find(value=>value.startsWith('chat-banners/'));
  assert.match(key,new RegExp('^chat-banners/v1/'+a.id+'/[a-f0-9-]+\\.png$'));
  assert.ok(!Buffer.from(storage.files.get(key).body).includes(Buffer.from('private banner test metadata')));
  const image=await call(path,b,'GET',undefined,{'X-Kkeep-Profile':''},storage);
  assert.equal(image.status,200);assert.deepEqual(avatarDimensions(new Uint8Array(image.data),'image/png'),{width:960,height:320});
  assert.equal(image.response.headers.get('Content-Type'),'image/png');assert.equal(image.response.headers.get('X-Content-Type-Options'),'nosniff');
  assert.equal(image.response.headers.get('Cross-Origin-Resource-Policy'),'same-origin');assert.match(image.response.headers.get('Content-Security-Policy'),/sandbox/);
  assert.equal((await call(path,undefined,'GET',undefined,{'X-Kkeep-Profile':''},storage)).status,200);
  assert.equal((await call(path,outsider,'GET',undefined,{'X-Kkeep-Profile':''},storage)).status,200);
  assert.equal((await call(path,b,'GET',undefined,{'Sec-Fetch-Site':'cross-site'},storage)).status,403);
  assert.equal((await call('/banner/'+a.id,b,'DELETE',undefined,{},storage)).status,405);
  assert.equal((await call('/banner/'+a.id,b,'PUT',bannerPng,{'Content-Type':'image/png'},storage)).status,405);
  assert.equal((await call('/banner',b,'DELETE',undefined,{},storage)).data.profile.bannerUrl,null);
  assert.equal((await call(path,b,'GET',undefined,{},storage)).status,200);
  const unavailable={...storage,GAME_ASSETS:{...storage.GAME_ASSETS,async delete(){throw Error('Temporary storage outage');}}};
  const removed=await call('/banner',a,'DELETE',undefined,{},unavailable);
  assert.equal(removed.status,200);assert.equal(removed.data.profile.bannerUrl,null);assert.equal(removed.data.cleanupPending,true);
  assert.equal(removed.data.profile.avatarUrl,ownAvatar.data.profile.avatarUrl);
  assert.equal((await call(path,b,'GET',undefined,{},storage)).status,404);
  assert.equal((await call('/banner',a,'DELETE',undefined,{},storage)).data.cleanupPending,false);
  assert.equal(storage.files.size,1,'Banner cleanup must preserve the current avatar');
  const avatarKey=[...storage.files.keys()][0];
  await env.DB.prepare('UPDATE kkeep_chat_profiles SET banner_key=?,banner_type=?,banner_version=? WHERE account=?').bind(avatarKey,'image/png',randomUUID(),a.id).run();
  assert.equal((await call('/banner/'+a.id,b,'GET',undefined,{},storage)).status,404,'A banner read must not use another media namespace');
});

test('animated avatar and banner GIFs remain GIFs without IMAGES and reject malformed or oversized uploads',async()=>{
  const a=await person(),b=await person(),storage={...mediaEnv(),IMAGES:undefined};
  for(const kind of ['avatar','banner']){
    const uploaded=await call('/'+kind,a,'PUT',animatedGif,{'Content-Type':'image/gif'},storage);
    assert.equal(uploaded.status,200,JSON.stringify(uploaded.data));
    const path=uploaded.data.profile[kind+'Url'].replace('/api/chat','');
    const image=await call(path,b,'GET',undefined,{'X-Kkeep-Profile':''},storage);
    assert.equal(image.status,200);assert.equal(image.response.headers.get('Content-Type'),'image/gif');
    assert.match(image.response.headers.get('Content-Disposition'),/\.gif"$/);
    const bytes=Buffer.from(image.data);assert.equal(bytes.subarray(0,6).toString(),'GIF89a');
    assert.ok(bytes.includes(Buffer.from('NETSCAPE2.0')));assert.ok(!bytes.includes(Buffer.from('private camera test metadata')));
    assert.match([...storage.files.keys()].find(key=>key.startsWith('chat-'+kind+'s/')),/\.gif$/);
    assert.equal((await call('/'+kind,b,'PUT',animatedGif,{'Content-Type':'image/png'},storage)).status,415);
    assert.equal((await call('/'+kind,b,'PUT',animatedGif.subarray(0,animatedGif.length-1),{'Content-Type':'image/gif'},storage)).status,422);
    assert.equal((await call('/'+kind,b,'PUT',animatedGif,{'Content-Type':'image/gif','Content-Length':String(8*1024*1024+1)},storage)).status,413);
    assert.equal((await call('/'+kind,b,'PUT',realPng,{'Content-Type':'image/png','Content-Length':String(2*1024*1024+1)},storage)).status,413);
  }
  assert.equal((await call('/blocks',b,'POST',{accountId:a.id})).status,200);
  for(const kind of ['avatar','banner'])assert.equal((await call('/'+kind+'/'+a.id,b,'GET',undefined,{'X-Kkeep-Profile':''},storage)).status,404);
});

test('banner leases reject stale uploads and a block during a media read prevents image disclosure',async()=>{
  const a=await person(),b=await person(),storage={...mediaEnv(),IMAGES:undefined};
  assert.equal((await call('/banner',a,'PUT',bannerPng,{'Content-Type':'image/png'},storage)).status,200);
  let intercepted=false;
  const delayed={...storage,GAME_ASSETS:{...storage.GAME_ASSETS,async put(key,stream,metadata){
    await storage.GAME_ASSETS.put(key,stream,metadata);
    if(!intercepted){intercepted=true;assert.equal((await call('/banner',a,'DELETE',undefined,{},storage)).status,200);}
  }}};
  const stale=await call('/banner',a,'PUT',bannerPng,{'Content-Type':'image/png'},delayed);
  assert.equal(stale.status,409);assert.equal(stale.data.code,'profile_changed');assert.equal(storage.files.size,0);
  assert.equal((await call('/session',a)).data.profile.bannerUrl,null);
  const saved=await call('/banner',a,'PUT',bannerPng,{'Content-Type':'image/png'},storage);assert.equal(saved.status,200);
  const blockedDuringRead={...storage,GAME_ASSETS:{...storage.GAME_ASSETS,async get(key){
    const file=await storage.GAME_ASSETS.get(key);
    assert.equal((await call('/blocks',b,'POST',{accountId:a.id})).status,200);
    return file;
  }}};
  assert.equal((await call(saved.data.profile.bannerUrl.replace('/api/chat',''),b,'GET',undefined,{'X-Kkeep-Profile':''},blockedDuringRead)).status,404);
});
