'use client';
import {useEffect,useState} from 'react';
import {ChatAvatarDecoration} from './chat-appearance';
import type {ChatUser} from '@/lib/chat-model';
import '@/app/chat.css';

type AvatarUser = Pick<ChatUser,'displayName'|'avatarUrl'> & Partial<Pick<ChatUser,'avatarDecoration'>>;
export default function ChatAvatar({user,size=38,fallbackName='',className=''}:{user:AvatarUser|null;size?:number;fallbackName?:string;className?:string}) {
  const [failed,setFailed]=useState(false);
  useEffect(()=>setFailed(false),[user?.avatarUrl]);
  const name=user?.displayName || fallbackName || 'K';
  const initials=Array.from(name.trim()).slice(0,2).join('').toLocaleUpperCase();
  return <span className={'chat-avatar '+(user?.avatarDecoration&&user.avatarDecoration!=='none'?'has-decoration ':'')+className} style={{width:size,height:size,fontSize:Math.max(12,Math.round(size*.34))}} aria-hidden="true">
    <span className="chat-avatar-surface">{user?.avatarUrl&&!failed?<img src={user.avatarUrl} alt="" width={size} height={size} decoding="async" onError={()=>setFailed(true)}/>:<span>{initials}</span>}</span><ChatAvatarDecoration kind={user?.avatarDecoration}/>
  </span>;
}
