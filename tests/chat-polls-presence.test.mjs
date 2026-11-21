import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {chatApi} from '../worker/chat.ts';
import {digest} from '../worker/profile.ts';
import {env as base} from './chat-environment.mjs';

const origin='https://kkeep.test',env={...base},knownOwner='342d1bf6-2554-4344-82ea-8ead8a7ed5a9';
async function call(path,who,method='GET',input,targetEnv=env){
  const response=await chatApi(new Request(origin+'/api/chat'+path,{method,headers:{'X-Kkeep-Profile':'1',Origin:origin,...(who?{Cookie:who.cookie}:{}),...(input!==undefined?{'Content-Type':'application/json'}:{})},body:input===undefined?undefined:JSON.stringify(input)}),targetEnv);
  return {status:response.status,data:await response.json()};
}
async function person(join=true,owner=false){
  const id=owner?knownOwner:randomUUID(),username=owner?'owner':'player'+randomBytes(4).toString('hex'),token=randomBytes(32).toString('hex');
  await env.DB.prepare('INSERT INTO kkeep_accounts (id,username,name,password,created) VALUES (?,?,?,?,?)').bind(id,username,username,'unused',Date.now()).run();
  await env.DB.prepare('INSERT INTO kkeep_sessions (token,account,expires) VALUES (?,?,?)').bind(await digest(token),id,Date.now()+3600000).run();
  const who={id,username,cookie:'__Host-kkeep-profile='+token};if(join)assert.equal((await call('/join',who,'POST',{})).status,200);return who;
}
let ownerFixture;
async function owner(){return ownerFixture??=await person(true,true);}
function payload(roomId='public',multiple=false){return {roomId,question:'Which game should we play?',options:['Brawlhalla','Roblox','Stick Fight'],allowMultiple:multiple,closesAt:Date.now()+600000,clientId:randomUUID()};}
async function makePoll(who,input=payload()){const result=await call('/polls',who,'POST',input);assert.equal(result.status,201,JSON.stringify(result.data));return result.data.message;}
async function vote(who,poll,optionIds,targetEnv=env){return call('/polls/'+poll.messageId+'/vote',who,'PUT',{optionIds},targetEnv);}
async function moderate(target,action){return call('/members/'+target.id+'/moderation',await owner(),'POST',{action,...(action==='timeout'?{durationMinutes:5}:{})});}
async function manager(){
  const who=await person(),created=await call('/roles',await owner(),'POST',{name:'Poll manager '+randomBytes(3).toString('hex'),color:'#75aaff',position:20,permissions:['manage_channels']});assert.equal(created.status,201);
  assert.equal((await call('/members/'+who.id+'/roles',await owner(),'PUT',{roleIds:[created.data.role.id]})).status,200);return {who,role:created.data.role};
}
function beforeBatch(callback,targetEnv=env){let done=false;return {...targetEnv,DB:{...targetEnv.DB,async batch(operations){if(!done){done=true;await callback();}return targetEnv.DB.batch(operations);}}};}
function beforeRun(match,callback,targetEnv=env){
  let done=false;const wrap=(query,sql,args=[])=>({bind(...values){return wrap(query.bind(...values),sql,values);},all:()=>query.all(),async run(){if(!done&&match(sql,args)){done=true;await callback();}return query.run();}});
  return {...targetEnv,DB:{...targetEnv.DB,prepare(sql){return wrap(targetEnv.DB.prepare(sql),sql);}}};
}
const presence=(who,clientId,sequence,online=true,targetEnv=env)=>call('/presence',who,online?'PUT':'DELETE',{clientId,sequence},targetEnv);
const roster=who=>call('/presence?limit=100',who);

test('read-only polls are created by channel managers and voted on by ordinary members with public aggregate results',async()=>{
  const a=await person(),b=await person(),input=payload('channel:polls',true);
  assert.equal((await call('/polls',a,'POST',input)).status,403);
  const message=await makePoll(await owner(),input),poll=message.poll;assert.ok(poll);assert.equal(message.roomId,'channel:polls');assert.equal(poll.canClose,true);
  const first=await vote(a,poll,[poll.options[0].id,poll.options[1].id]);assert.equal(first.status,200,JSON.stringify(first.data));
  const second=await vote(b,poll,[poll.options[1].id]);assert.equal(second.status,200);
  assert.equal(second.data.poll.totalVoters,2);assert.equal(second.data.poll.totalVotes,3);
  assert.deepEqual(second.data.poll.options.map(option=>option.votes),[1,2,0]);assert.deepEqual(second.data.poll.options.map(option=>option.percentage),[50,100,0]);
  assert.deepEqual(second.data.poll.viewerOptionIds,[poll.options[1].id]);assert.equal(second.data.poll.options[1].selected,true);
  const guest=await call('/polls/'+message.id);assert.equal(guest.status,200);assert.equal(guest.data.poll.canVote,false);assert.equal(guest.data.poll.canClose,false);assert.deepEqual(guest.data.poll.viewerOptionIds,[]);
  assert.doesNotMatch(JSON.stringify(guest.data),new RegExp(a.id+'|'+b.id+'|account|ballot|clientId'));
  const history=await call('/messages?room='+encodeURIComponent('channel:polls'));
  assert.equal(history.data.messages.find(item=>item.id===message.id).poll.totalVotes,3);
});

test('single-choice ballots can change or be removed, and repeated votes never add a second ballot',async()=>{
  const creator=await person(),voter=await person(),message=await makePoll(creator),poll=message.poll;
  assert.equal((await vote(voter,poll,[poll.options[0].id,poll.options[1].id])).status,400);
  assert.equal((await vote(voter,poll,[poll.options[0].id,poll.options[0].id])).status,400);
  assert.equal((await vote(voter,poll,[randomUUID()])).status,400);
  for(let attempt=0;attempt<3;attempt++)assert.equal((await vote(voter,poll,[poll.options[0].id])).data.poll.totalVoters,1);
  const changed=await vote(voter,poll,[poll.options[2].id]);assert.deepEqual(changed.data.poll.options.map(option=>option.votes),[0,0,1]);assert.equal(changed.data.poll.totalVotes,1);
  const removed=await vote(voter,poll,[]);assert.equal(removed.data.poll.totalVoters,0);assert.equal(removed.data.poll.totalVotes,0);assert.deepEqual(removed.data.poll.options.map(option=>option.percentage),[0,0,0]);
  const count=(await env.DB.prepare('SELECT COUNT(*) AS n FROM kkeep_chat_poll_ballots WHERE message=?').bind(message.id).all()).results[0].n;assert.equal(count,0);
});

test('poll creation is retry-safe across expiration and cannot reuse a text message send ID',async()=>{
  const creator=await person(),input=payload(),first=await makePoll(creator,input);
  const retry=await call('/polls',creator,'POST',input);assert.equal(retry.status,200);assert.equal(retry.data.message.id,first.id);
  assert.equal((await call('/polls',creator,'POST',{...input,options:['Different','Choices']})).status,409);
  const historicalEnd=Date.now()-1000;await env.DB.prepare('UPDATE kkeep_chat_polls SET closes_at=? WHERE message=?').bind(historicalEnd,first.id).run();
  const historicalRetry=await call('/polls',creator,'POST',{...input,closesAt:historicalEnd});assert.equal(historicalRetry.status,200);assert.equal(historicalRetry.data.message.id,first.id);assert.equal(historicalRetry.data.message.poll.closed,true);
  assert.equal((await call('/messages',creator,'POST',{roomId:'public',clientId:input.clientId,text:input.question})).status,409);
  const textId=randomUUID();assert.equal((await call('/messages',creator,'POST',{roomId:'public',clientId:textId,text:input.question})).status,201);
  assert.equal((await call('/polls',creator,'POST',{...payload(),clientId:textId})).status,409);
});

test('simultaneous text and poll sends cannot convert the winning message type',async()=>{
  const creator=await person(),input=payload();
  const textWins=beforeBatch(async()=>{assert.equal((await call('/messages',creator,'POST',{roomId:'public',clientId:input.clientId,text:input.question})).status,201);});
  assert.equal((await call('/polls',creator,'POST',input,textWins)).status,409);
  const second=payload(),pollWins=beforeBatch(async()=>{assert.equal((await call('/polls',creator,'POST',second)).status,201);});
  assert.equal((await call('/messages',creator,'POST',{roomId:'public',clientId:second.clientId,text:second.question},pollWins)).status,409);
  const rows=(await env.DB.prepare('SELECT kind FROM kkeep_chat_messages WHERE author=? AND client_id IN (?,?) ORDER BY id').bind(creator.id,input.clientId,second.clientId).all()).results;
  assert.deepEqual(rows.map(row=>row.kind),['text','poll']);
});

test('poll bodies, choices, deadlines, enrollment, and guest participation are bounded',async()=>{
  const creator=await person(),outsider=await person(false),input=payload();
  assert.equal((await call('/polls',undefined,'POST',input)).status,401);
  assert.equal((await call('/polls',outsider,'POST',input)).status,403);
  for(const patch of [{question:'x'.repeat(241)},{question:'\u200B\u2060'},{options:['One']},{options:Array.from({length:11},(_,i)=>'Option '+i)},{options:['Same',' same ']},{options:['Roblox','Rob\u200Blox']},{options:['x'.repeat(101),'Other']},{closesAt:Date.now()+100},{closesAt:Date.now()+31*86400000},{allowMultiple:'yes'},{roomId:randomUUID()}]){
    assert.equal((await call('/polls',creator,'POST',{...input,...patch,clientId:randomUUID()})).status,400,JSON.stringify(patch));
  }
  const poll=(await makePoll(creator)).poll;
  assert.equal((await vote(undefined,poll,[poll.options[0].id])).status,401);assert.equal((await vote(outsider,poll,[poll.options[0].id])).status,403);
  assert.equal((await moderate(creator,'timeout')).status,200);assert.equal((await call('/polls',creator,'POST',payload())).data.code,'chat_timeout');assert.equal((await vote(creator,poll,[poll.options[0].id])).data.code,'chat_timeout');
  assert.equal((await moderate(creator,'untimeout')).status,200);assert.equal((await moderate(creator,'ban')).status,200);assert.equal((await vote(creator,poll,[poll.options[0].id])).data.code,'chat_banned');
});

test('expiry and early close stop voting without a cron job, with creator and current manager authority',async()=>{
  const creator=await person(),voter=await person(),other=await person(),managed=await manager(),first=await makePoll(creator),poll=first.poll;
  assert.equal((await call('/polls/'+first.id+'/close',other,'POST',{})).status,403);
  assert.equal((await vote(voter,poll,[poll.options[1].id])).status,200);
  const closed=await call('/polls/'+first.id+'/close',managed.who,'POST',{});assert.equal(closed.status,200);assert.equal(closed.data.poll.closed,true);assert.ok(closed.data.poll.closedAt<=closed.data.poll.serverNow);
  assert.equal((await vote(voter,poll,[])).data.code,'poll_closed');assert.equal((await call('/polls/'+first.id)).data.poll.totalVoters,1);
  const own=await makePoll(creator);assert.equal((await call('/polls/'+own.id+'/close',creator,'POST',{})).status,200);
  const expired=await makePoll(creator),end=Date.now()-1000;await env.DB.prepare('UPDATE kkeep_chat_polls SET closes_at=? WHERE message=?').bind(end,expired.id).run();
  const result=await call('/polls/'+expired.id);assert.equal(result.data.poll.closed,true);assert.equal(result.data.poll.closedAt,end);assert.equal(result.data.poll.canVote,false);assert.equal(result.data.poll.canClose,false);
  assert.equal((await vote(voter,expired.poll,[expired.poll.options[0].id])).status,409);
});

test('archived, deleted, and blocked polls cannot be read or changed by an unauthorized voter',async()=>{
  const creator=await person(),voter=await person(),channel=await call('/channels',await owner(),'POST',{name:'poll-test-'+randomBytes(3).toString('hex')});assert.equal(channel.status,201);
  const archived=await makePoll(creator,payload(channel.data.channel.id));assert.equal((await call('/channels/'+encodeURIComponent(channel.data.channel.id),await owner(),'DELETE')).status,200);
  assert.equal((await call('/polls/'+archived.id)).status,404);assert.equal((await vote(voter,archived.poll,[archived.poll.options[0].id])).status,404);
  const deleted=await makePoll(creator);assert.equal((await call('/messages/'+deleted.id,creator,'DELETE')).status,200);
  assert.equal((await call('/polls/'+deleted.id)).status,404);assert.equal((await vote(voter,deleted.poll,[deleted.poll.options[0].id])).status,404);
  const tombstone=(await call('/messages?room=public')).data.messages.find(message=>message.id===deleted.id);assert.equal(tombstone.text,'');assert.equal(tombstone.poll,undefined);
  const blocked=await makePoll(creator);assert.equal((await call('/blocks',voter,'POST',{accountId:creator.id})).status,200);
  assert.equal((await call('/polls/'+blocked.id,voter)).status,404);assert.equal((await vote(voter,blocked.poll,[blocked.poll.options[0].id])).status,404);
  assert.equal((await call('/polls/'+blocked.id)).status,200,'The channel remains public to guests');
});

test('fresh write checks reject expiry, deletion, bans, and role revocation between poll reads and writes',async()=>{
  const creator=await person(),voter=await person(),first=await makePoll(creator);
  const expired=beforeBatch(async()=>{await env.DB.prepare('UPDATE kkeep_chat_polls SET closes_at=? WHERE message=?').bind(Date.now()-1,first.id).run();});
  assert.equal((await vote(voter,first.poll,[first.poll.options[0].id],expired)).data.code,'poll_closed');
  const second=await makePoll(creator),deleted=beforeBatch(async()=>{assert.equal((await call('/messages/'+second.id,creator,'DELETE')).status,200);});
  assert.equal((await vote(voter,second.poll,[second.poll.options[0].id],deleted)).status,404);
  const third=await makePoll(creator),banned=beforeBatch(async()=>{assert.equal((await moderate(voter,'ban')).status,200);});
  assert.equal((await vote(voter,third.poll,[third.poll.options[0].id],banned)).status,403);
  assert.equal((await call('/polls/'+third.id)).data.poll.totalVoters,0);
  const managed=await manager(),creation=payload('channel:polls'),revoked=beforeBatch(async()=>{assert.equal((await call('/roles/'+managed.role.id,await owner(),'DELETE')).status,200);});
  assert.equal((await call('/polls',managed.who,'POST',creation,revoked)).status,403);
  assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM kkeep_chat_messages WHERE author=? AND client_id=?').bind(managed.who.id,creation.clientId).all()).results[0].n,0);
  const closer=await manager(),fourth=await makePoll(creator),closeRevoked=beforeBatch(async()=>{assert.equal((await call('/roles/'+closer.role.id,await owner(),'DELETE')).status,200);});
  assert.equal((await call('/polls/'+fourth.id+'/close',closer.who,'POST',{},closeRevoked)).status,403);assert.equal((await call('/polls/'+fourth.id)).data.poll.closed,false);
});

test('poll changes use their own coalesced cursor and leave normal message history cursors intact',async()=>{
  const creator=await person(),voter=await person(),channel=await call('/channels',await owner(),'POST',{name:'poll-cursor-'+randomBytes(3).toString('hex')});assert.equal(channel.status,201);
  const room=channel.data.channel.id,a=await makePoll(creator,payload(room)),b=await makePoll(creator,payload(room));
  const initial=await call('/messages?room='+encodeURIComponent(room)+'&limit=1',voter);assert.equal(initial.data.messages[0].id,b.id);assert.equal(initial.data.hasMore,true);
  const older=await call('/messages?room='+encodeURIComponent(room)+'&before='+b.id,voter);assert.equal(older.data.messages[0].poll.messageId,a.id);
  assert.equal((await vote(voter,a.poll,[a.poll.options[0].id])).status,200);assert.equal((await vote(voter,a.poll,[a.poll.options[1].id])).status,200);assert.equal((await vote(voter,b.poll,[b.poll.options[2].id])).status,200);
  const path='/messages?room='+encodeURIComponent(room)+'&after='+initial.data.cursor+'&pollAfter='+initial.data.pollCursor;
  const changed=await call(path+'&limit=1',voter);assert.deepEqual(changed.data.messages,[]);assert.equal(changed.data.cursor,initial.data.cursor);assert.equal(changed.data.pollUpdates.length,1);assert.equal(changed.data.pollHasMore,true);
  const next=await call('/messages?room='+encodeURIComponent(room)+'&after='+changed.data.cursor+'&pollAfter='+changed.data.pollCursor+'&limit=1',voter);
  assert.equal(next.data.pollUpdates.length,1);assert.equal(next.data.pollHasMore,false);assert.notEqual(next.data.pollUpdates[0].id,changed.data.pollUpdates[0].id);
  const quiet=await call('/messages?room='+encodeURIComponent(room)+'&after='+next.data.cursor+'&pollAfter='+next.data.pollCursor,voter);assert.deepEqual(quiet.data.pollUpdates,[]);
  const changes=(await env.DB.prepare('SELECT COUNT(*) AS n FROM kkeep_chat_poll_updates WHERE message=?').bind(a.id).all()).results[0].n;assert.equal(changes,1,'Only the latest poll-change marker is retained');
});

test('presence is based on enrolled per-tab activity, expires, and never exposes private activity metadata',async()=>{
  const member=await person(),outsider=await person(false),client=randomUUID();
  assert.equal((await presence(undefined,client,1)).status,401);assert.equal((await presence(outsider,client,1)).status,403);
  assert.equal((await presence(member,'invalid',1)).status,400);assert.equal((await presence(member,client,0)).status,400);
  let page=await roster();assert.equal(page.data.members.find(item=>item.user.id===member.id).online,false);assert.ok(!page.data.members.some(item=>item.user.id===outsider.id));
  const beat=await presence(member,client,1);assert.equal(beat.status,200);assert.equal(beat.data.online,true);assert.ok(beat.data.expiresAt-beat.data.serverNow<=90000&&beat.data.expiresAt-beat.data.serverNow>=89000);
  page=await roster();assert.equal(page.data.members.find(item=>item.user.id===member.id).online,true);
  assert.doesNotMatch(JSON.stringify(page.data),/lastSeen|last_seen|expires|clientId|sequence|session|timeoutUntil|reason/);
  await env.DB.prepare('UPDATE kkeep_chat_presence SET expires=? WHERE account=?').bind(Date.now()-1,member.id).run();
  page=await roster();assert.equal(page.data.members.find(item=>item.user.id===member.id).online,false);
});

test('multiple tabs and reordered presence requests cannot take another active tab offline',async()=>{
  const member=await person(),other=await person(),one=randomUUID(),two=randomUUID();
  assert.equal((await presence(member,one,1)).status,200);assert.equal((await presence(member,two,1)).status,200);
  assert.equal((await presence(member,one,2,false)).data.online,false);assert.equal((await roster()).data.members.find(item=>item.user.id===member.id).online,true);
  assert.equal((await presence(member,one,1)).data.online,false,'A late heartbeat cannot undo the same tab’s leave');
  assert.equal((await presence(other,two,2,false)).status,200);assert.equal((await roster()).data.members.find(item=>item.user.id===member.id).online,true,'A different account cannot change this tab lease');
  assert.equal((await presence(member,two,2,false)).data.online,false);assert.equal((await roster()).data.members.find(item=>item.user.id===member.id).online,false);
  assert.equal((await presence(member,one,3)).data.online,true);assert.equal((await presence(member,one,2,false)).data.online,true,'A stale leave cannot override a newer heartbeat');
  assert.equal((await roster()).data.members.find(item=>item.user.id===member.id).online,true);
});

test('roster rows and group counts both honor blocks and bans, while timed-out readers can remain visibly active',async()=>{
  const a=await person(),b=await person(),timed=await person();
  assert.equal((await presence(a,randomUUID(),1)).status,200);assert.equal((await presence(b,randomUUID(),1)).status,200);assert.equal((await moderate(timed,'timeout')).status,200);assert.equal((await presence(timed,randomUUID(),1)).status,200);
  const publicBefore=await roster();assert.equal(publicBefore.data.members.find(item=>item.user.id===timed.id).online,true);
  assert.equal((await call('/blocks',a,'POST',{accountId:b.id})).status,200);
  const mine=await roster(a),theirs=await roster(b),guest=await roster();assert.ok(!mine.data.members.some(item=>item.user.id===b.id));assert.ok(!theirs.data.members.some(item=>item.user.id===a.id));
  assert.equal(mine.data.onlineCount,guest.data.onlineCount-1);assert.equal(theirs.data.onlineCount,guest.data.onlineCount-1);
  assert.equal((await moderate(b,'ban')).status,200);const banned=await roster();assert.ok(!banned.data.members.some(item=>item.user.id===b.id));assert.equal(banned.data.onlineCount,guest.data.onlineCount-1);
  assert.equal((await presence(b,randomUUID(),1)).data.code,'chat_banned');
});

test('public roster pagination stays bounded and reports counts for all visible members',async()=>{
  const seen=[],first=await call('/presence?limit=3');assert.ok(first.data.members.length<=3);let page=first;
  for(let n=0;n<100;n++){
    seen.push(...page.data.members);if(!page.data.hasMore)break;
    assert.ok(page.data.nextCursor);page=await call('/presence?limit=3&cursor='+encodeURIComponent(page.data.nextCursor));assert.equal(page.status,200);assert.ok(page.data.members.length<=3);
  }
  assert.equal(new Set(seen.map(item=>item.user.id)).size,seen.length);assert.equal(seen.length,first.data.onlineCount+first.data.offlineCount);
  assert.equal(seen.filter(item=>item.online).length,first.data.onlineCount);
  const firstOffline=seen.findIndex(item=>!item.online);assert.ok(firstOffline<0||seen.slice(firstOffline).every(item=>!item.online));
  assert.equal((await call('/presence?cursor=malformed')).status,400);
});

test('presence cannot race a ban and limits tab leases without breaking an existing tab',async()=>{
  const banned=await person(),client=randomUUID();
  const race=beforeRun(sql=>sql.startsWith('INSERT INTO kkeep_chat_presence'),async()=>{assert.equal((await moderate(banned,'ban')).status,200);});
  assert.equal((await presence(banned,client,1,true,race)).status,409);
  assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM kkeep_chat_presence WHERE account=?').bind(banned.id).all()).results[0].n,0);
  const busy=await person(),clients=Array.from({length:32},()=>randomUUID());
  for(const tab of clients)assert.equal((await presence(busy,tab,1)).status,200);
  assert.equal((await presence(busy,randomUUID(),1)).status,409);assert.equal((await presence(busy,clients[0],2)).status,200);
  await env.DB.prepare('UPDATE kkeep_chat_presence SET expires=?,updated=? WHERE account=?').bind(Date.now()-1000,Date.now()-301000,busy.id).run();
  assert.equal((await presence(busy,randomUUID(),1)).status,200);
});

test('new profile frames and extended cosmetics persist publicly through their allowlisted identifiers',async()=>{
  const member=await person();
  const saved=await call('/profile',member,'PATCH',{avatarDecoration:'watcher',nameplateStyle:'embers',profileFrame:'gilded-thorns'});assert.equal(saved.status,200);
  const profile=(await call('/profile?id='+member.id)).data.profile;assert.equal(profile.avatarDecoration,'watcher');assert.equal(profile.nameplateStyle,'embers');assert.equal(profile.profileFrame,'gilded-thorns');
  assert.equal((await call('/profile',member,'PATCH',{profileFrame:'https://foreign.test/frame.svg'})).status,400);
});
