import {redirect} from 'next/navigation';
import {clashRoyaleUrl} from '@/lib/apps';

export const metadata={title:'Clash Royale · Kkeep'};

export default function ClashRoyalePage(){
  redirect(clashRoyaleUrl);
}
