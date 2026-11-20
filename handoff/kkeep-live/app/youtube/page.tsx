import {searchMetadata} from '@/lib/search-metadata';
import ProxyBrowser from '@/components/proxy-browser';
export const metadata = searchMetadata('/youtube', 'YouTube · Kkeep fun', 'Open YouTube through Kkeep fun to search and watch videos in your browser.');
export default function YouTubePage(){return <ProxyBrowser startApp="YouTube"/>;}
