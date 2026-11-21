import {sqliteTable,text,integer,index,uniqueIndex,check} from 'drizzle-orm/sqlite-core';
import {sql} from 'drizzle-orm';
export const browserItems=sqliteTable('browser_items',{
 id:text('id').primaryKey(),owner:text('owner').notNull(),kind:text('kind').notNull(),
 title:text('title').notNull(),url:text('url').notNull(),created:integer('created').notNull(),
},t=>[index('browser_items_owner_kind_created').on(t.owner,t.kind,t.created)]);
export const ideas=sqliteTable('ideas',{
 id:text('id').primaryKey(),owner:text('owner').notNull(),message:text('message').notNull(),created:integer('created').notNull(),
},t=>[index('ideas_owner_created').on(t.owner,t.created),index('ideas_created').on(t.created)]);
export const partyRooms=sqliteTable('party_rooms',{
 id:text('id').primaryKey(),name:text('name').notNull(),game:text('game').notNull(),
 state:text('state').notNull(),version:integer('version').notNull().default(0),
 createdBy:text('created_by').notNull(),created:integer('created').notNull(),updated:integer('updated').notNull(),
},t=>[index('party_rooms_updated').on(t.updated),index('party_rooms_creator_created').on(t.createdBy,t.created)]);

// Only coarse first-party analytics. No raw IP, URL, query, referrer or account data.
export const analyticsEvents=sqliteTable('analytics_events',{
 id:text('id').primaryKey(),visitor:text('visitor').notNull(),created:integer('created').notNull(),
 day:text('day').notNull(),country:text('country').notNull(),device:text('device').notNull(),
 browser:text('browser').notNull(),surface:text('surface').notNull(),
},t=>[index('analytics_events_created').on(t.created),index('analytics_events_visitor_created').on(t.visitor,t.created)]);

// Stick Fight's browser room transport. Isolated from browser/session storage.
export const stickRooms=sqliteTable('stick_rooms',{
 code:text('code').primaryKey(),host:text('host').notNull(),name:text('name').notNull(),private:integer('private').notNull(),updated:integer('updated').notNull(),
},t=>[index('stick_rooms_updated').on(t.updated)]);
export const stickMembers=sqliteTable('stick_members',{
 id:text('id').primaryKey(),room:text('room').notNull(),name:text('name').notNull(),seen:integer('seen').notNull(),joined:integer('joined').notNull(),
},t=>[index('stick_members_room').on(t.room),index('stick_members_seen').on(t.seen)]);
export const stickMessages=sqliteTable('stick_messages',{
 id:integer('id').primaryKey({autoIncrement:true}),room:text('room').notNull(),recipient:text('recipient').notNull(),payload:text('payload').notNull(),created:integer('created').notNull(),
},t=>[index('stick_messages_recipient_id').on(t.recipient,t.id),index('stick_messages_created').on(t.created)]);

// Anonymous browser-owned backups. No expiry or game/cache cleanup deletes these.
export const hgolaSaves=sqliteTable('hgola_saves',{
 owner:text('owner').primaryKey(),data:text('data').notNull(),previous:text('previous'),
 revision:integer('revision').notNull().default(1),updated:integer('updated').notNull(),
});

export const kkeepAccounts=sqliteTable('kkeep_accounts',{
 id:text('id').primaryKey(),username:text('username').notNull().unique(),name:text('name').notNull(),password:text('password').notNull(),created:integer('created').notNull(),
});
export const kkeepSessions=sqliteTable('kkeep_sessions',{
 token:text('token').primaryKey(),account:text('account').notNull(),expires:integer('expires').notNull(),
},t=>[index('kkeep_sessions_account').on(t.account)]);
export const kkeepProfiles=sqliteTable('kkeep_profiles',{
 account:text('account').primaryKey(),data:text('data').notNull(),revision:integer('revision').notNull(),updated:integer('updated').notNull(),
});
export const kkeepAuthLimits=sqliteTable('kkeep_auth_limits',{
 key:text('key').primaryKey(),count:integer('count').notNull(),expires:integer('expires').notNull(),
});
export const kkeepMedia=sqliteTable('kkeep_media',{
 key:integer('key').primaryKey({autoIncrement:true}),account:text('account').notNull(),id:text('id').notNull(),
},t=>[uniqueIndex('kkeep_media_owner_id').on(t.account,t.id)]);

// The current chat uses Kkeep Profile identities. Retired private_* data stays isolated.
export const kkeepChatProfiles=sqliteTable('kkeep_chat_profiles',{
 account:text('account').primaryKey().references(()=>kkeepAccounts.id),
 displayName:text('display_name').notNull(),searchKey:text('search_key').notNull(),bio:text('bio').notNull().default(''),
 avatarKey:text('avatar_key'),avatarType:text('avatar_type'),avatarVersion:text('avatar_version'),
 bannerKey:text('banner_key'),bannerType:text('banner_type'),bannerVersion:text('banner_version'),
 nameColor:text('name_color').notNull().default('#eeeeee'),primaryColor:text('primary_color').notNull().default('#181b22'),secondaryColor:text('secondary_color').notNull().default('#121212'),
 joined:integer('joined').notNull(),updated:integer('updated').notNull(),
},t=>[index('kkeep_chat_profiles_search').on(t.searchKey),index('kkeep_chat_profiles_joined').on(t.joined)]);
export const kkeepChatFriends=sqliteTable('kkeep_chat_friends',{
 id:text('id').primaryKey(),pairKey:text('pair_key').notNull(),sender:text('sender').notNull().references(()=>kkeepChatProfiles.account),
 receiver:text('receiver').notNull().references(()=>kkeepChatProfiles.account),status:text('status').notNull(),
 created:integer('created').notNull(),updated:integer('updated').notNull(),
},t=>[uniqueIndex('kkeep_chat_friends_pair').on(t.pairKey),index('kkeep_chat_friends_sender').on(t.sender,t.status),index('kkeep_chat_friends_receiver').on(t.receiver,t.status),check('kkeep_chat_friends_not_self',sql.raw('sender <> receiver')),check('kkeep_chat_friends_status',sql.raw("status IN ('pending','accepted')"))]);
export const kkeepChatConversations=sqliteTable('kkeep_chat_conversations',{
 id:text('id').primaryKey(),pairKey:text('pair_key').notNull(),low:text('low').notNull().references(()=>kkeepChatProfiles.account),
 high:text('high').notNull().references(()=>kkeepChatProfiles.account),created:integer('created').notNull(),updated:integer('updated').notNull(),
},t=>[uniqueIndex('kkeep_chat_conversations_pair').on(t.pairKey),index('kkeep_chat_conversations_low').on(t.low,t.updated),index('kkeep_chat_conversations_high').on(t.high,t.updated),check('kkeep_chat_conversations_order',sql.raw('low < high'))]);
export const kkeepChatMessages=sqliteTable('kkeep_chat_messages',{
 id:integer('id').primaryKey({autoIncrement:true}),room:text('room').notNull(),author:text('author').notNull().references(()=>kkeepChatProfiles.account),
 text:text('text').notNull(),clientId:text('client_id').notNull(),created:integer('created').notNull(),deleted:integer('deleted').notNull().default(0),
},t=>[index('kkeep_chat_messages_room_id').on(t.room,t.id),uniqueIndex('kkeep_chat_messages_retry').on(t.author,t.clientId),check('kkeep_chat_message_deleted',sql.raw('deleted IN (0,1)'))]);
export const kkeepChatEvents=sqliteTable('kkeep_chat_events',{
 id:integer('id').primaryKey({autoIncrement:true}),room:text('room').notNull(),message:integer('message').notNull().references(()=>kkeepChatMessages.id),kind:text('kind').notNull(),
},t=>[index('kkeep_chat_events_room_id').on(t.room,t.id),uniqueIndex('kkeep_chat_events_message_kind').on(t.message,t.kind),check('kkeep_chat_event_kind',sql.raw("kind IN ('created','deleted')"))]);
export const kkeepChatBlocks=sqliteTable('kkeep_chat_blocks',{
 id:integer('id').primaryKey({autoIncrement:true}),blocker:text('blocker').notNull().references(()=>kkeepChatProfiles.account),blocked:text('blocked').notNull().references(()=>kkeepChatProfiles.account),created:integer('created').notNull(),
},t=>[uniqueIndex('kkeep_chat_blocks_pair').on(t.blocker,t.blocked),index('kkeep_chat_blocks_incoming').on(t.blocked,t.blocker),check('kkeep_chat_blocks_not_self',sql.raw('blocker <> blocked'))]);
export const kkeepChatReports=sqliteTable('kkeep_chat_reports',{
 id:integer('id').primaryKey({autoIncrement:true}),reporter:text('reporter').notNull().references(()=>kkeepChatProfiles.account),message:integer('message').notNull().references(()=>kkeepChatMessages.id),reason:text('reason').notNull(),created:integer('created').notNull(),
},t=>[uniqueIndex('kkeep_chat_reports_once').on(t.reporter,t.message)]);
export const kkeepChatLimits=sqliteTable('kkeep_chat_limits',{
 key:text('key').primaryKey(),count:integer('count').notNull(),expires:integer('expires').notNull(),
},t=>[index('kkeep_chat_limits_expiry').on(t.expires)]);
export const kkeepChatChannels=sqliteTable('kkeep_chat_channels',{
 id:text('id').primaryKey(),name:text('name').notNull(),category:text('category').notNull(),readOnly:integer('read_only').notNull().default(0),archived:integer('archived').notNull().default(0),
 createdBy:text('created_by').notNull().references(()=>kkeepChatProfiles.account),created:integer('created').notNull(),updated:integer('updated').notNull(),
},()=>[check('kkeep_chat_channel_readonly',sql.raw('read_only IN (0,1)')),check('kkeep_chat_channel_archived',sql.raw('archived IN (0,1)'))]);
export const kkeepChatAvatarCleanup=sqliteTable('kkeep_chat_avatar_cleanup',{
 key:text('key').primaryKey(),account:text('account').notNull().references(()=>kkeepChatProfiles.account),created:integer('created').notNull(),
},t=>[index('kkeep_chat_avatar_cleanup_account').on(t.account,t.created)]);
