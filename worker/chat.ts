import {profileIdentity} from './profile.ts';
import {analyticsOwner, type AnalyticsEnv} from './analytics.ts';
import {normalizeChatAvatar} from './chat-avatar.ts';
import {normalizeChatGif} from './chat-gif.ts';
import type {BrowserDB} from './browser-data.ts';
import type {GameBucket} from './game-assets.ts';
import {detectImageType, normalizeText} from '../lib/chat-moderation.ts';
import {DEFAULT_CHAT_CHANNELS, CHAT_AVATAR_MAX, CHAT_GIF_MAX, CHAT_BIO_MAX, CHAT_MESSAGE_MAX, type ChatChannel, type ChatProfile, type ChatUser, type ChatMessage, type ChatFriend, type ChatRelationship, type ChatConversation} from '../lib/chat-model.ts';

export type ChatEnv = AnalyticsEnv & {
  DB?: BrowserDB;
  GAME_ASSETS?: GameBucket & {delete?(key: string): Promise<unknown>};
  IMAGES?: {input(stream: ReadableStream): {transform(options: Record<string, unknown>): {output(options: {format: string; quality: number; anim?: boolean}): Promise<{response(): Response | Promise<Response>}>}}};
};
type Row = {id: string; name: string; displayName: string; bio: string; nameColor: string; primaryColor: string; secondaryColor: string; avatarVersion: string | null; joinedAt: number; avatarKey: string | null; avatarType: string | null; bannerVersion: string | null; bannerKey: string | null; bannerType: string | null};
type MessageRow = Row & {messageId: number; room: string; authorId: string; text: string; clientId: string; createdAt: number; deleted: number};
type FriendRow = Row & {friendId: string; sender: string; receiver: string; status: 'pending' | 'accepted'; createdAt: number};
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const profileColumns = 'p.account AS id,a.name,p.display_name AS displayName,p.bio,p.name_color AS nameColor,p.primary_color AS primaryColor,p.secondary_color AS secondaryColor,p.avatar_version AS avatarVersion,p.avatar_key AS avatarKey,p.avatar_type AS avatarType,p.banner_version AS bannerVersion,p.banner_key AS bannerKey,p.banner_type AS bannerType,p.joined AS joinedAt';
const profileJoin = 'kkeep_chat_profiles p JOIN kkeep_accounts a ON a.id=p.account';
const messageColumns = 'm.id AS messageId,m.room,m.author AS authorId,m.text,m.client_id AS clientId,m.created AS createdAt,m.deleted,' + profileColumns;
const messageJoin = 'kkeep_chat_messages m JOIN kkeep_chat_profiles p ON p.account=m.author JOIN kkeep_accounts a ON a.id=p.account';
const jsonHeaders = {'Cache-Control': 'no-store, private', 'X-Content-Type-Options': 'nosniff', 'Cross-Origin-Resource-Policy': 'same-origin', Vary: 'Cookie, oai-authenticated-user-email'};

class ChatError extends Error {
  status: number;
  code: string;
  retryAfter?: number;
  constructor(message: string, status = 400, code = 'invalid_request', retryAfter?: number) {
    super(message); this.status = status; this.code = code; this.retryAfter = retryAfter;
  }
}
const fail = (message: string, status = 400, code = 'invalid_request'): never => {throw new ChatError(message, status, code);};
const reply = (data: unknown, status = 200) => Response.json(data, {status, headers: jsonHeaders});
const pair = (a: string, b: string) => [a, b].sort().join(':');
const user = (row: Row): ChatUser => ({id: row.id, name: row.name, displayName: row.displayName, nameColor: row.nameColor, avatarUrl: row.avatarKey && row.avatarVersion ? '/api/chat/avatar/' + row.id + '?v=' + encodeURIComponent(row.avatarVersion) : null});
const profile = (row: Row): ChatProfile => ({...user(row), bio: row.bio, joinedAt: row.joinedAt, bannerUrl: row.bannerKey && row.bannerVersion ? '/api/chat/banner/' + row.id + '?v=' + encodeURIComponent(row.bannerVersion) : null, primaryColor: row.primaryColor, secondaryColor: row.secondaryColor});
const message = (row: MessageRow, viewer: string): ChatMessage => ({id: row.messageId, roomId: row.room, author: user(row), text: row.deleted ? '' : row.text, createdAt: row.createdAt, deleted: !!row.deleted, ...(row.authorId === viewer ? {clientId: row.clientId} : {})});
const statement = (db: BrowserDB, sql: string, args: unknown[] = []) => db.prepare(sql).bind(...args);
async function rows<T>(db: BrowserDB, sql: string, args: unknown[] = []): Promise<T[]> {return (await statement(db, sql, args).all()).results as T[];}
async function one<T>(db: BrowserDB, sql: string, args: unknown[] = []): Promise<T | undefined> {return (await rows<T>(db, sql, args))[0];}
const loadProfile = (db: BrowserDB, id: string) => one<Row>(db, 'SELECT ' + profileColumns + ' FROM ' + profileJoin + ' WHERE p.account=?', [id]);
function id(value: unknown): string {if (typeof value !== 'string' || !uuid.test(value)) return fail('Choose a valid account or conversation.'); return value.toLowerCase();}
function number(value: string | null, fallback = 0): number {if (value === null) return fallback; if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value))) return fail('Invalid history position.'); return Number(value);}
function text(value: unknown, max: number, label: string, required = true): string {
  if (typeof value !== 'string') return fail('Enter ' + label + '.');
  const cleaned = value.normalize('NFC').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u202A-\u202E\u2066-\u2069]/g, '').trim();
  if ((required && !cleaned) || cleaned.length > max) return fail(label + ' must be ' + (required ? '1–' : 'at most ') + max + ' characters.');
  return cleaned;
}
function displayName(value: unknown): string {
  const name = text(value, 32, 'Your display name').replace(/[\u200B-\u200F\u2060-\u206F\uFEFF]/g, '').replace(/\s+/g, ' ').trim();
  if (!name || /[<>]/.test(name) || !/[\p{L}\p{N}\p{Extended_Pictographic}]/u.test(name)) return fail('Use 1–32 visible characters for your display name.');
  return name;
}
function color(value: unknown, fallback: string): string {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || !/^#[a-f0-9]{6}$/i.test(value)) return fail('Choose a six-digit hex color such as #eeeeee.');
  return value.toLowerCase();
}
function channelId(value: unknown): string {
  if (typeof value !== 'string') return fail('Choose a valid channel.');
  let decoded: string;
  try {decoded = decodeURIComponent(value);} catch {return fail('Choose a valid channel.');}
  if (DEFAULT_CHAT_CHANNELS.some(channel => channel.id === decoded) || (decoded.startsWith('channel:') && uuid.test(decoded.slice(8)))) return decoded.toLowerCase();
  return fail('Choose a valid channel.');
}
function roomId(value: unknown): string {return typeof value === 'string' && (value === 'public' || value.startsWith('channel:')) ? channelId(value) : id(value);}
async function readBytes(request: Request, max: number): Promise<Uint8Array<ArrayBuffer>> {
  const length = request.headers.get('Content-Length');
  if (length && (!/^\d+$/.test(length) || Number(length) > max)) throw new ChatError('This upload or message is too large.', 413);
  const reader = request.body?.getReader(); if (!reader) return fail('Missing request body.');
  const chunks: Uint8Array[] = []; let size = 0;
  for (;;) {
    const part = await reader.read(); if (part.done) break;
    size += part.value.byteLength;
    if (size > max) {await reader.cancel(); throw new ChatError('This upload or message is too large.', 413);}
    chunks.push(part.value);
  }
  if (!size) return fail('Missing request body.');
  const data = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) {data.set(chunk, offset); offset += chunk.length;}
  return data;
}
async function body(request: Request): Promise<Record<string, unknown>> {
  if (!/^application\/json(?:;|$)/i.test(request.headers.get('Content-Type') || '')) return fail('Send a JSON request.', 415);
  let parsed: unknown;
  try {parsed = JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(await readBytes(request, 12000)));}
  catch (error) {if (error instanceof ChatError) throw error; return fail('Invalid JSON request.');}
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return fail('Invalid JSON request.');
  return parsed as Record<string, unknown>;
}
async function rate(db: BrowserDB, scope: string, account: string, limit: number, period: number) {
  const now = Date.now(), window = Math.floor(now / period), key = scope + ':' + account + ':' + window;
  const result = await statement(db, 'INSERT INTO kkeep_chat_limits (key,count,expires) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 WHERE count<?', [key, now + period * 2, limit]).run();
  if (!result.meta.changes) throw new ChatError('Please wait a moment before trying again.', 429, 'rate_limited', Math.ceil(((window + 1) * period - now) / 1000));
  // Expiring counters are the only chat rows automatically cleaned up.
  await statement(db, 'DELETE FROM kkeep_chat_limits WHERE expires<?', [now]).run();
}
function unblocked(left: string, right: string) {
  return 'NOT EXISTS (SELECT 1 FROM kkeep_chat_blocks b WHERE (b.blocker=' + left + ' AND b.blocked=' + right + ') OR (b.blocker=' + right + ' AND b.blocked=' + left + '))';
}
type ChannelRow = {id: string; name: string; category: string; readOnly: number; archived: number; created: number};
async function channelList(db: BrowserDB): Promise<ChatChannel[]> {
  const saved = await rows<ChannelRow>(db, 'SELECT id,name,category,read_only AS readOnly,archived,created FROM kkeep_chat_channels ORDER BY created,id');
  const overridden = new Map(saved.map(channel => [channel.id, channel]));
  const result: ChatChannel[] = [];
  for (const builtin of DEFAULT_CHAT_CHANNELS) {
    const current = overridden.get(builtin.id);
    if (!current) result.push({...builtin});
    else if (!current.archived) result.push({id: current.id,name: current.name,category: current.category,readOnly: !!current.readOnly});
    overridden.delete(builtin.id);
  }
  for (const current of overridden.values()) if (!current.archived) result.push({id: current.id,name: current.name,category: current.category,readOnly: !!current.readOnly});
  return result;
}
function channelFields(input: Record<string, unknown>, current?: ChatChannel) {
  const name = input.name === undefined ? current?.name : typeof input.name === 'string' ? input.name.normalize('NFKC').trim().toLowerCase() : '';
  if (!name || !/^[\p{L}\p{N}][\p{L}\p{N}_-]{0,31}$/u.test(name)) return fail('Use 1–32 letters, numbers, underscores or hyphens for the channel name.');
  const category = input.category === undefined ? current?.category || 'Chat' : text(input.category, 24, 'A category');
  if (input.readOnly !== undefined && typeof input.readOnly !== 'boolean') return fail('Choose a valid channel permission.');
  return {name,category,readOnly: input.readOnly === undefined ? current?.readOnly || false : input.readOnly as boolean};
}
function roomAccess(room: string, viewer: string, writing = false, owner = false) {
  const builtin = DEFAULT_CHAT_CHANNELS.find(channel => channel.id === room);
  if (builtin) return {
    sql: 'NOT EXISTS (SELECT 1 FROM kkeep_chat_channels ch WHERE ch.id=? AND ch.archived=1)' + (writing ? ' AND (?=1 OR COALESCE((SELECT read_only FROM kkeep_chat_channels ch WHERE ch.id=?),?)=0)' : ''),
    args: [room, ...(writing ? [owner ? 1 : 0,room,builtin.readOnly ? 1 : 0] : [])],
  };
  if (room.startsWith('channel:')) return {
    sql: 'EXISTS (SELECT 1 FROM kkeep_chat_channels ch WHERE ch.id=? AND ch.archived=0' + (writing ? ' AND (?=1 OR ch.read_only=0)' : '') + ')',
    args: [room, ...(writing ? [owner ? 1 : 0] : [])],
  };
  return {
    sql: "EXISTS (SELECT 1 FROM kkeep_chat_conversations c JOIN kkeep_chat_friends f ON f.pair_key=c.pair_key AND f.status='accepted' WHERE c.id=? AND (c.low=? OR c.high=?) AND " + unblocked('c.low', 'c.high') + ')',
    args: [room, viewer, viewer],
  };
}
async function requireRoom(db: BrowserDB, room: string, viewer: string, writing = false, owner = false) {
  const access = roomAccess(room, viewer, writing, owner);
  if (!await one(db, 'SELECT 1 AS allowed WHERE ' + access.sql, access.args)) {
    if (writing && !owner) {
      const readable = roomAccess(room, viewer);
      if ((room === 'public' || room.startsWith('channel:')) && await one(db, 'SELECT 1 WHERE ' + readable.sql, readable.args)) return fail('Only the Kkeep owner can post in this channel.', 403, 'owner_required');
    }
    return fail('This channel or conversation is unavailable.', 403, 'conversation_unavailable');
  }
}
async function relation(db: BrowserDB, viewer: string, target: string): Promise<{relationship: ChatRelationship; requestId?: string}> {
  if (viewer === target) return {relationship: 'self'};
  if (await one(db, 'SELECT 1 FROM kkeep_chat_blocks WHERE (blocker=? AND blocked=?) OR (blocker=? AND blocked=?)', [viewer, target, target, viewer])) return {relationship: 'blocked'};
  const row = await one<{id: string; sender: string; status: string}>(db, 'SELECT id,sender,status FROM kkeep_chat_friends WHERE pair_key=?', [pair(viewer, target)]);
  return row ? {relationship: row.status === 'accepted' ? 'friends' : row.sender === viewer ? 'outgoing' : 'incoming', requestId: row.id} : {relationship: 'none'};
}
async function targetProfile(db: BrowserDB, viewer: string, target: string) {
  if (viewer === target) return fail('Choose another player.');
  const found = await loadProfile(db, target);
  if (!found) return fail('This player is unavailable.', 404);
  return found;
}
async function conversations(db: BrowserDB, viewer: string, conversationId?: string): Promise<ChatConversation[]> {
  const access = 'f.status=\'accepted\' AND (c.low=? OR c.high=?) AND ' + unblocked('c.low', 'c.high');
  const found = await rows<Row & {conversationId: string; updatedAt: number}>(db,
    'SELECT c.id AS conversationId,c.updated AS updatedAt,' + profileColumns + ' FROM kkeep_chat_conversations c JOIN kkeep_chat_friends f ON f.pair_key=c.pair_key JOIN kkeep_chat_profiles p ON p.account=CASE WHEN c.low=? THEN c.high ELSE c.low END JOIN kkeep_accounts a ON a.id=p.account WHERE ' + access + (conversationId ? ' AND c.id=?' : '') + ' ORDER BY c.updated DESC,c.id LIMIT 100',
    [viewer, viewer, viewer, ...(conversationId ? [conversationId] : [])]);
  return found.map(row => ({id: row.conversationId, user: user(row), updatedAt: row.updatedAt}));
}
async function messageRows(db: BrowserDB, viewer: string, room: string, extra: string, args: unknown[]) {
  const access = roomAccess(room, viewer);
  return rows<MessageRow>(db, 'SELECT ' + messageColumns + ' FROM ' + messageJoin + ' WHERE m.room=? AND ' + access.sql + ' AND ' + unblocked('m.author', '?') + ' ' + extra, [room, ...access.args, viewer, viewer, ...args]);
}
async function history(db: BrowserDB, viewer: string, url: URL) {
  const room = roomId(url.searchParams.get('room') || 'public'), afterValue = url.searchParams.get('after'), beforeValue = url.searchParams.get('before');
  if (afterValue !== null && beforeValue !== null) return fail('Choose older history or new messages.');
  const limit = Math.min(80, Math.max(1, number(url.searchParams.get('limit'), 50)));
  await requireRoom(db, room, viewer);
  const access = roomAccess(room, viewer);
  if (afterValue !== null) {
    const after = number(afterValue);
    const events = await rows<{id: number; message: number}>(db, 'SELECT e.id,e.message FROM kkeep_chat_events e WHERE e.room=? AND e.id>? AND ' + access.sql + ' ORDER BY e.id LIMIT ?', [room, after, ...access.args, limit + 1]);
    const page = events.slice(0, limit), ids = [...new Set(page.map(event => event.message))];
    const found = ids.length ? await messageRows(db, viewer, room, 'AND m.id IN (' + ids.map(() => '?').join(',') + ') ORDER BY m.id', ids) : [];
    return reply({messages: found.map(row => message(row, viewer)), cursor: page.at(-1)?.id ?? after, hasMore: events.length > limit, oldestId: found[0]?.messageId ?? null});
  }
  // Freeze the event watermark before reading history; later sends cannot fall into a cursor gap.
  const watermark = await one<{cursor: number}>(db, 'SELECT COALESCE(MAX(id),0) AS cursor FROM kkeep_chat_events WHERE room=? AND ' + access.sql, [room, ...access.args]);
  const cursor = watermark?.cursor || 0, before = beforeValue === null ? null : number(beforeValue);
  const found = await messageRows(db, viewer, room, "AND EXISTS (SELECT 1 FROM kkeep_chat_events e WHERE e.message=m.id AND e.kind='created' AND e.id<=?)" + (before !== null ? ' AND m.id<?' : '') + ' ORDER BY m.id DESC LIMIT ?', [cursor, ...(before !== null ? [before] : []), limit + 1]);
  const page = found.slice(0, limit).reverse();
  return reply({messages: page.map(row => message(row, viewer)), cursor, hasMore: found.length > limit, oldestId: page[0]?.messageId ?? null});
}

/** Read just enough raster structure to reject oversized canvases before decoding. */
export function avatarDimensions(data: Uint8Array, type: string): {width: number; height: number} | null {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  if (type === 'image/png') {
    if (data.length < 33 || String.fromCharCode(...data.slice(12, 16)) !== 'IHDR') return null;
    return {width: view.getUint32(16), height: view.getUint32(20)};
  }
  if (type === 'image/jpeg') {
    let offset = 2;
    while (offset + 4 < data.length) {
      if (data[offset++] !== 0xff) return null;
      while (data[offset] === 0xff) offset++;
      const marker = data[offset++];
      if (marker === 0xda || marker === 0xd9) return null;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (offset + 2 > data.length) return null;
      const length = view.getUint16(offset);
      if (length < 2 || offset + length > data.length) return null;
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
        if (length < 8) return null;
        return {height: view.getUint16(offset + 3), width: view.getUint16(offset + 5)};
      }
      offset += length;
    }
    return null;
  }
  if (type === 'image/webp') {
    let offset = 12;
    while (offset + 8 <= data.length) {
      const kind = String.fromCharCode(...data.slice(offset, offset + 4)), length = view.getUint32(offset + 4, true), start = offset + 8;
      if (start + length > data.length) return null;
      if (kind === 'VP8X' && length >= 10) return {width: 1 + data[start + 4] + (data[start + 5] << 8) + (data[start + 6] << 16), height: 1 + data[start + 7] + (data[start + 8] << 8) + (data[start + 9] << 16)};
      if (kind === 'VP8L' && length >= 5 && data[start] === 0x2f) {
        const bits = view.getUint32(start + 1, true);
        return {width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1};
      }
      if (kind === 'VP8 ' && length >= 10 && data[start + 3] === 0x9d && data[start + 4] === 0x01 && data[start + 5] === 0x2a) return {width: view.getUint16(start + 6, true) & 0x3fff, height: view.getUint16(start + 8, true) & 0x3fff};
      offset = start + length + (length & 1);
    }
  }
  return null;
}
type MediaKind = 'avatar' | 'banner';
type MediaType = 'image/png' | 'image/webp' | 'image/gif';
function mediaState(row: Row, kind: MediaKind) {
  return kind === 'avatar' ? {key: row.avatarKey, type: row.avatarType, version: row.avatarVersion} : {key: row.bannerKey, type: row.bannerType, version: row.bannerVersion};
}
function validMediaKey(key: string, account: string, kind?: MediaKind): boolean {
  const kinds: MediaKind[] = kind ? [kind] : ['avatar', 'banner'];
  return kinds.some(item => {
    const prefix = 'chat-' + item + 's/v1/' + account + '/';
    if (!key.startsWith(prefix)) return false;
    const pieces = key.slice(prefix.length).split('.');
    // The fixed avatar filename is accepted only for photos saved before version leases.
    return pieces.length === 2 && ['png','webp','gif'].includes(pieces[1]) && ((item === 'avatar' && pieces[0] === 'avatar') || uuid.test(pieces[0]));
  });
}
async function cleanMediaObjects(db: BrowserDB, bucket: ChatEnv['GAME_ASSETS'], account: string) {
  if (!bucket?.delete) return;
  try {
    // The existing durable cleanup queue serves both isolated profile-media namespaces.
    const pending = await rows<{key: string}>(db, 'SELECT g.key FROM kkeep_chat_avatar_cleanup g JOIN kkeep_chat_profiles p ON p.account=g.account WHERE g.account=? AND g.key<>COALESCE(p.avatar_key,\'\') AND g.key<>COALESCE(p.banner_key,\'\') ORDER BY g.created LIMIT 8', [account]);
    for (const item of pending) {
      if (!validMediaKey(item.key, account)) continue;
      await bucket.delete(item.key);
      await statement(db, 'DELETE FROM kkeep_chat_avatar_cleanup WHERE key=? AND account=?', [item.key, account]).run();
    }
  } catch {/* Keep the durable row for the next media action to retry. */}
}
async function abandonMedia(db: BrowserDB, bucket: ChatEnv['GAME_ASSETS'], account: string, key: string) {
  try {
    await statement(db, 'INSERT OR IGNORE INTO kkeep_chat_avatar_cleanup (key,account,created) VALUES (?,?,?)', [key,account,Date.now()]).run();
    await cleanMediaObjects(db, bucket, account);
  } catch {/* Never delete without checking D1: a failed response may follow a committed write. */}
}
function oldMediaCleanup(db: BrowserDB, current: Row, kind: MediaKind, nextVersion: string) {
  const old = mediaState(current, kind);
  if (!old.key || !validMediaKey(old.key, current.id, kind)) return [];
  return [statement(db, 'INSERT OR IGNORE INTO kkeep_chat_avatar_cleanup (key,account,created) SELECT ?,?,? WHERE EXISTS (SELECT 1 FROM kkeep_chat_profiles WHERE account=? AND ' + kind + '_version=?)', [old.key,current.id,Date.now(),current.id,nextVersion])];
}
async function profileMedia(request: Request, env: ChatEnv, db: BrowserDB, viewer: string, path: string, kind: MediaKind) {
  const route = '/' + kind;
  if (request.method === 'GET' && path.startsWith(route + '/')) {
    const target = id(path.slice(route.length + 1)), social = await loadProfile(db, target), media = social ? mediaState(social, kind) : null;
    if (!media?.key || !media.version || (await relation(db, viewer, target)).relationship === 'blocked') return fail('Profile image unavailable.', 404);
    const extension = media.type === 'image/png' ? 'png' : media.type === 'image/webp' ? 'webp' : media.type === 'image/gif' ? 'gif' : null;
    if (!extension || !validMediaKey(media.key,target,kind) || !media.key.endsWith('.' + extension)) return fail('Profile image unavailable.', 404);
    const stored = await env.GAME_ASSETS?.get(media.key);
    if (!stored?.body) return fail('Profile image unavailable.', 404);
    // A block, removal or replacement during the object read must not return stale private media.
    const visible = await one(db, 'SELECT 1 FROM kkeep_chat_profiles p WHERE p.account=? AND p.' + kind + '_key=? AND p.' + kind + '_version=? AND ' + unblocked('p.account','?'), [target,media.key,media.version,viewer,viewer]);
    if (!visible) {await stored.body.cancel(); return fail('Profile image unavailable.',404);}
    return new Response(stored.body, {headers: {...jsonHeaders, 'Content-Type': media.type!, 'Content-Security-Policy': "default-src 'none'; sandbox", 'Content-Disposition': 'inline; filename="profile-' + kind + '.' + extension + '"'}});
  }
  if (path !== route || !['PUT', 'DELETE'].includes(request.method)) return fail('Method not allowed.', 405);
  await rate(db, kind, viewer, 12, 3600000);
  await cleanMediaObjects(db, env.GAME_ASSETS, viewer);
  const current = (await loadProfile(db,viewer))!, previous = mediaState(current,kind), version = crypto.randomUUID();
  if (request.method === 'DELETE') {
    const changes = await db.batch([
      statement(db, 'UPDATE kkeep_chat_profiles SET ' + kind + '_key=NULL,' + kind + '_type=NULL,' + kind + '_version=?,updated=? WHERE account=? AND ' + kind + '_version IS ?', [version,Date.now(),viewer,previous.version]),
      ...oldMediaCleanup(db,current,kind,version),
    ]) as {meta:{changes:number}}[];
    if (!changes[0]?.meta.changes) return fail('Your profile image changed on another device. Refresh and try again.', 409, 'profile_changed');
    await cleanMediaObjects(db,env.GAME_ASSETS,viewer);
    const pending = await one<{count:number}>(db,'SELECT COUNT(*) AS count FROM kkeep_chat_avatar_cleanup WHERE account=?',[viewer]);
    return reply({profile:profile((await loadProfile(db,viewer))!),cleanupPending:!!pending?.count});
  }
  const contentType = request.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase();
  if (!contentType || !['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(contentType)) return fail('Choose a JPEG, PNG, WebP or GIF image.', 415);
  const input = await readBytes(request, contentType === 'image/gif' ? CHAT_GIF_MAX : CHAT_AVATAR_MAX);
  const detected = /^GIF8[79]a$/.test(String.fromCharCode(...input.slice(0,6))) ? 'image/gif' : detectImageType(input);
  if (detected !== contentType) return fail('This image format does not match its contents.', 415);
  if (contentType !== 'image/gif') {
    const dimensions = avatarDimensions(input, contentType);
    if (!dimensions || dimensions.width < 32 || dimensions.height < 32 || dimensions.width > 4096 || dimensions.height > 4096 || dimensions.width * dimensions.height > 16000000) return fail('Choose an image between 32 and 4096 pixels, up to 16 megapixels.');
  }
  if (!env.GAME_ASSETS) return fail('Image uploads are temporarily unavailable.', 503, 'storage_unavailable');
  const pending = await one<{count:number}>(db,'SELECT COUNT(*) AS count FROM kkeep_chat_avatar_cleanup WHERE account=?',[viewer]);
  if ((pending?.count || 0) >= 8) return fail('Image storage is catching up. Please try again later.',503,'storage_unavailable');
  let output: Uint8Array<ArrayBuffer>, safeType: MediaType;
  if (contentType === 'image/png' || contentType === 'image/gif') {
    try {
      const normalized = contentType === 'image/gif' ? normalizeChatGif(input,kind) : await normalizeChatAvatar(input,contentType,kind);
      output = normalized.bytes; safeType = normalized.type;
    } catch {return fail('This image could not be processed. Choose it again using the profile image picker.', 422);}
  } else {
    if (!env.IMAGES) return fail('Use the profile image picker to upload a cropped PNG or a GIF.', 415, 'png_required');
    const width = kind === 'banner' ? 960 : 256, height = kind === 'banner' ? 320 : 256;
    try {
      const transformed = await env.IMAGES.input(new Blob([input]).stream()).transform({width, height, fit: 'cover', metadata: 'none'}).output({format: 'image/webp', quality: 82, anim: false});
      const response = await transformed.response();
      if (!response.ok || response.headers.get('Content-Type')?.split(';')[0] !== 'image/webp') return fail('The image could not be processed.', 422);
      output = await readBytes(new Request('https://media.invalid/', {method: 'POST', body: response.body, duplex: 'half'} as RequestInit), CHAT_AVATAR_MAX);
      const size = avatarDimensions(output, 'image/webp');
      if (detectImageType(output) !== 'image/webp' || !size || size.width < 32 || size.height < 32 || size.width > width || size.height > height) return fail('The image could not be processed.', 422);
      safeType = 'image/webp';
    } catch (error) {if (error instanceof ChatError) throw error; return fail('The image could not be processed. Try another image.', 422);}
  }
  const extension = safeType === 'image/png' ? 'png' : safeType === 'image/gif' ? 'gif' : 'webp', key = 'chat-' + kind + 's/v1/' + viewer + '/' + version + '.' + extension;
  try {
    await env.GAME_ASSETS.put(key,new Blob([output]).stream(),{httpMetadata:{contentType:safeType},customMetadata:{type:safeType}});
    const changes = await db.batch([
      statement(db,'UPDATE kkeep_chat_profiles SET ' + kind + '_key=?,' + kind + '_type=?,' + kind + '_version=?,updated=? WHERE account=? AND ' + kind + '_version IS ?',[key,safeType,version,Date.now(),viewer,previous.version]),
      ...oldMediaCleanup(db,current,kind,version),
    ]) as {meta:{changes:number}}[];
    if (!changes[0]?.meta.changes) return fail('Your profile image changed on another device. Refresh and try again.',409,'profile_changed');
  } catch(error) {await abandonMedia(db,env.GAME_ASSETS,viewer,key);throw error;}
  await cleanMediaObjects(db,env.GAME_ASSETS,viewer);
  return reply({profile:profile((await loadProfile(db,viewer))!)});
}

export async function chatApi(request: Request, env: ChatEnv): Promise<Response> {
  const url = new URL(request.url), path = url.pathname.slice('/api/chat'.length).replace(/\/$/, '') || '/', isMediaRead = request.method === 'GET' && (path.startsWith('/avatar/') || path.startsWith('/banner/'));
  const origin = request.headers.get('Origin'), site = request.headers.get('Sec-Fetch-Site');
  if ((!isMediaRead && request.headers.get('X-Kkeep-Profile') !== '1') || site === 'cross-site' || (origin && origin !== url.origin)) return reply({error: 'Open Chat from Kkeep.', code: 'origin_required'}, 403);
  if (!env.DB) return reply({error: 'Chat is temporarily unavailable.', code: 'storage_unavailable'}, 503);
  const db = env.DB;
  try {
    const account = await profileIdentity(request, db);
    const owner = analyticsOwner(request, env);
    if (path === '/channels' && request.method === 'GET') return reply({
      channels: await channelList(db),canManageChannels: owner,ownerConfigured: !!env.KKEEP_ANALYTICS_OWNER_EMAIL?.trim(),ownerSignedIn: !!request.headers.get('oai-authenticated-user-email'),
    });
    if (path === '/session' && request.method === 'GET') {
      const social = account ? await loadProfile(db, account.id) : undefined;
      const total = account ? await one<{count: number}>(db, 'SELECT COUNT(*) AS count FROM kkeep_chat_profiles') : undefined;
      return reply({account: account || null, profile: social ? profile(social) : null, memberCount: total?.count || 0});
    }
    if (!account) return fail('Log in to your Kkeep Profile first.', 401, 'login_required');
    const viewer = account.id;
    let social = await loadProfile(db, viewer);
    if (path === '/join' && request.method === 'POST') {
      const input = await body(request);
      if (!social) {
        await rate(db, 'join', viewer, 5, 600000);
        const name = input.displayName === undefined ? account.name : displayName(input.displayName);
        const bio = input.bio === undefined ? '' : text(input.bio, CHAT_BIO_MAX, 'Your bio', false), now = Date.now();
        await statement(db, 'INSERT OR IGNORE INTO kkeep_chat_profiles (account,display_name,search_key,bio,joined,updated) VALUES (?,?,?,?,?,?)', [viewer, name, normalizeText(name + ' ' + account.name), bio, now, now]).run();
        social = await loadProfile(db, viewer);
      }
      return reply({profile: profile(social!)});
    }
    if (!social) return fail('Join Chat with your Kkeep Profile first.', 403, 'join_required');
    if (path.startsWith('/avatar')) return await profileMedia(request, env, db, viewer, path, 'avatar');
    if (path.startsWith('/banner')) return await profileMedia(request, env, db, viewer, path, 'banner');
    if (path === '/channels' && request.method === 'POST') {
      if (!owner) return fail('Only the Kkeep owner can manage channels.', 403, 'owner_required');
      const input = await body(request), fields = channelFields(input);
      await rate(db, 'channel-management', viewer, 40, 60000);
      if ((await channelList(db)).length >= 100) return fail('Archive a channel before adding another.', 409);
      const channel: ChatChannel = {id: 'channel:' + crypto.randomUUID(),...fields}, now = Date.now();
      await statement(db, 'INSERT INTO kkeep_chat_channels (id,name,category,read_only,archived,created_by,created,updated) VALUES (?,?,?,?,0,?,?,?)', [channel.id,channel.name,channel.category,channel.readOnly ? 1 : 0,viewer,now,now]).run();
      return reply({channel}, 201);
    }
    if (path.startsWith('/channels/') && ['PATCH','DELETE'].includes(request.method)) {
      if (!owner) return fail('Only the Kkeep owner can manage channels.', 403, 'owner_required');
      const target = channelId(path.slice('/channels/'.length)), current = (await channelList(db)).find(channel => channel.id === target);
      if (!current) return fail('This channel is unavailable.', 404);
      const fields = request.method === 'DELETE' ? current : channelFields(await body(request), current), now = Date.now();
      await rate(db, 'channel-management', viewer, 40, 60000);
      const changed = await statement(db, 'INSERT INTO kkeep_chat_channels (id,name,category,read_only,archived,created_by,created,updated) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,category=excluded.category,read_only=excluded.read_only,archived=excluded.archived,updated=excluded.updated WHERE kkeep_chat_channels.archived=0', [target,fields.name,fields.category,fields.readOnly ? 1 : 0,request.method === 'DELETE' ? 1 : 0,viewer,now,now]).run();
      if (!changed.meta.changes) return fail('This channel was archived on another device. Refresh the channel list.', 409, 'channel_changed');
      return request.method === 'DELETE' ? reply({ok: true}) : reply({channel: {id: target,...fields}});
    }
    if (request.method === 'GET') await rate(db, 'read', viewer, 240, 60000);

    if (path === '/profile' && request.method === 'GET') {
      const target = url.searchParams.has('id') ? id(url.searchParams.get('id')) : viewer, found = await loadProfile(db, target), relationship = await relation(db, viewer, target);
      if (!found || relationship.relationship === 'blocked') return fail('This profile is unavailable.', 404);
      return reply({profile: profile(found), ...relationship});
    }
    if (path === '/profile' && request.method === 'PATCH') {
      const input = await body(request), name = input.displayName === undefined ? social.displayName : displayName(input.displayName), bio = input.bio === undefined ? social.bio : text(input.bio, CHAT_BIO_MAX, 'Your bio', false);
      const nameColor = color(input.nameColor,social.nameColor), primaryColor = color(input.primaryColor,social.primaryColor), secondaryColor = color(input.secondaryColor,social.secondaryColor);
      await rate(db, 'profile', viewer, 30, 3600000);
      await statement(db, 'UPDATE kkeep_chat_profiles SET display_name=?,search_key=?,bio=?,name_color=?,primary_color=?,secondary_color=?,updated=? WHERE account=?', [name, normalizeText(name + ' ' + account.name), bio, nameColor, primaryColor, secondaryColor, Date.now(), viewer]).run();
      return reply({profile: profile((await loadProfile(db, viewer))!)});
    }
    if (path === '/people' && request.method === 'GET') {
      await rate(db, 'people', viewer, 60, 60000);
      const query = (url.searchParams.get('q') || '').normalize('NFKC').trim();
      if (query.length > 60) return fail('Search using up to 60 characters.');
      const escaped = normalizeText(query).replace(/[\\%_]/g, character => '\\' + character);
      const found = await rows<Row & {friendId: string | null; friendSender: string | null; friendStatus: string | null}>(db, 'SELECT ' + profileColumns + ',f.id AS friendId,f.sender AS friendSender,f.status AS friendStatus FROM ' + profileJoin + ' LEFT JOIN kkeep_chat_friends f ON f.pair_key=CASE WHEN p.account<? THEN p.account || ? ELSE ? || p.account END WHERE p.account<>? AND ' + unblocked('p.account', '?') + (query ? " AND p.search_key LIKE ? ESCAPE '\\'" : '') + ' ORDER BY p.joined DESC,p.account LIMIT 30', [viewer, ':' + viewer, viewer + ':', viewer, viewer, viewer, ...(query ? ['%' + escaped + '%'] : [])]);
      const people = found.map(row => ({...user(row), relationship: row.friendStatus === 'accepted' ? 'friends' : row.friendId ? row.friendSender === viewer ? 'outgoing' : 'incoming' : 'none', ...(row.friendId ? {requestId: row.friendId} : {})}));
      return reply({people});
    }
    if (path === '/friends' && request.method === 'GET') {
      const found = await rows<FriendRow>(db, 'SELECT f.id AS friendId,f.sender,f.receiver,f.status,f.created AS createdAt,' + profileColumns + ' FROM kkeep_chat_friends f JOIN kkeep_chat_profiles p ON p.account=CASE WHEN f.sender=? THEN f.receiver ELSE f.sender END JOIN kkeep_accounts a ON a.id=p.account WHERE (f.sender=? OR f.receiver=?) AND ' + unblocked('f.sender', 'f.receiver') + ' ORDER BY f.updated DESC LIMIT 500', [viewer, viewer, viewer]);
      const items: ChatFriend[] = found.map(row => ({id: row.friendId, status: row.status, direction: row.sender === viewer ? 'outgoing' : 'incoming', user: user(row), createdAt: row.createdAt}));
      return reply({friends: items.filter(item => item.status === 'accepted'), incoming: items.filter(item => item.status === 'pending' && item.direction === 'incoming'), outgoing: items.filter(item => item.status === 'pending' && item.direction === 'outgoing')});
    }
    if (path === '/friends' && request.method === 'POST') {
      const input = await body(request), target = id(input.accountId);
      await targetProfile(db, viewer, target);
      const current = await relation(db, viewer, target);
      if (current.relationship === 'blocked') return fail('This player is unavailable.', 403);
      if (current.relationship === 'incoming') return fail('Accept this player’s incoming request from Friends.', 409);
      if (current.requestId) return reply({ok: true, id: current.requestId});
      await rate(db, 'friend-request', viewer, 10, 900000); await rate(db, 'friend-day', viewer, 40, 86400000);
      const friendId = crypto.randomUUID(), now = Date.now();
      await statement(db, "INSERT OR IGNORE INTO kkeep_chat_friends (id,pair_key,sender,receiver,status,created,updated) SELECT ?,?,?,?,'pending',?,? WHERE " + unblocked('?', '?'), [friendId, pair(viewer, target), viewer, target, now, now, viewer, target, target, viewer]).run();
      const updated = await relation(db, viewer, target);
      if (!updated.requestId) return fail('This player is unavailable.', 403);
      return reply({ok: true, id: updated.requestId});
    }
    if (path.startsWith('/friends/') && request.method === 'POST') {
      const friendId = id(path.slice('/friends/'.length)), input = await body(request), action = input.action;
      const found = await one<{id: string; sender: string; receiver: string; status: string}>(db, 'SELECT id,sender,receiver,status FROM kkeep_chat_friends WHERE id=? AND (sender=? OR receiver=?)', [friendId, viewer, viewer]);
      if (!found) return fail('This friend request is unavailable.', 404);
      await rate(db, 'friend-actions', viewer, 60, 60000);
      if (action === 'accept') {
        if (found.receiver !== viewer) return fail('Only the recipient can accept this request.', 403);
        const changed = await statement(db, "UPDATE kkeep_chat_friends SET status='accepted',updated=? WHERE id=? AND receiver=? AND status IN ('pending','accepted') AND " + unblocked('sender', 'receiver'), [Date.now(), friendId, viewer]).run();
        if (!changed.meta.changes) return fail('This request is no longer available.', 409);
      } else if (action === 'decline' || action === 'cancel' || action === 'remove') {
        const condition = action === 'decline' ? "receiver=? AND status='pending'" : action === 'cancel' ? "sender=? AND status='pending'" : "status='accepted' AND (sender=? OR receiver=?)";
        const removed = await statement(db, 'DELETE FROM kkeep_chat_friends WHERE id=? AND ' + condition, [friendId, viewer, ...(action === 'remove' ? [viewer] : [])]).run();
        if (!removed.meta.changes) return fail('You cannot perform that action on this request.', 403);
      } else return fail('Choose a valid friend action.');
      return reply({ok: true});
    }
    if (path === '/conversations' && request.method === 'GET') return reply({conversations: await conversations(db, viewer)});
    if (path === '/conversations' && request.method === 'POST') {
      const input = await body(request), target = id(input.accountId); await targetProfile(db, viewer, target);
      await rate(db, 'conversation', viewer, 40, 60000);
      const pairKey = pair(viewer, target), [low, high] = [viewer, target].sort(), now = Date.now();
      await statement(db, 'INSERT OR IGNORE INTO kkeep_chat_conversations (id,pair_key,low,high,created,updated) SELECT ?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM kkeep_chat_friends f WHERE f.pair_key=? AND f.status=\'accepted\' AND ' + unblocked('f.sender', 'f.receiver') + ')', [crypto.randomUUID(), pairKey, low, high, now, now, pairKey]).run();
      const existing = await one<{id: string}>(db, 'SELECT id FROM kkeep_chat_conversations WHERE pair_key=?', [pairKey]);
      const conversation = existing ? (await conversations(db, viewer, existing.id))[0] : undefined;
      if (!conversation) return fail('Add this player as a friend before sending a private message.', 403, 'friends_required');
      return reply({conversation});
    }
    if (path === '/messages' && request.method === 'GET') return await history(db, viewer, url);
    if (path === '/messages' && request.method === 'POST') {
      const input = await body(request), room = roomId(input.roomId), clientId = id(input.clientId), content = text(input.text, CHAT_MESSAGE_MAX, 'Your message');
      await requireRoom(db, room, viewer, true, owner);
      const existing = await one<{room: string; text: string}>(db, 'SELECT room,text FROM kkeep_chat_messages WHERE author=? AND client_id=?', [viewer, clientId]);
      if (existing) {
        if (existing.room !== room || existing.text !== content) return fail('This send ID was already used. Start a new message.', 409, 'idempotency_conflict');
        const found = (await messageRows(db, viewer, room, 'AND m.author=? AND m.client_id=?', [viewer, clientId]))[0];
        if (!found) return fail('This conversation is unavailable.', 403);
        return reply({message: message(found, viewer)});
      }
      await rate(db, 'send', viewer, 30, 60000); await rate(db, 'send-day', viewer, 1200, 86400000);
      const access = roomAccess(room, viewer, true, owner), now = Date.now();
      await db.batch([
        statement(db, 'INSERT OR IGNORE INTO kkeep_chat_messages (room,author,text,client_id,created,deleted) SELECT ?,?,?,?,?,0 WHERE ' + access.sql, [room, viewer, content, clientId, now, ...access.args]),
        statement(db, "INSERT OR IGNORE INTO kkeep_chat_events (room,message,kind) SELECT room,id,'created' FROM kkeep_chat_messages WHERE author=? AND client_id=? AND room=? AND " + access.sql, [viewer, clientId, room, ...access.args]),
        statement(db, 'UPDATE kkeep_chat_conversations SET updated=? WHERE id=? AND EXISTS (SELECT 1 FROM kkeep_chat_messages WHERE author=? AND client_id=? AND room=?)', [now, room, viewer, clientId, room]),
      ]);
      const found = (await messageRows(db, viewer, room, 'AND m.author=? AND m.client_id=?', [viewer, clientId]))[0];
      if (!found) return fail('This conversation is unavailable.', 403, 'conversation_unavailable');
      if (found.text !== content) return fail('This send ID was already used.', 409, 'idempotency_conflict');
      return reply({message: message(found, viewer)}, 201);
    }
    if (path.startsWith('/messages/') && request.method === 'DELETE') {
      const messageId = number(path.slice('/messages/'.length));
      if (!await one(db, 'SELECT id FROM kkeep_chat_messages WHERE id=? AND author=?', [messageId, viewer])) return fail('This message is unavailable.', 404);
      await rate(db, 'delete', viewer, 60, 60000);
      await db.batch([
        statement(db, "UPDATE kkeep_chat_messages SET text='',deleted=1 WHERE id=? AND author=?", [messageId, viewer]),
        statement(db, "INSERT OR IGNORE INTO kkeep_chat_events (room,message,kind) SELECT room,id,'deleted' FROM kkeep_chat_messages WHERE id=? AND author=? AND deleted=1", [messageId, viewer]),
      ]);
      return reply({ok: true});
    }
    if (path === '/blocks' && request.method === 'GET') {
      const found = await rows<Row>(db, 'SELECT ' + profileColumns + ' FROM kkeep_chat_blocks b JOIN kkeep_chat_profiles p ON p.account=b.blocked JOIN kkeep_accounts a ON a.id=p.account WHERE b.blocker=? ORDER BY b.created DESC LIMIT 500', [viewer]);
      return reply({blocks: found.map(user)});
    }
    if (path === '/blocks' && request.method === 'POST') {
      const input = await body(request), target = id(input.accountId); await targetProfile(db, viewer, target);
      await rate(db, 'block', viewer, 30, 60000);
      await db.batch([
        statement(db, 'INSERT OR IGNORE INTO kkeep_chat_blocks (blocker,blocked,created) VALUES (?,?,?)', [viewer, target, Date.now()]),
        statement(db, 'DELETE FROM kkeep_chat_friends WHERE pair_key=?', [pair(viewer, target)]),
      ]);
      return reply({ok: true});
    }
    if (path.startsWith('/blocks/') && request.method === 'DELETE') {
      const target = id(path.slice('/blocks/'.length));
      await rate(db, 'block', viewer, 30, 60000);
      await statement(db, 'DELETE FROM kkeep_chat_blocks WHERE blocker=? AND blocked=?', [viewer, target]).run();
      return reply({ok: true});
    }
    if (path === '/reports' && request.method === 'POST') {
      const input = await body(request);
      if (!Number.isSafeInteger(input.messageId) || Number(input.messageId) < 1) return fail('Choose a valid message.');
      const reason = text(input.reason, 500, 'A report reason'), messageId = Number(input.messageId);
      const target = await one<{room: string; author: string}>(db, 'SELECT room,author FROM kkeep_chat_messages WHERE id=?', [messageId]);
      if (!target || target.author === viewer) return fail('This message cannot be reported.', 404);
      const found = (await messageRows(db, viewer, target.room, 'AND m.id=?', [messageId]))[0];
      if (!found) return fail('This message is unavailable.', 404);
      if (!await one(db, 'SELECT id FROM kkeep_chat_reports WHERE reporter=? AND message=?', [viewer, messageId])) {
        await rate(db, 'report', viewer, 12, 86400000);
        const access = roomAccess(target.room, viewer);
        await statement(db, 'INSERT OR IGNORE INTO kkeep_chat_reports (reporter,message,reason,created) SELECT ?,?,?,? WHERE ' + access.sql, [viewer, messageId, reason, Date.now(), ...access.args]).run();
      }
      return reply({ok: true});
    }
    return reply({error: 'Chat route or method not found.', code: 'not_found'}, 404);
  } catch (error) {
    if (error instanceof ChatError) return Response.json({error: error.message, code: error.code}, {status: error.status, headers: {...jsonHeaders, ...(error.retryAfter ? {'Retry-After': String(error.retryAfter)} : {})}});
    return reply({error: 'Chat could not complete this request. Please try again.', code: 'chat_unavailable'}, 503);
  }
}
