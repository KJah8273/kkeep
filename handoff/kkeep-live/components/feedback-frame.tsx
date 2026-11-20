'use client';
import {useEffect,useRef,useState} from 'react';

const ORIGIN='https://kkeep-community.testerqrr1.chatgpt.site';
const nonce=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),x=>x.toString(16).padStart(2,'0')).join('');

export default function FeedbackFrame({onSignIn}:{onSignIn:()=>void}){
 const frame=useRef<HTMLIFrameElement>(null),signIn=useRef(onSignIn);
 const [reload,setReload]=useState(0),[slow,setSlow]=useState(false);
 signIn.current=onSignIn;
 useEffect(()=>{
  let active=true,ready=false,generation=0;
  const send=(data:unknown)=>frame.current?.contentWindow?.postMessage(data,ORIGIN);
  const timer=setTimeout(()=>setSlow(true),20000);
  async function connect(openProfile=false){
   if(!ready)return;
   const version=++generation,state=nonce();
   send({type:'kkeep-community-reset',state});
   try{
    const response=await fetch('/api/community-auth',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json','X-Kkeep-Profile':'1'},body:JSON.stringify({state}),signal:AbortSignal.timeout(15000)});
    if(!active||version!==generation)return;
    if(response.status===401){send({type:'kkeep-community-signed-out',state});if(openProfile)signIn.current();return;}
    if(!response.ok)throw Error('Could not connect your Profile. Try again.');
    const data=await response.json() as {url:string},url=new URL(data.url);
    if(url.origin!==ORIGIN||url.searchParams.get('state')!==state||!/^[a-f0-9]{64}$/.test(url.searchParams.get('code')||''))throw Error('Could not connect your Profile. Try again.');
    if(active&&version===generation)send({type:'kkeep-community-code',state,code:url.searchParams.get('code')});
   }catch{if(active&&version===generation)send({type:'kkeep-community-error',state});}
  }
  function message(event:MessageEvent){
   if(event.origin!==ORIGIN||event.source!==frame.current?.contentWindow)return;
   if(event.data?.type==='kkeep-community-ready'){ready=true;clearTimeout(timer);setSlow(false);void connect();}
   if(event.data?.type==='kkeep-community-sign-in')void connect(true);
  }
  const change=()=>void connect();
  window.addEventListener('message',message);window.addEventListener('kkeep-profile-change',change);
  return()=>{active=false;generation++;clearTimeout(timer);window.removeEventListener('message',message);window.removeEventListener('kkeep-profile-change',change);};
 },[reload]);
 return <section className="feedback-page" aria-label="Fix or idea">
  <iframe key={reload} ref={frame} src={ORIGIN+'/?embed=kkeep'} title="Fix or idea" referrerPolicy="strict-origin-when-cross-origin"/>
  {slow&&<div className="feedback-retry" role="status"><p>Fix or idea is taking longer to open.</p><button onClick={()=>{setSlow(false);setReload(x=>x+1);}}>Try again</button></div>}
 </section>;
}
