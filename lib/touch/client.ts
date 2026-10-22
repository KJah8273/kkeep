export type TouchController={show:()=>void;hide:()=>void;destroy:()=>void};
type TouchOptions={frame?:HTMLIFrameElement;name?:string;onClose?:()=>void;onBack?:()=>void;onOpenPlayer?:(url:string)=>void};
type TouchFactory={mount:(options?:TouchOptions)=>TouchController|undefined};
declare global{interface Window{KkeepTouch?:TouchFactory;__kkeepTouch?:TouchController}}
let loading:Promise<TouchFactory>|undefined;

export function loadTouchControls():Promise<TouchFactory>{
  if(window.KkeepTouch)return Promise.resolve(window.KkeepTouch);
  loading??=new Promise<TouchFactory>((resolve,reject)=>{
    const script=document.createElement('script');script.src='/controls/kkeep-touch-embed.js?v=2';
    const fail=()=>{clearTimeout(timer);script.remove();reject(new Error('Controls could not load. Tap Controls to try again.'));};
    const timer=setTimeout(fail,15000);
    script.onload=()=>{clearTimeout(timer);if(window.KkeepTouch)resolve(window.KkeepTouch);else fail();};
    script.onerror=fail;document.head.append(script);
  }).catch(error=>{loading=undefined;throw error;});
  return loading;
}
