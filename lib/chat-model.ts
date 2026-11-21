/** Public chat contracts. Session tokens, login keys and storage keys never leave the server. */
export type ChatUser = {
  id: string;
  name: string;
  displayName: string;
  nameColor: string;
  avatarUrl: string | null;
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
export type ChatSession = {account: {id: string; name: string} | null; profile: ChatProfile | null; memberCount: number};
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
