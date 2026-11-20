'use client';

import {useEffect,useRef,useState,type RefObject} from 'react';
import Lenis from 'lenis';
import 'lenis/dist/lenis.css';
import {useMenuEffects} from './menu-effects-controls';

const revealSelector='.game-grid > .game-tile, .hot-game, .cloud-card, .settings-card, .home-library, .home-collections, .collection-card';

/** The menu's motion runs outside React; no per-frame renders or game-page listeners. */
export default function MenuMotion({root,route,paused}:{root:RefObject<HTMLDivElement|null>;route:string;paused:boolean}){
  const canvas=useRef<HTMLCanvasElement>(null);
  const {effects,allowed}=useMenuEffects();
  const [visible,setVisible]=useState(true);
  useEffect(()=>{
    const sync=()=>setVisible(!document.hidden);sync();
    document.addEventListener('visibilitychange',sync);
    return()=>document.removeEventListener('visibilitychange',sync);
  },[]);
  const active=allowed&&visible&&!paused;

  useEffect(()=>{
    const menu=root.current;if(!menu)return;
    menu.dataset.motion=active?'on':'off';
    menu.dataset.atmosphere=active?'on':'off';
    menu.dataset.motionMode=effects.motion;
    return()=>{delete menu.dataset.motion;delete menu.dataset.atmosphere;delete menu.dataset.motionMode;};
  },[active,effects.motion,root]);

  useEffect(()=>{
    const menu=root.current,element=canvas.current;
    if(!menu||!element||!active)return;
    const ctx=effects.snow?element.getContext('2d'):null;
    if(!ctx)return;
    let width=innerWidth,height=innerHeight;
    let frame=0,last=0,time=0,targetX=0,pointerX=0,mouseX=-1000,mouseY=-1000;
    let flakes:{x:number;y:number;r:number;speed:number;phase:number;alpha:number;depth:number;vx:number}[]=[];
    // One bounded snow canvas; the orbital artwork moves independently in CSS.
    const sprite=document.createElement('canvas');sprite.width=sprite.height=48;
    const brush=sprite.getContext('2d');
    if(brush){const glow=brush.createRadialGradient(24,24,0,24,24,24);glow.addColorStop(0,'rgba(242,247,255,.95)');glow.addColorStop(.3,'rgba(230,240,255,.8)');glow.addColorStop(.6,'rgba(221,234,255,.27)');glow.addColorStop(1,'rgba(225,240,255,0)');brush.fillStyle=glow;brush.fillRect(0,0,48,48);}
    const resize=()=>{
      width=innerWidth;height=innerHeight;
      const coarse=matchMedia('(any-pointer: coarse)').matches;
      const ratio=Math.min(devicePixelRatio||1,coarse?1.25:1.5);
      element.width=Math.round(width*ratio);element.height=Math.round(height*ratio);ctx.setTransform(ratio,0,0,ratio,0,0);
      const count=Math.min(coarse?48:80,Math.max(28,Math.round(width*height/18000)));
      flakes=Array.from({length:count},()=>{const depth=Math.random();return {x:Math.random()*width,y:Math.random()*height,r:1.6+depth*depth*5.5,speed:23+depth*42,phase:Math.random()*Math.PI*2,alpha:.22+depth*.48,depth,vx:0};});
    };
    const pointer=(event:PointerEvent)=>{
      if(event.pointerType==='touch')return;
      mouseX=event.clientX;mouseY=event.clientY;
      targetX=Math.max(-1,Math.min(1,(mouseX-width/2)/(width/2)));
    };
    const leave=()=>{targetX=0;mouseX=mouseY=-1000;};
    const tick=(now:number)=>{
      // Avoid doing 120/240 draws per second on high-refresh displays.
      if(last&&now-last<1000/60-.75){frame=requestAnimationFrame(tick);return;}
      const delta=last?Math.min((now-last)/1000,.05):1/60;last=now;time+=delta;
      const ease=1-Math.exp(-delta/0.19);pointerX+=(targetX-pointerX)*ease;
      if(ctx){
        ctx.clearRect(0,0,width,height);
        for(const flake of flakes){
          const dx=flake.x-mouseX,dy=flake.y-mouseY,distance=Math.hypot(dx,dy);
          const breeze=Math.abs(dx)<150&&Math.abs(dy)<150?(1-Math.min(1,distance/150))*Math.sign(dx)*38:0;
          flake.vx+=(breeze-flake.vx)*(1-Math.exp(-delta*3));
          flake.x+=(Math.sin(time*.35+flake.phase)*9+pointerX*(6+flake.depth*13)+flake.vx)*delta;
          flake.y+=flake.speed*delta;
          if(flake.y>height+12){flake.y=-12;flake.x=Math.random()*width;}
          if(flake.x< -12)flake.x=width+12;if(flake.x>width+12)flake.x=-12;
          ctx.globalAlpha=flake.alpha;ctx.drawImage(sprite,flake.x-flake.r,flake.y-flake.r,flake.r*2,flake.r*2);
        }
        ctx.globalAlpha=1;
      }
      frame=requestAnimationFrame(tick);
    };
    resize();window.addEventListener('resize',resize,{passive:true});window.addEventListener('pointermove',pointer,{passive:true});document.addEventListener('pointerleave',leave);
    frame=requestAnimationFrame(tick);
    return()=>{
      cancelAnimationFrame(frame);window.removeEventListener('resize',resize);window.removeEventListener('pointermove',pointer);document.removeEventListener('pointerleave',leave);
      ctx?.clearRect(0,0,width,height);
    };
  },[active,effects.snow,root,route]);

  useEffect(()=>{
    const menu=root.current;if(!active||!menu||typeof IntersectionObserver==='undefined')return;
    const seen=new WeakSet<Element>();
    const observer=new IntersectionObserver(entries=>{
      let order=0;
      for(const entry of entries){
        if(!entry.isIntersecting)continue;
        const element=entry.target as HTMLElement;element.style.setProperty('--reveal-delay',Math.min(order++*55,220)+'ms');element.dataset.reveal='visible';observer.unobserve(element);
      }
    },{rootMargin:'0px 0px -12px 0px',threshold:.01});
    const watch=(node:Element)=>{
      const elements=[...(node.matches(revealSelector)?[node]:[]),...node.querySelectorAll(revealSelector)];
      for(const element of elements){if(seen.has(element))continue;seen.add(element);(element as HTMLElement).dataset.reveal='pending';observer.observe(element);}
    };
    watch(menu);
    const mutations=new MutationObserver(records=>{for(const record of records)for(const node of record.addedNodes)if(node instanceof Element)watch(node);});
    mutations.observe(menu,{childList:true,subtree:true});
    return()=>{observer.disconnect();mutations.disconnect();for(const element of menu.querySelectorAll<HTMLElement>('[data-reveal]')){delete element.dataset.reveal;element.style.removeProperty('--reveal-delay');}};
  },[active,root,route]);

  useEffect(()=>{
    const menu=root.current;if(!menu)return;
    const lenis=active&&effects.smooth?new Lenis({autoRaf:true,duration:1.15,easing:t=>1-Math.pow(1-t,4),smoothWheel:true,wheelMultiplier:1,touchMultiplier:1.2,allowNestedScroll:true,respectReducedMotion:effects.motion!=='full',prevent:element=>!!element.closest('[role="dialog"],input,textarea,select,[contenteditable="true"],[data-native-scroll]')}):null;
    const reset=()=>lenis?.scrollTo(0,{immediate:true,force:true});
    const jump=()=>{const target=menu.querySelector<HTMLElement>('#featured');if(!target)return;let top=0;for(let node:HTMLElement|null=target;node;node=node.offsetParent as HTMLElement|null)top+=node.offsetTop;if(lenis)lenis.scrollTo(top,{offset:-85});else target.scrollIntoView({behavior:'instant'});};
    window.addEventListener('kkeep-menu-navigate',reset);window.addEventListener('kkeep-menu-featured',jump);
    return()=>{window.removeEventListener('kkeep-menu-navigate',reset);window.removeEventListener('kkeep-menu-featured',jump);lenis?.destroy();};
  },[active,effects.smooth,effects.motion,root,route]);

  return <canvas ref={canvas} className="menu-snow" aria-hidden="true" hidden={!active||!effects.snow}/>;
}
