'use client';

import {UserRound} from 'lucide-react';
import ChatAvatar from './chat-avatar';
import {useChatProfile} from '@/lib/use-chat-profile';

export default function AccountAvatar({size=36}:{size?:number}){
  const {profile}=useChatProfile();
  return profile?<ChatAvatar user={profile} size={size}/>:<UserRound size={Math.round(size*.48)} aria-hidden="true"/>;
}
