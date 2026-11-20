import type {ProxyEngine} from './proxy-engines';
import {searchUrl,type SearchProvider} from './search-providers.ts';
export type ProxyHandle = {go:(url:string)=>void;back:()=>void;forward:()=>void;reload:()=>void;destroy:()=>void};
export type ProxyCallbacks = {onNavigate:(url:string)=>void;onTitle:(title:string)=>void;onLoaded:()=>void;onDocument?:(document:Document,url:string)=>void;onRecover?:()=>void;onWarning?:(message:string)=>void;onRateLimit?:(until:number)=>void;onError:(message:string)=>void;onOpen:(url:string)=>void};
export type ProxyOptions={engine?:ProxyEngine;nativePopups?:boolean;mediaPermissions?:boolean;isolateFrameErrors?:boolean;moviePlayback?:boolean};
type Engine = {mount:(element:HTMLElement,callbacks:ProxyCallbacks,options?:ProxyOptions)=>Promise<ProxyHandle>;setLite:(value:boolean)=>void;setAdBlock:(value:boolean)=>void};
declare global {interface Window {KHAProxy?:Engine;KkeepUVProxy?:Pick<Engine,'mount'>}}
let boot:Promise<void>|undefined;
let uvBoot:Promise<void>|undefined;
let lite=false;
let adBlock=true;
const engineScripts=['/engine/scramjet.js?v=9','/engine/controller.api.js?v=6','/engine/kha-runtime.js?v=32'];
let preloaded=false;
// Fetch independent same-origin files together, but execute in dependency order.
// This warms only Kkeep assets, never a remote website or a user's account.
export function prepareProxy(){
  if(typeof document==='undefined'||preloaded)return;
  preloaded=true;
  for(const src of engineScripts){const link=document.createElement('link');link.rel='preload';link.as='script';link.href=src;document.head.appendChild(link);}
}
export function setAdBlocking(value:boolean){adBlock=value;if(typeof window!=='undefined')window.KHAProxy?.setAdBlock?.(value);}

export function normalizeAddress(value:string,provider?:SearchProvider):string {
  const input=value.trim();
  if(!input)throw new Error('Enter a website address or something to search.');
  if(input.length>8192)throw new Error('This address is too long.');
  if(/^[a-z][a-z0-9+.-]*:/i.test(input)&&!/^https?:\/\//i.test(input))throw new Error('Use an http:// or https:// website address.');
  const isUrl=/^https?:\/\//i.test(input)||(!/\s/.test(input)&&input.includes('.'));
  // Search stays in the same proxy tab; no external/direct-site fallback.
  if(!isUrl)return searchUrl(input,provider);
  let url:URL;try{url=new URL(/^https?:\/\//i.test(input)?input:'https://'+input);}catch{throw new Error('That website address doesn’t look right.');}
  if(!['https:','http:'].includes(url.protocol)||url.username||url.password)throw new Error('Use a regular website address without a username or password in the URL.');
  return url.href;
}
function loadScript(src:string){return new Promise<void>((resolve,reject)=>{
  const el=document.createElement('script');el.src=src;el.async=false;
  const timer=setTimeout(()=>{el.remove();reject(new Error('The proxy engine took too long to load. Please refresh and try again.'));},25000);
  el.onload=()=>{clearTimeout(timer);resolve();};el.onerror=()=>{clearTimeout(timer);el.remove();reject(new Error('Couldn’t load the proxy engine. Refresh and try again.'));};document.head.appendChild(el);
});}
export function setLiteMode(value:boolean){lite=value;if(typeof window!=='undefined')window.KHAProxy?.setLite(value);}
export async function mountProxy(element:HTMLElement,callbacks:ProxyCallbacks,options?:ProxyOptions):Promise<ProxyHandle>{
  if(!window.isSecureContext)throw new Error('This proxy needs a secure HTTPS page. Open the published Kkeep link to connect.');
  if(!('serviceWorker' in navigator))throw new Error('Open this site in a full browser such as Safari, Chrome, Edge, or Firefox. This in-app browser cannot start the proxy.');
  if(options?.engine==='ultraviolet'){
    uvBoot??=(async()=>{await loadScript('/uv/runtime.js?v=1');})().catch(error=>{uvBoot=undefined;throw error;});
    await uvBoot;
    if(!window.KkeepUVProxy)throw new Error('Ultraviolet did not initialize. Refresh to retry.');
    return window.KkeepUVProxy.mount(element,callbacks,options);
  }
  prepareProxy();
  boot??=(async()=>{for(const src of engineScripts)await loadScript(src);})().catch(e=>{boot=undefined;throw e;});
  await boot;
  if(!window.KHAProxy)throw new Error('The proxy did not initialize. Refresh this page.');
  window.KHAProxy.setLite(lite);
  window.KHAProxy.setAdBlock?.(adBlock);
  return window.KHAProxy.mount(element,callbacks,options);
}
