'use client';

import {useEffect,useState} from 'react';
import GameProfile from '@/components/game-profile';

const preview='https://kkeep-roblox-preview.testerqrr1.chatgpt.site';
const profileHeaders={'X-Kkeep-Profile':'1'};

export default function RobloxConnect(){
  const [open,setOpen]=useState(false);
  const [name,setName]=useState<string|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');

  useEffect(()=>{
    async function check(){
      try{
        const response=await fetch('/api/profile',{headers:profileHeaders,cache:'no-store',signal:AbortSignal.timeout(12000)});
        if(!response.ok)throw new Error();
        const data=await response.json();
        setName(data.account?.name||'');
        if(data.account?.name)setOpen(false);
        setError('');
      }catch{
        setName('');
        setError('Kkeep Profile could not load. Try again.');
      }
    }
    void check();
    window.addEventListener('kkeep-profile-change',check);
    return ()=>window.removeEventListener('kkeep-profile-change',check);
  },[]);

  async function connect(){
    setBusy(true);
    setError('');
    try{
      const state=new URL(location.href).searchParams.get('state');
      if(!state||!/^[a-f0-9]{64}$/.test(state))throw new Error('Start sign-in from the Roblox preview again.');
      const response=await fetch('/api/community-auth/roblox',{
        method:'POST',
        headers:{...profileHeaders,'Content-Type':'application/json'},
        body:JSON.stringify({state}),
        signal:AbortSignal.timeout(12000)
      });
      const data=await response.json();
      if(!response.ok)throw new Error(data.error||'Could not connect your Profile.');
      const destination=new URL(data.url);
      if(destination.origin!==preview||destination.pathname!=='/auth/callback')throw new Error('Could not connect your Profile.');
      location.replace(destination.href);
    }catch(err){
      setError(err instanceof Error?err.message:'Could not connect your Profile.');
      setBusy(false);
    }
  }

  return <main style={{minHeight:'100dvh',display:'grid',placeContent:'center',padding:24,background:'#080809',color:'#f8f8f7'}}>
    <section style={{width:'min(100%, 420px)',margin:'auto',padding:'clamp(24px, 5vw, 40px)',border:'1px solid #303032',borderRadius:24,background:'#111113',display:'grid',gap:20,textAlign:'center'}}>
      <img src="/kkeep-icon.png" alt="Kkeep" width={52} height={52} style={{margin:'auto',borderRadius:12}}/>
      <h1 style={{fontSize:28,fontWeight:700,letterSpacing:'-.04em'}}>Connect Kkeep Profile</h1>
      <p style={{color:'#b6b6ba',lineHeight:1.5}}>Use your existing Kkeep account to open the Roblox preview.</p>
      {name===null?<p role="status">Checking your Profile…</p>:<button type="button" disabled={busy} onClick={name?connect:()=>setOpen(true)} style={{minHeight:50,borderRadius:12,padding:'10px 16px',background:'#f4f3ef',color:'#121215',fontWeight:700,cursor:'pointer',overflowWrap:'anywhere'}}>
        {busy?'Connecting…':name?'Continue as '+name:'Sign in / Sign up'}
      </button>}
      {error&&<p role="alert" style={{color:'#ffb7aa'}}>{error}</p>}
      <a href={preview} rel="noreferrer" style={{minHeight:44,display:'grid',placeItems:'center',color:'#b6b6ba'}}>Back to Roblox</a>
    </section>
    <GameProfile open={open} onOpenChange={setOpen}/>
  </main>;
}
