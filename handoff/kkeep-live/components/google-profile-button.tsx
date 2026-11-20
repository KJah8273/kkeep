'use client';
import {useEffect,useRef,useState} from 'react';
type Google={accounts:{id:{initialize:(options:Record<string,unknown>)=>void;renderButton:(el:HTMLElement,options:Record<string,unknown>)=>void;disableAutoSelect:()=>void}}};
declare global{interface Window{google?:Google}}
let sdk:Promise<void>|undefined;
function loadSdk(){return sdk??=new Promise<void>((resolve,reject)=>{if(window.google){resolve();return;}const s=document.createElement('script');s.src='https://accounts.google.com/gsi/client';s.async=true;s.onload=()=>resolve();s.onerror=()=>{sdk=undefined;s.remove();reject(Error('Could not load Google sign-in.'));};document.head.appendChild(s);});}
export default function GoogleProfileButton({connected,onSuccess}:{connected:boolean;onSuccess:()=>Promise<void>}){
 const host=useRef<HTMLDivElement>(null),callback=useRef(onSuccess);callback.current=onSuccess;const [enabled,setEnabled]=useState(false),[error,setError]=useState(''),[attempt,setAttempt]=useState(0);
 useEffect(()=>{let cancelled=false;
  const api=async(body?:unknown)=>{const r=await fetch('/api/profile/google',{method:body?'POST':'GET',headers:{'X-Kkeep-Profile':'1',...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,cache:'no-store',signal:AbortSignal.timeout(20000)}),data=await r.json();if(!r.ok)throw Error(data.error);return data;};
  void api().then(async config=>{if(!config.enabled||cancelled)return;setEnabled(true);await loadSdk();const start=await api({action:'start'});if(cancelled||!host.current)return;window.google!.accounts.id.initialize({client_id:start.clientId,nonce:start.nonce,auto_select:false,callback:async(result:{credential:string})=>{try{setError('');await api({credential:result.credential});await callback.current();}catch(e){setError((e as Error).message);}}});window.google!.accounts.id.renderButton(host.current,{theme:'filled_black',size:'large',shape:'pill',text:connected?'continue_with':'signin_with'});}).catch(e=>{if(!cancelled)setError((e as Error).message);});return()=>{cancelled=true;};
 },[connected,attempt]);
 return <>{enabled&&connected&&<p>Connect Google to this Profile</p>}<div ref={host}/>{error&&<><p role="alert">{error}</p><button type="button" onClick={()=>{setError('');setAttempt(n=>n+1);}}>Try Google again</button></>}</>;
}
