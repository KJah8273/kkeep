import {engineProfiles,resolvePublicEngine} from './engine.js';

// Resolve the provider's current public binary on each check. A successful
// check of an obsolete upload says nothing about the engine a new launch uses.
export function engineCheckBootstrap(scope, profiles, resolveMetadata) {
  const document=scope.document;
  const results=document.getElementById('results'),run=document.getElementById('run'),status=document.getElementById('status');
  const wasm=scope.WebAssembly;
  const features={secure:scope.isSecureContext,isolation:scope.crossOriginIsolated,sharedMemory:typeof scope.SharedArrayBuffer==='function',jspi:typeof wasm.Suspending==='function'&&typeof wasm.promising==='function'};
  const summary=Object.entries(features).map(([key,value])=>key+': '+(value?'ready':'missing')).join('\n');
  results.textContent=summary;
  results.textContent+='\nGame network API: '+(typeof scope.WebTransport==='function'?'ready':'missing');
  const datagrams=scope.WebTransportDatagramDuplexStream?.prototype;
  results.textContent+='\nPacket writer: '+(typeof datagrams?.createWritable==='function'?'createWritable (Safari compatible)':datagrams&&'writable' in datagrams?'legacy writable':'unavailable');
  try{const last=scope.sessionStorage.getItem('kkeep.roblox.connection');if(last&&/^transport-[a-z-]+(?: \/ [A-Za-z]+)?$/.test(last))results.textContent+='\nLast connection: '+last;}catch{}
  const featureSummary=results.textContent;
  async function boundedFetch(work,timeout) {
    const controller=new scope.AbortController();
    let deadline;
    try {
      return await Promise.race([
        work(controller.signal),
        new Promise((_,reject)=>{deadline=scope.setTimeout(()=>{controller.abort();reject(new Error('Engine check timed out. Check your connection and retry.'));},timeout);})
      ]);
    } finally { scope.clearTimeout(deadline); }
  }
  run.onclick=async()=>{
    run.disabled=true;
    results.textContent=featureSummary;
    try {
      if(Object.values(features).some(value=>!value)){status.textContent='A required browser feature is missing. Engine download skipped.';return;}
      status.textContent='Finding the current engine version…';
      const metadata=await boundedFetch(async signal=>{
        const response=await scope.fetch('/_rbx/engine',{cache:'no-store',credentials:'omit',signal});
        if(!response.ok)throw new Error('Engine version lookup returned HTTP '+response.status);
        return response.json();
      },15000);
      const engine=resolveMetadata(metadata);
      if(!engine)throw new Error('The provider did not identify a valid current engine binary.');
      const {version,wasmPath}=engine;
      results.textContent+='\nCurrent engine: '+version;
      status.textContent='Downloading and compiling '+version+'…';
      const module=await boundedFetch(async signal=>{
        const response=await scope.fetch(wasmPath,{credentials:'omit',signal});
        if(!response.ok)throw new Error('Engine download returned HTTP '+response.status);
        return wasm.compileStreaming(response);
      },90000);
      const profile=Object.prototype.hasOwnProperty.call(profiles,version)?profiles[version]:null;
      if(!profile){status.textContent='Engine compiled: '+version+'. This new version’s memory layout has not been verified, so this check cannot confirm engine startup.';return;}
      const memoryMiB=profile.memoryPages/16;
      status.textContent='Checking '+memoryMiB+' MiB shared memory and engine linking…';
      const imports={};
      for(const item of wasm.Module.imports(module)){
        imports[item.module]??={};
        if(item.kind==='memory')imports[item.module][item.name]=new wasm.Memory({initial:profile.memoryPages,maximum:profile.memoryPages,shared:true});
        else if(item.kind==='function')imports[item.module][item.name]=()=>0;
        else throw new Error('The engine import format changed: '+item.kind);
      }
      await wasm.instantiate(module,imports);
      status.textContent='Startup check passed for '+version+': engine compiled and linked with '+memoryMiB+' MiB shared memory. This does not test gameplay or server joining.';
    }catch(error){status.textContent='Startup check failed: '+error.name+': '+error.message;}
    finally{run.disabled=false;}
  };
}

export const checkPage=`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Roblox startup check · Kkeep</title><style>body{margin:0;min-height:100dvh;display:grid;place-items:center;background:#080b12;color:#e9f2ff;font:17px/1.6 system-ui}main{max-width:560px;padding:28px}h1{font-size:28px}button,a{font:inherit;border:0;border-radius:14px;background:#8ab9ff;color:#061022;padding:12px 18px;display:inline-block;text-decoration:none}pre{white-space:pre-wrap;font:14px/1.7 system-ui;color:#bdd5f8}</style><main><h1>Kkeep · Roblox startup check</h1><p>This checks the current public game engine in this browser. No Roblox account is needed.</p><pre id="results" aria-live="polite"></pre><button id="run">Check engine startup</button><p id="status" role="status"></p><a href="/_rbx/app/session-check">Check session connection</a> <a href="/_rbx/app/">Roblox menu</a></main><script>(${engineCheckBootstrap.toString()})(window,${JSON.stringify(engineProfiles)},${resolvePublicEngine.toString()});</script></html>`;
