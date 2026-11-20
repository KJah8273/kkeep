'use client';
import {MessageSquare} from 'lucide-react';
import {Button} from '@/components/ui/button';

export default function FeedbackMenu(){
 return <Button variant="ghost" asChild>
  <a href="/#feedback">
   <MessageSquare size={20}/>Fix or idea
  </a>
 </Button>;
}
