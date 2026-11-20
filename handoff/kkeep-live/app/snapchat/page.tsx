import type {Metadata} from 'next';
import ProxyBrowser from '@/components/proxy-browser';
export const metadata:Metadata={title:'Snapchat · Kkeep'};
export default function SnapchatPage(){return <ProxyBrowser startApp="Snapchat"/>;}
