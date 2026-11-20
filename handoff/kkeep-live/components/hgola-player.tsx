'use client';
import {useEffect,useRef,useState} from 'react';

const playerUrl='/hgola-runtime.html';

export default function HgolaPlayer(){
  const frame=useRef<HTMLIFrameElement>(null);
  const [attempt,setAttempt]=useState(0);
  const [stage,setStage]=useState('جاري تجهيز اللعبة…');
  const [slow,setSlow]=useState(false);
  const [storageError,setStorageError]=useState(false);
  const [graphicsError,setGraphicsError]=useState(false);
  const [progress,setProgress]=useState(0);
  const [status,setStatus]=useState<'loading'|'ready'|'error'>('loading');
  useEffect(()=>{
    let lastProgress=Date.now(),lastValue=-1,ready=false;
    const watchdog=setInterval(()=>{if(!ready&&Date.now()-lastProgress>90000)setSlow(true);},5000);
    function message(event:MessageEvent){
      if(event.origin!==location.origin||event.source!==frame.current?.contentWindow)return;
      const data=event.data;
      if(!data||typeof data!=='object')return;
      if(data.event==='ready'){
        ready=true;clearInterval(watchdog);setSlow(false);setStatus('ready');
        frame.current?.focus({preventScroll:true});
      }else if(data.event==='stage'&&typeof data.message?.text==='string'){
        setStage(data.message.text);
      }else if(data.event==='progress'&&typeof data.message?.progress==='number'&&Number.isFinite(data.message.progress)){
        if(data.message.progress>lastValue){lastValue=data.message.progress;lastProgress=Date.now();setSlow(false);}
        setProgress(Math.round(Math.max(0,Math.min(1,data.message.progress))*100));
      }else if(data.event==='error'){ready=true;clearInterval(watchdog);setStorageError(data.message?.reason==='storage');setGraphicsError(data.message?.reason==='graphics');setStatus('error');}
    }
    window.addEventListener('message',message);
    // The iframe starts from server-rendered HTML. Ask for its current state in
    // case a cached launch completed before React attached this listener.
    frame.current?.contentWindow?.postMessage({event:'hgola-state'},location.origin);
    return ()=>{clearInterval(watchdog);window.removeEventListener('message',message);};
  },[attempt]);
  function retry(){setGraphicsError(false);setStorageError(false);setSlow(false);setStage('جاري تجهيز اللعبة…');setProgress(0);setStatus('loading');setAttempt(value=>value+1);}
  return <main className="hgola-player" aria-label="هجولة الطارة">
    <iframe ref={frame} key={attempt} src={playerUrl} loading="eager" className="hgola-game" title="هجولة الطارة" allow="autoplay; fullscreen; gamepad" allowFullScreen onLoad={()=>frame.current?.contentWindow?.postMessage({event:'hgola-state'},location.origin)} onError={()=>setStatus('error')}/>
    {status==='loading'?<div className="hgola-loading" role="status" aria-live="polite">
      <img src="/games/covers/hgola-altara.webp" width={158} height={118} alt=""/>
      <strong>Kkeep</strong>
      <span lang="ar" dir="rtl">هجولة الطارة</span>
      <small lang="ar" dir="rtl">{stage}</small>
      <small>{progress}%</small>
      <progress max={100} value={progress} aria-label="تحميل اللعبة"/>
      {slow?<small lang="ar" dir="rtl">جاري تشغيل اللعبة…</small>:null}
    </div>:null}
    {status==='error'?<div className="hgola-error" role="alert" lang="ar" dir="rtl">
      <p>{storageError?'تعذّر قراءة التقدم المحفوظ. أغلق نوافذ اللعبة الأخرى ثم أعد المحاولة. لا تحذف بيانات Safari.':graphicsError?'المتصفح لا يدعم تشغيل رسومات اللعبة. افتحها في Safari أو متصفح يدعم WebGL.':'تعذّر تحميل اللعبة. حاول مرة ثانية.'}</p>
      <button type="button" onClick={()=>retry()}>إعادة المحاولة</button>
    </div>:null}
  </main>;
}
