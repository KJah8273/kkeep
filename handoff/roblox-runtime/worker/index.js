import {runtimeBootstrap} from './runtime.js';
import {checkPage} from './check.js';
import {preferencesBootstrap} from './preferences.js';
import {transportBootstrap,transportStages} from './transport.js';
import {UPSTREAM,allowedPath,responseHeaders,transformText} from './gateway.js';
import {sessionClient} from './session.js';
import {signinBootstrap} from './signin.js';
import {sessionCheckPage} from './session-check.js';
import {graphicsSettingsRequest,applyGraphicsPreference} from './graphics.js';
import {publicEngineAsset,fetchPublicEngineAsset,fetchEngineAssetResponse} from './public-assets.js';
import {pinnedLaunchResource,pinnedLaunchResponse} from './launch-shell.js';

// A sign-in frame that misses its browser service worker must never become a
// server-side account request. Only its initial, fixed login GET can receive a
// local recovery notice; the owning sign-in page validates the message source
// before reclaiming the worker and reopening that one navigation.
function missingSigninControl(request, url, headers) {
  // The inspected provider uses base64url; the controller's default codec
  // uses encodeURIComponent. Accept only these exact encodings of /login.
  const initialLogin = /^\/~\/sj\/[a-z0-9]{1,32}\/[a-z0-9]{1,32}\/(?:aHR0cHM6Ly93d3cucm9ibG94LmNvbS9sb2dpbg|https%3A%2F%2Fwww\.roblox\.com%2Flogin)$/.test(url.pathname);
  const frame = request.headers.get('sec-fetch-dest') === 'iframe' || request.destination === 'iframe';
  if (request.method !== 'GET' || !frame || !initialLogin || url.search) return null;
  const out = new Headers(headers);
  out.set('Content-Type', 'text/html; charset=utf-8');
  out.set('Content-Security-Policy', out.get('Content-Security-Policy') + "; default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'");
  return new Response(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Reconnecting sign-in</title><style>html{background:#0b0b0b;color:#ddd;font:16px system-ui}body{margin:0;min-height:100vh;display:grid;place-items:center}p{padding:24px;text-align:center}</style><p id="kkeep-signin-control-missing">Reconnecting sign-in…</p><script>if(parent!==window)parent.postMessage({type:'kkeep:signin-control-missing'},location.origin);</script></html>`, {status:503, headers:out});
}

function safeFailureDiagnostic(data) {
  if(!data||typeof data!=='object'||!['startup','after-load'].includes(data.phase))return null;
  const kinds=['JavaScript','engine worker','worker','promise rejection','unavailable'];
  const names=['Error','TypeError','RangeError','ReferenceError','SyntaxError','EvalError','URIError','AggregateError',
    'AbortError','DataCloneError','InvalidStateError','NotSupportedError','NetworkError','SecurityError','OperationError',
    'QuotaExceededError','UnknownError','RuntimeError','CompileError','LinkError','SuspendError',
    'BindingError','InternalError','ExitStatus','WebTransportError','WebAssembly.Exception'];
  const sources=['WebClient.js','WasmPlayer.js','WasmLoader.js','stub.js','hook.js',
    'kkeep-runtime.js','kkeep-session.js','kkeep-preferences.js','audio-processor-fast.js'];
  const coordinate=value=>Number.isInteger(value)&&value>0&&value<=1000000?value:0;
  return {phase:data.phase,kind:kinds.includes(data.kind)?data.kind:'unavailable',
    name:names.includes(data.name)?data.name:'',source:sources.includes(data.source)?data.source:'',
    line:coordinate(data.line),column:coordinate(data.column),gpu:['webgl','webgpu'].includes(data.gpu)?data.gpu:''};
}

export default {
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    const headers=responseHeaders({},url.origin);
    if(url.pathname==='/')return new Response(null,{status:302,headers:{...Object.fromEntries(headers),Location:'/_rbx/app/'}});
    if(url.pathname==='/health')return Response.json({service:'Kkeep Roblox runtime',revision:'join19',assetDelivery:'verified-public-cdn',launchDelivery:'bundled-inspected-build',isolation:'require-corp',sharedAccount:false},{headers});
    if(url.pathname==='/kkeep-session.js')return new Response('('+sessionClient.toString()+')(window,location.origin);',{headers:{...Object.fromEntries(headers),'Content-Type':'text/javascript; charset=utf-8'}});
    if(url.pathname==='/kkeep-signin.js')return new Response('('+signinBootstrap.toString()+')(window);',{headers:{...Object.fromEntries(headers),'Content-Type':'text/javascript; charset=utf-8'}});
    if(url.pathname==='/check')return new Response(checkPage,{headers:{...Object.fromEntries(headers),'Content-Type':'text/html; charset=utf-8'}});
    if(url.pathname==='/_rbx/app/session-check')return new Response(sessionCheckPage,{headers:{...Object.fromEntries(headers),'Content-Type':'text/html; charset=utf-8'}});
    if(url.pathname==='/_kkeep/failure'){
      if(request.method!=='POST')return new Response(null,{status:405,headers});
      const reader=request.body?.getReader();let bytes=0;const chunks=[];
      if(!reader)return new Response(null,{status:400,headers});
      for(;;){const {value,done}=await reader.read();if(done)break;bytes+=value.length;if(bytes>512){await reader.cancel();return new Response(null,{status:413,headers});}chunks.push(value);}
      let data;try{data=JSON.parse(new TextDecoder().decode(Uint8Array.from(chunks.flatMap(c=>Array.from(c)))));}catch{return new Response(null,{status:400,headers});}
      const record=safeFailureDiagnostic(data);
      if(!record)return new Response(null,{status:400,headers});
      console.error('[Kkeep Roblox failure]',JSON.stringify(record));
      return new Response(null,{status:204,headers});
    }
    if(url.pathname==='/kkeep-runtime.js')return new Response('('+runtimeBootstrap.toString()+')();('+transportBootstrap.toString()+')();',{headers:{...Object.fromEntries(headers),'Content-Type':'text/javascript; charset=utf-8'}});
    if(url.pathname==='/kkeep-preferences.js')return new Response('('+preferencesBootstrap.toString()+')();',{headers:{...Object.fromEntries(headers),'Content-Type':'text/javascript; charset=utf-8'}});
    if(url.pathname==='/_kkeep/connection'){
      if(request.method!=='POST')return new Response(null,{status:405,headers});
      const reader=request.body?.getReader();let bytes=0,chunks=[];
      if(!reader)return new Response(null,{status:400,headers});
      for(;;){const {value,done}=await reader.read();if(done)break;bytes+=value.length;if(bytes>256){await reader.cancel();return new Response(null,{status:413,headers});}chunks.push(value);}
      let data;try{data=JSON.parse(new TextDecoder().decode(Uint8Array.from(chunks.flatMap(c=>Array.from(c)))));}catch{return new Response(null,{status:400,headers});}
      if(!transportStages.includes(data?.stage))return new Response(null,{status:400,headers});
      const name=['TypeError','NotSupportedError','InvalidStateError','NetworkError','WebTransportError','AbortError','SecurityError'].includes(data.name)?data.name:'';
      const log=['transport-connecting','transport-native','transport-relay','transport-ready','transport-stream-ready'].includes(data.stage)?console.info:console.error;
      log('[Kkeep Roblox connection]',data.stage,name);
      return new Response(null,{status:204,headers});
    }
    // Provider diagnostics may contain session URLs. Do not forward or log them.
    if(url.pathname==='/_diag')return new Response(null,{status:204,headers});
    // Authenticated APIs are handled by the user's browser-local jar service worker.
    // Do not fall back to an upstream server session if that worker is unavailable.
    if(url.pathname.startsWith('/_rbx/api/'))return Response.json({error:'Browser session is not ready',loggedIn:false},{status:503,headers});
    const signinControl = missingSigninControl(request, url, headers);
    if(signinControl)return signinControl;
    if(!allowedPath(url.pathname)||!['GET','HEAD'].includes(request.method))return new Response('Not found',{status:404,headers});
    if(url.pathname.startsWith('/_/')){
      let host='';try{host=atob(url.pathname.split('/')[2].replace(/-/g,'+').replace(/_/g,'/'))}catch{}
      const targetPath='/'+url.pathname.split('/').slice(3).join('/');
      const publicCdn=/^(?:[a-z0-9-]+\.)*rbxcdn\.com$/.test(host);
      const publicSettings=host==='clientsettingscdn.roblox.com'||
        (host==='clientsettings.roblox.com'&&/^\/v2\/client-version\/WebClientApp(?:\/channel\/[^/]+)?$/.test(targetPath));
      const gameShell=host==='play.roblox.com'&&(/^\/games\/start$/.test(targetPath)||/^\/(?:[a-f0-9]{40}|_next|assets)\//.test(targetPath));
      // Every account/API request must use the visitor's browser-local session.
      // A strict public asset allowlist prevents accidental upstream account fallback.
      if(!publicCdn&&!publicSettings&&!gameShell)return new Response('Session worker required',{status:503,headers});
    }
    const graphics=graphicsSettingsRequest(url);
    if(graphics&&!graphics.renderer)url.searchParams.delete('rbxgpu');
    const forwarded=new Headers();
    // Only public delivery preferences pass through. Never relay browser cookies or Authorization.
    for(const key of ['accept','range','if-range'])if(request.headers.has(key))forwarded.set(key,request.headers.get(key));
    const pref=request.headers.get('cookie')||'';
    const fps=/(?:^|;\s*)rbxfps=(30|45|60)(?:;|$)/.exec(pref)?.[1]||'60';
    forwarded.set('Cookie','rbxperf=performance; rbxfps='+fps);
    const launchResource=pinnedLaunchResource(url,request.method);
    const publicAsset=publicEngineAsset(url,request.method);
    let upstream;
    try{
      if(launchResource)upstream=await pinnedLaunchResponse(launchResource,request.method);
      else if(publicAsset)upstream=await fetchPublicEngineAsset(publicAsset,request);
      if(!upstream){
        if(request.signal.aborted)throw new Error('Request canceled');
        const options={method:request.method,headers:forwarded,redirect:'manual'};
        upstream=publicAsset?
          await fetchEngineAssetResponse(UPSTREAM+url.pathname+url.search,options,request.signal):
          await fetch(UPSTREAM+url.pathname+url.search,options);
      }
    }catch{return new Response('Roblox assets are temporarily unavailable',{status:502,headers});}
    const out=responseHeaders(upstream.headers,url.origin,url);
    const type=upstream.headers.get('content-type')||'';
    if(request.method==='GET'&&upstream.ok&&(graphics?.renderer||graphics?.iosFps)&&/^application\/(?:[\w.+-]+\+)?json(?:\s*;|$)/i.test(type)){
      // Honor the renderer preference and the otherwise ignored iOS FPS cap
      // locally while retaining every other platform-specific engine flag.
      const body=applyGraphicsPreference(await upstream.text(),graphics.renderer,graphics.iosFps);
      for(const key of ['content-length','content-encoding','etag','last-modified'])out.delete(key);
      return new Response(body,{status:upstream.status,headers:out});
    }
    if(request.method==='GET'&&upstream.ok&&/text\/html|javascript|text\/css/.test(type)){
      try{
        const body=transformText(await upstream.text(),url.pathname,url.origin);
        for(const key of ['content-length','content-encoding','etag','last-modified'])out.delete(key);
        return new Response(body,{status:upstream.status,headers:out});
      }catch{return new Response('The Roblox provider changed its loader. Please retry later.',{status:502,headers:out});}
    }
    // Stream large wasm/assets without copying the entire response into Worker memory.
    if(upstream.ok&&(/\.wasm$/.test(url.pathname)||/\/[a-f0-9]{40}\//.test(url.pathname)))out.set('Cache-Control','public, max-age=86400');
    return new Response(upstream.body,{status:upstream.status,headers:out});
  }
};
