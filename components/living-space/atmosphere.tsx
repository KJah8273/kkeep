'use client';
import {useEffect,useRef} from 'react';
/** One seeded, capped decorative scheduler. It never reads an embedded page. */
export default function Atmosphere({count,fps,dpr,speed,paused}:{count:number;fps:number;dpr:number;speed:number;paused:boolean}){
 const ref=useRef<HTMLCanvasElement>(null);
 useEffect(()=>{
  const canvas=ref.current;let context:CanvasRenderingContext2D|null=null;try{context=canvas?.getContext('2d',{alpha:true})??null;}catch{}if(!canvas||!context||!count||!fps)return;
  let width=0,height=0,raf=0,last=0,time=0,slow=0,frames=0,currentFps=fps;
  let seed=92741;const random=()=>{seed=(seed*16807)%2147483647;return(seed-1)/2147483646;};
  const points=Array.from({length:count},()=>({x:random(),y:random(),radius:.4+random()*1.2,rate:.5+random(),phase:random()*6.28}));
  const draw=()=>{context!.clearRect(0,0,width,height);context!.fillStyle='#e2f0ed';for(const p of points){context!.globalAlpha=.13+(.5+.5*Math.sin(p.phase+time*.1))*.25;context!.beginPath();context!.arc(((p.x+time*.001*p.rate)%1)*width,((p.y-time*.002*p.rate+100)%1)*height,p.radius,0,Math.PI*2);context!.fill();}};
  const resize=()=>{const box=canvas.getBoundingClientRect();width=box.width;height=box.height;canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);context!.setTransform(dpr,0,0,dpr,0,0);draw();};
  const tick=(now:number)=>{if(last&&now-last>=1000/currentFps){const elapsed=now-last;time+=Math.min(elapsed,100)/1000*speed/35;frames++;if(elapsed>1000/currentFps*1.8)slow++;if(frames>=90){if(slow>28)currentFps=15;frames=slow=0;}last=now;draw();}else if(!last)last=now;raf=requestAnimationFrame(tick);};
  const sync=()=>{cancelAnimationFrame(raf);last=0;if(!paused&&!document.hidden&&speed>0)raf=requestAnimationFrame(tick);};
  const observer=new ResizeObserver(resize);observer.observe(canvas);document.addEventListener('visibilitychange',sync);resize();sync();
  return()=>{cancelAnimationFrame(raf);observer.disconnect();document.removeEventListener('visibilitychange',sync);context!.clearRect(0,0,width,height);};
 },[count,fps,dpr,speed,paused]);
 return <canvas ref={ref} className="living-particles" aria-hidden="true"/>;
}
