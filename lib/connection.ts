export type ConnectionResult={browser:string;server:string;relay:string};
export async function checkConnection():Promise<ConnectionResult>{
 const result:ConnectionResult={browser:window.isSecureContext&&'serviceWorker' in navigator?'Supported':'Open this link in Safari or Chrome',server:'Not checked',relay:'Not checked'};
 if(!navigator.onLine){result.server='Device is offline';return result;}
 try{const health=await fetch('/api/health',{cache:'no-store',signal:AbortSignal.timeout(15000)});if(!health.ok)throw new Error(`Server returned ${health.status}`);const d=await health.json();if(!d.relay)throw new Error('Unexpected server response');result.server='Reachable';}catch(e){result.server=e instanceof Error?e.message:'Network request failed';return result;}
 try{const meta=btoa(JSON.stringify({url:'https://example.com/',method:'HEAD',headers:[]}));const r=await fetch('/api/relay',{method:'POST',headers:{'X-Kha-Relay':'1','X-Kha-Meta':meta},cache:'no-store',signal:AbortSignal.timeout(45000)});if(!r.ok){let message=`Relay returned ${r.status}`;try{message=(await r.json()).error||message;}catch{}throw new Error(message);}const raw=r.headers.get('X-Kha-Response');if(!raw)throw new Error('Relay response missing; reopen the shared link in Safari');const data=JSON.parse(atob(raw));result.relay=data.status>=200&&data.status<400?'Test website reached':`Test website returned ${data.status}`;}catch(e){result.relay=e instanceof Error?e.message:'Network request failed';}
 return result;
}
export async function repairProxy(){
 if('serviceWorker' in navigator){const registrations=await navigator.serviceWorker.getRegistrations();for(const r of registrations){const worker=r.active||r.waiting||r.installing;if(worker&&['/proxy-sw.js','/gfn/proxy-sw.js','/xbox/proxy-sw.js'].includes(new URL(worker.scriptURL).pathname))await r.unregister();}}
 window.location.reload();
}
