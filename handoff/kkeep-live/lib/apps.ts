import {cloudProviders,type CloudProvider} from './touch/providers';
import {isRobloxPlayerUrl} from './roblox-player';
export type App = {name:string;url:string;path:string;icon:string;cloud?:CloudProvider;engine?:'scramjet-v2';external?:boolean;native?:boolean};
export const robloxUrl=cloudProviders.find(provider=>provider.id==='roblox')!.url;
export const clashRoyaleUrl=cloudProviders.find(provider=>provider.id==='clash')!.url;
export const geforceUrl='https://play.geforcenow.com/mall/';
export const xboxUrl='https://www.xbox.com/en-us/play';
export const apps:App[] = [
  {name:'YouTube',url:'https://www.youtube.com/',path:'/youtube',icon:'/icons/youtube.svg'},
  {name:'TikTok',url:'https://www.tiktok.com/foryou',path:'/tiktok',icon:'/icons/tiktok.svg',native:true},
  {name:'GeForce NOW',url:geforceUrl,path:'/gfn/index.html',icon:'/icons/nvidia.svg',engine:'scramjet-v2'},
  {name:'Xbox Cloud',url:xboxUrl,path:'/xbox/index.html',icon:'/icons/xbox.svg',engine:'scramjet-v2'},
  {name:'Snapchat',url:'https://www.snapchat.com/web',path:'/snapchat',icon:'/icons/snapchat.svg'},
  {name:'Kick',url:'https://kick.com/',path:'/kick',icon:'/icons/kick-mark.svg'},
  ...(['roblox','clash','ghost'] as const).map(id=>{
    const provider=cloudProviders.find(item=>item.id===id)!;
    return {name:provider.name,url:provider.url,path:provider.path,icon:provider.icon,cloud:id,external:id==='clash',native:id==='roblox'};
  }),
];

export function geforceDestination(value:string):string|null{
  const url=new URL(value);
  if(url.protocol!=='https:'||url.hostname!=='play.geforcenow.com'||url.username||url.password)return null;
  return '/gfn/index.html?launch='+encodeURIComponent(url.href);
}

export function gamingDestination(value:string):string|null{
  const geforce=geforceDestination(value);if(geforce)return geforce;
  const url=new URL(value);
  if(url.protocol!=='https:'||url.username||url.password)return null;
  if(isRobloxPlayerUrl(url))return '/roblox';
  // Clash Royale owns its standalone launch flow and sign-in.
  if(url.origin===new URL(clashRoyaleUrl).origin)return url.href;
  if(!['xbox.com','www.xbox.com'].includes(url.hostname)||!/^\/(?:[a-z]{2}-[a-z]{2}\/)?play(?:\/|$)/i.test(url.pathname))return null;
  return '/xbox/index.html?launch='+encodeURIComponent(url.href);
}
