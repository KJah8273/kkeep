import type {Metadata} from 'next';
import ProxyBrowser from '@/components/proxy-browser';
export const metadata:Metadata={title:'TikTok · Kkeep'};
export default function TikTokPage(){return <ProxyBrowser startApp="TikTok"/>;}
