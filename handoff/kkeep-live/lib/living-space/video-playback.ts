import type {Preferences} from './model.ts';

// A deliberately selected video is content, not a particle/parallax effect.
// Keep explicit pause/quiet preferences; do not hide it behind the effects budget.
export function pauseWallpaperVideo(p:Preferences,paused:boolean,hidden:boolean){
 return paused||hidden||p.quiet||p.motion==='reduced'||p.speed===0;
}

export function bindWallpaperPlayback(
 video:HTMLVideoElement,
 paused:boolean,
 page:Pick<Document,'hidden'|'addEventListener'|'removeEventListener'>=document,
 lifecycle:Pick<Window,'addEventListener'|'removeEventListener'>=window,
){
 video.muted=true;
 video.defaultMuted=true;
 video.playsInline=true;
 video.setAttribute('muted','');
 video.setAttribute('playsinline','');
 video.setAttribute('webkit-playsinline','');
 let disposed=false;
 const play=()=>{
  if(disposed)return;
  if(paused||page.hidden){video.pause();return;}
  video.muted=true;
  try{void video.play()?.catch(()=>{/* Safari may require the next completed tap. */});}catch{/* Keep the native poster until a later gesture. */}
 };
 const gestures=['click','touchend','pointerup','keydown'] as const;
 const options={capture:true,passive:true};
 if(!paused){
  for(const name of gestures)page.addEventListener(name,play,options);
  page.addEventListener('visibilitychange',play);
  lifecycle.addEventListener('pageshow',play);
  video.addEventListener('loadeddata',play);
  video.addEventListener('canplay',play);
 }
 play();
 return()=>{
  disposed=true;
  for(const name of gestures)page.removeEventListener(name,play,options);
  page.removeEventListener('visibilitychange',play);
  lifecycle.removeEventListener('pageshow',play);
  video.removeEventListener('loadeddata',play);
  video.removeEventListener('canplay',play);
  video.pause();
 };
}
