'use client';

import {useState} from 'react';
import {MessageCircle,Pencil,RotateCw} from 'lucide-react';
import ChatProfileEditor from './chat-profile-editor';
import {useChatProfile} from '@/lib/use-chat-profile';
import {chatNameColor} from '@/lib/chat-client';
import {Button} from './ui/button';

export default function ProfileSocial(){
  const {profile,setProfile,loading,error,refresh}=useChatProfile();
  const [editing,setEditing]=useState(false);
  return <section className="profile-social" aria-label="Chat profile">
    {loading?<p role="status">Loading chat profile…</p>:error?<div role="status"><p>{error}</p><Button variant="secondary" onClick={()=>void refresh()}><RotateCw size={16}/>Retry</Button></div>:profile?<>
      <strong dir="auto" style={{color:chatNameColor(profile.nameColor)}}>{profile.displayName}</strong>
      {profile.bio&&<p dir="auto">{profile.bio}</p>}
      <Button variant="secondary" onClick={()=>setEditing(true)}><Pencil size={16}/>Edit photo and profile</Button>
    </>:<p>Set up your public chat profile to add a photo and meet friends.</p>}
    {profile&&<ChatProfileEditor key={profile.id} open={editing} onOpenChange={setEditing} profile={profile} onSaved={setProfile}/>}
    <a className="profile-chat-link" href="/chat"><MessageCircle size={17}/>{profile?'Open Chat':'Set up chat profile'}</a>
  </section>;
}
