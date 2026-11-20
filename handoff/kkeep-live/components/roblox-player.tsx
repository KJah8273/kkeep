'use client';
import {useEffect,useRef,useState} from 'react';
import {robloxOrigin,robloxFrameUrl,robloxSigninUrl,robloxCheckUrl,robloxPlayerEvent,robloxRuntimeEvent,robloxViewEvent,isRobloxMobileDevice,robloxFpsPreference,robloxGamePlaceId,robloxGameUrl,newRobloxRecoveryBudget,robloxRecoveryAction,robloxRecoveryPlan,type RobloxViewSnapshot,type RobloxRecoveryPlan} from '@/lib/roblox-player';
import RobloxSnow from './roblox-snow';

export default function RobloxPlayer(){
  const frame=useRef<HTMLIFrameElement>(null);
  const [status,setStatus]=useState<'loading'|'ready'|'error'>('loading');
  const [slow,setSlow]=useState(false);
  const [attempt,setAttempt]=useState(0);
  const [playing,setPlaying]=useState(false);
  const [source,setSource]=useState(robloxFrameUrl);
  const [help,setHelp]=useState(false);
  const [offline,setOffline]=useState(false);
  const [connected,setConnected]=useState(false);
  const [mobile,setMobile]=useState(false);
  const [gameId,setGameId]=useState<string|null>(null);
  const [fps,setFps]=useState<30|60>(60);
  const [tuning,setTuning]=useState(false);
  const [engineError,setEngineError]=useState('');
  const [connectionStatus,setConnectionStatus]=useState('');
  const [connectionMode,setConnectionMode]=useState<'native'|'relay'|null>(null);
  const [graphics,setGraphics]=useState<'webgl'|'webgpu'|null>(null);
  const [disconnected,setDisconnected]=useState(false);
  const [view,setView]=useState<RobloxViewSnapshot|null>(null);
  const [automatic,setAutomatic]=useState({active:false,message:''});
  const [inlineHelp,setInlineHelp]=useState('');
  const mobileRef=useRef(false);
  const fpsRef=useRef<30|60>(60);
  const gameRef=useRef<string|null>(null);
  const gpuRef=useRef<'webgl'|'webgpu'|undefined>(undefined);
  const relayRef=useRef(false);
  const recoverySource=useRef(robloxFrameUrl);
  // Message events and iframe load events can arrive in the same React batch.
  // Keep a synchronous failure marker so load cannot hide a reported failure.
  const failureRef=useRef<'session'|'catalog'|'engine'|null>(null);
  const automaticOwner=useRef<'session'|'game'|null>(null);
  const recoveryBudget=useRef(newRobloxRecoveryBudget());
  const recoveryTimer=useRef<number|null>(null);
  const pendingRecovery=useRef<{plan:RobloxRecoveryPlan;placeId:string;owner:Window;url:string}|null>(null);
  const gameReady=useRef(false);
  const terminalConnectionFailure=useRef(false);
  const gameExited=useRef(false);
  const keepPlayerVisible=useRef(false);
  const sessionPaused=useRef(false);
  const sessionPreservesForm=useRef(false);

  useEffect(()=>{
    // A client-side navigation does not apply new document isolation headers.
    // Perform one real navigation when needed; never create a reload loop.
    if(!window.crossOriginIsolated&&window.location&&!new URL(window.location.href).searchParams.has('isolate')){
      const url=new URL(window.location.href);url.searchParams.set('isolate','1');window.location.replace(url.href);return;
    }
    mobileRef.current=isRobloxMobileDevice(navigator);setMobile(mobileRef.current);
    let savedFps:string|null=null;
    try{savedFps=localStorage.getItem('kkeep.roblox.fps');}catch{}
    fpsRef.current=robloxFpsPreference(navigator,savedFps);setFps(fpsRef.current);
    recoverySource.current=robloxFrameUrl+'?fps='+fpsRef.current;setSource(recoverySource.current);
    const sync=()=>{setOffline(!navigator.onLine);armGameRecovery();};sync();
    window.addEventListener('online',sync);window.addEventListener('offline',sync);
    if(typeof document!=='undefined')document.addEventListener('visibilitychange',sync);
    return()=>{window.removeEventListener('online',sync);window.removeEventListener('offline',sync);if(typeof document!=='undefined')document.removeEventListener('visibilitychange',sync);if(recoveryTimer.current!==null)clearTimeout(recoveryTimer.current);pendingRecovery.current=null;};
  },[]);

  useEffect(()=>{
    if(status!=='loading')return;
    const timer=window.setTimeout(()=>setSlow(true),20000);
    return()=>clearTimeout(timer);
  },[attempt,status]);

  useEffect(()=>{
    if(!gameId||source===robloxCheckUrl)return;
    const timer=window.setTimeout(()=>{
      if(gameRef.current!==gameId||gameReady.current||failureRef.current)return;
      // A long load is not a confirmed failure. Offer help without hiding or
      // replacing a game that may still be joining successfully.
      const automaticCover=automaticOwner.current==='game';
      clearAutomatic();if(automaticCover)setHelp(false);setStatus('ready');setSlow(false);
      setInlineHelp('Roblox is taking longer to join. Loading help is ready if you need it.');
      requestView();
    },60000);
    return()=>clearTimeout(timer);
  },[gameId,attempt,source]);

  useEffect(()=>{
    const receive=(event:MessageEvent)=>{
      const snapshot=robloxViewEvent(event,frame.current?.contentWindow??null);
      if(snapshot){if(gameRef.current)setView(snapshot);return;}
      const runtime=robloxRuntimeEvent(event,frame.current?.contentWindow??null);
      if(runtime){
        const connectionFailure=runtime.stage==='failed'&&(runtime.detail==='connection'||runtime.detail==='transport-lost');
        // The iframe can stay alive while the provider returns to its menu.
        // Retired game messages must not cover that menu or clear its errors.
        // Initial pre-play startup failures still get their normal explanation.
        if(gameExited.current&&!gameRef.current&&(connectionFailure||runtime.stage==='running'))return;
        // Engine readiness cannot resurrect an ended game connection. Only a
        // new launch, restart or exit retires this terminal failure marker.
        if(runtime.stage==='running'&&terminalConnectionFailure.current)return;
        if(runtime.gpu&&gameRef.current){gpuRef.current=runtime.gpu;setGraphics(runtime.gpu);}
        if(runtime.stage==='session-recovering'||runtime.stage==='session-waiting'){
          if(failureRef.current==='engine'||failureRef.current==='catalog'||gameRef.current||sessionPaused.current)return;
          automaticOwner.current='session';failureRef.current='session';
          const message=runtime.stage==='session-waiting'?'Waiting for your connection. Sign-in recovery will continue automatically.':runtime.detail==='service-worker'?'Restoring the Roblox browser connection automatically…':'Reconnecting Roblox sign-in automatically…';
          // Only the runtime can verify that a current form/challenge is usable.
          // Initial session-ready also reports worker preparation, not a form.
          sessionPreservesForm.current=runtime.preserveForm===true;
          const visible=keepPlayerVisible.current||sessionPreservesForm.current;
          setEngineError('');setInlineHelp(visible?message:'');setSlow(false);setStatus(visible?'ready':'loading');setHelp(!visible);
          setAutomatic({active:true,message});
          return;
        }
        if(runtime.stage==='session-paused'){
          if(failureRef.current==='engine'||failureRef.current==='catalog'||gameRef.current)return;
          sessionPaused.current=true;clearAutomatic();
          if(keepPlayerVisible.current||sessionPreservesForm.current){failureRef.current=null;setEngineError('');setStatus('ready');setHelp(false);setInlineHelp('Automatic sign-in recovery is paused. Loading help is available.');return;}
          failureRef.current='session';setEngineError('Automatic sign-in recovery is paused. You can retry when you are ready.');setStatus('error');setHelp(true);return;
        }
        if(runtime.stage==='session-help'){
          if(failureRef.current==='engine'||failureRef.current==='catalog'||gameRef.current)return;
          sessionPreservesForm.current=true;
          clearAutomatic();failureRef.current=null;setEngineError('');setStatus('ready');setHelp(false);setSlow(false);
          setInlineHelp(runtime.detail==='connection'?'The sign-in connection could not be restored. Your current form is still open. Use Loading help when you are ready to retry.':'Complete the Roblox sign-in or verification shown below. Automatic retries are paused while you do this.');return;
        }
        if(runtime.stage==='session-failed'){
          if(failureRef.current==='engine'||failureRef.current==='catalog'||gameRef.current)return;
          clearAutomatic();setInlineHelp('');
          const messages:Record<string,string>={
            'service-worker':'Roblox sign-in could not start its browser session. Retry to reconnect without clearing your sign-in.',
            session:'Roblox sign-in did not finish loading. Retry to load it again.',
            connection:'Roblox sign-in could not connect. Check your connection, then retry.',
          };
          const message=messages[runtime.detail]||messages.session;
          failureRef.current='session';setEngineError(message);
          const visible=keepPlayerVisible.current||sessionPreservesForm.current;
          setInlineHelp(visible?message:'');setStatus(visible?'ready':'error');setHelp(!visible);setSlow(false);return;
        }
        if(runtime.stage==='session-ready'){
          // This confirms the sign-in session can load, not that the user has
          // signed in or a game has started. Never clear an engine failure.
          if(failureRef.current==='session'){
            clearAutomatic();failureRef.current=null;setEngineError('');setStatus('ready');setHelp(false);setSlow(false);
          }
          if(!gameRef.current&&failureRef.current!=='catalog')setInlineHelp('');
          return;
        }
        if(runtime.stage==='catalog-failed'){
          if(gameRef.current||failureRef.current==='engine'||failureRef.current==='session')return;
          clearAutomatic();
          const messages:Record<string,string>={version:'This Roblox menu needs an update. Retry to open the current version without clearing your sign-in.',connection:'The Roblox menu could not connect. Loading help is open so you can retry.',catalog:'This Roblox page could not load. Loading help is open so you can retry or return to the menu.'};
          const message=messages[runtime.detail]||messages.catalog;
          failureRef.current='catalog';setEngineError(message);setSlow(false);
          setInlineHelp(keepPlayerVisible.current?message:'');setStatus(keepPlayerVisible.current?'ready':'error');setHelp(!keepPlayerVisible.current);return;
        }
        if(runtime.stage==='catalog-ready'){
          // A menu request cannot confirm sign-in or clear a game failure.
          if(!gameRef.current&&failureRef.current==='catalog'){
            failureRef.current=null;setEngineError('');setInlineHelp('');setStatus('ready');setHelp(false);setSlow(false);
          }
          return;
        }
        if(runtime.stage.startsWith('transport-')){
          if(!gameRef.current)return;
          if(runtime.stage==='transport-native'||runtime.stage==='transport-relay'){
            relayRef.current=runtime.stage==='transport-relay';
            setConnectionMode(relayRef.current?'relay':'native');return;
          }
          const labels:Record<string,string>={'transport-connecting':'Connecting to the game server','transport-ready':'Game server handshake completed','transport-stream-ready':'Game data stream opened','transport-handshake':'Game server handshake failed','transport-closed':'Game server connection closed','transport-lost':'Established game connection lost','transport-unavailable':'Game connection API unavailable','transport-constructor':'Game connection could not be created','transport-stream':'Game data stream failed','transport-datagram':'Game packet writer unavailable'};
          setConnectionStatus((labels[runtime.stage]||runtime.stage)+(runtime.detail?' · '+runtime.detail:''));return;
        }
        if(runtime.stage==='failed'){
          const messages:Record<string,string>={isolation:'The browser could not enable the shared memory Roblox needs.',jspi:'Update iPadOS to a version with the WebAssembly features Roblox needs.',memory:'The engine could not reserve memory. Close other apps and tabs, then retry.',compile:'The Roblox engine could not compile in this browser.',instantiate:'The engine could not start with the available memory or browser features.',download:'The engine download failed. Check your connection and retry.',connection:'The game server disconnected (277). Rejoin to request a fresh server connection. Your sign-in is kept.','transport-lost':'The established game connection was lost. Rejoin to request a fresh server connection. Your sign-in is kept.','transport-unavailable':'This browser does not expose the game network connection API.','transport-constructor':'The browser could not create the game server connection.','transport-handshake':'The game server handshake failed. Rejoin to request a fresh connection.','graphics-init':'The browser could not start the selected graphics mode.','graphics-device-lost':'The game lost its graphics connection.','engine':'Roblox reported a game error. Loading help is open so you can choose the next step.'};
          failureRef.current='engine';setEngineError(messages[runtime.detail]||'Roblox could not start. Run the startup check for more detail.');
          if(connectionFailure)terminalConnectionFailure.current=true;
          gameReady.current=false;setInlineHelp('');setDisconnected(connectionFailure);
          setStatus('error');setHelp(true);setSlow(false);
          scheduleGameRecovery(runtime.detail);
        }else if(runtime.stage==='running'){clearAutomatic();gameReady.current=true;failureRef.current=null;setDisconnected(false);setEngineError('');setStatus('ready');setHelp(false);setInlineHelp('');setSlow(false);}
        return;
      }
      const action=robloxPlayerEvent(event,frame.current?.contentWindow??null);
      if(action==='signed-out'){clearGame();restart(robloxSigninUrl);}
      else if(action==='play'){
        const placeId=robloxGamePlaceId(event,frame.current?.contentWindow??null);
        if(placeId){
          if(gameRef.current!==placeId){
            clearAutomatic();recoveryBudget.current=newRobloxRecoveryBudget();gameReady.current=false;setInlineHelp('');
            terminalConnectionFailure.current=false;gameExited.current=false;
            keepPlayerVisible.current=false;sessionPaused.current=false;sessionPreservesForm.current=false;
            failureRef.current=null;setEngineError('');setStatus('ready');setSlow(false);
            setView(null);
            setConnectionStatus('');setConnectionMode(null);setDisconnected(false);relayRef.current=false;
            gpuRef.current=undefined;setGraphics(null);
          }
          gameRef.current=placeId;setGameId(placeId);
          // Preferences now run inside the isolated runtime before its engine.
          // Keep this document and any chosen server: a reload here interrupts
          // its first join and can create a second concurrent launch.
        }
        setPlaying(true);setHelp(false);setTuning(false);
      }
      else if(action==='exit'){
        // The catalog is now the active destination. Retaining this experience
        // would make Retry launch the old game instead of reopening the menu.
        clearGame();gameExited.current=true;recoverySource.current=robloxFrameUrl+'?fps='+fpsRef.current;
        failureRef.current=null;setEngineError('');setPlaying(false);
        setConnectionStatus('');setTuning(false);setStatus('ready');setHelp(false);
      }
    };
    window.addEventListener('message',receive);
    // Install the signed-out listener before starting the catalog. A cached
    // provider response can otherwise post its sign-in request before hydration.
    setConnected(true);
    return()=>window.removeEventListener('message',receive);
  },[]);

  function clearAutomatic(){
    if(recoveryTimer.current!==null)clearTimeout(recoveryTimer.current);
    recoveryTimer.current=null;pendingRecovery.current=null;automaticOwner.current=null;setAutomatic({active:false,message:''});
  }
  function clearGame(){clearAutomatic();keepPlayerVisible.current=false;sessionPaused.current=false;sessionPreservesForm.current=false;recoveryBudget.current=newRobloxRecoveryBudget();gameReady.current=false;terminalConnectionFailure.current=false;gameExited.current=false;setInlineHelp('');gameRef.current=null;setGameId(null);setView(null);gpuRef.current=undefined;setGraphics(null);relayRef.current=false;setDisconnected(false);setConnectionMode(null);}
  function restart(url:string,applying=false,isAutomatic=false){clearAutomatic();keepPlayerVisible.current=false;sessionPaused.current=false;sessionPreservesForm.current=false;if(!isAutomatic)recoveryBudget.current=newRobloxRecoveryBudget();gameReady.current=false;terminalConnectionFailure.current=false;gameExited.current=false;setInlineHelp('');recoverySource.current=url;failureRef.current=null;setView(null);setDisconnected(false);setEngineError('');setConnectionStatus('');setConnectionMode(null);setGraphics(null);setSource(url);setStatus('loading');setSlow(false);setHelp(false);setPlaying(false);setTuning(applying);setAttempt(value=>value+1);}
  function armGameRecovery(){
    if(recoveryTimer.current!==null)clearTimeout(recoveryTimer.current);
    recoveryTimer.current=null;
    const pending=pendingRecovery.current;
    if(!pending||recoveryBudget.current.paused)return;
    if(!navigator.onLine){setAutomatic({active:true,message:'Waiting for your connection. Game recovery will continue automatically.'});return;}
    if(typeof document!=='undefined'&&document.visibilityState==='hidden'){setAutomatic({active:true,message:'Game recovery will continue when you return to this tab.'});return;}
    setAutomatic({active:true,message:pending.plan.message});
    recoveryTimer.current=window.setTimeout(()=>{
      recoveryTimer.current=null;
      if(pendingRecovery.current!==pending||recoveryBudget.current.paused)return;
      if(gameRef.current!==pending.placeId||frame.current?.contentWindow!==pending.owner){clearAutomatic();return;}
      if(!navigator.onLine||typeof document!=='undefined'&&document.visibilityState==='hidden'){armGameRecovery();return;}
      if(pending.plan.gpu)gpuRef.current=pending.plan.gpu;
      if(pending.plan.relay)relayRef.current=true;
      restart(pending.url,mobileRef.current,true);
      automaticOwner.current='game';setAutomatic({active:true,message:pending.plan.message});setHelp(true);
    },pending.plan.delay);
  }
  function scheduleGameRecovery(detail:string){
    const placeId=gameRef.current,owner=frame.current?.contentWindow;
    if(!placeId||!owner)return;
    if(pendingRecovery.current){
      // A later definitive feature/memory/unknown error invalidates an earlier
      // connection retry. Do not replace its explanation with an obsolete join.
      if(!robloxRecoveryAction(detail,gpuRef.current,relayRef.current))clearAutomatic();
      return;
    }
    const plan=robloxRecoveryPlan(detail,gpuRef.current,relayRef.current,recoveryBudget.current);
    if(!plan){clearAutomatic();if(recoveryBudget.current.attempts>=2)setAutomatic({active:false,message:'Automatic recovery has reached its limit. Choose a step below to continue.'});return;}
    const url=robloxGameUrl(placeId,mobileRef.current?fpsRef.current:null,{gpu:plan.gpu??gpuRef.current,transport:plan.relay||relayRef.current?'relay':undefined});
    if(!url)return;
    automaticOwner.current='game';pendingRecovery.current={plan,placeId,owner,url};armGameRecovery();
  }
  function stopAutomatic(){
    const owner=automaticOwner.current;
    clearAutomatic();recoveryBudget.current.paused=true;
    if(owner==='session'){
      sessionPaused.current=true;
      try{frame.current?.contentWindow?.postMessage({type:'kkeep:roblox-recovery',action:'stop'},robloxOrigin);}catch{}
      if(sessionPreservesForm.current){setInlineHelp('Automatic sign-in recovery is paused. Loading help is available.');setStatus('ready');setHelp(false);return;}
    }
    setAutomatic({active:false,message:'Automatic recovery is paused. You can use the controls below.'});setHelp(true);
  }
  function requestView(){
    if(!gameRef.current)return;
    try{frame.current?.contentWindow?.postMessage({type:'kkeep:roblox-view-request'},robloxOrigin);}catch{}
  }
  function openHelp(){keepPlayerVisible.current=false;setHelp(true);requestView();}
  function retry(useRelay=false){
    const placeId=gameRef.current;
    if(useRelay)relayRef.current=true;
    const url=placeId?robloxGameUrl(placeId,mobileRef.current?fpsRef.current:null,{gpu:gpuRef.current,transport:relayRef.current?'relay':undefined}):null;
    if(url&&placeId){restart(url,mobileRef.current);}
    else restart(recoverySource.current);
  }
  function changeFps(value:30|60){
    fpsRef.current=value;setFps(value);
    try{localStorage.setItem('kkeep.roblox.fps',String(value));}catch{}
    const placeId=gameRef.current;
    const url=placeId?robloxGameUrl(placeId,value,{gpu:gpuRef.current,transport:relayRef.current?'relay':undefined}):null;
    if(url&&placeId){restart(url,true);}
  }
  function tryCompatibilityGraphics(){
    const placeId=gameRef.current;
    if(!placeId||gpuRef.current!=='webgpu')return;
    const url=robloxGameUrl(placeId,mobileRef.current?fpsRef.current:null,{gpu:'webgl',transport:relayRef.current?'relay':undefined});
    if(url){gpuRef.current='webgl';restart(url,mobileRef.current);}
  }
  function tryStandardGraphics(){
    const placeId=gameRef.current;
    if(!placeId||gpuRef.current!=='webgl')return;
    const url=robloxGameUrl(placeId,mobileRef.current?fpsRef.current:null,{gpu:'webgpu',transport:relayRef.current?'relay':undefined});
    if(url){gpuRef.current='webgpu';restart(url,mobileRef.current);}
  }
  function openMenu(){clearGame();restart(robloxFrameUrl+'?fps='+fpsRef.current);}
  const relayRecovery=Boolean(gameId&&disconnected&&connectionMode!=='relay');
  const lifecycleLabels={'join-reported':'Join reported','scripts-starting':'Game scripts starting','game-closed':'Game closed'};

  return <main className="roblox-player" aria-label="Roblox">
    <RobloxSnow paused={playing||status!=='ready'||help||source===robloxCheckUrl}/>
    {/* The runtime budgets its drawing buffer; keep its document viewport full size during startup. */}
    <iframe key={attempt} ref={frame} src={connected?source:undefined} className="roblox-frame" title="Roblox" loading="eager"
      allow="cross-origin-isolated; autoplay; fullscreen; gamepad; clipboard-write"
      allowFullScreen
      sandbox="allow-scripts allow-same-origin allow-forms allow-pointer-lock allow-popups allow-popups-to-escape-sandbox allow-downloads allow-modals"
      referrerPolicy="strict-origin-when-cross-origin"
      onLoad={event=>{if(event.currentTarget===frame.current&&connected&&!failureRef.current&&!automaticOwner.current){setStatus('ready');setSlow(false);}}}
      onError={event=>{if(event.currentTarget===frame.current){clearAutomatic();failureRef.current=gameRef.current?'engine':'session';setEngineError('Roblox could not open this page. Check your connection, then retry.');setStatus('error');setHelp(true);setSlow(false);}}}/>
    {status==='ready'&&!help&&!inlineHelp&&<button className="roblox-help-toggle" type="button" onClick={openHelp} aria-label="Roblox loading help">Loading help</button>}
    {status==='ready'&&!help&&inlineHelp&&<div className="roblox-auto-notice" role="status"><p>{inlineHelp}</p><div>{automatic.active&&<button type="button" onClick={stopAutomatic}>Stop automatic recovery</button>}<button type="button" onClick={openHelp}>Loading help</button><button type="button" onClick={()=>setInlineHelp('')}>Dismiss</button></div></div>}
    {(status!=='ready'||help)&&<div className="roblox-loading" role={status==='error'?'alert':'status'}>
      <img className="roblox-loading-cover" src="/games/covers/roblox-blue.svg" width={240} height={150} alt="Roblox"/>
      <strong>Kkeep</strong>
      <p>{automatic.active?automatic.message:offline?'You are offline. Reconnect to continue.':engineError|| (help?'Black screen or stuck loading?':status==='error'?'Roblox could not open.':tuning?'Applying Roblox performance settings…':source===robloxSigninUrl?'Opening Roblox sign-in…':'Opening Roblox…')}</p>
      {status==='loading'&&!offline&&<span className="roblox-spinner" aria-hidden="true"/>}
      {(status==='error'||slow||help||offline)&&<div className="roblox-recovery">
        {!automatic.active&&automatic.message&&<p role="status">{automatic.message}</p>}
        {automatic.active&&<button type="button" onClick={stopAutomatic}>Stop automatic recovery</button>}
        {slow&&status==='loading'&&!automatic.active&&<p>The player is taking longer to respond. Retry or run the startup check.</p>}
        {help&&!engineError&&!automatic.active&&<p>{gameId?'Retry reopens this experience. Lighter mode reduces the frame-rate target to ease the load.':'Choose an experience to start. This Kkeep player keeps its own sign-in session.'}</p>}
        {mobile&&<p className="roblox-mode-label">Mobile performance mode · {fps} FPS target</p>}
        {graphics&&<p className="roblox-mode-label">Graphics · {graphics==='webgl'?'WebGL':'WebGPU'}</p>}
        {connectionMode&&<p className="roblox-mode-label">Game connection · {connectionMode==='relay'?'Relay':'Direct'}</p>}
        {connectionStatus&&<p className="roblox-mode-label" role="status">{connectionStatus}</p>}
        {help&&gameId&&<details className="roblox-troubleshooting">
          <summary>Troubleshooting details</summary>
          <div className="roblox-troubleshooting-content">
            <dl>
              <div><dt>Runtime revision</dt><dd>{view?.revision??'Not reported'}</dd></div>
              <div><dt>Current view</dt><dd>{view?.canvas?`${view.canvas.cssWidth} × ${view.canvas.cssHeight} CSS pixels`:'Not reported'}</dd></div>
              <div><dt>Current backing size</dt><dd>{view?.canvas?`${view.canvas.width} × ${view.canvas.height} pixels`:'Not reported'}</dd></div>
              <div><dt>{view?.startup?'Startup size reported':'Startup size'}</dt><dd>{view?.startup?<>{view.startup.cssWidth} × {view.startup.cssHeight} CSS pixels<br/>{view.startup.width} × {view.startup.height} backing pixels</>:'Engine startup size not reported'}</dd></div>
              <div><dt>Last native game event</dt><dd>{view?.lifecycle?lifecycleLabels[view.lifecycle]:'No native game event reported'}</dd></div>
            </dl>
            <p>These checks do not confirm that the game is playable.</p>
            <button type="button" onClick={requestView}>Refresh details</button>
          </div>
        </details>}
        <button type="button" onClick={()=>retry(relayRecovery)}>{relayRecovery?'Rejoin using relay':gameId?'Rejoin this game':'Retry'}</button>
        {gameId&&graphics==='webgpu'&&<button type="button" onClick={tryCompatibilityGraphics}>Try compatibility graphics</button>}
        {gameId&&graphics==='webgl'&&<button type="button" onClick={tryStandardGraphics}>Try standard graphics</button>}
        {gameId&&<button type="button" onClick={()=>changeFps(fps===30?60:30)}>{fps===30?'Use 60 FPS target':'Use lighter mode (30 FPS)'}</button>}
        <button type="button" onClick={openMenu}>Roblox menu</button>
        <button type="button" onClick={()=>restart(robloxCheckUrl)}>Run startup check</button>
        <button type="button" onClick={()=>{keepPlayerVisible.current=true;if(automaticOwner.current)stopAutomatic();if(engineError)setInlineHelp(engineError);setStatus('ready');setHelp(false);setSlow(false);}}>Show player</button>
        <a href="/">Back to Kkeep</a>
      </div>}
    </div>}
  </main>;
}
