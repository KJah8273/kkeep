import type {Metadata} from 'next';
import HgolaPlayer from '@/components/hgola-player';

export const metadata:Metadata={title:'هجولة الطارة · Kkeep',description:'العب هجولة الطارة في Kkeep.'};

export default function HgolaPage(){return <HgolaPlayer/>;}
