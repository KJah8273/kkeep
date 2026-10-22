import {redirect} from 'next/navigation';
import {robloxUrl} from '@/lib/apps';

export const metadata={title:'Roblox · Kkeep'};

export default function RobloxPage(){
  redirect(robloxUrl);
}
