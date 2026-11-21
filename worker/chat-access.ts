import type {BrowserDB} from './browser-data.ts';
import {CHAT_PERMISSIONS,type ChatAccess,type ChatPermission,type ChatRole} from '../lib/chat-model.ts';

export type ChatSql = {sql:string;args:unknown[]};
export const permissionBits:Record<ChatPermission,number> = {delete_messages:1,timeout_members:2,ban_members:4,manage_channels:8};
export function permissionsFromMask(mask:number):ChatPermission[] {return CHAT_PERMISSIONS.filter(permission=>(mask&permissionBits[permission])!==0);}
export function ownerSql(account:string):ChatSql {return {sql:'EXISTS (SELECT 1 FROM kkeep_chat_owner co WHERE co.id=1 AND co.account=?)',args:[account]};}
export function activeSql(account:string, includeTimeout=false):ChatSql {
  return {sql:'NOT EXISTS (SELECT 1 FROM kkeep_chat_moderation cm WHERE cm.account=? AND (cm.banned=1'+(includeTimeout?' OR cm.timeout_until>?':'')+'))',args:[account,...(includeTimeout?[Date.now()]:[])]};
}
export function permissionSql(account:string,permission:ChatPermission):ChatSql {
  const active=activeSql(account,true),owner=ownerSql(account);
  return {sql:active.sql+' AND ('+owner.sql+' OR EXISTS (SELECT 1 FROM kkeep_chat_member_roles mr JOIN kkeep_chat_roles r ON r.id=mr.role WHERE mr.account=? AND (r.permissions & ?)<>0))',args:[...active.args,...owner.args,account,permissionBits[permission]]};
}
/** target is a trusted SQL column expression, never request text. */
export function moderationSql(actor:string,target:string,permission:ChatPermission):ChatSql {
  const grant=permissionSql(actor,permission),owner=ownerSql(actor);
  const rank=(column:string)=>'COALESCE((SELECT MAX(r.position) FROM kkeep_chat_member_roles mr JOIN kkeep_chat_roles r ON r.id=mr.role WHERE mr.account='+column+'),0)';
  return {sql:grant.sql+' AND '+target+'<>? AND NOT EXISTS (SELECT 1 FROM kkeep_chat_owner co WHERE co.account='+target+') AND ('+owner.sql+' OR '+rank('?')+'>'+rank(target)+')',args:[...grant.args,actor,...owner.args,actor]};
}
export async function chatAccess(db:BrowserDB,account:string|null,owner:string|null,canClaimOwner=false):Promise<ChatAccess> {
  const empty:ChatAccess={isOwner:false,permissions:[],canManageRoles:false,canClaimOwner,banned:false,timeoutUntil:null};
  if(!account)return empty;
  const found=(await db.prepare('SELECT banned,timeout_until AS timeoutUntil FROM kkeep_chat_moderation WHERE account=?').bind(account).all()).results[0] as {banned:number;timeoutUntil:number|null}|undefined;
  const isOwner=account===owner,banned=!!found?.banned,timeoutUntil=found?.timeoutUntil&&found.timeoutUntil>Date.now()?found.timeoutUntil:null;
  const roles=(await db.prepare('SELECT r.permissions FROM kkeep_chat_member_roles mr JOIN kkeep_chat_roles r ON r.id=mr.role WHERE mr.account=?').bind(account).all()).results as {permissions:number}[];
  const mask=roles.reduce((combined,role)=>combined|role.permissions,0);
  return {...empty,isOwner,banned,timeoutUntil,canManageRoles:isOwner&&!banned&&!timeoutUntil,permissions:banned||timeoutUntil?[]:isOwner?[...CHAT_PERMISSIONS]:permissionsFromMask(mask)};
}
export async function roleList(db:BrowserDB):Promise<ChatRole[]> {
  const result=(await db.prepare('SELECT id,name,color,position,permissions FROM kkeep_chat_roles ORDER BY position DESC,id').all()).results as {id:string;name:string;color:string;position:number;permissions:number}[];
  return result.map(role=>({...role,permissions:permissionsFromMask(role.permissions)}));
}
