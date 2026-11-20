'use client';
import {useEffect,useRef,useState} from 'react';

// Open the actual HTML game bundled with the official Unity upload.
const playerUrl='/api/room-play?v=2';

export default function RoomGamePlayer(){
  const frame=useRef<HTMLIFrameElement>(null);
  const [attempt,setAttempt]=useState(0);
  const [errorText,setErrorText]=useState('The game could not load. Please try again.');
  const [stage,setStage]=useState('Preparing غرفه ونص 1…');
  const [slow,setSlow]=useState(false);
  const [progress,setProgress]=useState(0);
  const [status,setStatus]=useState<'loading'|'ready'|'error'>('loading');
  useEffect(()=>{
    let lastProgress=Date.now(),lastValue=-1,ready=false;
    const watchdog=setInterval(()=>{if(!ready&&Date.now()-lastProgress>20000)setSlow(true);},5000);
    function message(event:MessageEvent){
      if(event.origin!==location.origin||event.source!==frame.current?.contentWindow)return;
      const data=event.data;
      if(!data||typeof data!=='object')return;
      if(data.event==='ready'){
        ready=true;clearInterval(watchdog);setSlow(false);setStatus('ready');
        frame.current?.focus({preventScroll:true});
      }else if(data.event==='stage'&&typeof data.message?.text==='string'){
        setStage(data.message.text);lastProgress=Date.now();
      }else if(data.event==='progress'&&typeof data.message?.progress==='number'&&Number.isFinite(data.message.progress)){
        if(data.message.progress>lastValue){lastValue=data.message.progress;lastProgress=Date.now();setSlow(false);}
        setProgress(Math.round(Math.max(0,Math.min(1,data.message.progress))*100));
      }else if(data.event==='error'){if(typeof data.message?.text==='string')setErrorText(data.message.text);ready=true;clearInterval(watchdog);setStatus('error');}
    }
    window.addEventListener('message',message);
    // Listen before navigation so a cached game cannot finish before the listener exists.
    if(frame.current)frame.current.src=playerUrl+(attempt?'&retry='+attempt:'');
    return ()=>{clearInterval(watchdog);window.removeEventListener('message',message);};
  },[attempt]);
  function retry(){setSlow(false);setStage('Preparing غرفه ونص 1…');setProgress(0);setStatus('loading');setAttempt(value=>value+1);}
  return <main className="hgola-player" aria-label="غرفه ونص 1">
    <iframe ref={frame} key={attempt} className="hgola-game" title="غرفه ونص 1" allow="autoplay; fullscreen; gamepad" allowFullScreen onError={()=>setStatus('error')}/>
    {status==='loading'?<div className="hgola-loading" role="status" aria-live="polite">
      <img src="/games/covers/room-and-half.jpg" width={158} height={118} alt=""/>
      <strong>Kkeep</strong><span lang="ar" dir="rtl">غرفه ونص 1</span>
      <small lang="en">{stage}</small>
      <progress max={100} value={progress} aria-label="Loading game"/>
      {slow?<div className="hgola-slow" lang="en"><p>Loading is taking longer than usual. You can wait or retry.</p><button type="button" onClick={retry}>Retry</button></div>:null}
    </div>:null}
    {status==='error'?<div className="hgola-error" role="alert" lang="en">
      <p>{errorText}</p>
      <button type="button" onClick={retry}>Retry</button>
      <a href="/">Back to Kkeep</a>
    </div>:null}
  </main>;
}
