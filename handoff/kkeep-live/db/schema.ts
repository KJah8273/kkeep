import {sqliteTable,text,integer,index,uniqueIndex} from 'drizzle-orm/sqlite-core';
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

export const kkeepGameSaves=sqliteTable('kkeep_game_saves',{
 id:integer('id').primaryKey({autoIncrement:true}),account:text('account').notNull(),game:text('game').notNull(),
 data:text('data').notNull(),previous:text('previous'),revision:integer('revision').notNull(),updated:integer('updated').notNull(),
},t=>[uniqueIndex('kkeep_game_saves_account_game').on(t.account,t.game)]);

// Kkeep YouTube library is private to the existing Profile account.
export const kkeepVideoItems=sqliteTable('kkeep_video_items',{
 id:integer('id').primaryKey({autoIncrement:true}),account:text('account').notNull(),video:text('video').notNull(),data:text('data').notNull(),
 position:integer('position').notNull().default(0),duration:integer('duration').notNull().default(0),watched:integer('watched').notNull().default(0),
 saved:integer('saved').notNull().default(0),liked:integer('liked').notNull().default(0),updated:integer('updated').notNull(),session:text('session'),seq:integer('seq').notNull().default(0),
},t=>[uniqueIndex('kkeep_video_owner_video').on(t.account,t.video),index('kkeep_video_recent').on(t.account,t.updated)]);
export const kkeepVideoChannels=sqliteTable('kkeep_video_channels',{
 id:integer('id').primaryKey({autoIncrement:true}),account:text('account').notNull(),channel:text('channel').notNull(),name:text('name').notNull(),created:integer('created').notNull(),
},t=>[uniqueIndex('kkeep_video_owner_channel').on(t.account,t.channel)]);

export const privateUsers=sqliteTable('private_users',{id:text('id').primaryKey(),subject:text('subject').notNull().unique(),username:text('username').unique(),name:text('name'),passwordHash:text('password_hash'),avatarKey:text('avatar_key'),avatarType:text('avatar_type'),createdAt:integer('created_at').notNull()});
export const privateSessions=sqliteTable('private_sessions',{tokenHash:text('token_hash').primaryKey(),userId:text('user_id').notNull().references(()=>privateUsers.id),expiresAt:integer('expires_at').notNull()});
export const privateOauth=sqliteTable('private_oauth',{state:text('state').primaryKey(),bindingHash:text('binding_hash').notNull(),verifier:text('verifier').notNull(),expiresAt:integer('expires_at').notNull()});
export const privateFriends=sqliteTable('private_friends',{id:text('id').primaryKey(),pairKey:text('pair_key').notNull().unique(),sender:text('sender').notNull().references(()=>privateUsers.id),receiver:text('receiver').notNull().references(()=>privateUsers.id),status:text('status').notNull(),createdAt:integer('created_at').notNull()});
export const privateRooms=sqliteTable('private_rooms',{id:text('id').primaryKey(),kind:text('kind').notNull(),name:text('name'),creator:text('creator').notNull().references(()=>privateUsers.id),dmKey:text('dm_key').unique(),createdAt:integer('created_at').notNull(),updatedAt:integer('updated_at').notNull()});
export const privateMembers=sqliteTable('private_members',{roomId:text('room_id').notNull().references(()=>privateRooms.id),userId:text('user_id').notNull().references(()=>privateUsers.id)});
export const privateMessages=sqliteTable('private_messages',{id:text('id').primaryKey(),roomId:text('room_id').notNull().references(()=>privateRooms.id),authorId:text('author_id').notNull().references(()=>privateUsers.id),text:text('text').notNull(),createdAt:integer('created_at').notNull()},t=>[index('private_messages_room_time').on(t.roomId,t.createdAt)]);

export const chatLimits=sqliteTable('rate_limits',{key:text('key').primaryKey(),count:integer('count').notNull(),expiresAt:integer('expires_at').notNull()});

export const kkeepGoogleAccounts=sqliteTable('kkeep_google_accounts',{subject:text('subject').primaryKey(),account:text('account').notNull().references(()=>kkeepAccounts.id)});
export const kkeepLoginNonces=sqliteTable('kkeep_login_nonces',{nonce:text('nonce').primaryKey(),account:text('account').notNull(),expires:integer('expires').notNull()});
export const kkeepCommunityCodes=sqliteTable('kkeep_community_codes',{code:text('code').primaryKey(),account:text('account').notNull(),state:text('state').notNull(),expires:integer('expires').notNull()});
