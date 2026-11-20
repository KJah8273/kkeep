import {sessionClient} from './session.js';

// Exercise the engine's XHR request path in a real owned worker. Only the
// existing read-only session endpoint is used; identity data stays in the jar.
export function sessionCheckWorker(scope, installSession, origin) {
  let rpcCount=0, nativeCount=0;
  const post=scope.postMessage.bind(scope);
  scope.postMessage=(data,ports)=>{
    if(data?.key==='kkeep:jar:v4'&&data.op==='fetch')rpcCount++;
    return post(data,ports);
  };
  const Native=scope.XMLHttpRequest;
  scope.XMLHttpRequest=class extends Native {
    send(...args){nativeCount++;return super.send(...args);}
  };
  installSession(scope,origin);
  const finish=(outcome,signedIn=false)=>post({type:'kkeep:session-check',outcome,signedIn,rpcCount,nativeCount});
  try {
    const xhr=new scope.XMLHttpRequest();
    xhr.open('GET',origin+'/_rbx/api/session',true);
    xhr.responseType='arraybuffer';
    xhr.timeout=40000;
    xhr.onload=()=>{
      if(xhr.status!==200)return finish('http-error');
      try {
        const data=JSON.parse(new TextDecoder().decode(xhr.response));
        if(typeof data?.loggedIn!=='boolean')return finish('invalid-response');
        finish('ready',data.loggedIn);
      }catch{finish('invalid-response');}
    };
    xhr.onerror=()=>finish('request-error');
    xhr.ontimeout=()=>finish('timeout');
    xhr.onabort=()=>finish('cancelled');
    xhr.send();
  }catch{finish('request-error');}
}

export function sessionCheckBootstrap(scope, installSession, probeWorker) {
  const run=scope.document.getElementById('run');
  const status=scope.document.getElementById('status');
  installSession(scope,scope.location.origin);
  let worker,blobUrl,timer,generation=0;
  const cleanup=()=>{
    scope.clearTimeout(timer);
    worker?.terminate();worker=null;
    if(blobUrl)scope.URL.revokeObjectURL(blobUrl);
    blobUrl=null;
  };
  const finish=text=>{cleanup();run.disabled=false;status.textContent=text;};
  scope.addEventListener('pagehide',()=>{generation++;cleanup();run.disabled=false;status.textContent='';});
  run.onclick=async()=>{
    const current=++generation;
    cleanup();
    run.disabled=true;
    status.textContent='Checking the browser session connection…';
    let pending=true;
    const done=text=>{if(!pending||generation!==current)return;pending=false;finish(text);};
    timer=scope.setTimeout(()=>done('The session check timed out. Try again.'),60000);
    try {
      await scope.__kkeepSessionReady();
      if(!pending||generation!==current)return;
      const source='('+probeWorker.toString()+')(self,'+installSession.toString()+','+JSON.stringify(scope.location.origin)+');';
      blobUrl=scope.URL.createObjectURL(new scope.Blob([source],{type:'text/javascript'}));
      worker=new scope.Worker(blobUrl);
      worker.onmessage=event=>{
        const data=event.data;
        if(data?.type!=='kkeep:session-check')return;
        if(data.outcome==='ready'&&typeof data.signedIn==='boolean'&&data.rpcCount===1&&data.nativeCount===0){
          done('Session routing passed: the game worker reached the browser session. '+(data.signedIn?'Your sign-in is available.':'This browser is signed out.')+' This check does not join a game.');
        }else {
          const reasons={'http-error':'the session returned an HTTP error','invalid-response':'the session response was not valid','request-error':'the session request failed','timeout':'the session request timed out','cancelled':'the request was cancelled','ready':'the request used an unexpected route'};
          const reason=reasons[data.outcome]||'the request could not be verified';
          const routed=data.rpcCount===0?'none':data.rpcCount===1?'one':'unexpected';
          const native=data.nativeCount===0?'none':data.nativeCount===1?'one':'unexpected';
          done('Session check failed: '+reason+'. Session requests: '+routed+'. Direct requests: '+native+'. Reload Roblox and try again.');
        }
      };
      worker.onerror=()=>done('The browser could not complete the session check. Reload Roblox and try again.');
    }catch{done('The browser session is not ready. Reload Roblox and try again.');}
  };
}

export const sessionCheckPage=`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Roblox session check · Kkeep</title><style>body{margin:0;min-height:100dvh;display:grid;place-items:center;background:#080b12;color:#e9f2ff;font:17px/1.6 system-ui}main{max-width:580px;padding:28px}h1{font-size:28px}button,a{font:inherit;border:0;border-radius:14px;background:#8ab9ff;color:#061022;padding:12px 18px;display:inline-block;text-decoration:none}a{margin-top:14px}#status{min-height:5em}</style><main><h1>Kkeep · Roblox session check</h1><p>Check the browser connection used for game requests. You can run this check while signed out.</p><button id="run">Check session connection</button><p id="status" role="status"></p><a href="/_rbx/app/">Roblox menu</a></main><script>(${sessionCheckBootstrap.toString()})(window,${sessionClient.toString()},${sessionCheckWorker.toString()});</script></html>`;
