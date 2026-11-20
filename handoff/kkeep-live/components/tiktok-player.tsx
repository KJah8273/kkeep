'use client';
import {useEffect,useRef,useState,type ReactNode} from 'react';
import {mountProxy,prepareProxy,setLiteMode,type ProxyHandle} from '@/lib/proxy-client';
import {attachTikTokDesktop,desktopViewport,isTikTokUrl,TIKTOK_LOGIN_LIMIT} from '@/lib/tiktok-desktop';
import {attachTikTokApp,TIKTOK_APP_EMPTY,type TikTokAppAction,type TikTokAppState} from '@/lib/tiktok-app';
import {createTikTokStartupRecovery,isTikTokLanding,isTikTokUnavailable,TIKTOK_HOME,TIKTOK_UNAVAILABLE} from '@/lib/tiktok-recovery';
import {setAnalyticsSurface} from '@/lib/analytics-client';

type IconName='home'|'friends'|'create'|'inbox'|'profile'|'search'|'more'|'back'|'live';
function Icon({name}:{name:IconName}){
 const paths:Record<IconName,ReactNode>={
  home:<><path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z"/></>,
  friends:<><circle cx="9" cy="8" r="3.4"/><path d="M2.5 21v-2a6.5 6.5 0 0 1 13 0v2M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14a5 5 0 0 1 3.5 4.8V21"/></>,
  create:<path d="M12 5v14M5 12h14"/>,
  inbox:<path d="M5 3h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-8l-6 3v-3a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2ZM8 9h8M8 13h5"/>,
  profile:<><circle cx="12" cy="7" r="4"/><path d="M4 22v-3a8 8 0 0 1 16 0v3Z"/></>,
  search:<><circle cx="10.5" cy="10.5" r="7.5"/><path d="m16 16 6 6"/></>,
  more:<><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></>,
  back:<path d="m15 4-8 8 8 8"/>,
  live:<><rect x="3" y="6" width="18" height="15" rx="3"/><path d="m8 2 4 4 4-4M7 11v6h3M13 11v6M17 11v6"/></>,
 };
 return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

/** App presentation around TikTok's existing feed, controls and browser session. */
export default function TikTokPlayer(){
 const mount=useRef<HTMLDivElement>(null),handle=useRef<ProxyHandle|null>(null);
 const desktop=useRef<ReturnType<typeof attachTikTokDesktop>|null>(null);
 const app=useRef<ReturnType<typeof attachTikTokApp>|null>(null),appActive=useRef(false),preferApp=useRef(true);
 const currentUrl=useRef(TIKTOK_HOME);
 const feedRecovery=useRef(createTikTokStartupRecovery()),recoveredSession=useRef(false);
 const [attempt,setAttempt]=useState(0),[loading,setLoading]=useState(true),[error,setError]=useState('');
 const [unavailable,setUnavailable]=useState(false);
 const [warning,setWarning]=useState(''),[limited,setLimited]=useState(false),[dialog,setDialog]=useState(false);
 const [dismissed,setDismissed]=useState(false),[menu,setMenu]=useState(false),[appView,setAppView]=useState(true);
 const [view,setView]=useState<TikTokAppState>(TIKTOK_APP_EMPTY);
 useEffect(()=>{
  const container=mount.current;if(!container)return;
  let cancelled=false;
  setLiteMode(false);prepareProxy();setAnalyticsSurface('tiktok');
  const fit=()=>{
   const frame=container.querySelector('iframe');if(!frame||!container.clientWidth||!container.clientHeight)return;
   const size=appActive.current?{width:container.clientWidth,height:container.clientHeight,scale:1}:desktopViewport(container.clientWidth,container.clientHeight);
   frame.style.width=size.width+'px';frame.style.height=size.height+'px';frame.style.transform=`scale(${size.scale})`;frame.style.transformOrigin='top left';
  };
  const resize=new ResizeObserver(fit);resize.observe(container);
  const viewport=window.visualViewport;
  const viewportChange=()=>{container.parentElement?.style.setProperty('--tiktok-height',(viewport?.height||window.innerHeight)+'px');fit();};
  viewport?.addEventListener('resize',viewportChange);viewportChange();
  void mountProxy(container,{
   onNavigate:url=>{
    if(cancelled)return;
    currentUrl.current=url;app.current?.updateUrl(url);setLoading(true);setError('');setWarning('');setLimited(false);setDismissed(false);setMenu(false);
    const recovery=feedRecovery.current.navigate(url);setUnavailable(recovery.unavailable);
    if(isTikTokUnavailable(url))setDialog(false);
    // SPA errors can arrive without a replacement document. Never retry a
    // newer sign-in, profile, search or private account navigation.
    if(recovery.retry)queueMicrotask(()=>{if(!cancelled&&currentUrl.current===url)handle.current?.go(recovery.retry!);});
    else if(recovery.unavailable)setLoading(false);
   },
   onLoaded:()=>{if(!cancelled){setLoading(false);setError('');fit();}},
   onTitle:()=>{},
   onWarning:message=>{if(!cancelled){setWarning(message);setDismissed(false);}},
   onError:message=>{if(!cancelled){setError(message);setLoading(false);}},
   onRecover:()=>{
    if(cancelled)return;
    if(!recoveredSession.current&&isTikTokLanding(currentUrl.current)){
     recoveredSession.current=true;setAttempt(value=>value+1);return;
    }
    setLoading(false);setError('The connection paused. Reconnect to continue with your saved session.');
   },
   onOpen:url=>{if(!cancelled)handle.current?.go(url);},
   onDocument:(doc,url)=>{
    if(cancelled)return;
    app.current?.destroy();app.current=null;appActive.current=false;setView(TIKTOK_APP_EMPTY);
    desktop.current?.destroy();desktop.current=null;
    if(isTikTokUnavailable(url))setDialog(false);
    else if(isTikTokUrl(url)){
     desktop.current=attachTikTokDesktop(doc,value=>{setLimited(value);setDismissed(false);},open=>{setDialog(open);if(open)setMenu(false);});
     app.current=attachTikTokApp(doc,url,state=>{if(cancelled)return;appActive.current=state.active;setView(state);fit();},preferApp.current);
    }else setDialog(true);
    fit();
   }
  },{nativePopups:true,engine:'scramjet-v2'}).then(session=>{
   if(cancelled){session.destroy();return;}
   handle.current=session;session.go(currentUrl.current);fit();
  }).catch(reason=>{if(!cancelled){setError(reason instanceof Error?reason.message:'Could not start TikTok.');setLoading(false);}});
  return()=>{cancelled=true;resize.disconnect();viewport?.removeEventListener('resize',viewportChange);app.current?.destroy();app.current=null;appActive.current=false;desktop.current?.destroy();desktop.current=null;handle.current?.destroy();handle.current=null;};
 },[attempt]);
 function reload(){setMenu(false);setError('');setWarning('');setLoading(true);if(handle.current)handle.current.reload();else setAttempt(value=>value+1);}
 function reconnect(){
  recoveredSession.current=false;
  const destination=feedRecovery.current.reconnectUrl();feedRecovery.current.reset();
  if(isTikTokUnavailable(currentUrl.current))currentUrl.current=destination;
  setUnavailable(false);setError('');setWarning('');setLoading(true);setAttempt(value=>value+1);
 }
 function activate(action:TikTokAppAction,label:string){
  setMenu(false);
  if(!app.current?.activate(action)){setWarning(`${label} is not available on this TikTok page.`);setDismissed(false);}
 }
 function toggleApp(){const next=!appView;preferApp.current=next;setAppView(next);app.current?.setEnabled(next);setMenu(false);}
 const notice=limited?TIKTOK_LOGIN_LIMIT:warning,pageError=error||(unavailable?TIKTOK_UNAVAILABLE:'');
 const appMode=view.active&&!dialog&&!pageError;
 const tabs:[TikTokAppAction,IconName,string][]=[['home','home','Home'],['friends','friends','Friends'],['create','create','Create'],['inbox','inbox','Inbox'],['profile','profile','Profile']];
 return <main className={`tiktok-player${appMode?' tiktok-app-mode':''}`} aria-label="Kkeep TikTok">
  <div className="tiktok-mount" ref={mount}/>
  {appMode?<>
   <header className="tiktok-app-header">
    <div className="tiktok-header-start"><a className="tiktok-icon-button" href="/" aria-label="Back to Kkeep"><Icon name="back"/></a>{view.available.live?<button className="tiktok-icon-button tiktok-live-button" onClick={()=>activate('live','LIVE')} aria-label="LIVE"><Icon name="live"/></button>:null}</div>
    <nav className="tiktok-feed-tabs" aria-label="Choose TikTok feed">
     <button aria-current={view.tab==='following'?'page':undefined} aria-disabled={!view.available.following} onClick={()=>activate('following','Following')}>Following</button>
     <button aria-current={view.tab==='for-you'?'page':undefined} aria-disabled={!view.available['for-you']} onClick={()=>activate('for-you','For You')}>For You</button>
    </nav>
    <div className="tiktok-header-end"><button className="tiktok-icon-button" aria-label="Search TikTok" aria-disabled={!view.available.search} onClick={()=>activate('search','Search')}><Icon name="search"/></button><button className="tiktok-icon-button" aria-label="Player options" aria-expanded={menu} onClick={()=>setMenu(value=>!value)}><Icon name="more"/></button></div>
   </header>
   <nav className="tiktok-app-navigation" aria-label="TikTok navigation">
    {tabs.map(([action,icon,label])=><button key={action} className={`tiktok-app-tab${action==='create'?' tiktok-create-tab':''}`} aria-label={action==='create'?'Create or upload a video':view.loginRequired[action]?`${label} — log in`:label} aria-current={action==='home'?'page':undefined} aria-disabled={!view.available[action]} title={view.loginRequired[action]?`Log in to use ${label}`:view.available[action]?label:`${label} is not available on this TikTok page`} onClick={()=>activate(action,label)}><span className="tiktok-tab-icon"><Icon name={icon}/></span>{action!=='create'?<span>{label}</span>:<span className="tiktok-sr-only">Create</span>}</button>)}
   </nav>
  </>:<div className="tiktok-native-toolbar"><a className="tiktok-home" href="/">‹ Kkeep</a>{!dialog?<button className="tiktok-options-button" aria-label="Player options" aria-expanded={menu} onClick={()=>setMenu(value=>!value)}><Icon name="more"/></button>:null}</div>}
  {menu&&!dialog?<div className="tiktok-options" role="group" aria-label="Player options"><button onClick={toggleApp}>{appView?'Website view':'App view'}</button><button onClick={()=>{desktop.current?.step(-1);setMenu(false);}}>Previous video</button><button onClick={()=>{desktop.current?.step(1);setMenu(false);}}>Next video</button><button onClick={reload}>Reload</button><button onClick={()=>setMenu(false)}>Close options</button></div>:null}
  {loading&&!dialog&&!pageError?<div className="tiktok-loading" role="status"><img src="/icons/tiktok.svg" width={40} height={40} alt=""/><strong>Opening TikTok</strong><span>Your feed is loading</span></div>:null}
  {notice&&!dismissed&&!pageError&&(!dialog||limited)?<div className="tiktok-notice" role="status"><span>{notice}</span><button aria-label="Dismiss notice" onClick={()=>setDismissed(true)}>×</button></div>:null}
  {pageError?<div className="tiktok-error" role="alert"><strong>{unavailable?'TikTok page unavailable':'TikTok could not connect'}</strong><p>{pageError}</p><button onClick={reconnect}>Reconnect</button><button onClick={()=>{setError('');setUnavailable(false);}}>Keep waiting</button></div>:null}
 </main>;
}
