import type {Metadata} from 'next';
import ProxyBrowser from '@/components/proxy-browser';
export const metadata:Metadata={title:'Kick · Kkeep'};
export default function KickPage(){return <ProxyBrowser startApp="Kick"/>;}
