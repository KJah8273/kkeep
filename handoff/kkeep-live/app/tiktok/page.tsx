import type {Metadata} from 'next';
import TikTokPlayer from '@/components/tiktok-player';
import './tiktok.css';
export const metadata:Metadata={title:'TikTok · Kkeep'};
export default function TikTokPage(){return <TikTokPlayer/>;}
