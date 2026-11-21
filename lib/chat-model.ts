/** Public chat contracts. Session tokens, login keys and storage keys never leave the server. */
export const CHAT_PERMISSIONS = ['delete_messages','timeout_members','ban_members','manage_channels'] as const;
export type ChatPermission = typeof CHAT_PERMISSIONS[number];
export type ChatRoleBadge = {id:string;name:string;color:string;position:number};
export type ChatRole = ChatRoleBadge & {permissions:ChatPermission[]};
export const CHAT_AVATAR_DECORATIONS = ['none','solar','fangs','wraith','sakura','crescent','shadow','wings'] as const;
export const CHAT_NAMEPLATE_STYLES = ['none','ravens','crimson','moonlight','ocean','haunted','ink'] as const;
export type ChatAvatarDecoration = typeof CHAT_AVATAR_DECORATIONS[number];
export type ChatNameplateStyle = typeof CHAT_NAMEPLATE_STYLES[number];
export type ChatModeration = {banned:boolean;timeoutUntil:number|null};
export type ChatAccess = ChatModeration & {isOwner:boolean;permissions:ChatPermission[];canManageRoles:boolean;canClaimOwner:boolean};
export type ChatUser = {
  id: string;
  username: string;
  name: string;
  displayName: string;
  nameColor: string;
  avatarUrl: string | null;
  avatarDecoration: ChatAvatarDecoration;
  nameplateStyle: ChatNameplateStyle;
  roles: ChatRoleBadge[];
  isOwner: boolean;
};
export type ChatProfile = ChatUser & {bio: string; joinedAt: number; bannerUrl: string | null; primaryColor: string; secondaryColor: string};
export type ChatRelationship = 'self' | 'none' | 'friends' | 'incoming' | 'outgoing' | 'blocked';
export type ChatPerson = ChatUser & {relationship: ChatRelationship; requestId?: string};
export type ChatFriend = {
  id: string;
  status: 'pending' | 'accepted';
  direction: 'incoming' | 'outgoing';
  user: ChatUser;
  createdAt: number;
};
export type ChatConversation = {id: string; user: ChatUser; updatedAt: number};
export type ChatMessage = {
  id: number;
  roomId: string;
  author: ChatUser;
  text: string;
  createdAt: number;
  deleted: boolean;
  /** Returned only to the author; lets an uncertain send retry safely. */
  clientId?: string;
};
export type ChatSession = {account: {id: string; name: string; username:string} | null; profile: ChatProfile | null; memberCount: number;access:ChatAccess};
export type ChatMember = {user:ChatUser;moderation:ChatModeration;canTimeout:boolean;canBan:boolean};
export type ChatMessagesPage = {messages: ChatMessage[]; cursor: number; hasMore: boolean; oldestId: number | null};
export type ChatFriends = {friends: ChatFriend[]; incoming: ChatFriend[]; outgoing: ChatFriend[]};
export type ChatChannel = {id: string; name: string; category: string; readOnly: boolean};
export type ChatChannels = {channels: ChatChannel[]; canManageChannels: boolean; ownerConfigured: boolean; ownerSignedIn: boolean};
/** Virtual defaults receive durable overrides/tombstones when the owner edits them. */
export const DEFAULT_CHAT_CHANNELS: readonly ChatChannel[] = [
  {id:'channel:rules',name:'rules',category:'Kkeep',readOnly:true},
  {id:'channel:announcements',name:'announcements',category:'Kkeep',readOnly:true},
  {id:'channel:links',name:'links',category:'Kkeep',readOnly:true},
  {id:'channel:polls',name:'polls',category:'Kkeep',readOnly:true},
  {id:'channel:faq',name:'faq',category:'Kkeep',readOnly:true},
  {id:'public',name:'general',category:'Chat',readOnly:false},
  {id:'channel:commands',name:'commands',category:'Chat',readOnly:false},
  {id:'channel:ad-reports',name:'ad-reports',category:'Chat',readOnly:false},
  {id:'channel:questions',name:'questions',category:'Chat',readOnly:false},
];
export const CHAT_MESSAGE_MAX = 2000;
export const CHAT_BIO_MAX = 160;
export const CHAT_AVATAR_MAX = 2 * 1024 * 1024;
export const CHAT_GIF_MAX = 8 * 1024 * 1024;
