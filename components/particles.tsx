'use client';
import {useEffect,useRef} from 'react';
import type {Wallpaper} from '@/lib/themes';

/** A capped, 30 fps star field; pauses offscreen and respects reduced motion. */
export default function Particles({moving=true,mode='stars',dense=false}:{moving?:boolean;mode?:Wallpaper;dense?:boolean}){
  const canvas=useRef<HTMLCanvasElement>(null);
  useEffect(()=>{
    const element=canvas.current,context=element?.getContext('2d');
    if(!element||!context||mode==='none')return;
    const reduced=matchMedia('(prefers-reduced-motion: reduce)');
    let width=0,height=0,frame=0,last=0,time=0,color='#eee';
    let points:{x:number;y:number;r:number;speed:number;phase:number}[]=[];
    function palette(){color=getComputedStyle(element!).getPropertyValue('--kk-text').trim()||'#eee';render(0);}
    function resize(){
      const size=element!.getBoundingClientRect();width=size.width;height=size.height;
      const ratio=Math.min(devicePixelRatio||1,1.5);element!.width=Math.round(width*ratio);element!.height=Math.round(height*ratio);context!.setTransform(ratio,0,0,ratio,0,0);
      const count=Math.min(dense?140:85,Math.max(25,Math.round(width*height/(dense?6500:12000))));
      points=Array.from({length:count},()=>({x:Math.random()*width,y:Math.random()*height,r:.45+Math.random()*1.1,speed:2+Math.random()*7,phase:Math.random()*Math.PI*2}));palette();
    }
    function render(delta:number){
      time+=delta;context!.clearRect(0,0,width,height);context!.fillStyle=color;
      for(const p of points){
        p.x+=p.speed*delta*.2;p.y-=p.speed*delta;if(p.y< -3){p.y=height+3;p.x=Math.random()*width;}if(p.x>width+3)p.x=-3;
        context!.globalAlpha=.2+(.5+.5*Math.sin(time*.7+p.phase))*.5;
        context!.beginPath();context!.arc(p.x,p.y,p.r,0,Math.PI*2);context!.fill();
      }
      if(mode==='constellation'){
        context!.strokeStyle=color;context!.lineWidth=.5;
        for(let i=0;i<points.length;i++)for(let j=i+1;j<points.length;j++){
          const a=points[i],b=points[j],distance=Math.hypot(a.x-b.x,a.y-b.y);
          if(distance<100){context!.globalAlpha=(1-distance/100)*.18;context!.beginPath();context!.moveTo(a.x,a.y);context!.lineTo(b.x,b.y);context!.stroke();}
        }
      }
      context!.globalAlpha=1;
    }
    function tick(now:number){if(!last||now-last>=33){render(last?Math.min((now-last)/1000,.08):0);last=now;}frame=requestAnimationFrame(tick);}
    function sync(){cancelAnimationFrame(frame);last=0;render(0);if(moving&&!document.hidden&&!reduced.matches)frame=requestAnimationFrame(tick);}
    const observer=new ResizeObserver(resize);observer.observe(element);resize();sync();
    const themeObserver=new MutationObserver(palette);themeObserver.observe(document.documentElement,{attributes:true,attributeFilter:['style']});
    document.addEventListener('visibilitychange',sync);reduced.addEventListener('change',sync);
    return()=>{cancelAnimationFrame(frame);observer.disconnect();themeObserver.disconnect();document.removeEventListener('visibilitychange',sync);reduced.removeEventListener('change',sync);};
  },[moving,mode,dense]);
  if(mode==='none')return null;
  return <div className="star-wallpaper" aria-hidden="true"><canvas ref={canvas}/></div>;
}
