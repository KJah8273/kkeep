// Runs before the provider hook, in the isolated game document only.
export function runtimeBootstrap() {
  const TARGETS = ['https://kkeep.fun', 'https://kkeep.kha971.chatgpt.site'];
  const send = (stage, detail = '', selectedGpu) => {
    const gpu=selectedGpu || window.__rbxPerf?.gpu;
    const preferences=gpu==='webgl'||gpu==='webgpu'?{gpu}:{};
    if (parent !== window) for (const target of TARGETS) parent.postMessage({type:'kkeep:roblox-runtime',stage,detail,...preferences},target);
  };
  const mobile = /iPad|iPhone|iPod|Android|Mobi/i.test(navigator.userAgent) || navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  let lastError = '';
  let networkStage='';
  let gameClosing = false, pageHidden = false, pageDiscarded = false;
  let graphicsDevice = null, graphicsFailureReported = false, pendingGraphicsFailure = null;
  let transportFailureReported = false, pendingTransportFailure = false;
  addEventListener('pagehide', event => {
    pageHidden=true;
    if(!event.persisted){pageDiscarded=true;pendingGraphicsFailure=null;pendingTransportFailure=false;}
  });
  addEventListener('pageshow', event => {
    if(!event.persisted || pageDiscarded)return;
    pageHidden=false;
    const pending=pendingGraphicsFailure;
    pendingGraphicsFailure=null;
    if(pending && (!pending.device || pending.device===graphicsDevice))graphicsFailure(pending.code);
    if(pendingTransportFailure){pendingTransportFailure=false;transportFailure();}
  });
  // An on-demand, local view check helps distinguish the canvas dimensions
  // from the game's own loading GUI. Never retain arbitrary engine output.
  let startupView = null, lifecycle = null;
  const viewSize = value => Number.isInteger(value) && value >= 0 && value <= 32768;
  function engineOutput(line) {
    if (typeof line !== 'string' || line.length > 200) return;
    // These three exact printf messages belong to the inspected engine's
    // registered native lifecycle callbacks. Ignore every other log and ID.
    const lifecycleLines = {
      '[LIFECYCLE] joinGameSucceeded':'join-reported',
      '[LIFECYCLE] ugcGameLuaWillStart':'scripts-starting',
      '[LIFECYCLE] ugcGameWillClose':'game-closed',
    };
    if (Object.hasOwn(lifecycleLines,line)) {
      lifecycle=lifecycleLines[line];
      if(lifecycle==='game-closed')gameClosing=true;
      return;
    }
    if (startupView) return;
    const match = /^Canvas: (\d{1,5})x(\d{1,5}) CSS, (\d{1,5})x(\d{1,5}) backing \(effective dpr=(\d{1,2}(?:\.\d{1,3})?), raw=(\d{1,2}(?:\.\d{1,3})?)\)$/.exec(line);
    if (!match) return;
    const [cssWidth,cssHeight,width,height,effectiveDpr,rawDpr] = match.slice(1).map(Number);
    if (![cssWidth,cssHeight,width,height].every(viewSize) ||
        ![effectiveDpr,rawDpr].every(value => Number.isFinite(value) && value > 0 && value <= 16)) return;
    startupView = {cssWidth,cssHeight,width,height,effectiveDpr,rawDpr};
  }
  addEventListener('message', event => {
    if (parent === window || event.source !== parent || !TARGETS.includes(event.origin) ||
        event.data?.type !== 'kkeep:roblox-view-request') return;
    try {
      const element = document.getElementById('canvas');
      const dimensions = element && {cssWidth:element.clientWidth,cssHeight:element.clientHeight,
        width:element.width,height:element.height};
      const canvas = dimensions && Object.values(dimensions).every(viewSize) ? dimensions : null;
      parent.postMessage({type:'kkeep:roblox-view',revision:'join19',canvas,startup:startupView,lifecycle},event.origin);
    } catch { /* A local view check must never interrupt the game. */ }
  });
  // Keep only fixed categories and known script coordinates in this document.
  // The provider rethrows worker ErrorEvents, which can lose their details.
  // Never retain or transmit raw messages, stacks, filenames, or session URLs.
  let pendingFailure = null, recentRejection = null, fatalSnapshot = null;
  let pendingTimer = null;
  const errorNames = new Set(['Error','TypeError','RangeError','ReferenceError','SyntaxError','EvalError','URIError','AggregateError',
    'AbortError','DataCloneError','InvalidStateError','NotSupportedError','NetworkError','SecurityError','OperationError',
    'QuotaExceededError','UnknownError','RuntimeError','CompileError','LinkError','SuspendError',
    'BindingError','InternalError','ExitStatus','WebTransportError']);
  const sourceNames = new Set(['WebClient.js','WasmPlayer.js','WasmLoader.js','stub.js','hook.js',
    'kkeep-runtime.js','kkeep-session.js','kkeep-preferences.js','audio-processor-fast.js']);
  const namedError = value => typeof value === 'string' && errorNames.has(value) ? value : '';
  const messageError = value => {
    if (typeof value !== 'string') return '';
    const name = /^(?:Uncaught(?: \(in promise\))?\s+)?([A-Za-z]*Error|ExitStatus)(?::|\s|$)/.exec(value.slice(0,80))?.[1];
    return namedError(name);
  };
  const sourceName = value => {
    if (typeof value !== 'string') return '';
    const path = value.split(/[?#]/,1)[0], name = path.slice(path.lastIndexOf('/')+1);
    return sourceNames.has(name) ? name : '';
  };
  const coordinate = value => Number.isInteger(value) && value > 0 && value <= 1000000 ? value : 0;
  function sourceLocation(event, error, hint = '') {
    for (const [file,line,column] of [[event?.filename,event?.lineno,event?.colno],
      [error?.fileName || error?.sourceURL,error?.lineNumber,error?.columnNumber]]) {
      const source = sourceName(file);
      if (source) return {source,line:coordinate(line),column:coordinate(column)};
    }
    // Promise rejections often have only a stack. Extract one known source
    // coordinate, then discard the stack, including function names and URLs.
    const stack = error?.stack;
    if (typeof stack === 'string') {
      const match = /(?:^|\/)(WebClient\.js|WasmPlayer\.js|WasmLoader\.js|stub\.js|hook\.js|kkeep-runtime\.js|kkeep-session\.js|kkeep-preferences\.js|audio-processor-fast\.js)(?:[?#][^\s)]*)?:(\d{1,7}):(\d{1,7})(?=[)\s]|$)/m.exec(stack.slice(0,8192));
      if (match) return {source:match[1],line:coordinate(Number(match[2])),column:coordinate(Number(match[3]))};
    }
    return {source:sourceNames.has(hint)?hint:'',line:0,column:0};
  }
  function describeError(event, kind = 'JavaScript', hint = '') {
    try {
      const value = event?.error;
      const nested = value && typeof value === 'object' &&
        ((typeof ErrorEvent === 'function' && value instanceof ErrorEvent) ||
          value.type === 'error' && typeof value.message === 'string' && typeof value.filename === 'string') ? value : null;
      const error = nested ? nested.error : value;
      const location = sourceLocation(nested || event, error, hint);
      if (nested && (location.source === 'WebClient.js' || location.source === 'stub.js')) kind = 'engine worker';
      let name = namedError(error?.name) || messageError(nested?.message) || messageError(event?.message);
      if (!name && typeof WebAssembly.Exception === 'function' && error instanceof WebAssembly.Exception) name = 'WebAssembly.Exception';
      return {kind,name,...location};
    } catch { return {kind,name:'',source:'',line:0,column:0}; }
  }
  const useful = failure => failure && (failure.name || failure.source || failure.kind === 'engine worker');
  function recordError(event, kind, hint) {
    if (fatalSnapshot) return;
    const failure = describeError(event,kind,hint);
    if (!pendingFailure || !useful(pendingFailure) && useful(failure)) pendingFailure = failure;
    // Only errors from the task that displayed the fatal panel belong to it.
    // The observer runs before this timer; older nonfatal errors then expire.
    if (pendingTimer === null) pendingTimer = setTimeout(() => {pendingFailure=null;pendingTimer=null;},0);
  }
  addEventListener('error', event => recordError(event));
  addEventListener('unhandledrejection', event => {
    if (fatalSnapshot) return;
    let failure;
    try { failure=describeError({error:event.reason,message:typeof event.reason==='string'?event.reason:''},'promise rejection'); }
    catch { failure=describeError(null,'promise rejection'); }
    recentRejection={failure,time:Date.now()};
  });
  function observeWorker(worker, kind, source) {
    worker.addEventListener('error', event => recordError(event,kind,source));
  }
  const NativeWorker = window.Worker;
  if (typeof NativeWorker === 'function' && !NativeWorker.__kkeepErrorObserved) {
    // Observe this document's workers before the provider assigns onerror.
    // Preserve native construction, errors, events, and return values.
    const Worker = class extends NativeWorker {
      constructor(url, options) {
        super(url,options);
        try {
          const engine = options && Object.getOwnPropertyDescriptor(options,'name')?.value === 'em-pthread';
          observeWorker(this,engine?'engine worker':'worker',sourceName(url));
        } catch { /* diagnostics must not affect a successfully created worker */ }
      }
    };
    Object.defineProperty(Worker,'__kkeepErrorObserved',{value:true});
    try { window.Worker=Worker; } catch { /* global error observation remains available */ }
  }
  const describeFailure = failure => {
    const site = failure.source ? ' at '+failure.source+(failure.line?':'+failure.line+(failure.column?':'+failure.column:''):'') : '';
    return failure.kind+' / '+(failure.name||'details unavailable')+site;
  };
  function reportFatal(failure, afterLoad) {
    // Report only a confirmed, visible engine failure. These are the same
    // bounded categories shown in the panel, never exception text or URLs.
    if (typeof fetch !== 'function') return;
    const gpu=window.__rbxPerf?.gpu;
    const record={phase:afterLoad?'after-load':'startup',
      kind:failure?.kind||'unavailable',name:failure?.name||'',
      source:failure?.source||'',line:failure?.line||0,column:failure?.column||0,
      gpu:gpu==='webgl'||gpu==='webgpu'?gpu:''};
    try {
      fetch(new URL('/_kkeep/failure',location.href).href,{method:'POST',credentials:'omit',mode:'same-origin',
        redirect:'error',referrerPolicy:'no-referrer',headers:{'Content-Type':'application/json'},
        body:JSON.stringify(record),keepalive:true}).catch(()=>{});
    } catch { /* A diagnostic must never prevent the failure panel. */ }
  }
  function compatibilityUrl() {
    try {
      const current=new URL(location.href), place=current.searchParams.get('placeId')||'';
      if(!/\/games\/start$/.test(current.pathname)||!/^\d{1,16}$/.test(place)||!Number.isSafeInteger(Number(place))||Number(place)<=0)return '';
      const next=new URL(current.pathname,current.origin);
      next.searchParams.set('placeId',place);
      for(const [key,allowed] of [['perf',/^(performance|balanced|quality|auto)$/],['fps',/^(30|45|60|off)$/],['res',/^(auto|full|low)$/]]){
        const value=current.searchParams.get(key);
        if(value&&allowed.test(value))next.searchParams.set(key,value);
      }
      next.searchParams.set('gpu','webgl');
      if(current.searchParams.get('wt')==='relay')next.searchParams.set('wt','relay');
      return next.href;
    }catch{return '';}
  }
  const messages = {
    isolation:'Safari could not enable shared memory for this launch.',
    jspi:'This browser is missing the WebAssembly feature this game needs. Update iPadOS, then try again.',
    memory:'The engine could not reserve its required memory. Close other tabs and apps, then retry.',
    compile:'The game engine could not compile in this browser.',
    instantiate:'The game engine could not start with the available memory or browser features.',
    download:'The engine download failed. Check your connection and retry.',
    connection:'The game server disconnected (277). Rejoin to request a fresh server connection. Your sign-in is kept.',
    'transport-unavailable':'This browser does not expose the game network connection API.',
    'transport-constructor':'The browser could not create the game server connection.',
    'transport-handshake':'The browser could not complete the game server handshake. Rejoin to try a fresh connection.',
    'transport-closed':'The game server connection closed. Rejoin to request a fresh connection.',
    'transport-lost':'The game connection ended unexpectedly. Rejoin to request a fresh connection. Your sign-in is kept.',
    'graphics-init':'WebGPU could not start. Compatibility graphics may work for this browser.',
    'graphics-device-lost':'The browser lost the game graphics device. Compatibility graphics may work for this browser.'
  };
  function fail(code, error, selectedGpu) {
    lastError = code;
    send('failed',code,selectedGpu);
    console.error('[Kkeep Roblox]',code,error);
    const show = () => {
      let panel = document.getElementById('kkeep-runtime-error');
      if (!panel) {
        panel = document.createElement('section'); panel.id='kkeep-runtime-error'; panel.setAttribute('role','alert');
        panel.style.cssText='position:fixed;inset:0;z-index:2147483647;background:#080b12ed;color:white;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;padding:24px;text-align:center;font:17px/1.5 system-ui';
        const title=document.createElement('strong');title.textContent='Kkeep · Roblox';title.style.fontSize='26px';
        const text=document.createElement('p');text.id='kkeep-runtime-message';text.style.maxWidth='480px';
        const retry=document.createElement('button');retry.textContent='Rejoin this experience';retry.style.cssText='font:inherit;padding:14px 24px;border:0;border-radius:14px;background:#85b5ff;color:#061022';retry.onclick=()=>{
          const old=new URL(location.href),next=new URL(old.pathname,old.origin);
          for(const key of ['placeId','perf','fps','res'])if(old.searchParams.has(key))next.searchParams.set(key,old.searchParams.get(key));
          const gpu=window.__rbxPerf?.gpu;
          if(gpu==='webgl'||gpu==='webgpu')next.searchParams.set('gpu',gpu);
          if(old.searchParams.get('wt')==='relay')next.searchParams.set('wt','relay');
          location.replace(next.href);
        };
        const back=document.createElement('a');back.textContent='Roblox menu';back.href='/_rbx/app/';back.style.color='#bdd6ff';
        panel.append(title,text,retry,back);document.body.append(panel);
      }
      document.getElementById('kkeep-runtime-message').textContent=(messages[code] || messages.instantiate)+(networkStage?' Connection check: '+networkStage+'.':'');
    };
    if(document.body)show();else addEventListener('DOMContentLoaded',show,{once:true});
  }
  function graphicsFailure(code) {
    if(gameClosing || pageDiscarded || lastError && lastError!=='engine' || graphicsFailureReported ||
        !['graphics-init','graphics-device-lost'].includes(code))return;
    // BFCache suspension is not a game exit. Defer an observed loss until
    // restoration, keeping only its fixed cause and the selected device.
    if(pageHidden){pendingGraphicsFailure={code,device:code==='graphics-device-lost'?graphicsDevice:null};return;}
    graphicsFailureReported=true;
    // Called only from the inspected player's actual WebGPU selection branch.
    // A preference alone cannot establish which renderer really failed.
    fail(code,undefined,'webgpu');
  }
  function transportFailure() {
    if(gameClosing || pageDiscarded || transportFailureReported || lastError && lastError!=='engine')return;
    // This signal comes only from the current adopted transport after its
    // readiness completed. Candidate failures and intentional closes remain
    // advisory. Do not start host recovery while this document is in BFCache.
    if(pageHidden){pendingTransportFailure=true;return;}
    transportFailureReported=true;
    fail('transport-lost');
  }
  window.__kkeepRuntime={mobile,fail,engineOutput,graphicsFailure,graphicsDevice(device){
    if(gameClosing || pageDiscarded || !device || graphicsDevice===device)return;
    try {
      if(typeof device.lost?.then!=='function')return;
      graphicsDevice=device;
      device.lost.then(info=>{
        if(gameClosing || pageDiscarded || graphicsDevice!==device || info?.reason==='destroyed')return;
        graphicsFailure('graphics-device-lost');
      },()=>{});
    } catch { /* Observing the selected device must never affect initialization. */ }
  },engineError(error){
    // The inspected engine catches frame-loop exceptions before window.onerror.
    // Preserve only its bounded descriptor; the provider displays the failure.
    recordError({error},'JavaScript','WebClient.js');
  },connection(stage,name){
    // The transport observer emits this for every new current generation.
    // Replacement invalidates only a deferred loss, never a reported failure.
    if(stage==='transport-connecting')pendingTransportFailure=false;
    networkStage=stage+(name?' / '+name:'');send(stage,name);
    try{sessionStorage.setItem('kkeep.roblox.connection',networkStage);}catch{}
    // Native QUIC can fail while the provider's WebSocket fallback succeeds.
    // Only the selected ready transport's terminal event confirms a lost
    // connection; the other transport stages remain advisory.
    if(stage==='transport-lost')transportFailure();
  }};
  if(!crossOriginIsolated || typeof SharedArrayBuffer!=='function')fail('isolation');
  else if(typeof WebAssembly.Suspending!=='function'||typeof WebAssembly.promising!=='function')fail('jspi');
  else send('features-ready');

  // Preserve the engine's declared memory layout. Never silently shrink its heap.
  const NativeMemory=WebAssembly.Memory;
  function Memory(descriptor){
    if(!new.target)throw new TypeError('WebAssembly.Memory requires new');
    try{return new NativeMemory(descriptor)}catch(error){fail('memory',error);throw error;}
  }
  Memory.prototype=NativeMemory.prototype;Object.setPrototypeOf(Memory,NativeMemory);WebAssembly.Memory=Memory;
  const compile=WebAssembly.compileStreaming;
  if(compile)WebAssembly.compileStreaming=function(source){
    send('compiling');
    return compile.call(WebAssembly,source).then(module=>{send('compiled');return module},error=>{fail(error instanceof TypeError?'download':'compile',error);throw error});
  };
  const instantiate=WebAssembly.instantiate;
  WebAssembly.instantiate=function(){
    return instantiate.apply(WebAssembly,arguments).catch(error=>{fail('instantiate',error);throw error});
  };
  addEventListener('DOMContentLoaded',()=>{
    const loading=document.getElementById('loading-overlay');
    if(!loading)return;
    let reportedRunning=false;
    const observer=new MutationObserver(()=>{
      const code=document.getElementById('loading-error-code');
      const panel=document.querySelector('.loading-error-panel');
      const message=document.getElementById('loading-error-message');
      const details=document.getElementById('kkeep-engine-error-detail');
      const compatibility=document.getElementById('kkeep-engine-compatibility');
      const visible=panel&&!panel.hidden&&!loading.hidden&&getComputedStyle(panel).display!=='none'&&getComputedStyle(loading).display!=='none'&&getComputedStyle(panel).visibility!=='hidden';
      const original=message?Array.from(message.childNodes).filter(node=>node!==details).map(node=>node.textContent||'').join('').trim():'';
      if(visible&&message&&panel.contains(message)&&original==='Roblox encountered a problem. Check the console and reload.'){
        if(!fatalSnapshot){
          fatalSnapshot={failure:pendingFailure,rejection:recentRejection&&Date.now()-recentRejection.time<=10000?recentRejection.failure:null};
          reportFatal(fatalSnapshot.failure,reportedRunning);
        }
        let text='Details: '+(fatalSnapshot.failure?describeFailure(fatalSnapshot.failure):'no error event captured');
        if(fatalSnapshot.rejection)text+='; earlier '+describeFailure(fatalSnapshot.rejection);
        text+=' · join19';
        const detail=details||document.createElement('small');
        if(!details){detail.id='kkeep-engine-error-detail';detail.style.cssText='display:block;margin-top:12px;font:14px/1.4 system-ui;opacity:.85';message.append(detail);}
        if(detail.textContent!==text)detail.textContent=text;
        if(mobile&&window.__rbxPerf?.gpu==='webgpu'&&compatibilityUrl()){
          if(!compatibility){
            const controls=document.createElement('div');controls.id='kkeep-engine-compatibility';
            controls.style.cssText='display:grid;gap:8px;margin:14px 0 0';
            const explanation=document.createElement('p');explanation.textContent='Restart this experience using compatibility graphics.';
            explanation.style.cssText='margin:0;font:14px/1.4 system-ui;color:inherit';
            const retry=document.createElement('button');retry.id='kkeep-engine-compatibility-retry';retry.type='button';retry.textContent='Try compatibility mode';
            retry.style.cssText='font:inherit;padding:12px 18px;border:0;border-radius:12px;background:#c5b7ff;color:#171329;cursor:pointer';
            retry.onclick=()=>{
              if(window.__rbxPerf?.gpu!=='webgpu')return;
              const url=compatibilityUrl();if(!url)return;
              retry.disabled=true;location.replace(url);
            };
            controls.append(explanation,retry);panel.append(controls);
          }
        }else compatibility?.remove();
      }else {details?.remove();compatibility?.remove();fatalSnapshot=null;}
      if(visible&&code&&/\b277\b/.test(code.textContent)){
        if(!lastError)fail('connection');
        return;
      }
      // A confirmed provider error opens host Loading help even when its cause
      // is unknown. Do not reinterpret incidental console errors or retry them.
      const providerError=original==='Roblox encountered a problem. Check the console and reload.' ||
        original==='Failed to load engine. Please reload the page.' ||
        original==='Unable to start Roblox. Check the console and reload.' ||
        /^\(Error Code: -?\d{1,4}\)$/.test(code?.textContent?.trim()||'');
      if(visible&&providerError&&!lastError){lastError='engine';send('failed','engine');}
      if(!lastError&&!reportedRunning && (loading.hidden || getComputedStyle(loading).display==='none')){reportedRunning=true;send('running');}
    });
    observer.observe(loading,{attributes:true,attributeFilter:['hidden','class','style'],childList:true,subtree:true,characterData:true});
  },{once:true});
}
