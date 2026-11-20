'use client';
import {useEffect,useRef,useState} from 'react';
import {videoApi} from '@/lib/kkeep-youtube/client';
import type {VideoDetails} from '@/lib/kkeep-youtube/model';
export default function KkeepVideoPlayer({video,scope,onSaved}:{video:VideoDetails;scope:string;onSaved:()=>void}){
 const ref=useRef<HTMLVideoElement>(null),session=useRef(''),sequence=useRef(0),last=useRef(0),wasPlaying=useRef(false),resume=useRef(0),live=useRef(true),checkpoint=useRef({position:0,duration:0});
 const [quality,setQuality]=useState(video.formats[0]?.itag||''),[ready,setReady]=useState(false),[error,setError]=useState(''),[saveStatus,setSaveStatus]=useState(''),[reload,setReload]=useState(0);
 const callback=useRef(onSaved);callback.current=onSaved;
 useEffect(()=>{
  const controller=new AbortController();live.current=true;setReady(false);setError('');session.current='';sequence.current=0;wasPlaying.current=false;checkpoint.current={position:0,duration:0};
  if(!video.formats.length||video.unavailable)return()=>{live.current=false;};
  videoApi<{session:string;position:number;duration:number}>('action',{scope,action:'start',id:video.id},controller.signal).then(data=>{if(controller.signal.aborted)return;session.current=data.session;resume.current=data.duration>0&&data.position>=data.duration-5?0:data.position;setReady(true);}).catch(e=>{if(!controller.signal.aborted)setError(e.message);});
  return()=>{controller.abort();live.current=false;void save(true);};
 },[video.id,scope,reload]);
 function capture(){const el=ref.current;if(el&&Number.isFinite(el.currentTime)&&Number.isFinite(el.duration))checkpoint.current={position:Math.floor(el.currentTime),duration:Math.floor(el.duration)};}
 async function save(keepalive=false){
  capture();if(!session.current||!wasPlaying.current||!checkpoint.current.duration)return;
  last.current=Date.now();const input={scope,action:'progress',id:video.id,session:session.current,seq:++sequence.current,...checkpoint.current};
  try{await videoApi('action',input,undefined,keepalive);if(live.current){if(input.seq===sequence.current)setSaveStatus('Saved to Profile');callback.current();}}
  catch(e){if(live.current&&input.seq===sequence.current)setSaveStatus((e as Error).message);}
 }
 useEffect(()=>{const flush=()=>void save(true);window.addEventListener('pagehide',flush);const hidden=()=>{if(document.hidden)flush();};document.addEventListener('visibilitychange',hidden);return()=>{window.removeEventListener('pagehide',flush);document.removeEventListener('visibilitychange',hidden);};},[video.id,scope]);
 const canPlay=video.formats.length>0&&!video.unavailable;
 return <div className="ky-player">
  <div className="ky-screen">
   {error?<div className="ky-player-message" role="alert"><p>{error}</p><button onClick={()=>setReload(n=>n+1)}>Retry</button></div>:!canPlay?<div className="ky-player-message"><p>This video is unavailable from the video server.</p></div>:!ready?<div className="ky-player-message" role="status">Restoring your place…</div>:<video ref={ref} key={quality+'-'+reload} controls playsInline preload="metadata" poster={'/api/kkeep-youtube/image?id='+video.id} src={'/api/kkeep-youtube/stream?id='+video.id+'&itag='+quality}
    onLoadedMetadata={()=>{const el=ref.current;if(el&&Number.isFinite(el.duration)&&resume.current>0)el.currentTime=Math.min(resume.current,Math.max(0,el.duration-1));}}
    onPlay={()=>{wasPlaying.current=true;setError('');}} onTimeUpdate={()=>{capture();if(Date.now()-last.current>15000)void save();}} onPause={()=>void save(true)} onEnded={()=>void save(true)} onError={()=>setError('The video could not play. Retry, or choose another video.')}/>
   }
  </div>
  <div className="ky-player-status"><span role="status">{saveStatus||'Progress saves to your Kkeep Profile'}</span>{video.formats.length>1&&<label>Quality<select value={quality} onChange={e=>{resume.current=ref.current?.currentTime||0;void save();setQuality(e.target.value);setError('');}}>{video.formats.map(f=><option key={f.itag} value={f.itag}>{f.label}</option>)}</select></label>}</div>
 </div>;
}
