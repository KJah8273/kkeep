'use client';
import {useEffect,useRef,useState} from 'react';
import {CloudCheck,CloudOff,LoaderCircle,UserRound,Maximize2,RotateCw,ArrowLeft,X} from 'lucide-react';
import GameProfile from './game-profile';
import {claimGuestProgress,cloudProgress,migrateLegacyProgress,emptyGameSave,prepareGameHtml,readProgress,writeProgress,type GameSnapshot,type ProgressRow,type GameAccount} from '@/lib/games/progress-client';
import type {SavedGame} from '@/lib/games/save-catalog';

export default function SavedGamePlayer({game,initialGuest=false}:{game:SavedGame;initialGuest?:boolean}){
 const frame=useRef<HTMLIFrameElement>(null),port=useRef<MessagePort|null>(null),pending=useRef<GameSnapshot|null>(null),revision=useRef(0),scope=useRef('guest'),accountRef=useRef<GameAccount|null>(null),blocked=useRef(false),lastSaved=useRef(''),localQueue=useRef(Promise.resolve()),timer=useRef<ReturnType<typeof setTimeout>|null>(null);
 const [boot,setBoot]=useState(false),[error,setError]=useState(''),[menu,setMenu]=useState(false),[profile,setProfile]=useState(false),[running,setRunning]=useState(false),[status,setStatus]=useState('Restoring progress…'),[account,setAccount]=useState<GameAccount|null>(null),[reload,setReload]=useState(0),[quality,setQuality]=useState('low'),[controls,setControls]=useState(true);
 const [conflict,setConflict]=useState<{html:string;cloud:GameSnapshot;local:GameSnapshot}|null>(null);
 const flight=useRef<Promise<void>|null>(null),flushDone=useRef<(()=>void)|null>(null);
 const launch=useRef<((html:string,save:GameSnapshot)=>void)|null>(null),started=useRef(false);
 const key=()=>scope.current+':'+game.slug;
 const store=(save:GameSnapshot,dirty:boolean)=>{
  const row:ProgressRow={key:key(),save,revision:revision.current,dirty,updated:Date.now()};
  localQueue.current=localQueue.current.catch(()=>{}).then(()=>writeProgress(row));return localQueue.current;
 };
 function persist(keepalive=false):Promise<void>{
  if(flight.current)return flight.current;
  if(!pending.current||!accountRef.current||blocked.current)return Promise.resolve();
  const task=(async()=>{
   while(pending.current&&accountRef.current&&!blocked.current){
    const save:GameSnapshot=pending.current,serialized=JSON.stringify(save);pending.current=null;
    try{
     setStatus('Saving to Profile…');const result=await cloudProgress(game.slug,{scope:scope.current,revision:revision.current,save},keepalive);
     revision.current=result.revision;lastSaved.current=serialized;
     await store(pending.current||save,!!pending.current).catch(()=>{});setStatus('Saved to Profile');
    }catch(e){const failure=e as Error&{status?:number};pending.current=pending.current||save;if([401,409].includes(failure.status||0))blocked.current=true;setStatus(failure.message);break;}
   }
  })();
  flight.current=task.finally(()=>{flight.current=null;if(pending.current&&!blocked.current&&accountRef.current)timer.current=setTimeout(()=>void persist(),10000);});
  return flight.current;
 }
 async function flush(){
  if(started.current&&port.current)await new Promise<void>(resolve=>{const timeout=setTimeout(resolve,2000);flushDone.current=()=>{clearTimeout(timeout);resolve();};port.current!.postMessage({type:'flush'});});
  await localQueue.current.catch(()=>{});await persist();
 }
 function receive(save:GameSnapshot){
  if(!save||save.version!==1||!Array.isArray(save.local)||!Array.isArray(save.databases)||JSON.stringify(save).length>1048576)return;
  if(JSON.stringify(save)===lastSaved.current&&!pending.current)return;
  pending.current=save;
  void store(save,!!accountRef.current).then(()=>{if(!accountRef.current)setStatus('Saved on this device');}).catch(()=>setStatus('Device storage is unavailable. Keep this game open until Profile saves it.'));
  if(timer.current)clearTimeout(timer.current);timer.current=setTimeout(()=>void persist(),2000);
 }
 useEffect(()=>{
  let cancelled=false,connected=false,sent=false;
  let payload:{html:string;save:GameSnapshot}|null=null;
  let startTimeout:ReturnType<typeof setTimeout>|undefined;
  started.current=false;setBoot(false);setError('');setRunning(false);setConflict(null);blocked.current=false;pending.current=null;
  const controller=new AbortController();const loadTimeout=setTimeout(()=>{controller.abort();if(!cancelled)setError('The game is taking too long to load. Reopen it to try again.');},30000);
  const sendStart=()=>{
   if(!connected||!payload||sent||controller.signal.aborted)return;
   sent=true;
   port.current?.postMessage({type:'start',...payload,slug:game.slug,origins:game.origins,startup:game.startup});
  };
  launch.current=(html,save)=>{
   payload={html,save};setBoot(true);
   startTimeout=setTimeout(()=>setError('The game did not finish loading. Try again.'),game.startup?45000:30000);
   sendStart();
  };
  const ready=()=>{clearTimeout(startTimeout);setError('');setRunning(true);};
  const connect=(event:MessageEvent)=>{
   const target=frame.current?.contentWindow;
   if(event.source!==target||event.origin!=='null'||event.data?.channel!=='kkeep-game-ready'||port.current)return;
   const channel=new MessageChannel();port.current=channel.port1;
   channel.port1.onmessage=event=>{
    const message=event.data;
    if(message?.type==='connected'){connected=true;sendStart();}
    if(message?.type==='started'){started.current=true;if(!game.startup)ready();channel.port1.postMessage({type:'setting',setting:'quality',value:'low'});channel.port1.postMessage({type:'setting',setting:'controls',value:true});}
    if(message?.type==='engine-ready'&&game.startup)ready();
    if(message?.type==='save')receive(message.save);
    if(message?.type==='flushed'){flushDone.current?.();flushDone.current=null;}
    if(message?.type==='error'){setStatus(message.message);if(message.fatal){clearTimeout(startTimeout);setError(message.message);}}
   };
   channel.port1.start();target!.postMessage({channel:'kkeep-game-init'},'*',[channel.port2]);
  };
  window.addEventListener('message',connect);
  const guestKey='guest:'+game.slug;
  const guestProgress=readProgress(guestKey);
  const restoredCloud=initialGuest&&reload===0?Promise.resolve({account:null,save:null,revision:0}):cloudProgress(game.slug);
  (async()=>{
   const entry=fetch(game.entry.startsWith('/')?game.entry:'/api/game-entry/'+game.slug,{signal:controller.signal}).then(async r=>{if(game.entry.startsWith('/')){if(!r.ok)throw Error('The game files could not load.');return {html:await r.text(),base:r.url};}const result=await r.json();if(!r.ok)throw Error(result.error);return result as {html:string;base:string};});
   const [source,cloud]=await Promise.all([entry,restoredCloud]);
   if(cancelled||controller.signal.aborted)return;
   accountRef.current=cloud.account;setAccount(cloud.account);scope.current=cloud.account?.id||'guest';revision.current=cloud.revision;
   let local=cloud.account?await readProgress(key()):await guestProgress;
   if(!local&&!cloud.save){
    const device=await guestProgress||await migrateLegacyProgress(game.slug);
    if(!cloud.account)local=device;
    else if(device&&!device.claimed)local=await claimGuestProgress(game.slug,cloud.account.id);
   }
   if(cancelled||controller.signal.aborted)return;
   const html=prepareGameHtml(source.html,source.base,game);clearTimeout(loadTimeout);
   if(local?.dirty&&cloud.save&&local.revision!==cloud.revision){setConflict({html,cloud:cloud.save,local:local.save});setStatus('Choose which progress to continue.');return;}
   const save=local?.dirty&&local.revision===cloud.revision?local.save:cloud.save||local?.save||emptyGameSave();
   lastSaved.current=JSON.stringify(cloud.save||save);setStatus(cloud.account?'Profile connected':'Progress saves on this device');launch.current?.(html,save);
   if(cloud.account&&(local?.dirty||!cloud.save&&(save.local.length||save.databases.length))){pending.current=save;void persist();}
  })().catch(e=>{clearTimeout(loadTimeout);if(!cancelled&&!controller.signal.aborted)setError(e.message||'Could not load this game.');});
  return()=>{
   cancelled=true;clearTimeout(loadTimeout);clearTimeout(startTimeout);controller.abort();launch.current=null;
   window.removeEventListener('message',connect);if(timer.current)clearTimeout(timer.current);
   if(started.current)port.current?.postMessage({type:'flush'});
   void persist(true);port.current?.close();port.current=null;
  };
 },[game.slug,reload,initialGuest]);
 useEffect(()=>{
  const apply=(event:MessageEvent)=>{
   if(event.source!==frame.current?.contentWindow||event.origin!=='null'||event.data?.channel!=='kkeep-arcade-player'||event.data.type!=='ready')return;
   port.current?.postMessage({type:'setting',setting:'quality',value:quality});
   port.current?.postMessage({type:'setting',setting:'controls',value:controls});
  };
  window.addEventListener('message',apply);
  return()=>window.removeEventListener('message',apply);
 },[quality,controls]);
 useEffect(()=>{
  const flush=()=>{port.current?.postMessage({type:'flush'});void persist(true);};
  const check=async()=>{
   try{const cloud=await cloudProgress(game.slug);if((cloud.account?.id||'guest')!==scope.current){blocked.current=true;setStatus('Profile changed. Reopen the game to continue with that profile.');}}catch{}
  };
  window.addEventListener('pagehide',flush);const visibility=()=>{if(document.hidden)flush();else void check();};document.addEventListener('visibilitychange',visibility);window.addEventListener('kkeep-profile-change',check);
  return()=>{window.removeEventListener('pagehide',flush);document.removeEventListener('visibilitychange',visibility);window.removeEventListener('kkeep-profile-change',check);};
 },[game.slug]);
 async function back(){await flush();location.assign('/?games=1');}
 async function fullScreen(){try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen?.();}catch{}}
 function choose(useLocal:boolean){if(!conflict)return;const save=useLocal?conflict.local:conflict.cloud;lastSaved.current=JSON.stringify(conflict.cloud);launch.current?.(conflict.html,save);setConflict(null);if(useLocal){pending.current=save;void persist();}else void store(save,false);}
 return <main className="saved-game-page" aria-label={game.name}>
  {game.entry.startsWith('/')&&<link rel="preload" as="fetch" href={game.entry} crossOrigin="anonymous"/>}
  <iframe key={reload} ref={frame} src="/games/save-frame.html" title={game.name} allow="autoplay; fullscreen; gamepad *" allowFullScreen sandbox="allow-scripts allow-forms allow-pointer-lock allow-orientation-lock allow-modals" referrerPolicy="no-referrer" tabIndex={running&&!error?0:-1} aria-hidden={!running||!!error}/>
  {(!boot||!running||error)&&<div className="saved-game-loading" role="status">
    {game.loadingCover&&<img src={game.loadingCover} alt="" style={{width:300,maxWidth:'70vw',height:'auto',borderRadius:16}}/>}
    <h1>{game.name}</h1>
    {error?<><p role="alert">{error}</p><button onClick={()=>{void flush().finally(()=>setReload(n=>n+1));}}>Retry</button></>
      :conflict?<><p>Profile and this device have different progress.</p><button onClick={()=>choose(false)}>Use Profile progress</button><button onClick={()=>choose(true)}>Keep this device’s progress</button></>
      :game.startup||game.slug==='hunter-assassin'?<><p>{boot?'Loading game…':'Restoring saved progress…'}</p><progress className="game-startup-progress" aria-label={'Loading '+game.name}/></>
      :!game.loadingCover?<><LoaderCircle className="spin"/><p>Restoring progress…</p></>:null}
    {(!game.loadingCover||error||conflict)&&<a className="game-back-link" href="/games">Back to Games</a>}
  </div>}
  {!game.gameOnly&&<nav className="saved-game-menu" aria-label="Kkeep game menu"><button className="saved-game-toggle" onClick={()=>{setMenu(!menu);port.current?.postMessage({type:'setting',setting:'menu',value:!menu});}} aria-label={menu?'Close game menu':'Open game menu'} aria-expanded={menu}>{menu?<X size={19}/>:'K'}</button>
   {menu&&<div className="saved-game-tools"><strong>{game.name}</strong><p role="status">{account?<CloudCheck size={16}/>:<CloudOff size={16}/>}<span>{status}</span></p>{account&&<small>{account.name}</small>}<button onClick={back}><ArrowLeft size={16}/>Games</button><button onClick={()=>setProfile(true)}><UserRound size={16}/>Profile</button><button onClick={()=>{void flush().finally(()=>setReload(n=>n+1));}}><RotateCw size={16}/>Reopen game</button><button onClick={fullScreen}><Maximize2 size={16}/>Full screen</button>
    {game.quality&&<label>Quality<select value={quality} onChange={e=>{setQuality(e.target.value);port.current?.postMessage({type:'setting',setting:'quality',value:e.target.value});}}><option value="low">Low · iPad</option><option value="balanced">Balanced</option><option value="high">High</option></select></label>}
    {game.controls&&<button aria-pressed={controls} onClick={()=>{setControls(!controls);port.current?.postMessage({type:'setting',setting:'controls',value:!controls});}}>Touch controls</button>}
    {!account&&<small>Log in to Profile, then reopen the game to sync progress across devices.</small>}
   </div>}
  </nav>}
  <GameProfile open={profile} onOpenChange={setProfile}/>
 </main>;
}
