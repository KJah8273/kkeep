import type {Metadata} from 'next';
import {House,MessageCircle} from 'lucide-react';
import KkeepChat from '@/components/kkeep-chat';
import '../legacy-chat.css';

export const metadata:Metadata={
  title:'Chat · Kkeep',
  description:'Chat with the Kkeep community, find friends, and make your profile your own.',
  robots:{index:false,follow:true},
};

export default function ChatPage(){
  return <KkeepChat navigation={<nav className="legacy-chat-navigation" aria-label="Main navigation"><a href="/"><House size={17} aria-hidden="true"/><span>Home</span></a><a href="/chat" aria-current="page"><MessageCircle size={17} aria-hidden="true"/><span>Chat</span></a></nav>}/>;
}
