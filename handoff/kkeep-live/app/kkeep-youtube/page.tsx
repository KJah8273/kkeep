import type {Metadata} from 'next';
import KkeepYoutube from '@/components/kkeep-youtube';
import './youtube.css';
export const metadata:Metadata={title:'Kkeep YouTube',description:'Watch videos, follow channels, and save your place with your Kkeep Profile.'};
export default function KkeepYoutubePage(){return <KkeepYoutube/>;}
