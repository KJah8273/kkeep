'use client';
import {useEffect,useRef,useState} from 'react';
import {ArrowLeft,House,LoaderCircle,RotateCw} from 'lucide-react';
import {mountProxy,normalizeAddress,type ProxyHandle} from '@/lib/proxy-client';

export default function MovieSiteBrowser({name,url}:{name:string;url:string}){
  return <MovieSiteSession key={url} name={name} url={url}/>;
}

function MovieSiteSession({name,url}:{name:string;url:string}){
  const container=useRef<HTMLDivElement>(null),address=useRef(url);
  const activeSession=useRef<ProxyHandle|null>(null);
  const [attempt,setAttempt]=useState(0),[loading,setLoading]=useState(true),[error,setError]=useState(''),[connected,setConnected]=useState(false);
  useEffect(()=>{
    if(!container.current)return;
    setConnected(false);
    let cancelled=false,session:ProxyHandle|undefined,timer:ReturnType<typeof setTimeout>|undefined;
    const fail=(message:string)=>{if(cancelled)return;clearTimeout(timer);setLoading(false);setError(message);};
    const start=()=>{if(cancelled)return;clearTimeout(timer);setLoading(true);setError('');timer=setTimeout(()=>fail(`${name} is taking longer to load. Try again.`),45000);};
    const go=(url:string)=>{try{const next=normalizeAddress(url);address.current=next;start();session?.go(next);}catch{fail('This link could not open.');}};
    start();
    mountProxy(container.current,{
      onNavigate:url=>{if(cancelled)return;address.current=url;start();},
      onTitle:()=>{},
      onLoaded:()=>{if(cancelled)return;clearTimeout(timer);setLoading(false);setError('');},
      onError:fail,
      onRecover:()=>fail(`The connection to ${name} was interrupted. Try again.`),
      onOpen:url=>{if(!cancelled)go(url);},
    },{isolateFrameErrors:true,moviePlayback:true}).then(proxy=>{
      if(cancelled){proxy.destroy();return;}
      session=proxy;
      activeSession.current=proxy;
      setConnected(true);
      const frame=container.current?.querySelector('iframe');if(frame)frame.title=name;
      go(address.current);
    }).catch(()=>fail(`${name} could not connect. Try again.`));
    return()=>{cancelled=true;clearTimeout(timer);activeSession.current=null;session?.destroy();};
  },[attempt,name,url]);
  const retry=()=>setAttempt(value=>value+1);
  return <section className="movie-movy" aria-label={`${name} browser`}>
    <nav className="movie-browser-toolbar" aria-label={`${name} navigation`}>
      <button type="button" onClick={()=>activeSession.current?.back()} disabled={!connected} aria-label={`Back in ${name}`}><ArrowLeft size={17}/><span>Back</span></button>
      <button type="button" onClick={()=>{address.current=url;retry();}} aria-label={`${name} home`}><House size={17}/><span>Home</span></button>
      <button type="button" onClick={retry} aria-label={`Reload ${name}`}><RotateCw size={17}/><span>Reload</span></button>
    </nav>
    <div className="movie-movy-content">
      <div className="movie-movy-frame" ref={container}/>
      {loading&&<div className="movie-movy-loading" role="status"><LoaderCircle className="spin" size={19}/>Loading {name}…</div>}
      {error&&<div className="movie-movy-error" role="alert"><p>{error}</p><button type="button" onClick={retry}><RotateCw size={17}/>Retry</button></div>}
    </div>
  </section>;
}
