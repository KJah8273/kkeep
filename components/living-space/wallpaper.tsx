'use client';
import {lazy,Suspense,useEffect,useRef,useState,type CSSProperties} from 'react';
import {qualityBudget,type Preferences,type Capabilities,nextFavorite} from '@/lib/living-space/model';
import {wallpaperInfo} from '@/lib/living-space/scenes';
import {getMedia,preloadImage} from '@/lib/living-space/media';
import LivingBoundary from './boundary';
const Atmosphere=lazy(()=>import('./atmosphere'));
type Resource={src:string;poster:string;kind:'image'|'video';id:string};
export default function LivingWallpaper({preferences:p,original,paused=false,tilt=false,onRotate}:{preferences:Preferences;original:string;paused?:boolean;tilt?:boolean;onRotate?:(id:string)=>void}){
 const info=wallpaperInfo(p.wallpaper,original),initial=wallpaperInfo('original',original);
 const [resource,setResource]=useState<Resource>({src:info.src||initial.src,poster:info.poster||initial.poster,kind:'image',id:info.id});
 const [cap,setCap]=useState<Capabilities>({coarse:true,reducedMotion:true,saveData:false,cores:4}),[hidden,setHidden]=useState(false),[deferred,setDeferred]=useState(false),[videoReady,setVideoReady]=useState(false);
 const ref=useRef<HTMLDivElement>(null),video=useRef<HTMLVideoElement>(null),owned=useRef<string[]>([]);
 const budget=qualityBudget(p,cap),still=!budget.fps||info.id==='none',halt=paused||hidden||still||p.speed===0;
 useEffect(()=>{const motion=matchMedia('(prefers-reduced-motion: reduce)'),coarse=matchMedia('(pointer: coarse)');const sync=()=>setCap({reducedMotion:motion.matches,coarse:coarse.matches,saveData:!!(navigator as Navigator&{connection?:{saveData?:boolean}}).connection?.saveData,cores:navigator.hardwareConcurrency||4});const visibility=()=>setHidden(document.hidden);sync();visibility();motion.addEventListener('change',sync);coarse.addEventListener('change',sync);document.addEventListener('visibilitychange',visibility);const delay=setTimeout(()=>setDeferred(true),350);return()=>{clearTimeout(delay);motion.removeEventListener('change',sync);coarse.removeEventListener('change',sync);document.removeEventListener('visibilitychange',visibility);};},[]);
 useEffect(()=>{const controller=new AbortController();let newUrls:string[]=[];setVideoReady(false);
  (async()=>{let next:Resource;if(info.id.startsWith('upload:')){const media=await getMedia(info.id);if(!media)throw new Error('Missing upload');const src=URL.createObjectURL(media.blob),poster=URL.createObjectURL(media.poster);newUrls=[src,poster];next={src,poster,kind:media.kind,id:info.id};await preloadImage(poster,controller.signal);}else{next={src:info.src,poster:info.poster,kind:'image',id:info.id};if(next.src)await preloadImage(next.src,controller.signal);}if(controller.signal.aborted)return;const old=owned.current;owned.current=newUrls;newUrls=[];setResource(next);old.forEach(URL.revokeObjectURL);})().catch(()=>{/* Keep the last decoded wallpaper; media failures cannot reload browsing. */}).finally(()=>newUrls.forEach(URL.revokeObjectURL));
  return()=>controller.abort();
 },[info.id,info.src,info.poster]);
 useEffect(()=>()=>owned.current.forEach(URL.revokeObjectURL),[]);
 useEffect(()=>{const element=video.current;if(!element)return;if(halt){element.pause();return;}element.play().catch(()=>setVideoReady(false));return()=>element.pause();},[halt,resource.src]);
 useEffect(()=>{
  const el=ref.current;if(!el||halt||(!budget.parallax&&!tilt))return;let x=0,y=0,raf=0;
  const apply=()=>{raf=0;el.style.setProperty('--drift-x',x+'px');el.style.setProperty('--drift-y',y+'px');};
  const queue=()=>{if(!raf)raf=requestAnimationFrame(apply);};
  const move=(event:PointerEvent)=>{if(event.pointerType!=='mouse')return;x=(event.clientX/innerWidth-.5)*budget.parallax;y=(event.clientY/innerHeight-.5)*budget.parallax;queue();};
  const orient=(event:DeviceOrientationEvent)=>{x=Math.max(-10,Math.min(10,(event.gamma||0)/4));y=Math.max(-8,Math.min(8,(event.beta||0)/8));queue();};
  const reset=()=>{x=y=0;queue();};if(budget.parallax)window.addEventListener('pointermove',move,{passive:true});if(tilt)window.addEventListener('deviceorientation',orient,{passive:true});window.addEventListener('blur',reset);document.addEventListener('visibilitychange',reset);
  return()=>{window.removeEventListener('pointermove',move);window.removeEventListener('deviceorientation',orient);window.removeEventListener('blur',reset);document.removeEventListener('visibilitychange',reset);cancelAnimationFrame(raf);el.style.setProperty('--drift-x','0px');el.style.setProperty('--drift-y','0px');};
 },[budget.parallax,halt,tilt]);
 useEffect(()=>{if(!p.rotation||paused||hidden||p.quiet||!onRotate)return;const timer=setInterval(()=>{if(document.hidden)return;const next=nextFavorite(p.wallpaper,p.favorites);if(next)onRotate(next);},p.rotation*60000);return()=>clearInterval(timer);},[p.rotation,p.wallpaper,p.favorites,paused,hidden,p.quiet,onRotate]);
 const [hour,setHour]=useState(12);useEffect(()=>{if(!p.timeAtmosphere)return;const update=()=>setHour(new Date().getHours());update();const timer=setInterval(update,60000);return()=>clearInterval(timer);},[p.timeAtmosphere]);
 const originalMode=p.mode==='original'||info.id==='none';
 const style={'--wall-brightness':originalMode?'100%':p.brightness+'%','--wall-saturation':originalMode?'100%':p.saturation+'%','--wall-blur':originalMode?'0px':p.blur+'px','--wall-dim':originalMode?0:p.dimming/100,'--wall-speed':Math.round(160-p.speed)+'s','--wall-fit':'cover','--wall-position':'50% 50%','--time-tint':p.timeAtmosphere&&!originalMode?(hour<7||hour>=19?'.09':'.025'):'0'} as CSSProperties;
 return <div ref={ref} className={'living-wallpaper '+(info.scene?'scene-'+info.scene.motion:'scene-original')} data-paused={halt} data-static={still} data-original={originalMode} data-fit="cover" data-tier={budget.tier} style={style} aria-hidden="true">
  <div className="wallpaper-image-layer">{resource.poster&&<img className="wallpaper-still" src={resource.kind==='video'?resource.poster:resource.src} alt="" decoding="async" fetchPriority="high" onError={e=>{if(initial.src&&e.currentTarget.src!==new URL(initial.src,location.origin).href)e.currentTarget.src=initial.src;}}/>}
   {resource.kind==='video'&&!still&&!paused&&!hidden&&<video key={resource.src} ref={video} src={resource.src} poster={resource.poster} muted loop playsInline preload="metadata" onPlaying={()=>setVideoReady(true)} onError={()=>setVideoReady(false)} style={{opacity:videoReady?1:0}}/>}
   {!resource.src&&<div className={'wallpaper-effect wallpaper-effect-'+(resource.id==='none'?'none':'stars')}/>}
  </div>
  {!originalMode&&<><div className="living-light"/><div className="living-depth"/><div className="living-shade"/>{deferred&&!still&&budget.particles>0&&<LivingBoundary fallback={null} resetKey={String(budget.tier)}><Suspense fallback={null}><Atmosphere count={budget.particles} fps={budget.fps} dpr={budget.dpr} speed={p.speed} paused={halt}/></Suspense></LivingBoundary>}</>}
 </div>;
}
