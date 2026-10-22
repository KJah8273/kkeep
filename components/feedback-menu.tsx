'use client';
import {MessageSquare} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Dialog,DialogContent,DialogTitle,DialogDescription,DialogTrigger} from '@/components/ui/dialog';
import IdeasForm from '@/components/ideas-form';

export default function FeedbackMenu(){
 return <Dialog>
  <DialogTrigger asChild><Button variant="ghost"><MessageSquare size={20}/>Fix or idea</Button></DialogTrigger>
  <DialogContent className="proxy-dialog feedback-menu">
   <DialogTitle className="sr-only">Fix or idea</DialogTitle>
   <DialogDescription className="sr-only">Report a problem or share an idea with Kkeep.</DialogDescription>
   <IdeasForm title="Fix or idea"/>
  </DialogContent>
 </Dialog>;
}
