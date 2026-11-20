'use client';
import {useEffect,useRef,useState,type CSSProperties} from 'react';
import {Check} from 'lucide-react';
import {bindWallpaperPlayback} from '@/lib/living-space/video-playback';

export const wallpaperColors=[
  {name:'Iris',hue:248,color:'#a394ff'},
  {name:'Ocean',hue:210,color:'#71b8ff'},
  {name:'Mint',hue:164,color:'#6ce5bf'},
  {name:'Rose',hue:322,color:'#ef8ac5'},
  {name:'Ember',hue:25,color:'#ffb576'},
  {name:'Silver',hue:230,color:'#c9cedf'},
] as const;
const COLOR_KEY='kkeep-wallpaper-color-v2',MOTION_KEY='kkeep-wallpaper-motion-v2',EVENT='kkeep-wallpaper-change';
function useWallpaper(){
  const [color,setColor]=useState('Iris'),[motion,setMotion]=useState(false);
  useEffect(()=>{
    const reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)');
    const read=()=>{
      let savedMotion:string|null=null;
      try{
        const savedColor=localStorage.getItem(COLOR_KEY);
        setColor(wallpaperColors.find(c=>c.name===savedColor)?.name??'Iris');
        savedMotion=localStorage.getItem(MOTION_KEY);
      }catch{}
      setMotion(savedMotion===null?!reducedMotion.matches:savedMotion!=='off');
    };
    read();
    window.addEventListener('storage',read);
    window.addEventListener(EVENT,read);
    reducedMotion.addEventListener('change',read);
    return()=>{
      window.removeEventListener('storage',read);
      window.removeEventListener(EVENT,read);
      reducedMotion.removeEventListener('change',read);
    };
  },[]);
  function choose(value:string){setColor(value);try{localStorage.setItem(COLOR_KEY,value);}catch{}window.dispatchEvent(new Event(EVENT));}
  function toggle(){setMotion(!motion);try{localStorage.setItem(MOTION_KEY,motion?'off':'on');}catch{}window.dispatchEvent(new Event(EVENT));}
  return {color,motion,choose,toggle};
}
export function WallpaperSwatches({accent=false}:{accent?:boolean}={}){
  const {color,choose}=useWallpaper();
  return <div className="wallpaper-swatches" role="group" aria-label={accent?'Accent color':'Wallpaper color'}>{wallpaperColors.map(c=><button key={c.name} type="button" style={{'--swatch':c.color} as CSSProperties} aria-label={c.name+(accent?' accent':' wallpaper')} aria-pressed={color===c.name} title={c.name} onClick={()=>choose(c.name)}>{color===c.name&&<Check size={17}/>}</button>)}</div>;
}
export function WallpaperMotion(){const {motion,toggle}=useWallpaper();return <button className="setting-toggle" role="switch" aria-label="Wallpaper motion" aria-checked={motion} onClick={toggle}><span/></button>;}
export function WallpaperColorButton({accent=false}:{accent?:boolean}={}){
  const ref=useRef<HTMLDetailsElement>(null);
  useEffect(()=>{const outside=(e:PointerEvent)=>{if(ref.current&&!ref.current.contains(e.target as Node))ref.current.open=false;};const escape=(e:KeyboardEvent)=>{if(e.key==='Escape'&&ref.current?.open){ref.current.open=false;ref.current.querySelector('summary')?.focus();}};document.addEventListener('pointerdown',outside);document.addEventListener('keydown',escape);return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape);};},[]);
  return <details className="wallpaper-color-picker" ref={ref}><summary aria-label={accent?'Accent color':'Wallpaper color'} title={accent?'Accent color':'Wallpaper color'}><span className="color-wheel"/></summary><div className="wallpaper-color-popover"><span>{accent?'Accent color':'Color'}</span><WallpaperSwatches accent={accent}/></div></details>;
}
export default function KkeepBackdrop({paused=false,pauseOnTouch=false,variant='video'}:{paused?:boolean;pauseOnTouch?:boolean;variant?:'video'|'ambient'}){
  const {color,motion}=useWallpaper();
  const video=useRef<HTMLVideoElement>(null);
  const [source,setSource]=useState('/kkeep-orbit-4k.mp4');
  useEffect(()=>{
    const touchGameShelf=pauseOnTouch&&window.matchMedia('(any-pointer: coarse)').matches;
    if(video.current)return bindWallpaperPlayback(video.current,paused||!motion||touchGameShelf);
  },[motion,paused,pauseOnTouch,source,variant]);
  const palette=wallpaperColors.find(c=>c.name===color)||wallpaperColors[0];
  return <div className="kkeep-backdrop" aria-hidden="true" data-variant={variant} data-color={color} style={{'--wallpaper-shift':`${palette.hue-wallpaperColors[0].hue}deg`} as CSSProperties}>
    {variant==='video'&&<video
      ref={video}
      className="wallpaper-sculpture"
      src={source}
      poster="/kkeep-orbit-poster.webp"
      preload="none"
      muted
      playsInline
      loop
      onError={()=>setSource('/kkeep-orbit-1080.mp4')}
    />}
    <div className="wallpaper-shade"/>
  </div>;
}
