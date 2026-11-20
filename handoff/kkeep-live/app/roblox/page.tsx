import RobloxPlayer from '@/components/roblox-player';
import {robloxOrigin} from '@/lib/roblox-player';
import './roblox.css';

export const metadata={title:'Roblox · Kkeep'};

export default function RobloxPage(){
  return <><link rel="preconnect" href={robloxOrigin}/><link rel="preconnect" href="https://setup.rbxcdn.com" crossOrigin="anonymous"/><RobloxPlayer/></>;
}
