'use client';
import {useEffect,useRef,type KeyboardEvent} from 'react';
import {Check,ChevronDown} from 'lucide-react';
import {searchProviders,type SearchProvider} from '@/lib/search-providers';

export default function SearchPicker({value,onChange}:{value:SearchProvider;onChange:(value:SearchProvider)=>void}){
  const panel=useRef<HTMLDetailsElement>(null);
  const selected=searchProviders.find(provider=>provider.id===value)??searchProviders[0];
  useEffect(()=>{
    const close=(event:PointerEvent)=>{if(panel.current&&!panel.current.contains(event.target as Node))panel.current.open=false;};
    const escape=(event:globalThis.KeyboardEvent)=>{if(event.key==='Escape'&&panel.current?.open){panel.current.open=false;panel.current.querySelector('summary')?.focus();event.stopPropagation();}};
    document.addEventListener('pointerdown',close);document.addEventListener('keydown',escape,true);
    return()=>{document.removeEventListener('pointerdown',close);document.removeEventListener('keydown',escape,true);};
  },[]);
  function choose(provider:SearchProvider){onChange(provider);if(panel.current){panel.current.open=false;panel.current.querySelector('summary')?.focus();}}
  function move(event:KeyboardEvent<HTMLDivElement>){
    const direction=event.key==='ArrowDown'||event.key==='ArrowRight'?1:event.key==='ArrowUp'||event.key==='ArrowLeft'?-1:0;
    if(!direction)return;event.preventDefault();
    const index=searchProviders.findIndex(provider=>provider.id===value);
    const next=searchProviders[(index+direction+searchProviders.length)%searchProviders.length];
    onChange(next.id);panel.current?.querySelector<HTMLButtonElement>('[data-provider="'+next.id+'"]')?.focus();
  }
  return <details className="proxy-picker search-picker" ref={panel}>
    <summary aria-label={'Search engine: '+selected.name} title={'Search with '+selected.name}><img src={selected.icon} width={18} height={18} alt=""/><span>{selected.name}</span><ChevronDown size={14}/></summary>
    <div className="proxy-picker-menu" role="radiogroup" aria-label="Search engine" onKeyDown={move}>
      {searchProviders.map(provider=><button key={provider.id} type="button" role="radio" data-provider={provider.id} aria-checked={value===provider.id} tabIndex={value===provider.id?0:-1} onClick={()=>choose(provider.id)}><span className="search-provider-name"><img src={provider.icon} width={20} height={20} alt=""/>{provider.name}</span>{value===provider.id&&<Check size={15}/>}</button>)}
    </div>
  </details>;
}
