'use client';
import {useEffect,useRef,useState} from 'react';
import {LoaderCircle,RotateCw,ArrowLeft} from 'lucide-react';
import {movieRequest,MovieServiceError,movieServers,streamUrl,movieTitle,movieImage,type Movie,type MediaType,type MovieServerChoice,type StreamSource} from '@/lib/movies';
import MovieServerSelect from './movie-server-select';

export default function MoviePlayer({item,type,season,episode,resume=0,server,onServerChange,onBack,onProgress}:{item:Movie;type:MediaType;season:number;episode:number;resume?:number;server:MovieServerChoice;onServerChange:(server:MovieServerChoice)=>void;onBack:()=>void;onProgress:(time:number,duration:number)=>void}){
  const video=useRef<HTMLVideoElement>(null),position=useRef(resume),progress=useRef(onProgress);
  progress.current=onProgress;
  const [fallback,setFallback]=useState(0),[retry,setRetry]=useState(0);
  const [sources,setSources]=useState<StreamSource[]>([]),[quality,setQuality]=useState(0);
  const [status,setStatus]=useState('Finding a stream…'),[error,setError]=useState(''),[ready,setReady]=useState(false);
  const chosen=server==='auto'?movieServers[fallback]:movieServers.find(s=>s.id===server);
  const selected=sources[quality],url=chosen&&selected?streamUrl(selected):null;
  const next=useRef<()=>void>(()=>{});
  next.current=()=>{
    setReady(false);
    if(server==='auto'&&fallback<movieServers.length-1)setFallback(f=>f+1);
    else {setError('This movie could not start on the available server. Choose another server or try again later.');setStatus('');}
  };
  useEffect(()=>{
    if(!chosen)return;
    const controller=new AbortController();
    setSources([]);setQuality(0);setError('');setReady(false);setStatus('Connecting to '+chosen.label+'…');
    movieRequest<{sources:StreamSource[]}>(chosen.endpoint,{tmdbId:item.id,type,season,episode,...(chosen.server?{server:chosen.server}:{})},controller.signal).then(data=>{
      if(controller.signal.aborted)return;
      const items=data.sources.filter(source=>source&&streamUrl(source));
      // Prefer 1080p on tablets instead of forcing 4K bandwidth and decoding.
      items.sort((a,b)=>Math.abs((parseInt(a.quality||'1080')||1080)-1080)-Math.abs((parseInt(b.quality||'1080')||1080)-1080));
      if(!items.length)throw new Error('No playable sources');
      setSources(items);setStatus('Loading movie…');
    }).catch(error=>{
      if(controller.signal.aborted)return;
      if(error instanceof MovieServiceError&&error.code==='MOVIE_SERVICE_UNAVAILABLE'){
        setError('Library’s playback service is unavailable. Close this movie and choose Cinera or Movy.');setStatus('');
      }else next.current();
    });
    return()=>controller.abort();
  },[item.id,type,season,episode,chosen,retry]);

  useEffect(()=>{
    const el=video.current;if(!el||!url)return;
    let cancelled=false,hls:{destroy:()=>void}|null=null,failed=false;
    const fail=()=>{if(cancelled||failed)return;failed=true;next.current();};
    const timer=setTimeout(fail,35000);
    const loaded=()=>{if(cancelled)return;clearTimeout(timer);setReady(true);setStatus('');if(position.current>0&&position.current<el.duration-5)el.currentTime=position.current;void el.play().catch(()=>{});};
    let lastSaved=0;
    const save=()=>{position.current=el.currentTime;if(el.currentTime>1&&Number.isFinite(el.duration)&&el.duration>0&&(Math.abs(el.currentTime-lastSaved)>5||el.paused)){lastSaved=el.currentTime;progress.current(el.currentTime,el.duration);}};
    el.addEventListener('loadedmetadata',loaded);el.addEventListener('error',fail);el.addEventListener('timeupdate',save);el.addEventListener('pause',save);
    if(el.canPlayType('application/vnd.apple.mpegurl')||/\.(?:mp4|webm)(?:[?#]|$)/i.test(selected?.url||'')){
      el.src=url;el.load();
    }else{
      import('hls.js').then(({default:Hls})=>{
        if(cancelled)return;
        if(!Hls.isSupported()){fail();return;}
        const player=new Hls({enableWorker:false,maxBufferLength:30,maxMaxBufferLength:60,capLevelToPlayerSize:true});hls=player;
        player.on(Hls.Events.ERROR,(_event,data)=>{if(data.fatal)fail();});
        player.loadSource(url);player.attachMedia(el);
      }).catch(fail);
    }
    return()=>{cancelled=true;clearTimeout(timer);save();el.removeEventListener('loadedmetadata',loaded);el.removeEventListener('error',fail);el.removeEventListener('timeupdate',save);el.removeEventListener('pause',save);el.pause();hls?.destroy();el.removeAttribute('src');el.load();};
  },[url,selected?.url]);

  return <div className="movie-player">
    <div className="movie-player-toolbar"><button type="button" onClick={onBack}><ArrowLeft size={18}/>Details</button><span>{movieTitle(item)}{type==='tv'?` · S${season} E${episode}`:''}</span></div>
    <div className="movie-video-wrap">
      <video ref={video} controls playsInline preload="metadata" poster={movieImage(item.backdrop_path,'w1280')||undefined} aria-label={movieTitle(item)}/>
      {!ready&&!error&&<div className="movie-player-message" role="status"><LoaderCircle className="spin" size={26}/><span>{status}</span></div>}
      {error&&<div className="movie-player-message movie-player-error" role="alert"><p>{error}</p><button type="button" onClick={()=>{setFallback(0);setRetry(n=>n+1);}}><RotateCw size={17}/>Retry</button></div>}
    </div>
    <div className="movie-player-options">
      <MovieServerSelect value={server} onChange={value=>{onServerChange(value);setFallback(0);setRetry(n=>n+1);}} autoLabel={server==='auto'&&chosen?`Auto · ${chosen.label}`:'Auto'}/>
      {sources.length>1&&<label>Quality<select aria-label="Playback quality" value={quality} onChange={e=>{position.current=video.current?.currentTime||position.current;setReady(false);setStatus('Changing quality…');setQuality(Number(e.target.value));}}>{sources.map((s,i)=><option key={i} value={i}>{s.quality||`Source ${i+1}`}</option>)}</select></label>}
      <span>Playback availability depends on the selected server.</span>
    </div>
  </div>;
}
