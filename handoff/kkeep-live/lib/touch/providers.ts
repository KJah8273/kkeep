export const cloudProviders=[
  {id:'ghost',name:'GhostCloud',url:'https://ghost-mathmulti.zeoghost.workers.dev/',path:'/?cloud=ghost',icon:'/icons/ghostcloud.svg'},
  {id:'roblox',name:'Roblox',url:'https://kkeep-roblox-runtime.kha971.chatgpt.site/_rbx/app/',path:'/roblox',icon:'/icons/roblox.svg'},
  {id:'clash',name:'Clash Royale',url:'https://kkeep-clash-royale.testerqrr1.chatgpt.site/',path:'/clash-royale',icon:'/icons/clash-royale.webp'},
] as const;
export type CloudProvider=typeof cloudProviders[number]['id'];
export function supportsTouchControls(provider:CloudProvider|undefined):provider is 'ghost'{
  return provider==='ghost';
}

export function cloudProviderForUrl(value:string){
  try{const url=new URL(value);if(!['https:','http:'].includes(url.protocol)||url.username||url.password)return;
    return cloudProviders.find(provider=>new URL(provider.url).hostname===url.hostname);
  }catch{return;}
}
