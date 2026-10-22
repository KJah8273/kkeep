/** Bounded diagnostics for the Epic page that stalls during GeForce linking.
 * Observe only Epic's existing error reports. Never log the envelope, freeform
 * message, breadcrumbs, user, request, OAuth URL, cookies, or account data.
 * This does not change or retry any request and does not suppress Epic's report.
 */
const MAX_ENVELOPE = 128 * 1024;
const ERROR_TYPES = new Set(['Error','TypeError','ReferenceError','SyntaxError','RangeError','SecurityError','DataCloneError','InvalidStateError','NotSupportedError','NetworkError','AbortError']);
const PROPERTIES = new Set(['serviceWorker','addEventListener','removeEventListener','postMessage','location','href','origin','opener','parent','top','document','window','body','style','prototype','constructor','call','apply','bind','then','length']);
type Failure = {type:string;kind:string;property?:string;frames:Array<{script:string;line:number;column:number}>};
const seen = new Map<string,number>();

export function isEpicErrorReport(profile:string|null,target:URL,headers:Headers,method:string):boolean {
  if(profile!=='geforce'||method!=='POST'||target.hostname!=='sentry.io'||target.pathname!=='/api/1333512/envelope/')return false;
  // Epic applies an origin-only referrer policy to its cross-origin telemetry.
  try {const ref=new URL(headers.get('referer')||'');return ref.origin==='https://www.epicgames.com'&&(ref.pathname==='/'||ref.pathname.startsWith('/id/'));} catch {return false;}
}

function classify(value:unknown):Pick<Failure,'kind'|'property'> {
  if(typeof value!=='string'||value.length>8192)return {kind:'other'};
  const react=/^Minified React error #(\d{1,4});/.exec(value);
  if(react)return {kind:'react-'+react[1]};
  if(/^Maximum update depth exceeded/.test(value))return {kind:'react-update-loop'};
  if(/^Too many re-renders/.test(value))return {kind:'react-render-loop'};
  if(/^Invalid hook call/.test(value))return {kind:'react-invalid-hook'};
  if(/^Rendered (?:more|fewer) hooks/.test(value))return {kind:'react-hook-count'};
  if(/^Objects are not valid as a React child/.test(value))return {kind:'react-invalid-child'};
  if(/^Hydration failed|^Text content does not match/.test(value))return {kind:'react-hydration'};
  if(/^(?:typeof|return|await|void|delete|throw|case|in|of|new|yield)\$scramjet\$\w+ is not defined$/.test(value))return {kind:'rewriter-keyword-join'};
  if(/^Illegal invocation$/.test(value))return {kind:'illegal-invocation'};
  if(/^Maximum call stack size exceeded$|^too much recursion$/.test(value))return {kind:'recursion'};
  if(/^Failed to fetch$|^Load failed$|^NetworkError when attempting to fetch resource\.$/.test(value))return {kind:'network'};
  if(/^Cannot (?:read|set) properties of (?:undefined|null)/.test(value)) {
    const property=/\((?:reading|setting) ['"]([A-Za-z]+)['"]\)/.exec(value)?.[1];
    return {kind:'missing-property',...(property&&PROPERTIES.has(property)?{property}:{})};
  }
  if(/^Cannot redefine property: /.test(value))return {kind:'property-redefinition'};
  if(/is not a function$/.test(value))return {kind:'not-callable'};
  if(/is not defined$/.test(value))return {kind:'undefined-binding'};
  if(/^Unexpected (?:token|identifier|end)/.test(value))return {kind:'syntax'};
  return {kind:'other'};
}

function scriptName(input:unknown):string {
  if(typeof input!=='string'||input.length>16384)return 'other';
  try {
    let url=new URL(input);
    // Stack traces can retain Kkeep's rewritten URL. Discard its session IDs.
    for(let i=0;i<3&&url.pathname.startsWith('/gfn/browse/');i++) {
      const nested=url.pathname.match(/^\/gfn\/browse\/[^/]+\/[^/]+\/(https?%3A.*)$/i)?.[1];
      if(!nested)break;
      url=new URL(decodeURIComponent(nested));
    }
    if(url.hostname==='static-assets-prod.unrealengine.com'&&/^\/account-portal\/static\/assets\/index-[A-Za-z0-9_-]{4,40}\.js$/.test(url.pathname))return 'epic-account-bundle';
    if(/^\/gfn\/engine\/(?:scramjet|controller\.inject)\.js$/.test(url.pathname))return url.pathname.endsWith('scramjet.js')?'scramjet':'controller-inject';
    if(url.hostname==='www.epicgames.com'&&url.pathname.startsWith('/id/'))return 'epic-document';
    return 'other';
  } catch {return 'other';}
}

function failures(event:unknown):Failure[] {
  const values=(event as {exception?:{values?:unknown}})?.exception?.values;
  if(!Array.isArray(values))return [];
  return values.slice(0,3).filter(value=>value&&typeof value==='object').map(value=>({
    type:ERROR_TYPES.has(value.type)?value.type:'OtherError',
    ...classify(value.value),
    frames:(Array.isArray(value.stacktrace?.frames)?value.stacktrace.frames:[]).slice(-3).map((frame:Record<string,unknown>)=>({
      script:scriptName(frame?.filename),
      line:Number.isSafeInteger(frame?.lineno)&&Number(frame.lineno)>0&&Number(frame.lineno)<10000000?Number(frame.lineno):0,
      column:Number.isSafeInteger(frame?.colno)&&Number(frame.colno)>0&&Number(frame.colno)<10000000?Number(frame.colno):0,
    })),
  }));
}

export function epicRuntimeFailures(body:ArrayBuffer|null):Failure[] {
  if(!body||body.byteLength>MAX_ENVELOPE)return [];
  try {
    const bytes=new Uint8Array(body),decoder=new TextDecoder('utf-8',{fatal:true});let offset=0;
    const line=()=>{let end=bytes.indexOf(10,offset);if(end<0)end=bytes.length;const text=decoder.decode(bytes.subarray(offset,end));offset=end+1;return text;};
    JSON.parse(line()); // Envelope metadata is deliberately discarded.
    for(let count=0;offset<bytes.length&&count<8;count++) {
      const item=JSON.parse(line());let payload:string;
      if(item.length!==undefined) {
        if(!Number.isSafeInteger(item.length)||item.length<0||offset+item.length>bytes.length)return [];
        payload=decoder.decode(bytes.subarray(offset,offset+item.length));offset+=item.length;
        if(offset<bytes.length&&bytes[offset++]!==10)return [];
      } else payload=line();
      if(item.type==='event')return failures(JSON.parse(payload));
    }
  } catch { /* Malformed, binary, or compressed reports stay opaque. */ }
  return [];
}

export function reportEpicRuntimeFailures(body:ArrayBuffer|null):void {
  try {
    const now=Date.now();
    for(const [key,expiry] of seen)if(expiry<=now)seen.delete(key);
    for(const failure of epicRuntimeFailures(body)) {
      const key=JSON.stringify(failure);
      if(seen.has(key)||seen.size>=30)continue;
      seen.set(key,now+60000);
      console.warn('GeForce Epic script failure',key);
    }
  } catch { /* Diagnostics must never break or delay sign-in. */ }
}
