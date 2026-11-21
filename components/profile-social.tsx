'use client';

import {useState} from 'react';
import {MessageCircle,Pencil,RotateCw} from 'lucide-react';
import ChatProfileEditor from './chat-profile-editor';
import {useChatProfile} from '@/lib/use-chat-profile';
import ChatProfileCard from './chat-profile-card';
import {Button} from './ui/button';

export default function ProfileSocial(){
  const {profile,setProfile,loading,error,refresh}=useChatProfile();
  const [editing,setEditing]=useState(false);
  return <section className="profile-social" aria-label="Chat profile">
    {loading?<p role="status">Loading chat profile…</p>:error?<div role="status"><p>{error}</p><Button variant="secondary" onClick={()=>void refresh()}><RotateCw size={16}/>Retry</Button></div>:profile?<>
      <ChatProfileCard profile={profile} actions={<Button className="chat-button" variant="secondary" onClick={()=>setEditing(true)}><Pencil size={16}/>Edit your profile</Button>}/>
    </>:<p>Set up your public chat profile to add a photo and meet friends.</p>}
    {profile&&<ChatProfileEditor key={profile.id} open={editing} onOpenChange={setEditing} profile={profile} onSaved={setProfile}/>}
    <a className="profile-chat-link" href="/chat"><MessageCircle size={17}/>{profile?'Open Chat':'Set up chat profile'}</a>
  </section>;
}
