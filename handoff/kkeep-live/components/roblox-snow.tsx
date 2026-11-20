'use client';

import {useEffect,useRef} from 'react';

/** A bounded decorative canvas behind the transparent provider menu. */
export default function RobloxSnow({paused}:{paused:boolean}){
  const canvas=useRef<HTMLCanvasElement>(null);
  useEffect(()=>{
    const element=canvas.current,ctx=element?.getContext('2d');
    if(!element||!ctx||paused)return;
    const motion=matchMedia('(prefers-reduced-motion: reduce)');
    let frame=0,last=0,width=0,height=0;
    let flakes:{x:number;y:number;r:number;speed:number;phase:number}[]=[];
    const resize=()=>{
      width=innerWidth;height=innerHeight;
      const ratio=Math.min(devicePixelRatio||1,1.5);
      element.width=Math.round(width*ratio);element.height=Math.round(height*ratio);
      ctx.setTransform(ratio,0,0,ratio,0,0);
      flakes=Array.from({length:Math.min(64,Math.max(24,Math.round(width*height/20000)))},()=>({x:Math.random()*width,y:Math.random()*height,r:.8+Math.random()*1.8,speed:18+Math.random()*28,phase:Math.random()*6.28}));
    };
    const tick=(now:number)=>{
      const delta=last?Math.min((now-last)/1000,.05):0;last=now;
      ctx.clearRect(0,0,width,height);
      for(const flake of flakes){
        flake.y+=flake.speed*delta;flake.x+=Math.sin(now/2500+flake.phase)*7*delta;
        if(flake.y>height+4){flake.y=-4;flake.x=Math.random()*width;}
        ctx.beginPath();ctx.arc(flake.x,flake.y,flake.r,0,Math.PI*2);ctx.fillStyle='rgba(235,242,255,.48)';ctx.fill();
      }
      frame=requestAnimationFrame(tick);
    };
    const sync=()=>{
      cancelAnimationFrame(frame);last=0;
      ctx.clearRect(0,0,width,height);
      if(!document.hidden&&!motion.matches)frame=requestAnimationFrame(tick);
    };
    resize();sync();
    window.addEventListener('resize',resize);document.addEventListener('visibilitychange',sync);motion.addEventListener('change',sync);
    return()=>{cancelAnimationFrame(frame);ctx.clearRect(0,0,width,height);window.removeEventListener('resize',resize);document.removeEventListener('visibilitychange',sync);motion.removeEventListener('change',sync);};
  },[paused]);
  return <canvas ref={canvas} className="roblox-snow" aria-hidden="true" hidden={paused}/>;
}
