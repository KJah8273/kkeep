'use client';
import {useEffect,useState} from 'react';
import {MENU_EFFECTS_KEY,MENU_EFFECTS_EVENT,defaultMenuEffects,readMenuEffects,menuMotionAllowed,type MenuEffects} from '@/lib/menu-effects';

export function useMenuEffects(){
  const [effects,setEffects]=useState<MenuEffects>(defaultMenuEffects);
  const [reduced,setReduced]=useState(false);
  useEffect(()=>{
    const media=matchMedia('(prefers-reduced-motion: reduce)');
    const sync=(event?:Event)=>{let next=defaultMenuEffects;try{next=readMenuEffects(localStorage);}catch{}if(event?.type===MENU_EFFECTS_EVENT)next=(event as CustomEvent<MenuEffects>).detail;setEffects(next);setReduced(media.matches);};
    sync();window.addEventListener('storage',sync);window.addEventListener(MENU_EFFECTS_EVENT,sync);media.addEventListener('change',sync);
    return()=>{window.removeEventListener('storage',sync);window.removeEventListener(MENU_EFFECTS_EVENT,sync);media.removeEventListener('change',sync);};
  },[]);
  const update=(patch:Partial<MenuEffects>)=>{
    const next={...effects,...patch};setEffects(next);
    try{localStorage.setItem(MENU_EFFECTS_KEY,JSON.stringify(next));}catch{}
    window.dispatchEvent(new CustomEvent(MENU_EFFECTS_EVENT,{detail:next}));
  };
  return {effects,update,allowed:menuMotionAllowed(effects,reduced),reduced};
}
export default function MenuEffectsControls(){
  const {effects,update,allowed,reduced}=useMenuEffects();
  return <>
    <div className="setting-row"><span>Motion</span><div className="motion-modes" role="group" aria-label="Menu motion">{(['auto','full','reduced'] as const).map(mode=><button type="button" key={mode} aria-pressed={effects.motion===mode} onClick={()=>update({motion:mode})}>{mode==='auto'?'Auto':mode==='full'?'Full':'Reduced'}</button>)}</div></div>
    {reduced&&effects.motion==='auto'&&<p className="motion-device-note">Reduced motion follows your device setting.</p>}
    <div className="setting-row"><span>Falling snow</span><button type="button" className="setting-toggle" role="switch" aria-label="Falling snow" aria-checked={allowed&&effects.snow} disabled={!allowed} onClick={()=>update({snow:!effects.snow})}><span/></button></div>
    <div className="setting-row"><span>Smooth scrolling</span><button type="button" className="setting-toggle" role="switch" aria-label="Smooth scrolling" aria-checked={allowed&&effects.smooth} disabled={!allowed} onClick={()=>update({smooth:!effects.smooth})}><span/></button></div>
  </>;
}
