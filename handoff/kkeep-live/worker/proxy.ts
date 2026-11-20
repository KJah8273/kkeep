/** KHA HTTP + WebSocket relay. Only public HTTP(S) origins are reachable. */
import {isEpicErrorReport,reportEpicRuntimeFailures} from './geforce-diagnostics.ts';
import {isXboxStartupReport,reportXboxStartupFailures} from './xbox-diagnostics.ts';
import {observeTikTokLogin} from './tiktok-diagnostics.ts';
const MAX_UPLOAD = 8 * 1024 * 1024;
const dnsCache = new Map<string, {expires:number; result:Promise<void>}>();
// User-requested movie exceptions bypass adult classification only, never malware
// filtering or private-network checks. Redirects are checked independently.
const MOVIE_EXCEPTIONS=new Set([
  'cinehd.app','www.cinehd.app','cinehd.vc','www.cinehd.vc',
  'cinejoy.to','www.cinejoy.to','cinejoy.pk','www.cinejoy.pk',
  'movy.sx','www.movy.sx','backend.movy.sx',
  'cinera.cfd','www.cinera.cfd',
  // Cinera's two players, including Videasy's current redirect destination.
  // Keep exact hosts: neither an arbitrary subdomain nor an ad inherits this.
  'www.vidy.st','player.videasy.net','player.videasy.to',
]);
export function dnsEndpoint(host:string){return MOVIE_EXCEPTIONS.has(host)?'https://security.cloudflare-dns.com/dns-query':'https://family.cloudflare-dns.com/dns-query';}
const DENIED_SUFFIXES=['.localhost','.local','.internal','.lan','.home','.test','.invalid','.onion','.arpa'];
const BLOCKED_HEADERS=/^(host|connection|keep-alive|transfer-encoding|te|trailer|upgrade|expect|content-length|accept-encoding|proxy-.*|cf-.*|oai-.*|x-kha-.*|x-forwarded-.*|forwarded|sec-websocket-.*)$/i;
const METHODS=new Set(['GET','HEAD','POST','PUT','PATCH','DELETE','OPTIONS']);
type RawHeaders=[string,string][];
type Metadata={url:string;method:string;headers:RawHeaders};
export function encodeMetadata(value:unknown){return btoa(Array.from(new TextEncoder().encode(JSON.stringify(value)),b=>String.fromCharCode(b)).join(''));}
export function decodeMetadata(value:string){return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(value),c=>c.charCodeAt(0))));}
function error(message:string,status=400){return Response.json({error:message},{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});}
export function parseTarget(value:string,origin:string,websocket=false):URL {
  if(typeof value!=='string'||value.length>8192)throw new Error('The website address is invalid or too long.');
  const url=new URL(value);
  const protocols=websocket?['wss:','ws:']:['https:','http:'];
  if(!protocols.includes(url.protocol)||url.username||url.password||url.port)throw new Error('Only public websites on standard web ports are supported.');
  const host=url.hostname.toLowerCase().replace(/\.$/,'');
  if(!host.includes('.')||host==='localhost'||host===new URL(origin).hostname||DENIED_SUFFIXES.some(s=>host.endsWith(s))||host.includes(':')||host.startsWith('[')||/^\d+(\.\d+)*$/.test(host)||host==='metadata.google.internal'||host==='metadata.google'||host==='instance-data.ec2.internal')throw new Error('Private network and IP addresses cannot be opened through this proxy.');
  url.hostname=host;url.hash='';return url;
}
export function isPublicIp(ip:string):boolean {
  if(ip.includes(':')){const [first,second]=ip.split(':').map(v=>parseInt(v,16));return first>=0x2000&&first<=0x3fff&&first!==0x2002&&!(first===0x2001&&[0,2,0x10,0x20,0xdb8].includes(second));}
  const parts=ip.split('.').map(Number);if(parts.length!==4||parts.some(n=>!Number.isInteger(n)||n<0||n>255))return false;
  const [a,b,c]=parts;
  return !(a===0||a===10||a===127||a>=224||(a===100&&b>=64&&b<=127)||(a===169&&b===254)||(a===172&&b>=16&&b<=31)||(a===192&&(b===168||b===0||b===88))||(a===198&&(b===18||b===19))||(a===198&&b===51&&c===100)||(a===203&&b===0&&c===113));
}
export async function validateDns(host:string):Promise<void>{
  const known=dnsCache.get(host);if(known&&known.expires>Date.now())return known.result;
  const result=(async()=>{
    const responses=await Promise.all(['A','AAAA'].map(async type=>{
      const endpoint=new URL(dnsEndpoint(host));endpoint.searchParams.set('name',host);endpoint.searchParams.set('type',type);
      const response=await fetch(endpoint,{headers:{Accept:'application/dns-json'},signal:AbortSignal.timeout(15000)});
      if(!response.ok)throw new Error('Could not resolve this website. Please try again.');
      return response.json() as Promise<{Status:number;Answer?:{type:number;data:string}[]}>;
    }));
    const ips=responses.flatMap(r=>r.Answer??[]).filter(a=>a.type===1||a.type===28).map(a=>a.data);
    if(ips.some(ip=>ip==='0.0.0.0'||ip==='::'||ip==='0:0:0:0:0:0:0:0'))throw new Error('Blocked by the adult-content and malware filter.');
    if(responses.some(r=>r.Status!==0))throw new Error('The website could not pass the safety lookup. Try again later.');
    if(!ips.length)throw new Error('This website address could not be found.');
    if(ips.some(ip=>!isPublicIp(ip)))throw new Error('This address does not point to a public website.');
  })();
  if(dnsCache.size>500)dnsCache.clear();
  dnsCache.set(host,{expires:Date.now()+60000,result});
  try{await result;}catch(e){dnsCache.delete(host);throw e;}
}
export function sanitizeHeaders(raw:unknown):Headers{
  if(!Array.isArray(raw)||raw.length>160)throw new Error('Invalid request headers.');
  const headers=new Headers();
  for(const entry of raw){
    if(!Array.isArray(entry)||entry.length!==2||typeof entry[0]!=='string'||typeof entry[1]!=='string')throw new Error('Invalid request header.');
    const [key,value]=entry;
    if(key.length>150||value.length>32000||/[\r\n\0]/.test(value))throw new Error('Invalid request header.');
    if(!BLOCKED_HEADERS.test(key))headers.append(key,value);
  }
  headers.set('Accept-Encoding','identity');return headers;
}
function sameOrigin(request:Request){const origin=request.headers.get('origin');return !origin||origin===new URL(request.url).origin;}
async function boundedBody(request:Request):Promise<ArrayBuffer|null>{
  if(Number(request.headers.get('content-length'))>MAX_UPLOAD)throw new Error('Uploads through this proxy are limited to 8 MB.');
  if(!request.body)return null;
  const reader=request.body.getReader();const parts:Uint8Array[]=[];let size=0;
  for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>MAX_UPLOAD){await reader.cancel();throw new Error('Uploads through this proxy are limited to 8 MB.');}parts.push(value);}
  if(!size)return null;
  const result=new Uint8Array(size);let offset=0;for(const part of parts){result.set(part,offset);offset+=part.byteLength;}return result.buffer;
}
export async function relay(request:Request):Promise<Response>{
  if(request.method!=='POST')return error('Use the proxy address bar to open a website.',405);
  if(!sameOrigin(request)||request.headers.get('x-kha-relay')!=='1')return error('This connection must start from your proxy browser.',403);
  let diagnostic:{host:string;method:string;stage:string}|undefined;
  let gamingDiagnostic=false;
  try{
    const raw=request.headers.get('x-kha-meta');if(!raw||raw.length>64000)return error('Missing or oversized request metadata.');
    const meta=decodeMetadata(raw) as Metadata;
    const target=parseTarget(meta.url,request.url);
    if(!METHODS.has(meta.method))return error('This request method is not supported.');
    if(/(^|\.)(tiktok\.com|tiktokcdn\.com|tiktokcdn-us\.com|tiktokv\.com)$/.test(target.hostname))diagnostic={host:target.hostname,method:meta.method,stage:'headers'};
    gamingDiagnostic=request.headers.get('x-kha-profile')==='geforce'&&/(^|\.)(epicgames\.com|unrealengine\.com|nvidia\.com|geforcenow\.com)$/.test(target.hostname);
    if(gamingDiagnostic)diagnostic={host:target.hostname,method:meta.method,stage:'headers'};
    const headers=sanitizeHeaders(meta.headers);
    // No header or authentication cookie from the hosting request is forwarded upstream.
    if(diagnostic)diagnostic.stage='safety-dns';
    await validateDns(target.hostname);
    if(diagnostic)diagnostic.stage='upstream';
    const body=['GET','HEAD'].includes(meta.method)?null:await boundedBody(request);
    if(isEpicErrorReport(request.headers.get('x-kha-profile'),target,headers,meta.method))reportEpicRuntimeFailures(body);
    if(isXboxStartupReport(request.headers.get('x-kha-profile'),target,headers,meta.method))reportXboxStartupFailures(body);
    // Limit time to response headers, not the lifetime of a video download.
    // Keep browser cancellation connected after the header deadline is cleared.
    const deadline=new AbortController();
    const timer=setTimeout(()=>deadline.abort(new DOMException('Upstream header timeout','TimeoutError')),30000);
    let response:Response;
    try{response=await fetch(target,{method:meta.method,headers,body,redirect:'manual',signal:AbortSignal.any([request.signal,deadline.signal])});}
    finally{clearTimeout(timer);}
    // Record only status and provider, never URLs, headers, cookies or request bodies.
    if(response.status>=400&&/(^|\.)(kick\.com|tiktok\.com)$/.test(target.hostname))console.warn('Social upstream response',JSON.stringify({host:target.hostname,status:response.status,method:meta.method}));
    if(response.status>=400&&gamingDiagnostic)console.warn('GeForce upstream response',JSON.stringify({host:target.hostname,status:response.status,method:meta.method}));
    const rawHeaders:RawHeaders=[];
    const wasEncoded=!!response.headers.get('content-encoding');
    for(const [key,value]of response.headers){
      if(['set-cookie','transfer-encoding','connection','content-encoding'].includes(key))continue;
      if(key==='content-length'&&wasEncoded)continue;
      rawHeaders.push([key,value]);
    }
    for(const cookie of response.headers.getSetCookie())rawHeaders.push(['set-cookie',cookie]);
    const envelope=encodeMetadata({status:response.status,statusText:response.statusText,headers:rawHeaders});
    if(envelope.length>100000){await response.body?.cancel();return error('This website returned more headers than the proxy can carry.',502);}
    const out=new Headers({'Content-Type':'application/octet-stream','Cache-Control':'private, no-store','X-Kha-Response':envelope,'X-Content-Type-Options':'nosniff'});
    return new Response(observeTikTokLogin(target,meta.method,response),{status:200,headers:out});
  }catch(e){
    const message=e instanceof Error?e.message:'Could not reach this website.';
    // Never log signed URLs, account identifiers, cookies, bodies or error text.
    if(diagnostic&&!request.signal.aborted)console.warn(gamingDiagnostic?'GeForce relay failure':'TikTok relay failure',JSON.stringify({...diagnostic,reason:/abort|timeout/i.test(message)?'timeout':message==='Blocked by the adult-content and malware filter.'?'safety-block':'request-failed'}));
    if(message==='Blocked by the adult-content and malware filter.')return error(message,403);
    if(/abort|timeout/i.test(message))return error('The website took too long to respond. Try again in a moment.',504);
    return error(message,502);
  }
}

type RelaySocket=WebSocket&{accept:()=>void};
declare const WebSocketPair:{new():{0:RelaySocket;1:RelaySocket}};
export function socketRelay(request:Request):Response{
  if(request.headers.get('upgrade')?.toLowerCase()!=='websocket')return error('A WebSocket connection is required.',426);
  if(request.headers.get('origin')!==new URL(request.url).origin)return error('This connection must start from your proxy browser.',403);
  const pair=new WebSocketPair();const [client,server]=[pair[0],pair[1]];server.accept();
  let upstream:RelaySocket|undefined;let started=false;let terminated=false;
  const close=(code=1000,reason='')=>{
    if(terminated)return;terminated=true;clearTimeout(timer);
    const safeCode=code===1000||(code>=3000&&code<=4999)?code:1000;
    try{server.close(safeCode,reason.slice(0,90));}catch{}try{upstream?.close(safeCode,reason.slice(0,90));}catch{}
  };
  const timer=setTimeout(()=>close(1000,'Proxy handshake timed out'),20000);
  const fail=(message:string)=>{try{server.send(JSON.stringify({type:'error',error:message}));}catch{}close(1000,'Connection failed');};
  server.addEventListener('message',async event=>{
    if(terminated)return;
    if(started){if(upstream?.readyState===1){try{upstream.send(event.data);}catch{close();}}return;}
    started=true;
    try{
      if(typeof event.data!=='string'||event.data.length>64000)throw new Error('Invalid connection request.');
      const meta=JSON.parse(event.data);
      const target=parseTarget(meta.url,request.url,true);
      if(!Array.isArray(meta.protocols)||meta.protocols.length>30||meta.protocols.some((p:unknown)=>typeof p!=='string'||p.length>200||!/^[-!#$%&'*+.^_`|~\w]+$/.test(p)))throw new Error('Invalid WebSocket protocols.');
      const headers=sanitizeHeaders(meta.headers);headers.set('Upgrade','websocket');
      if(meta.protocols.length)headers.set('Sec-WebSocket-Protocol',meta.protocols.join(', '));
      await validateDns(target.hostname);
      target.protocol=target.protocol==='wss:'?'https:':'http:';
      const response=await fetch(target,{headers,redirect:'manual',signal:AbortSignal.timeout(15000)});
      upstream=(response as Response&{webSocket?:RelaySocket}).webSocket;
      if(response.status!==101||!upstream)throw new Error('This site refused the live connection through the proxy.');
      if(terminated){try{upstream.close();}catch{}return;}
      clearTimeout(timer);upstream.accept();
      server.send(JSON.stringify({type:'open',protocol:response.headers.get('sec-websocket-protocol')||''}));
      upstream.addEventListener('message',e=>{if(!terminated)try{server.send(e.data);}catch{close();}});
      upstream.addEventListener('close',e=>close(e.code,e.reason));upstream.addEventListener('error',()=>close(1000,'Connection interrupted'));
    }catch(e){fail(e instanceof Error?e.message:'Live connection failed.');}
  });
  server.addEventListener('close',e=>close(e.code,e.reason));server.addEventListener('error',()=>close());
  return new Response(null,{status:101,webSocket:client} as ResponseInit);
}
