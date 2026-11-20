'use client';
import {useEffect,useRef} from 'react';
import {Check,ChevronDown} from 'lucide-react';
import {proxyEngines,type ProxyEngine} from '@/lib/proxy-engines';

export default function ProxyPicker({value,onChange}:{value:ProxyEngine;onChange:(value:ProxyEngine)=>void}){
  const panel=useRef<HTMLDetailsElement>(null);
  useEffect(()=>{
    const close=(event:PointerEvent)=>{if(panel.current&&!panel.current.contains(event.target as Node))panel.current.open=false;};
    const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'&&panel.current?.open){panel.current.open=false;panel.current.querySelector('summary')?.focus();event.stopPropagation();}};
    document.addEventListener('pointerdown',close);document.addEventListener('keydown',escape,true);
    return()=>{document.removeEventListener('pointerdown',close);document.removeEventListener('keydown',escape,true);};
  },[]);
  return <details className="proxy-picker" ref={panel}>
    <summary aria-label={'Proxy engine: '+proxyEngines.find(engine=>engine.id===value)?.name}><span>{proxyEngines.find(engine=>engine.id===value)?.name}</span><ChevronDown size={14}/></summary>
    <div className="proxy-picker-menu" role="radiogroup" aria-label="Proxy engine">
      {proxyEngines.map(engine=><button key={engine.id} type="button" role="radio" aria-checked={value===engine.id} onClick={()=>{onChange(engine.id);if(panel.current){panel.current.open=false;panel.current.querySelector('summary')?.focus();}}}><span>{engine.name}</span>{value===engine.id&&<Check size={15}/>}</button>)}
      <div className="proxy-picker-unavailable" aria-disabled="true"><span>eProxy</span><small>Eclipse plugin · unavailable on the web</small></div>
    </div>
  </details>;
}
