'use client';

import {useEffect,useState,type CSSProperties,type ReactNode} from 'react';
import ChatAvatar from './chat-avatar';
import {ChatNameplateArt,ChatRoleBadges} from './chat-appearance';
import {chatNameColor,normalizeChatColor} from '@/lib/chat-client';
import type {ChatProfile} from '@/lib/chat-model';
import '@/app/chat.css';

function shadedColor(color:string){
  return '#'+[1,3,5].map(index=>Math.round(parseInt(color.slice(index,index+2),16)*.28+8*.72).toString(16).padStart(2,'0')).join('');
}

export default function ChatProfileCard({profile,preview=false,actions,showJoined=false,className=''}:{profile:ChatProfile;preview?:boolean;actions?:ReactNode;showJoined?:boolean;className?:string}){
  const [bannerFailed,setBannerFailed]=useState(false);
  useEffect(()=>setBannerFailed(false),[profile.bannerUrl]);
  const primary=normalizeChatColor(profile.primaryColor,'#181b22'),secondary=normalizeChatColor(profile.secondaryColor,'#121212');
  const style={
    '--chat-profile-primary':primary,
    '--chat-profile-secondary':secondary,
    '--chat-profile-top':shadedColor(primary),
    '--chat-profile-bottom':shadedColor(secondary),
    '--chat-profile-name':chatNameColor(profile.nameColor,'#4d4d4d'),
  } as CSSProperties;
  return <article className={'chat-profile-card '+className} style={style} aria-label={preview?'Live profile preview':profile.displayName+'’s profile'}>
    <div className="chat-card-banner">
      {profile.bannerUrl&&!bannerFailed&&<img src={profile.bannerUrl} alt="" decoding="async" onError={()=>setBannerFailed(true)}/>}
    </div>
    <div className="chat-card-body">
      <div className="chat-card-avatar"><ChatAvatar user={profile} size={76}/>{preview&&<span className="chat-card-self-status" aria-label="You are online"/>}</div>
      <div className={'chat-card-identity '+(profile.nameplateStyle&&profile.nameplateStyle!=='none'?'chat-nameplate':'')}><ChatNameplateArt kind={profile.nameplateStyle}/><h2 dir="auto">{profile.displayName}</h2><p className="chat-card-handle">@{profile.username||profile.name}</p></div>
      <ChatRoleBadges user={profile}/>
      {profile.bio&&<p className="chat-card-bio" dir="auto">{profile.bio}</p>}
      {showJoined&&<p className="chat-card-joined">Joined {new Date(profile.joinedAt).toLocaleDateString([],{month:'long',year:'numeric'})}</p>}
      {actions?<div className="chat-card-actions">{actions}</div>:preview?<div className="chat-card-example" aria-hidden="true">Example button</div>:null}
    </div>
  </article>;
}
