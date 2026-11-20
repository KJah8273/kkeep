'use client';

import {Cloud,Clapperboard,Gamepad2,House,Settings} from 'lucide-react';
import {useLayoutEffect,useRef} from 'react';

const destinations=[
  {id:'home',label:'Home',href:'/',icon:House},
  {id:'games',label:'Games',href:'/games',icon:Gamepad2},
  {id:'movies',label:'Movies',href:'/movies',icon:Clapperboard},
  {id:'cloud',label:'Cloud gaming',href:'/#cloud',icon:Cloud},
  {id:'settings',label:'Settings',href:'/#settings',icon:Settings},
];

export default function KkeepRail({active}:{active:string}){
  const rail=useRef<HTMLElement>(null);
  useLayoutEffect(()=>{
    const nav=rail.current,selected=nav?.querySelector<HTMLElement>('[aria-current="page"]');
    if(!nav)return;
    if(!selected){delete nav.dataset.selectionReady;delete nav.dataset.selectionMoving;return;}
    if(nav.dataset.selectionReady==='true')nav.dataset.selectionMoving='true';
    const measure=()=>{
      nav.style.setProperty('--rail-selection-x',selected.offsetLeft+'px');
      nav.style.setProperty('--rail-selection-width',selected.offsetWidth+'px');
      nav.dataset.selectionReady='true';
    };
    measure();
    if(typeof ResizeObserver==='undefined')return;
    const observer=new ResizeObserver(measure);
    observer.observe(nav);
    observer.observe(selected);
    return()=>observer.disconnect();
  },[active]);
  return <nav ref={rail} className="kkeep-rail" aria-label="Main navigation">
    <span className="rail-selection" aria-hidden="true"/>
    {destinations.map(({id,label,href,icon:Icon})=><a key={id} data-nav={id} href={href} aria-label={label} aria-current={active===id?'page':undefined} className={active===id?'active':undefined}><span className="rail-orb"><Icon size={22} strokeWidth={1.8} aria-hidden="true"/></span><span className="rail-label">{label}</span></a>)}
  </nav>;
}
