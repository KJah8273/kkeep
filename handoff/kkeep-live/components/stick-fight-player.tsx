'use client';
import {useEffect,useRef,useState} from 'react';

// Use the current official build through our bounded loading adapter.
const playerUrl='/stick-runtime.html?v=stick-viewport-2';

export default function StickFightPlayer(){
  const frame=useRef<HTMLIFrameElement>(null);
  const [attempt,setAttempt]=useState(0);
  const [stage,setStage]=useState('Preparing Stick Fight…');
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
      }else if(data.event==='error'){ready=true;clearInterval(watchdog);setStatus('error');}
    }
    window.addEventListener('message',message);
    // Listen before navigation so a cached game cannot finish before the listener exists.
    if(frame.current)frame.current.src=playerUrl+(attempt?'&retry='+attempt:'');
    return ()=>{clearInterval(watchdog);window.removeEventListener('message',message);};
  },[attempt]);
  function retry(){setSlow(false);setStage('Preparing Stick Fight…');setProgress(0);setStatus('loading');setAttempt(value=>value+1);}
  return <main className="hgola-player" aria-label="Stick Fight">
    <iframe ref={frame} key={attempt} className="hgola-game" title="Stick Fight" allow="autoplay; fullscreen; gamepad" allowFullScreen onError={()=>setStatus('error')}/>
    {status==='loading'?<div className="hgola-loading" role="status" aria-live="polite">
      <img src="/games/covers/stick-fight.png" width={158} height={118} alt=""/>
      <span lang="en">Stick Fight</span>
      <small lang="en">{stage}</small>
      <progress max={100} value={progress} aria-label="Loading game"/>
      {slow?<div className="hgola-slow" lang="en"><p>Loading is taking longer than usual. You can wait or retry.</p><button type="button" onClick={retry}>Retry</button></div>:null}
    </div>:null}
    {status==='error'?<div className="hgola-error" role="alert" lang="en">
      <p>The game could not load. Please try again.</p>
      <button type="button" onClick={retry}>Retry</button>
      <a href="/">Back to Kkeep</a>
    </div>:null}
  </main>;
}
