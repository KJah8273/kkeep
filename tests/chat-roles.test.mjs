import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {chatApi} from '../worker/chat.ts';
import {digest} from '../worker/profile.ts';
import {normalizeText} from '../lib/chat-moderation.ts';
import {env as base} from './chat-environment.mjs';

const origin='https://kkeep.test',trusted='verified-owner@example.test',knownOwner='342d1bf6-2554-4344-82ea-8ead8a7ed5a9';
const env={...base,KKEEP_ANALYTICS_OWNER_EMAIL:trusted};
async function call(path,who,method='GET',input,extra={},targetEnv=env){
  const headers={'X-Kkeep-Profile':'1',Origin:origin,...(who?{Cookie:who.cookie}:{}),...extra};
  let body;
  if(input!==undefined){headers['Content-Type']??='application/json';body=headers['Content-Type']==='application/json'?JSON.stringify(input):input;}
  const response=await chatApi(new Request(origin+'/api/chat'+path,{method,headers,body}),targetEnv);
  const data=(response.headers.get('Content-Type')||'').includes('application/json')?await response.json():new Uint8Array(await response.arrayBuffer());
  return {status:response.status,data,response};
}
async function person(label='Member',options={},targetEnv=env){
  const id=options.id||randomUUID(),username=options.username||label.toLowerCase()+randomBytes(4).toString('hex'),token=randomBytes(32).toString('hex');
  await targetEnv.DB.prepare('INSERT INTO kkeep_accounts (id,username,name,password,created) VALUES (?,?,?,?,?)').bind(id,username,options.name||label,'unused-test-password',Date.now()).run();
  await targetEnv.DB.prepare('INSERT INTO kkeep_sessions (token,account,expires) VALUES (?,?,?)').bind(await digest(token),id,Date.now()+3600000).run();
  const who={id,username,cookie:'__Host-kkeep-profile='+token};
  if(options.join!==false)assert.equal((await call('/join',who,'POST',{}, {},targetEnv)).status,200);
  return who;
}
let ownerFixture;
async function owner(){return ownerFixture??=await person('Owner',{id:knownOwner,username:'owner',name:'The.'});}
async function role(permissions=[],position=10,name='Role '+randomBytes(3).toString('hex')){
  const result=await call('/roles',await owner(),'POST',{name,color:'#Ab34Ef',permissions,position});
  assert.equal(result.status,201,JSON.stringify(result.data));return result.data.role;
}
async function assign(who,roles){const result=await call('/members/'+who.id+'/roles',await owner(),'PUT',{roleIds:roles.map(item=>item.id)});assert.equal(result.status,200,JSON.stringify(result.data));return result.data.profile;}
async function moderate(actor,target,action,durationMinutes=5){return call('/members/'+target.id+'/moderation',actor,'POST',{action,...(action==='timeout'?{durationMinutes}:{}),reason:'Synthetic local test'});}
async function send(who,room='public',text='Local test',targetEnv=env){return call('/messages',who,'POST',{roomId:room,text,clientId:randomUUID()},{},targetEnv);}
async function dm(a,b){
  const request=await call('/friends',a,'POST',{accountId:b.id});assert.equal(request.status,200);
  assert.equal((await call('/friends/'+request.data.id,b,'POST',{action:'accept'})).status,200);
  const result=await call('/conversations',a,'POST',{accountId:b.id});assert.equal(result.status,200);return result.data.conversation.id;
}
function interceptRun(targetEnv,check,callback){
  let done=false;
  const wrap=(query,sql,args=[])=>({
    bind(...values){return wrap(query.bind(...values),sql,values);},all:()=>query.all(),
    async run(){if(!done&&check(sql,args)){done=true;await callback();}return query.run();}
  });
  return {...targetEnv,DB:{...targetEnv.DB,prepare(sql){return wrap(targetEnv.DB.prepare(sql),sql);}}};
}

test('the exact authorized owner account binds durably and public handles use username, not legacy name',async()=>{
  const who=await owner(),session=await call('/session',who);
  assert.equal(session.data.account.name,'The.');assert.equal(session.data.account.username,'owner');
  assert.equal(session.data.profile.username,'owner');assert.equal(session.data.profile.name,'owner');
  assert.equal(session.data.profile.displayName,'The.');assert.equal(session.data.profile.isOwner,true);assert.deepEqual(session.data.profile.roles,[]);
  assert.equal(session.data.access.isOwner,true);assert.equal(session.data.access.canManageRoles,true);assert.equal(session.data.access.permissions.length,4);
  await env.DB.prepare('UPDATE kkeep_accounts SET username=? WHERE id=?').bind('renamedowner',who.id).run();
  assert.equal((await call('/session',who)).data.access.isOwner,true,'A handle edit must preserve immutable ownership');
  await env.DB.prepare('UPDATE kkeep_accounts SET username=? WHERE id=?').bind('owner',who.id).run();
  const publicView=await call('/profile?id='+who.id);
  assert.equal(publicView.status,200);assert.equal(publicView.data.profile.username,'owner');assert.equal(publicView.data.profile.isOwner,true);
});

test('an owner-looking username grants nothing and trusted fallback claiming cannot replace a binding',async()=>{
  const isolatedBase=(await import('./chat-environment.mjs?owner-claim')).env,isolated={...isolatedBase,KKEEP_ANALYTICS_OWNER_EMAIL:trusted};
  const lookalike=await person('Owner',{username:'owner'},isolated),other=await person('Other',{},isolated);
  assert.equal((await call('/session',lookalike,'GET',undefined,{},isolated)).data.access.isOwner,false);
  assert.equal((await call('/owner/claim',lookalike,'POST',{}, {},isolated)).status,403);
  assert.equal((await call('/owner/claim',lookalike,'POST',{}, {'oai-authenticated-user-email':'wrong@example.test'},isolated)).status,403);
  assert.equal((await call('/owner/claim',undefined,'POST',{}, {'oai-authenticated-user-email':trusted},isolated)).status,401);
  assert.equal((await call('/session',lookalike,'GET',undefined,{'oai-authenticated-user-email':trusted},isolated)).data.access.canClaimOwner,true);
  assert.equal((await call('/owner/claim',lookalike,'POST',{}, {'oai-authenticated-user-email':trusted},isolated)).status,200);
  assert.equal((await call('/session',lookalike,'GET',undefined,{},isolated)).data.access.isOwner,true);
  assert.equal((await call('/owner/claim',other,'POST',{}, {'oai-authenticated-user-email':trusted},isolated)).status,409);
  assert.equal((await call('/session',other,'GET',undefined,{'oai-authenticated-user-email':trusted},isolated)).data.access.isOwner,false);
});

test('guest access exposes active public chat and enrolled profiles without friend or DM metadata',async()=>{
  const a=await person(),b=await person(),privateAccount=await person('Private',{join:false}),room=await dm(a,b);
  const privateMessage=await send(a,room,'Never public');assert.equal(privateMessage.status,201);
  const publicMessage=await send(a,'public','Public for guests');assert.equal(publicMessage.status,201);
  const history=await call('/messages?room=public');assert.equal(history.status,200);
  assert.ok(history.data.messages.some(message=>message.id===publicMessage.data.message.id));
  assert.ok(history.data.messages.every(message=>message.roomId==='public'&&message.clientId===undefined));
  assert.equal((await call('/messages?room='+room)).status,401);
  assert.equal((await call('/messages?room='+room+'&after=0')).status,401);
  for(const path of ['/friends','/conversations','/blocks','/members','/members/'+a.id+'/moderation'])assert.equal((await call(path)).status,401);
  assert.equal((await call('/profile?id='+privateAccount.id)).status,404);
  assert.equal((await call('/profile?id='+a.id)).status,200);
  const found=(await call('/people?q='+b.username)).data.people;
  assert.equal(found[0].relationship,'none');assert.equal(found[0].requestId,undefined);
  assert.doesNotMatch(JSON.stringify(found),/password|token|avatarKey|bannerKey|search_key|timeoutUntil|banned|reason/);
  assert.equal((await send(undefined)).status,401);
  assert.equal((await call('/profile',undefined,'PATCH',{displayName:'Cannot edit'})).status,401);
  const made=await call('/channels',await owner(),'POST',{name:'guest-'+randomBytes(4).toString('hex')});assert.equal(made.status,201);
  const publicRoom=made.data.channel.id;
  assert.equal((await call('/messages?room='+encodeURIComponent(publicRoom))).status,200);
  assert.equal((await call('/channels/'+encodeURIComponent(publicRoom),await owner(),'DELETE')).status,200);
  assert.equal((await call('/messages?room='+encodeURIComponent(publicRoom))).status,403);
});

test('profile decorations and nameplates are allowlisted, public, and independent of role authority',async()=>{
  const a=await person();
  const saved=await call('/profile',a,'PATCH',{avatarDecoration:'sakura',nameplateStyle:'ravens',isOwner:true,roles:[{id:'owner'}]});
  assert.equal(saved.status,200);assert.equal(saved.data.profile.avatarDecoration,'sakura');assert.equal(saved.data.profile.nameplateStyle,'ravens');assert.equal(saved.data.profile.isOwner,false);assert.deepEqual(saved.data.profile.roles,[]);
  const publicView=(await call('/profile?id='+a.id)).data.profile;
  assert.equal(publicView.avatarDecoration,'sakura');assert.equal(publicView.nameplateStyle,'ravens');
  assert.equal((await call('/profile',a,'PATCH',{avatarDecoration:'url(https://foreign.test/)'})).status,400);
  assert.equal((await call('/profile',a,'PATCH',{nameplateStyle:'<svg onload=alert(1)>'})).status,400);
});

test('only the durable owner defines and assigns colored roles, and deletion immediately revokes capabilities',async()=>{
  const member=await person(),custom=await role(['manage_channels'],25);
  assert.equal(custom.color,'#ab34ef');
  assert.equal((await call('/roles',member,'POST',{name:'Admin',permissions:['ban_members']})).status,403);
  assert.equal((await call('/roles/'+custom.id,member,'PATCH',{permissions:['ban_members']})).status,403);
  assert.equal((await call('/members/'+member.id+'/roles',member,'PUT',{roleIds:[custom.id]})).status,403);
  assert.equal((await call('/members/'+member.id+'/roles',member,'PUT',{roleIds:[custom.id]}, {'oai-authenticated-user-email':trusted})).status,403);
  assert.equal((await call('/roles',await owner(),'POST',{name:'Invalid',permissions:['owner']})).status,400);
  assert.equal((await call('/roles',await owner(),'POST',{name:'Invalid',color:'red',permissions:[]})).status,400);
  const profile=await assign(member,[custom]);assert.equal(profile.roles[0].id,custom.id);assert.equal(profile.isOwner,false);
  let session=(await call('/session',member)).data;
  assert.deepEqual(session.access.permissions,['manage_channels']);assert.equal(session.access.canManageRoles,false);
  assert.equal((await call('/channels',member)).data.canManageChannels,true);
  assert.equal((await send(member,'channel:rules','Role-managed announcement')).status,201);
  assert.equal((await call('/members/'+member.id+'/roles',await owner(),'PUT',{roleIds:[randomUUID()]})).status,409);
  assert.equal((await call('/profile',member)).data.profile.roles[0].id,custom.id,'A vanished selection must not clear existing roles');
  assert.equal((await call('/roles/'+custom.id,await owner(),'DELETE')).status,200);
  session=(await call('/session',member)).data;assert.deepEqual(session.access.permissions,[]);assert.deepEqual(session.profile.roles,[]);
  assert.equal((await call('/channels',member,'POST',{name:'no-longer-allowed'})).status,403);
  assert.equal((await send(member,'channel:rules','Permission removed')).status,403);
});

test('moderators follow hierarchy, timeouts and bans are reversible, and restrictions cover public and private participation',async()=>{
  const mod=await person(),low=await person(),peer=await person(),high=await person(),friend=await person();
  const moderator=await role(['delete_messages','timeout_members','ban_members'],60),lower=await role([],20),higher=await role([],80);
  await assign(mod,[moderator]);await assign(peer,[moderator]);await assign(low,[lower]);await assign(high,[higher]);
  const room=await dm(low,friend);
  for(const protectedUser of [mod,peer,high,await owner()]){
    assert.equal((await moderate(mod,protectedUser,'timeout')).status,403);
    assert.equal((await moderate(mod,protectedUser,'ban')).status,403);
  }
  assert.equal((await moderate(mod,low,'timeout',40321)).status,400);
  const timed=await moderate(mod,low,'timeout',5);assert.equal(timed.status,200,JSON.stringify(timed.data));assert.ok(timed.data.moderation.timeoutUntil>Date.now());
  assert.equal((await send(low)).data.code,'chat_timeout');assert.equal((await send(low,room)).data.code,'chat_timeout');
  assert.equal((await call('/friends',low,'POST',{accountId:high.id})).data.code,'chat_timeout');
  assert.equal((await call('/messages?room='+room,low)).status,200);
  assert.equal((await moderate(mod,low,'untimeout')).status,200);assert.equal((await send(low,room)).status,201);
  assert.equal((await moderate(mod,low,'ban')).status,200);
  assert.equal((await call('/session',low)).data.access.banned,true);
  assert.equal((await send(low)).data.code,'chat_banned');assert.equal((await call('/profile',low,'PATCH',{bio:'Banned edit'})).data.code,'chat_banned');
  assert.equal((await call('/messages?room=public',low)).status,200);
  assert.equal((await call('/messages?room='+room,low)).status,403);
  const members=(await call('/members?q='+low.username,mod)).data.members;
  assert.equal(members.length,1);assert.equal(members[0].moderation.banned,true);assert.equal(members[0].canBan,true);
  assert.equal((await call('/members/'+(await owner()).id+'/moderation',mod)).data.canBan,false);
  assert.equal((await call('/members',friend)).status,403);
  assert.equal((await moderate(mod,low,'unban')).status,200);assert.equal((await send(low,room)).status,201);
});

test('moderator deletion affects public messages only and never grants private conversation access',async()=>{
  const mod=await person(),author=await person(),friend=await person(),moderator=await role(['delete_messages'],40);
  await assign(mod,[moderator]);const room=await dm(author,friend),privateMessage=await send(author,room,'Private history'),publicMessage=await send(author,'public','Public moderation');
  const cursor=(await call('/messages?room=public')).data.cursor;
  assert.equal((await call('/messages/'+publicMessage.data.message.id,mod,'DELETE')).status,200);
  const events=(await call('/messages?room=public&after='+cursor)).data.messages;
  assert.ok(events.some(message=>message.id===publicMessage.data.message.id&&message.deleted&&message.text===''));
  for(const actor of [mod,await owner()]){
    assert.equal((await call('/messages?room='+room,actor)).status,403);
    assert.equal((await call('/messages/'+privateMessage.data.message.id,actor,'DELETE')).status,404);
  }
  const ownerMessage=await send(await owner(),'public','Owner protected by hierarchy');assert.equal(ownerMessage.status,201);
  assert.equal((await call('/messages/'+ownerMessage.data.message.id,mod,'DELETE')).status,404);
  assert.equal((await call('/messages/'+ownerMessage.data.message.id,await owner(),'DELETE')).status,200);
});

test('role revocation and hierarchy changes between checks and writes prevent channel and moderation mutations',async()=>{
  const mod=await person(),target=await person(),custom=await role(['manage_channels','timeout_members'],50);
  await assign(mod,[custom]);
  const revoked=interceptRun(env,sql=>sql.startsWith('INSERT INTO kkeep_chat_channels'),async()=>{
    assert.equal((await call('/roles/'+custom.id,await owner(),'PATCH',{permissions:[]})).status,200);
  });
  const created=await call('/channels',mod,'POST',{name:'revoked-race'}, {},revoked);assert.equal(created.status,403);
  assert.ok(!(await call('/channels')).data.channels.some(channel=>channel.name==='revoked-race'));
  assert.equal((await call('/roles/'+custom.id,await owner(),'PATCH',{permissions:['timeout_members']})).status,200);
  const highRole=await role([],90);
  const promoted=interceptRun(env,sql=>sql.startsWith('INSERT INTO kkeep_chat_moderation'),async()=>{await assign(target,[highRole]);});
  const action=await call('/members/'+target.id+'/moderation',mod,'POST',{action:'timeout',durationMinutes:5},{},promoted);
  assert.equal(action.status,403);assert.equal((await call('/session',target)).data.access.timeoutUntil,null);
});

test('ban and permission changes immediately before message batches prevent sends and moderator deletes',async()=>{
  const sender=await person(),mod=await person(),custom=await role(['delete_messages'],50);
  await assign(mod,[custom]);
  const initial=await send(sender,'public','Preserve if permission revoked');assert.equal(initial.status,201);
  let intercepted=false;
  const revoke={...env,DB:{...env.DB,async batch(operations){if(!intercepted){intercepted=true;assert.equal((await call('/roles/'+custom.id,await owner(),'DELETE')).status,200);}return env.DB.batch(operations);}}};
  assert.equal((await call('/messages/'+initial.data.message.id,mod,'DELETE',undefined,{},revoke)).status,403);
  const kept=(await env.DB.prepare('SELECT deleted,text FROM kkeep_chat_messages WHERE id=?').bind(initial.data.message.id).all()).results[0];assert.equal(kept.deleted,0);assert.equal(kept.text,'Preserve if permission revoked');
  intercepted=false;
  const banned={...env,DB:{...env.DB,async batch(operations){if(!intercepted){intercepted=true;assert.equal((await moderate(await owner(),sender,'ban')).status,200);}return env.DB.batch(operations);}}};
  const sent=await send(sender,'public','Must not survive ban',banned);assert.equal(sent.status,403);
  const found=(await env.DB.prepare('SELECT id FROM kkeep_chat_messages WHERE author=? AND text=?').bind(sender.id,'Must not survive ban').all()).results;assert.equal(found.length,0);
});

test('revoked member-management permission cannot disclose moderation metadata through a stale read',async()=>{
  const mod=await person(),target=await person(),custom=await role(['timeout_members'],50);
  assert.equal((await moderate(await owner(),target,'ban')).status,200);
  for(const path of ['/members?q='+target.username,'/members/'+target.id+'/moderation']){
    await assign(mod,[custom]);
    let intercepted=false;
    const wrap=(query,sql)=>({
      bind(...args){return wrap(query.bind(...args),sql);},run:()=>query.run(),
      async all(){
        if(!intercepted&&sql.includes('AS canTimeout')&&sql.includes('AS canBan')){
          intercepted=true;assert.equal((await call('/members/'+mod.id+'/roles',await owner(),'PUT',{roleIds:[]})).status,200);
        }
        return query.all();
      }
    });
    const raced={...env,DB:{...env.DB,prepare(sql){return wrap(env.DB.prepare(sql),sql);}}};
    const response=await call(path,mod,'GET',undefined,{},raced);
    assert.equal(intercepted,true);assert.equal(response.status,403);assert.equal(response.data.code,'permission_changed');
    assert.equal(response.data.members,undefined);assert.equal(response.data.moderation,undefined);
  }
});

test('stale display-name updates and initial enrollment cannot restore an old username search key',async()=>{
  const joined=await person('Joined'),unjoined=await person('Unjoined',{join:false});
  for(const [who,path,input] of [[joined,'/profile',{displayName:'Changed label'}],[unjoined,'/join',{displayName:'New label'}]]){
    const next='next'+randomBytes(5).toString('hex');
    const raced=interceptRun(env,sql=>path==='/join'?sql.startsWith('INSERT OR IGNORE INTO kkeep_chat_profiles'):sql.startsWith('UPDATE kkeep_chat_profiles SET display_name='),async()=>{
      await env.DB.prepare('UPDATE kkeep_accounts SET username=?,name=? WHERE id=?').bind(next,next,who.id).run();
      const current=(await env.DB.prepare('SELECT display_name FROM kkeep_chat_profiles WHERE account=?').bind(who.id).all()).results[0];
      if(current)await env.DB.prepare('UPDATE kkeep_chat_profiles SET search_key=? WHERE account=?').bind(normalizeText(current.display_name+' '+next),who.id).run();
    });
    const response=await call(path,who,path==='/join'?'POST':'PATCH',input,{},raced);assert.equal(response.status,409);assert.equal(response.data.code,'profile_changed');
    const row=(await env.DB.prepare('SELECT search_key,display_name FROM kkeep_chat_profiles WHERE account=?').bind(who.id).all()).results[0];
    if(path==='/join')assert.equal(row,undefined);else {assert.equal(row.search_key,normalizeText(row.display_name+' '+next));assert.notEqual(row.search_key,normalizeText(row.display_name+' '+who.username));}
  }
});

test('guest media reads only public Chat namespaces and banned uploads cannot commit after normalization',async()=>{
  const a=await person(),files=new Map(),storage={...env,GAME_ASSETS:{
    async put(key,stream){files.set(key,new Uint8Array(await new Response(stream).arrayBuffer()));},
    async get(key){return files.has(key)?{body:new Blob([files.get(key)]).stream()}:null;},
    async delete(key){files.delete(key);}
  }};
  const gif=readFileSync(new URL('./fixtures/chat/animated.gif',import.meta.url));
  const uploaded=await call('/avatar',a,'PUT',gif,{'Content-Type':'image/gif'},storage);assert.equal(uploaded.status,200);
  const image=await call(uploaded.data.profile.avatarUrl.replace('/api/chat',''),undefined,'GET',undefined,{'X-Kkeep-Profile':''},storage);assert.equal(image.status,200);assert.equal(image.response.headers.get('Content-Type'),'image/gif');
  await env.DB.prepare('UPDATE kkeep_chat_profiles SET banner_key=?,banner_type=?,banner_version=? WHERE account=?').bind('profile-media/private-wallpaper','image/png',randomUUID(),a.id).run();
  assert.equal((await call('/banner/'+a.id,undefined,'GET',undefined,{'X-Kkeep-Profile':''},storage)).status,404);
  let intercepted=false;
  const racing={...storage,GAME_ASSETS:{...storage.GAME_ASSETS,async put(key,stream){await storage.GAME_ASSETS.put(key,stream);if(!intercepted){intercepted=true;assert.equal((await moderate(await owner(),a,'ban')).status,200);}}}};
  const denied=await call('/avatar',a,'PUT',gif,{'Content-Type':'image/gif'},racing);assert.equal(denied.status,409);
  assert.equal((await call('/profile?id='+a.id)).data.profile.avatarUrl,uploaded.data.profile.avatarUrl);
  assert.equal(files.size,1,'The unreferenced banned upload must be cleaned without deleting the existing public image');
});
