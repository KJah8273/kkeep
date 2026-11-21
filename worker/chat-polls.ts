import type {BrowserDB} from './browser-data.ts';
import {activeSql,permissionSql,type ChatSql} from './chat-access.ts';
import {CHAT_POLL_MAX_DURATION,CHAT_POLL_MAX_OPTIONS,CHAT_POLL_OPTION_MAX,CHAT_POLL_QUESTION_MAX,type ChatPoll} from '../lib/chat-model.ts';

export class PollError extends Error {
  status:number;
  code:string;
  constructor(message:string,status=400,code='invalid_poll'){super(message);this.status=status;this.code=code;}
}
export type PollContext={db:BrowserDB;viewer:string|null;roomAccess:(room:string,viewer:string|null,writing?:boolean)=>ChatSql;rate:(scope:string,account:string,limit:number,period:number)=>Promise<void>};
/** Evaluate deadlines at the database write, including time spent waiting for D1. */
export const CHAT_DATABASE_NOW="(CAST(strftime('%s','now') AS INTEGER)*1000+CAST(substr(strftime('%f','now'),4,3) AS INTEGER))";
const statement=(db:BrowserDB,sql:string,args:unknown[]=[])=>db.prepare(sql).bind(...args);
async function rows<T>(db:BrowserDB,sql:string,args:unknown[]=[]):Promise<T[]>{return (await statement(db,sql,args).all()).results as T[];}
async function one<T>(db:BrowserDB,sql:string,args:unknown[]=[]):Promise<T|undefined>{return (await rows<T>(db,sql,args))[0];}
const isPublic=(room:string)=>room==='public'||room.startsWith('channel:');
const fail=(message:string,status=400,code='invalid_poll'):never=>{throw new PollError(message,status,code);};
function unblocked(viewer:string|null):ChatSql {
  return viewer?{sql:'NOT EXISTS(SELECT 1 FROM kkeep_chat_blocks b WHERE (b.blocker=m.author AND b.blocked=?) OR (b.blocker=? AND b.blocked=m.author))',args:[viewer,viewer]}:{sql:'1',args:[]};
}
function eligible(viewer:string|null):ChatSql {
  if(!viewer)return {sql:'0',args:[]};
  const active=activeSql(viewer,true);
  return {sql:active.sql+' AND EXISTS(SELECT 1 FROM kkeep_chat_profiles cp WHERE cp.account=?)',args:[...active.args,viewer]};
}
type PollRow={messageId:number;question:string;options:string;allowMultiple:number;closesAt:number;closedAt:number|null;totalVoters:number;totalVotes:number;counts:string;mine:string;canVote:number;canClose:number;serverNow:number};

/** One bounded query hydrates every poll in a message page without returning voter identities. */
export async function pollsForMessages(ctx:PollContext,room:string,ids:number[]):Promise<Map<number,ChatPoll>> {
  if(!isPublic(room)||!ids.length)return new Map();
  const readable=ctx.roomAccess(room,ctx.viewer),block=unblocked(ctx.viewer),member=eligible(ctx.viewer),manager=ctx.viewer?permissionSql(ctx.viewer,'manage_channels'):{sql:'0',args:[]};
  const open='q.closed_at IS NULL AND q.closes_at>'+CHAT_DATABASE_NOW;
  const found=await rows<PollRow>(ctx.db,'SELECT q.message AS messageId,q.question,q.options,q.allow_multiple AS allowMultiple,q.closes_at AS closesAt,q.closed_at AS closedAt,'+
    '(SELECT COUNT(*) FROM kkeep_chat_poll_ballots b WHERE b.message=q.message) AS totalVoters,'+
    '(SELECT COALESCE(SUM(json_array_length(b.options)),0) FROM kkeep_chat_poll_ballots b WHERE b.message=q.message) AS totalVotes,'+
    "COALESCE((SELECT json_group_array(json_object('id',choice,'votes',votes)) FROM (SELECT j.value AS choice,COUNT(*) AS votes FROM kkeep_chat_poll_ballots b JOIN json_each(b.options) j WHERE b.message=q.message GROUP BY j.value)),'[]') AS counts,"+
    "COALESCE((SELECT b.options FROM kkeep_chat_poll_ballots b WHERE b.message=q.message AND b.account=?),'[]') AS mine,"+
    '('+member.sql+' AND '+open+') AS canVote,('+member.sql+' AND (m.author=? OR ('+manager.sql+')) AND '+open+') AS canClose,'+CHAT_DATABASE_NOW+' AS serverNow '+
    "FROM kkeep_chat_polls q JOIN kkeep_chat_messages m ON m.id=q.message WHERE m.kind='poll' AND m.deleted=0 AND m.room=? AND q.message IN ("+ids.map(()=>'?').join(',')+') AND '+readable.sql+' AND '+block.sql,
    [ctx.viewer,...member.args,...member.args,ctx.viewer,...manager.args,room,...ids,...readable.args,...block.args]);
  return new Map(found.map(row=>{
    const choices=JSON.parse(row.options) as {id:string;label:string}[],counts=new Map((JSON.parse(row.counts) as {id:string;votes:number}[]).map(item=>[item.id,item.votes]));
    const viewerOptionIds=JSON.parse(row.mine) as string[],closedAt=row.closedAt??(row.closesAt<=row.serverNow?row.closesAt:null);
    const poll:ChatPoll={messageId:row.messageId,question:row.question,options:choices.map(choice=>({id:choice.id,label:choice.label,votes:counts.get(choice.id)||0,percentage:row.totalVoters?Math.round((counts.get(choice.id)||0)*100/row.totalVoters):0,selected:viewerOptionIds.includes(choice.id)})),allowMultiple:!!row.allowMultiple,totalVoters:row.totalVoters,totalVotes:row.totalVotes,viewerOptionIds,closesAt:row.closesAt,closedAt,closed:closedAt!==null,canVote:!!row.canVote,canClose:!!row.canClose,serverNow:row.serverNow};
    return [row.messageId,poll];
  }));
}
async function pollRoom(ctx:PollContext,messageId:number):Promise<string> {
  const found=await one<{room:string}>(ctx.db,'SELECT m.room FROM kkeep_chat_polls q JOIN kkeep_chat_messages m ON m.id=q.message WHERE q.message=?',[messageId]);
  if(!found||!isPublic(found.room))return fail('This poll is unavailable.',404,'poll_unavailable');
  return found.room;
}
export async function readPoll(ctx:PollContext,messageId:number):Promise<ChatPoll> {
  const room=await pollRoom(ctx,messageId),poll=(await pollsForMessages(ctx,room,[messageId])).get(messageId);
  if(!poll)return fail('This poll is unavailable.',404,'poll_unavailable');
  return poll;
}
function clean(value:unknown,max:number,label:string):string {
  if(typeof value!=='string')return fail('Enter '+label+'.');
  const result=value.normalize('NFC').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/g,'').replace(/\s+/g,' ').trim();
  if(!result||result.length>max)return fail(label+' must contain 1–'+max+' characters.');
  return result;
}
type Existing={messageId:number;kind:string;room:string;deleted:number;question:string|null;options:string|null;allowMultiple:number|null;closesAt:number|null};
function creationMatches(row:Existing,room:string,question:string,labels:string[],multiple:boolean,closesAt:number):boolean {
  return row.kind==='poll'&&!row.deleted&&row.room===room&&row.question===question&&row.allowMultiple===(multiple?1:0)&&row.closesAt===closesAt&&!!row.options&&JSON.stringify((JSON.parse(row.options) as {label:string}[]).map(option=>option.label))===JSON.stringify(labels);
}
export async function createPoll(ctx:PollContext,room:string,clientId:string,input:Record<string,unknown>):Promise<{messageId:number;created:boolean}> {
  if(!ctx.viewer)return fail('Sign in to create a poll.',401,'login_required');
  if(!isPublic(room))return fail('Create polls in a public channel.',400);
  const question=clean(input.question,CHAT_POLL_QUESTION_MAX,'A poll question');
  if(!Array.isArray(input.options)||input.options.length<2||input.options.length>CHAT_POLL_MAX_OPTIONS)return fail('Add 2–10 poll options.');
  const labels=input.options.map(value=>clean(value,CHAT_POLL_OPTION_MAX,'Each option'));
  if(new Set(labels.map(label=>label.normalize('NFKC').toLowerCase())).size!==labels.length)return fail('Give each option a different label.');
  if(typeof input.allowMultiple!=='boolean'||!Number.isSafeInteger(input.closesAt))return fail('Choose valid poll settings and an end time.');
  const multiple=input.allowMultiple,closesAt=Number(input.closesAt),grant=ctx.roomAccess(room,ctx.viewer,true);
  if(!await one(ctx.db,'SELECT 1 WHERE '+grant.sql,grant.args))return fail('You do not have permission to create a poll in this channel.',403,'permission_required');
  const existingSql='SELECT m.id AS messageId,m.kind,m.room,m.deleted,q.question,q.options,q.allow_multiple AS allowMultiple,q.closes_at AS closesAt FROM kkeep_chat_messages m LEFT JOIN kkeep_chat_polls q ON q.message=m.id WHERE m.author=? AND m.client_id=?';
  const existing=await one<Existing>(ctx.db,existingSql,[ctx.viewer,clientId]);
  if(existing){if(!creationMatches(existing,room,question,labels,multiple,closesAt))return fail('This send ID was already used. Start a new poll.',409,'idempotency_conflict');return {messageId:existing.messageId,created:false};}
  const now=Date.now();
  if(closesAt<now+5000||closesAt>now+CHAT_POLL_MAX_DURATION)return fail('End the poll between 5 seconds and 30 days from now.');
  await ctx.rate('poll-create',ctx.viewer,10,3600000);
  const options=JSON.stringify(labels.map(label=>({id:crypto.randomUUID(),label}))),revision=crypto.randomUUID();
  const changed=await ctx.db.batch([
    statement(ctx.db,"INSERT OR IGNORE INTO kkeep_chat_messages (room,author,text,client_id,created,deleted,kind) SELECT ?,?,?,?,?,0,'poll' WHERE "+grant.sql+' AND ?>'+CHAT_DATABASE_NOW,[room,ctx.viewer,question,clientId,now,...grant.args,closesAt]),
    statement(ctx.db,"INSERT OR IGNORE INTO kkeep_chat_polls (message,question,options,allow_multiple,closes_at,revision) SELECT m.id,?,?,?,?,? FROM kkeep_chat_messages m WHERE m.author=? AND m.client_id=? AND m.room=? AND m.kind='poll' AND m.deleted=0 AND m.text=? AND "+grant.sql,[question,options,multiple?1:0,closesAt,revision,ctx.viewer,clientId,room,question,...grant.args]),
    statement(ctx.db,"INSERT OR IGNORE INTO kkeep_chat_events (room,message,kind) SELECT m.room,m.id,'created' FROM kkeep_chat_messages m JOIN kkeep_chat_polls q ON q.message=m.id WHERE m.author=? AND m.client_id=?",[ctx.viewer,clientId]),
    statement(ctx.db,'INSERT OR IGNORE INTO kkeep_chat_poll_updates (message,room) SELECT m.id,m.room FROM kkeep_chat_messages m JOIN kkeep_chat_polls q ON q.message=m.id WHERE m.author=? AND m.client_id=?',[ctx.viewer,clientId]),
  ]) as {meta:{changes:number}}[];
  const saved=await one<Existing>(ctx.db,existingSql,[ctx.viewer,clientId]);
  if(!saved)return fail('This channel or your permission changed. Refresh and try again.',403,'permission_changed');
  if(!creationMatches(saved,room,question,labels,multiple,closesAt))return fail('This send ID was already used. Start a new poll.',409,'idempotency_conflict');
  return {messageId:saved.messageId,created:!!changed[0]?.meta.changes};
}
function mutationGrant(ctx:PollContext,room:string,close=false):ChatSql {
  const readable=ctx.roomAccess(room,ctx.viewer),block=unblocked(ctx.viewer),member=eligible(ctx.viewer),manager=ctx.viewer?permissionSql(ctx.viewer,'manage_channels'):{sql:'0',args:[]};
  return {sql:'closed_at IS NULL AND closes_at>'+CHAT_DATABASE_NOW+' AND '+member.sql+" AND EXISTS(SELECT 1 FROM kkeep_chat_messages m WHERE m.id=kkeep_chat_polls.message AND m.kind='poll' AND m.deleted=0 AND m.room=? AND "+readable.sql+' AND '+block.sql+(close?' AND (m.author=? OR ('+manager.sql+'))':'')+')',args:[...member.args,room,...readable.args,...block.args,...(close?[ctx.viewer,...manager.args]:[])]};
}
async function mutationFailed(ctx:PollContext,messageId:number):Promise<never> {
  const current=await readPoll(ctx,messageId);
  if(current.closed)return fail('This poll is closed.',409,'poll_closed');
  return fail('Your permission to update this poll changed. Refresh and try again.',403,'permission_changed');
}
export async function votePoll(ctx:PollContext,messageId:number,input:Record<string,unknown>):Promise<ChatPoll> {
  if(!ctx.viewer)return fail('Sign in to vote.',401,'login_required');
  const room=await pollRoom(ctx,messageId),current=await readPoll(ctx,messageId);
  if(current.closed)return fail('This poll is closed.',409,'poll_closed');
  if(!current.canVote)return fail('This account cannot vote right now.',403,'permission_required');
  if(!Array.isArray(input.optionIds)||input.optionIds.length>CHAT_POLL_MAX_OPTIONS||input.optionIds.some(value=>typeof value!=='string'))return fail('Choose valid poll options.');
  const selected=input.optionIds as string[],choices=new Set(current.options.map(option=>option.id));
  if(new Set(selected).size!==selected.length||selected.some(option=>!choices.has(option))||(!current.allowMultiple&&selected.length>1))return fail('Choose valid poll options.');
  const sorted=[...selected].sort();
  if(JSON.stringify(sorted)===JSON.stringify([...current.viewerOptionIds].sort()))return current;
  await ctx.rate('poll-vote',ctx.viewer,60,60000);
  const grant=mutationGrant(ctx,room),revision=crypto.randomUUID(),options=JSON.stringify(sorted),actor=ctx.viewer;
  const changed=await ctx.db.batch([
    statement(ctx.db,'UPDATE kkeep_chat_polls SET revision=? WHERE message=? AND '+grant.sql,[revision,messageId,...grant.args]),
    selected.length?statement(ctx.db,'INSERT INTO kkeep_chat_poll_ballots (message,account,options,updated) SELECT message,?,?, '+CHAT_DATABASE_NOW+' FROM kkeep_chat_polls WHERE message=? AND revision=? ON CONFLICT(message,account) DO UPDATE SET options=excluded.options,updated=excluded.updated',[actor,options,messageId,revision]):statement(ctx.db,'DELETE FROM kkeep_chat_poll_ballots WHERE message=? AND account=? AND EXISTS(SELECT 1 FROM kkeep_chat_polls q WHERE q.message=? AND q.revision=?)',[messageId,actor,messageId,revision]),
    statement(ctx.db,'INSERT OR REPLACE INTO kkeep_chat_poll_updates (message,room) SELECT q.message,m.room FROM kkeep_chat_polls q JOIN kkeep_chat_messages m ON m.id=q.message WHERE q.message=? AND q.revision=?',[messageId,revision]),
  ]) as {meta:{changes:number}}[];
  if(!changed[0]?.meta.changes)return await mutationFailed(ctx,messageId);
  return await readPoll(ctx,messageId);
}
export async function closePoll(ctx:PollContext,messageId:number):Promise<ChatPoll> {
  if(!ctx.viewer)return fail('Sign in to close a poll.',401,'login_required');
  const room=await pollRoom(ctx,messageId),current=await readPoll(ctx,messageId);
  if(current.closed)return current;
  if(!current.canClose)return fail('Only the poll creator or a channel manager can close this poll.',403,'permission_required');
  await ctx.rate('poll-close',ctx.viewer,30,60000);
  const revision=crypto.randomUUID(),grant=mutationGrant(ctx,room,true);
  const changed=await ctx.db.batch([
    statement(ctx.db,'UPDATE kkeep_chat_polls SET closed_at='+CHAT_DATABASE_NOW+',revision=? WHERE message=? AND '+grant.sql,[revision,messageId,...grant.args]),
    statement(ctx.db,'INSERT OR REPLACE INTO kkeep_chat_poll_updates (message,room) SELECT q.message,m.room FROM kkeep_chat_polls q JOIN kkeep_chat_messages m ON m.id=q.message WHERE q.message=? AND q.revision=?',[messageId,revision]),
  ]) as {meta:{changes:number}}[];
  if(!changed[0]?.meta.changes)return await mutationFailed(ctx,messageId);
  return await readPoll(ctx,messageId);
}
export async function pollWatermark(ctx:PollContext,room:string):Promise<number> {
  if(!isPublic(room))return 0;
  const grant=ctx.roomAccess(room,ctx.viewer),row=await one<{cursor:number}>(ctx.db,'SELECT COALESCE(MAX(id),0) AS cursor FROM kkeep_chat_poll_updates WHERE room=? AND '+grant.sql,[room,...grant.args]);
  return row?.cursor||0;
}
export async function pollChanges(ctx:PollContext,room:string,after:number,limit:number):Promise<{ids:number[];cursor:number;hasMore:boolean}> {
  if(!isPublic(room))return {ids:[],cursor:0,hasMore:false};
  const grant=ctx.roomAccess(room,ctx.viewer),events=await rows<{id:number;message:number}>(ctx.db,'SELECT id,message FROM kkeep_chat_poll_updates WHERE room=? AND id>? AND '+grant.sql+' ORDER BY id LIMIT ?',[room,after,...grant.args,Math.min(80,limit)+1]);
  const page=events.slice(0,limit);
  return {ids:page.map(event=>event.message),cursor:page.at(-1)?.id??after,hasMore:events.length>limit};
}
