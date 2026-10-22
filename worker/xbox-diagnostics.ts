/** Classify Microsoft's existing startup reports without retaining their data.
 * Never log URLs, messages, stacks, account IDs, cookies or request bodies.
 */
export function isXboxStartupReport(profile:string|null,url:URL,headers:Headers,method:string){
  if(profile!=='xbox'||method!=='POST'||url.hostname!=='browser.events.data.microsoft.com'||url.pathname!=='/OneCollector/1.0/')return false;
  try{return ['login.live.com','login.microsoftonline.com'].includes(new URL(headers.get('referer')||'').hostname);}catch{return false;}
}
function classify(message:unknown):string|undefined {
  if(typeof message!=='string'||message.length>8192)return;
  if(/Failed to load BrsConfig|Invalid BrsConfig|BrsConfig link/.test(message))return 'configuration-load';
  if(/reading ['"]controller['"]/.test(message))return 'controller-initialization';
  if(/\$scramjet\$\w+ is not defined/.test(message))return 'rewriter-initialization';
  if(/Minified React error #\d+/.test(message))return 'react-render';
  if(/Cannot (read|set) properties of (undefined|null)/.test(message))return 'missing-property';
  if(/Unexpected (token|identifier|end)/.test(message))return 'script-syntax';
  if(/Failed to fetch|Load failed|Loading chunk/.test(message))return 'resource-load';
  return 'other-script-error';
}
export function xboxStartupFailures(body:ArrayBuffer|null):string[]{
  if(!body||body.byteLength>128*1024)return [];
  const kinds=new Set<string>();
  try{
    const text=new TextDecoder('utf-8',{fatal:true}).decode(body);
    for(const line of text.split('\n').slice(0,20)){
      if(!line.trim())continue;
      const event=JSON.parse(line);
      if(typeof event.name!=='string'||!event.name.endsWith('IDUX_ClientTelemetry_PageLoadErrors'))continue;
      // OneDS may wrap custom event properties in baseData or properties.
      const data=event.data?.baseData?.properties??event.data?.baseData??event.data;
      if(!data||typeof data!=='object')continue;
      kinds.add('blank-form');
      const errors=typeof data.errors==='string'?JSON.parse(data.errors):data.errors;
      if(!Array.isArray(errors))continue;
      for(const error of errors.slice(0,8)){
        const kind=classify(typeof error==='string'?error:error?.message??error?.errorMessage);
        if(kind)kinds.add(kind);
      }
    }
  }catch{ /* Binary, compressed and malformed telemetry stays opaque. */ }
  return [...kinds];
}
const seen=new Map<string,number>();
export function reportXboxStartupFailures(body:ArrayBuffer|null){
  for(const kind of xboxStartupFailures(body)){
    if((seen.get(kind)||0)>Date.now())continue;
    seen.set(kind,Date.now()+60000);
    console.warn('Xbox Microsoft startup failure',kind);
  }
}

/** The diagnostic bootstrap sends only this bounded, fixed vocabulary. */
export function normalizeXboxStatus(value:unknown){
  if(!value||typeof value!=='object')return null;
  const v=value as Record<string,unknown>;
  if(v.type!=='kkeep-xbox-signin'||v.revision!==5||!['frame','window'].includes(v.surface as string)||!['ready','blank','frame-navigation','controller','rewriter','syntax','resource','script'].includes(v.kind as string)||!['page','main','vendors','ui','engine','other'].includes(v.script as string))return null;
  const result:Record<string,string|number|boolean>={revision:5,surface:v.surface as string,kind:v.kind as string,script:v.script as string};
  for(const key of ['line','column'])if(Number.isInteger(v[key])&&Number(v[key])>=0&&Number(v[key])<=10000000)result[key]=v[key] as number;
  for(const key of ['bodyHidden','rootEmpty'])if(typeof v[key]==='boolean')result[key]=v[key] as boolean;
  return result;
}
const reports=new Map<string,number>();
export async function xboxStatus(request:Request){
  const headers={'Cache-Control':'no-store'};
  if(request.method!=='POST'||request.headers.get('origin')!==new URL(request.url).origin||request.headers.get('x-kkeep-xbox-status')!=='1')return new Response(null,{status:403,headers});
  if(Number(request.headers.get('content-length'))>2048)return new Response(null,{status:413,headers});
  const reader=request.body?.getReader();if(!reader)return new Response(null,{status:400,headers});
  const parts:Uint8Array[]=[];let length=0;
  for(;;){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>2048){await reader.cancel();return new Response(null,{status:413,headers});}parts.push(value);}
  try{
    const bytes=new Uint8Array(length);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.byteLength;}
    const report=normalizeXboxStatus(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)));
    if(!report)return new Response(null,{status:400,headers});
    const key=JSON.stringify(report);
    if((reports.get(key)||0)<Date.now()){
      if(reports.size>=128)reports.clear();reports.set(key,Date.now()+60000);
      if(report.kind==='ready')console.info('Xbox sign-in ready',key);else console.warn('Xbox sign-in startup',key);
    }
    return new Response(null,{status:204,headers});
  }catch{return new Response(null,{status:400,headers});}
}
