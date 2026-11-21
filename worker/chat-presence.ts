import type {BrowserDB} from './browser-data.ts';
import {activeSql,type ChatSql} from './chat-access.ts';
import {CHAT_PRESENCE_LEASE_MS} from '../lib/chat-model.ts';
import {CHAT_DATABASE_NOW} from './chat-polls.ts';

export class PresenceError extends Error {
  status:number;
  code:string;
  constructor(message:string,status=400,code='invalid_presence'){super(message);this.status=status;this.code=code;}
}
/** Public roster queries use profile alias p; no timestamps or tab identifiers leave this module. */
export const presenceOnlineSql='EXISTS(SELECT 1 FROM kkeep_chat_presence pr WHERE pr.account=p.account AND pr.expires>'+CHAT_DATABASE_NOW+')';
export function presenceVisibility(viewer:string|null):ChatSql {
  return {sql:'NOT EXISTS(SELECT 1 FROM kkeep_chat_moderation cm WHERE cm.account=p.account AND cm.banned=1)'+(viewer?' AND NOT EXISTS(SELECT 1 FROM kkeep_chat_blocks b WHERE (b.blocker=p.account AND b.blocked=?) OR (b.blocker=? AND b.blocked=p.account))':''),args:viewer?[viewer,viewer]:[]};
}
export async function updatePresence(db:BrowserDB,viewer:string,input:Record<string,unknown>,online:boolean):Promise<{online:boolean;expiresAt:number|null;serverNow:number}> {
  const client=input.clientId,sequence=input.sequence;
  if(typeof client!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(client)||!Number.isSafeInteger(sequence)||Number(sequence)<1)throw new PresenceError('Use a valid tab identifier and activity sequence.');
  // Keep short-lived offline tombstones so a late heartbeat cannot undo a leave.
  await db.prepare('DELETE FROM kkeep_chat_presence WHERE account=? AND updated<? AND expires<?').bind(viewer,Date.now()-300000,Date.now()).run();
  const grant=activeSql(viewer),tab=client.toLowerCase();
  await db.prepare('INSERT INTO kkeep_chat_presence (account,client,sequence,expires,updated) SELECT ?,?,?,'+(online?CHAT_DATABASE_NOW+'+'+CHAT_PRESENCE_LEASE_MS:'0')+','+CHAT_DATABASE_NOW+' WHERE '+grant.sql+' AND EXISTS(SELECT 1 FROM kkeep_chat_profiles cp WHERE cp.account=?) AND (EXISTS(SELECT 1 FROM kkeep_chat_presence pr WHERE pr.account=? AND pr.client=?) OR (SELECT COUNT(*) FROM kkeep_chat_presence pr WHERE pr.account=?)<32) ON CONFLICT(account,client) DO UPDATE SET sequence=excluded.sequence,expires=excluded.expires,updated=excluded.updated WHERE excluded.sequence>kkeep_chat_presence.sequence').bind(viewer,tab,sequence,...grant.args,viewer,viewer,tab,viewer).run();
  const current=(await db.prepare('SELECT expires,'+CHAT_DATABASE_NOW+' AS serverNow FROM kkeep_chat_presence WHERE account=? AND client=?').bind(viewer,tab).all()).results[0] as {expires:number;serverNow:number}|undefined;
  if(!current)throw new PresenceError('This account cannot open another active tab right now.',409,'presence_unavailable');
  const active=current.expires>current.serverNow;
  return {online:active,expiresAt:active?current.expires:null,serverNow:current.serverNow};
}
