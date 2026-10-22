import type {Metadata} from 'next';
import ProxyBrowser from '@/components/proxy-browser';
export const metadata:Metadata={title:'YouTube · Kkeep'};
export default function YouTubePage(){return <ProxyBrowser startApp="YouTube"/>;}
