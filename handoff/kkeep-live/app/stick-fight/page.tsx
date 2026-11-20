import type {Metadata} from 'next';
import StickFightPlayer from '@/components/stick-fight-player';
export const metadata:Metadata={title:'Stick Fight · Kkeep',description:'Play Stick Fight in Kkeep.'};
export default function StickFightPage(){return <StickFightPlayer/>;}
