'use client';
import {useCallback,useEffect,useRef,useState,type FormEvent} from 'react';
import {Image,UserRound,Maximize2,Minimize2,ArrowLeft,ArrowRight,CircleAlert,Globe2,LoaderCircle,Plus,RotateCw,ShieldCheck,X,Home,Gamepad2} from 'lucide-react';
import {focusTikTok} from '@/lib/tiktok-view';
import {applyTheme,isThemeId,isWallpaper,defaultTheme,type ThemeId,type Wallpaper} from '@/lib/themes';
import {photoWallpapers} from '@/lib/wallpapers';
import {apps,gamingDestination,type App} from '@/lib/apps';
import {cloudProviderForUrl,cloudProviders,supportsTouchControls,type CloudProvider} from '@/lib/touch/providers';
import {loadTouchControls,type TouchController} from '@/lib/touch/client';
import {mountProxy,normalizeAddress,setLiteMode,setAdBlocking,type ProxyHandle} from '@/lib/proxy-client';
import KkeepHome from '@/components/kkeep-home';
import WallpaperGallery from '@/components/wallpaper-gallery';
import ProfilePanel from '@/components/profile-panel';
import FeedbackMenu from '@/components/feedback-menu';
import type {ProfileSnapshot} from '@/lib/profile-model';
import LivingBoundary from '@/components/living-space/boundary';
import LivingWallpaper from '@/components/living-space/wallpaper';
import {useLivingSpace} from '@/components/living-space/use-living-space';
import {contrastAccent,type Preferences,type LegacyAppearance} from '@/lib/living-space/model';

import PhotoBackground from '@/components/photo-wallpaper';
import Particles from '@/components/particles';
import {analyticsSurfaceForUrl,setAnalyticsSurface} from '@/lib/analytics-client';
import {Tabs,TabsContent,TabsList,TabsTrigger} from '@/components/ui/tabs';
import {Button} from '@/components/ui/button';
import {Toaster} from '@/components/ui/sonner';
import {toast} from 'sonner';

type BrowserTab={id:string;title:string;url:string;loading:boolean;error:string;warning?:string;restart?:number;icon?:App;cloud?:CloudProvider};
const firstTab:BrowserTab={id:'home',title:'Home',url:'',loading:false,error:''};

function ProxyView({tab,onState,onOpen,onHandle,videoMode,active,touchControls,onControlsClose,onControlsBack}:{videoMode:boolean;active:boolean;touchControls:boolean;onControlsClose:()=>void;onControlsBack:()=>void;tab:BrowserTab;onState:(id:string,patch:Partial<BrowserTab>)=>void;onOpen:(url:string)=>void;onHandle:(id:string,h:ProxyHandle|null)=>void}) {
  const [retryKey,setRetryKey]=useState(0);
  const container=useRef<HTMLDivElement>(null);
  const handle=useRef<ProxyHandle|null>(null);
  const initial=useRef(tab.url);
  const recoveryAt=useRef(0);
  const touchCallbacks=useRef({onOpen,onControlsClose,onControlsBack});touchCallbacks.current={onOpen,onControlsClose,onControlsBack};
  useEffect(()=>{
    if(!touchControls||!supportsTouchControls(tab.cloud)||!container.current)return;
    let cancelled=false,controller:TouchController|undefined;
    const observer=new MutationObserver(()=>attach());
    const attach=()=>{
      const frame=container.current?.querySelector('iframe');if(!frame||controller||cancelled)return;
      loadTouchControls().then(factory=>{
        if(cancelled||controller)return;
        controller=factory.mount({frame,name:cloudProviders.find(item=>item.id===tab.cloud)?.name,
          onClose:()=>{if(!cancelled)touchCallbacks.current.onControlsClose();},
          onBack:()=>touchCallbacks.current.onControlsBack(),onOpenPlayer:url=>touchCallbacks.current.onOpen(url)});
        observer.disconnect();
      }).catch(error=>{if(!cancelled){toast(error.message);touchCallbacks.current.onControlsClose();}});
    };
    observer.observe(container.current,{childList:true});attach();
    return()=>{cancelled=true;observer.disconnect();controller?.destroy();};
  },[touchControls,tab.cloud,retryKey]);
  useEffect(()=>{
    if(!videoMode)return;
    let doc:Document|null=null;
    let viewer:ReturnType<typeof focusTikTok>|undefined;
    const connect=()=>{try{
      const next=container.current?.querySelector('iframe')?.contentDocument;
      if(next&&next!==doc&&next.head){viewer?.destroy();doc=next;viewer=focusTikTok(next,message=>toast(message));}
    }catch{}};
    connect();const timer=setInterval(connect,500);
    const step=(e:Event)=>viewer?.step((e as CustomEvent<number>).detail);
    window.addEventListener('kkeep-video-step',step);
    return()=>{clearInterval(timer);viewer?.destroy();window.removeEventListener('kkeep-video-step',step);};
  },[videoMode,retryKey]);
  useEffect(()=>{
    if(!container.current)return;
    let cancelled=false;
    let timeout:ReturnType<typeof setTimeout>|undefined;
    onState(tab.id,{loading:true,error:''});
    mountProxy(container.current,{
      onNavigate:(url)=>{initial.current=url;onState(tab.id,{url,loading:true,error:'',warning:''});},
      onRecover:()=>{if(cancelled)return;if(Date.now()-recoveryAt.current<15000){onState(tab.id,{loading:false,error:'This browser could not keep the session connected. Retry this tab.'});return;}recoveryAt.current=Date.now();setRetryKey(n=>n+1);},
      onWarning:(warning)=>onState(tab.id,{warning}),
      onTitle:(title)=>onState(tab.id,{title:title.slice(0,70)}),
      onLoaded:()=>{if(timeout)clearTimeout(timeout);onState(tab.id,{loading:false,error:''});},
      onError:(message)=>{if(timeout)clearTimeout(timeout);onState(tab.id,{loading:false,error:message});},
      onOpen,
    },{nativePopups:/(^|\.)snapchat\.com$/.test(new URL(initial.current).hostname),mediaPermissions:/(^|\.)snapchat\.com$/.test(new URL(initial.current).hostname)}).then(h=>{
      if(cancelled){h.destroy();return;}
      handle.current=h;onHandle(tab.id,h);h.go(initial.current);
      timeout=setTimeout(()=>onState(tab.id,{loading:false,error:'This page is taking longer than expected. You can keep waiting or retry through Kkeep.'}),45000);
    }).catch(e=>{if(!cancelled)onState(tab.id,{loading:false,error:e instanceof Error?e.message:'The proxy could not start. Please retry.'});});
    return ()=>{cancelled=true;if(timeout)clearTimeout(timeout);handle.current?.destroy();handle.current=null;onHandle(tab.id,null);};
  // A mounted tab keeps its own browsing history and session.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[tab.id,retryKey]);
  return <div className="proxy-view"><div className="frame-mount" ref={container} data-kkeep-cloud-controller={active&&supportsTouchControls(tab.cloud)?tab.icon?.name||tab.cloud:undefined}/>{tab.warning&&<div className="upstream-warning" role="status"><CircleAlert size={18}/><span>{tab.warning}</span><button className="warning-restart" onClick={()=>{initial.current=tab.url;onState(tab.id,{error:'',warning:'',loading:true});setRetryKey(n=>n+1);}}>Restart tab</button><button aria-label="Dismiss notice" onClick={()=>onState(tab.id,{warning:''})}><X size={18}/></button></div>}{tab.loading&&<div className="page-loading" role="status"><LoaderCircle size={17} className="spin"/>Connecting through your proxy…</div>}{tab.error&&<div className="proxy-error" role="alert"><CircleAlert size={25}/><div><strong>Having trouble with this page</strong><p>{tab.error}</p><div className="error-actions"><Button onClick={()=>{onState(tab.id,{error:'',loading:true});if(handle.current)handle.current.reload();else setRetryKey(n=>n+1);}}><RotateCw size={15}/>Retry</Button><Button variant="ghost" onClick={()=>onState(tab.id,{error:'',loading:false})}>Keep waiting</Button></div><small>Some sites restrict proxies, sign-in, calls, or protected video.</small></div></div>}</div>;
}


export default function ProxyBrowser({startApp}:{startApp?:'TikTok'|'YouTube'|'Snapchat'|'Roblox'|'Clash Royale'}={}){
  const [studio,setStudio]=useState(false),[profileOpen,setProfileOpen]=useState(false);
  const tilt=false;
  const [homeFocused,setHomeFocused]=useState(false),[homeBusy,setHomeBusy]=useState(false);
  const [theme,setTheme]=useState<ThemeId>(defaultTheme);
  const [wallpaper,setWallpaper]=useState<Wallpaper>('stars');
  const [matchWallpaper,setMatchWallpaper]=useState(true),[appearanceReady,setAppearanceReady]=useState(false);
  const [moving,setMoving]=useState(true),[dense,setDense]=useState(false);
  const [,setLite]=useState(false);
  const [touchTab,setTouchTab]=useState<string|null>(null);
  const [expanded,setExpanded]=useState(false),[videoTab,setVideoTab]=useState<string|null>(null);
  const [tabs,setTabs]=useState<BrowserTab[]>([firstTab]),[active,setActive]=useState('home'),[address,setAddress]=useState('');
  const handles=useRef(new Map<string,ProxyHandle>()),sequence=useRef(0),addressInput=useRef<HTMLInputElement>(null);
  const legacy={theme,wallpaper,match:matchWallpaper,moving,dense};
  const living=useLivingSpace(appearanceReady,legacy),preferences=living.preferences;
  const current=tabs.find(tab=>tab.id===active)??tabs[0];
  const photoWallpaper=photoWallpapers.find(item=>item.id===wallpaper);
  const currentRef=useRef(current);currentRef.current=current;
  const tabsRef=useRef(tabs);tabsRef.current=tabs;
  function savePreference(key:string,value:string){try{localStorage.setItem(key,value);return true;}catch{toast('Applied for this visit. This browser could not save the preference.');return false;}}
  useEffect(()=>{
    try{
      const saved=localStorage.getItem('kkeep-theme-v1');
      const selected=isThemeId(saved)?saved:defaultTheme;setTheme(selected);
      const background=localStorage.getItem('kkeep-wallpaper');if(isWallpaper(background))setWallpaper(background);
      setMatchWallpaper(localStorage.getItem('kkeep-wallpaper-colors')!=='false');
      setMoving(localStorage.getItem('kkeep-particles')!=='false');
      setDense(localStorage.getItem('kkeep-dense-stars')==='true');
      const ads=localStorage.getItem('kkeep-ads')!=='false';setAdBlocking(ads);
      const light=localStorage.getItem('kha-lite')==='true';setLite(light);setLiteMode(light);
      localStorage.removeItem('soud-recent');localStorage.removeItem('soud-look');localStorage.removeItem('kkeep-glass-update');
    }catch{}finally{setAppearanceReady(true);}
    // Retired app engines must not continue controlling old installed shortcuts.
    navigator.serviceWorker?.getRegistrations().then(registrations=>Promise.all(registrations.filter(registration=>['/app-proxy/','/compat/'].includes(new URL(registration.scope).pathname)).map(registration=>registration.unregister()))).catch(()=>{});
  },[]);
  useEffect(()=>{
    if(!appearanceReady)return;
    const selected=preferences.wallpaper==='original'?living.original.wallpaper:preferences.wallpaper;
    applyTheme(theme,isWallpaper(selected)?selected:wallpaper,matchWallpaper);
    if(preferences.accent){const light=document.documentElement.style.colorScheme==='light';document.documentElement.style.setProperty('--kk-accent',contrastAccent(preferences.accent,light));document.documentElement.style.setProperty('--kk-ink',light?'#ffffff':'#13202c');}
  },[appearanceReady,theme,wallpaper,matchWallpaper,preferences.wallpaper,preferences.accent,living.original.wallpaper]);
  function applyLegacy(value:LegacyAppearance){
    if(isThemeId(value.theme))setTheme(value.theme);if(isWallpaper(value.wallpaper))setWallpaper(value.wallpaper);
    setMatchWallpaper(value.match);setMoving(value.moving);setDense(value.dense);
    let saved=true;
    for(const [key,stored] of Object.entries({'kkeep-theme-v1':value.theme,'kkeep-wallpaper':value.wallpaper,'kkeep-wallpaper-colors':String(value.match),'kkeep-particles':String(value.moving),'kkeep-dense-stars':String(value.dense)}))saved=savePreference(key,stored)&&saved;
    return saved;
  }
  function applyWallpaper(value:Preferences,look:LegacyAppearance){const saved=living.commit(value);return applyLegacy({...look,wallpaper:isWallpaper(value.wallpaper)?value.wallpaper:value.wallpaper==='original'?living.original.wallpaper:look.wallpaper})&&saved;}
  const rotateWallpaper=useCallback((wallpaper:string)=>living.commit({...preferences,wallpaper},false),[living.commit,preferences]);
  function restoreProfile(value:ProfileSnapshot){
    try{localStorage.setItem('kkeep-living-original-v1',JSON.stringify(value.original));}catch{}
    living.restoreOriginal(value.original);applyLegacy(value.legacy);living.commit(value.preferences);
  }

  const update=useCallback((id:string,patch:Partial<BrowserTab>)=>setTabs(previous=>previous.map(tab=>tab.id===id?{...tab,...patch}:tab)),[]);
  const onHandle=useCallback((id:string,handle:ProxyHandle|null)=>{if(handle)handles.current.set(id,handle);else handles.current.delete(id);},[]);
  const newTab=useCallback((value='',app?:App)=>{
    let url='';try{url=value?normalizeAddress(value):'';}catch(error){toast((error as Error).message);return;}
    const external=url?gamingDestination(url):null;if(external){window.location.assign(external);return;}
    if(tabsRef.current.length>=8){toast('Close a tab to make room for another.');return;}
    const id='tab-'+ ++sequence.current;
    setTabs(previous=>[...previous,{id,title:app?.name||(url?new URL(url).hostname.replace(/^www\./,''):'Home'),url,loading:!!url,error:'',icon:app,cloud:app?.cloud||cloudProviderForUrl(url)?.id}]);setActive(id);
  },[]);
  const open=useCallback((value:string,app?:App)=>{
    let url:string;try{url=normalizeAddress(value);}catch(error){toast((error as Error).message);return;}
    const external=gamingDestination(url);if(external){window.location.assign(external);return;}
    const tab=currentRef.current;
    if(tab.url){newTab(url,app);return;}
    update(tab.id,{url,title:app?.name||new URL(url).hostname.replace(/^www\./,''),icon:app,cloud:app?.cloud||cloudProviderForUrl(url)?.id,loading:true,error:''});
  },[newTab,update]);
  const openApp=useCallback((app:App,url=app.url)=>{setTouchTab(null);setLiteMode(false);setLite(false);open(url,app);setExpanded(true);},[open]);
  const search=useCallback((value:string)=>{let url:string;try{url=normalizeAddress(value);}catch(error){toast((error as Error).message);return;}const provider=cloudProviderForUrl(url);const app=apps.find(item=>item.cloud&&item.cloud===provider?.id);if(app)openApp(app,url);else open(url);},[open,openApp]);
  const launched=useRef(false);
  useEffect(()=>{
    if(launched.current)return;launched.current=true;
    const params=new URLSearchParams(window.location.search);
    const requestedCloud=params.get('cloud');
    const app=startApp?apps.find(item=>item.name===startApp):apps.find(item=>item.cloud&&item.cloud===requestedCloud);
    const url=app?.url||params.get('launch');
    if(app)openApp(app);else if(url){search(url);setExpanded(true);window.history.replaceState(null,'','/');}
  },[openApp,search,startApp]);
  useEffect(()=>{setAddress(current.url);},[current.url,active]);
  useEffect(()=>{setAnalyticsSurface(analyticsSurfaceForUrl(current.url));},[current.url]);
  useEffect(()=>{
    const runBookmark=(event:Event)=>{
      // Claim the bookmark on Kkeep even if no eligible game is open: do not
      // fall back to an unmanaged controller on Home or another game.
      event.preventDefault();
      const tab=currentRef.current;
      if(!supportsTouchControls(tab.cloud)){toast('Open GhostCloud in Kkeep first.');return;}
      if(tab.loading||tab.error){toast('Wait for your game page to load, then run the bookmark again.');return;}
      if(window.__kkeepTouch)window.__kkeepTouch.show();
      setExpanded(true);setTouchTab(tab.id);
    };
    window.addEventListener('kkeep-controls-bookmark',runBookmark);
    return()=>window.removeEventListener('kkeep-controls-bookmark',runBookmark);
  },[]);
  useEffect(()=>{
    const keydown=(event:KeyboardEvent)=>{
      if(event.key==='Escape'){setExpanded(false);setVideoTab(null);setTouchTab(null);}
      if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='l'){event.preventDefault();addressInput.current?.focus();addressInput.current?.select();}
    };
    window.addEventListener('keydown',keydown);return()=>window.removeEventListener('keydown',keydown);
  },[]);
  const isTikTok=/^https:\/\/(?:[a-z0-9-]+\.)*tiktok\.com(?:\/|$)/i.test(current.url);
  const videoMode=expanded&&videoTab===active&&isTikTok;
  function fullScreen(){setExpanded(true);document.documentElement.requestFullscreen?.().catch(()=>{});}
  function exitFull(){setExpanded(false);setVideoTab(null);setTouchTab(null);if(document.fullscreenElement)document.exitFullscreen?.().catch(()=>{});}
  function reloadTab(){
    const handle=handles.current.get(active);
    if(handle&&!current.error){update(active,{loading:true,error:'',warning:''});handle.reload();return;}
    setTabs(previous=>previous.map(tab=>tab.id===active?{...tab,loading:true,error:'',warning:'',restart:(tab.restart??0)+1}:tab));
  }
  function navigate(event:FormEvent){
    event.preventDefault();let url:string;try{url=normalizeAddress(address);}catch(error){toast((error as Error).message);return;}
    const external=gamingDestination(url);if(external){window.location.assign(external);return;}
    const provider=cloudProviderForUrl(url),app=apps.find(item=>item.cloud&&item.cloud===provider?.id);
    if(app){openApp(app,url);return;}
    const handle=handles.current.get(active);
    if(handle){update(active,{url,loading:true,error:''});handle.go(url);}
    else open(url);
  }
  function close(id:string){
    const index=tabs.findIndex(tab=>tab.id===id),remaining=tabs.filter(tab=>tab.id!==id);
    if(!remaining.length){const next={...firstTab,id:'tab-'+ ++sequence.current};setTabs([next]);setActive(next.id);setExpanded(false);}
    else{setTabs(remaining);if(active===id)setActive(remaining[Math.max(0,index-1)].id);}
  }
  function home(){exitFull();const tab=tabs.find(item=>!item.url);if(tab)setActive(tab.id);else newTab();}

  return <main className={['workspace',!current.url?'home-mode':'',!current.url&&photoWallpaper?'photo-mode':'',expanded&&current.url?'full-view':''].join(' ')}>
    {!current.url&&(living.loaded?<LivingBoundary resetKey={preferences.wallpaper} fallback={<div className="living-boot-wallpaper" aria-hidden="true"/>}><LivingWallpaper preferences={preferences} original={living.original.wallpaper} paused={studio||profileOpen||homeFocused||homeBusy} tilt={tilt} onRotate={rotateWallpaper}/></LivingBoundary>:<>{photoWallpaper&&<PhotoBackground wallpaper={photoWallpaper}/>} {wallpaper!=='none'&&<Particles moving={moving&&!studio} mode={wallpaper==='constellation'?'constellation':'stars'} dense={dense}/>}</>)}
    <header className="workspace-header">
      {current.url&&<button className="workspace-title" onClick={home} aria-label="Kkeep home">kkeep</button>}
      <nav className="workspace-actions" aria-label="Kkeep tools">
        <Button variant="ghost" onClick={()=>setStudio(true)}><Image size={20}/>Wallpaper</Button><Button variant="ghost" onClick={()=>setProfileOpen(true)}><UserRound size={20}/>Profile</Button><FeedbackMenu/>
      </nav>
    </header>
    <Tabs value={active} onValueChange={setActive} className="browser">
      {current.url&&<>
        <div className="tab-strip"><TabsList className="browser-tabs" aria-label="Open browser tabs">{tabs.map(tab=><div className={'browser-tab '+(active===tab.id?'selected':'')} key={tab.id}><TabsTrigger value={tab.id}>{tab.loading?<LoaderCircle className="spin"/>:tab.icon?<img src={tab.icon.icon} width={18} height={18} alt=""/>:tab.url?<Globe2/>:<Home/>}<span>{tab.title}</span></TabsTrigger><button className="close-tab" aria-label={'Close '+tab.title} onClick={()=>close(tab.id)}><X size={14}/></button></div>)}</TabsList><button className="icon-button" aria-label="Open home tab" onClick={()=>newTab()}><Plus size={20}/></button><span className="tab-count">{tabs.length}/8</span></div>
        <div className="toolbar">
          <div className="navigation-buttons"><button className="icon-button" aria-label="Go back" onClick={()=>handles.current.get(active)?.back()}><ArrowLeft size={19}/></button><button className="icon-button" aria-label="Go forward" onClick={()=>handles.current.get(active)?.forward()}><ArrowRight size={19}/></button><button className="icon-button" aria-label="Reload page" onClick={reloadTab}><RotateCw size={18} className={current.loading?'spin':''}/></button></div>
          <form className="address-bar" onSubmit={navigate}><ShieldCheck size={18}/><input ref={addressInput} aria-label="Website address or search" value={address} onChange={event=>setAddress(event.target.value)} autoComplete="off" autoCapitalize="none" spellCheck={false}/><button type="submit">Go</button></form>
          {supportsTouchControls(current.cloud)&&<Button variant="secondary" disabled={current.loading||!!current.error} onClick={()=>{setExpanded(true);setTouchTab(active);}}><Gamepad2 size={18}/>Controls</Button>}
          <button className="icon-button" aria-label="Full screen" onClick={fullScreen}><Maximize2 size={19}/></button>
        </div>
      </>}
      {tabs.map(tab=><TabsContent forceMount key={tab.id} value={tab.id} className={'browser-content '+(active===tab.id?'visible':'concealed')}>
        {tab.url?<ProxyView key={tab.id+'-'+(tab.restart??0)} tab={tab} active={tab.id===active} touchControls={expanded&&active===tab.id&&touchTab===tab.id} onControlsClose={()=>setTouchTab(null)} onControlsBack={exitFull} videoMode={videoMode&&tab.id===active} onState={update} onHandle={onHandle} onOpen={url=>{setTouchTab(null);newTab(url,tab.cloud?tab.icon:undefined);}}/>:<KkeepHome onFocusChange={setHomeFocused} onBusyChange={setHomeBusy} onSearch={search} onApp={openApp}/>}
      </TabsContent>)}
    </Tabs>
    {expanded&&current.url&&touchTab!==active&&<div className={'full-controls '+(videoMode?'video-controls':'')}>
      {supportsTouchControls(current.cloud)&&<Button disabled={current.loading||!!current.error} onClick={()=>setTouchTab(active)}><Gamepad2 size={18}/>Controls</Button>}
      {isTikTok&&<Button variant="secondary" onClick={()=>{setLiteMode(false);setLite(false);reloadTab();}}>Retry video</Button>}
      {isTikTok&&(videoMode?<><Button variant="secondary" onClick={()=>window.dispatchEvent(new CustomEvent('kkeep-video-step',{detail:-1}))}>Previous</Button><Button variant="secondary" onClick={()=>window.dispatchEvent(new CustomEvent('kkeep-video-step',{detail:1}))}>Next</Button><Button variant="secondary" onClick={()=>setVideoTab(null)}>Exit video</Button></>:<Button onClick={()=>{setLiteMode(false);setLite(false);setVideoTab(active);fullScreen();}}><Maximize2 size={17}/>Video view</Button>)}
      <Button variant="secondary" onClick={exitFull}><Minimize2 size={17}/>Back to tabs</Button>
    </div>}
    <WallpaperGallery open={studio} onOpenChange={setStudio} value={preferences.wallpaper==='original'?living.original.wallpaper:preferences.wallpaper} onSelect={id=>applyWallpaper({...preferences,wallpaper:id,rotation:0,accent:''},{...legacy,match:true})}/>
    <ProfilePanel open={profileOpen} onOpenChange={setProfileOpen} data={{version:1,preferences,legacy,original:living.original}} ready={living.loaded} onRestore={restoreProfile}/>
    <Toaster position="bottom-center"/>
  </main>;
}
