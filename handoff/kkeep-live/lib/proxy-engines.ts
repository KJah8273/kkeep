export type ProxyEngine = 'scramjet-v2' | 'ultraviolet';
export const proxyEngineKey = 'kkeep-proxy-engine-v1';
export const proxyEngines = [
  {id:'scramjet-v2',name:'Scramjet v2'},
  {id:'ultraviolet',name:'Ultraviolet'},
] as const;
export function isProxyEngine(value:unknown):value is ProxyEngine{return value==='scramjet-v2'||value==='ultraviolet';}
export function readProxyEngine(value?:string|null):ProxyEngine{
  if(isProxyEngine(value))return value;
  try{const saved=localStorage.getItem(proxyEngineKey);if(isProxyEngine(saved))return saved;}catch{}
  return 'scramjet-v2';
}
export function saveProxyEngine(value:ProxyEngine){try{localStorage.setItem(proxyEngineKey,value);}catch{}}
