'use client';

import {useCallback,useEffect,useRef,useState} from 'react';
import type {ChatProfile} from './chat-model';

/** A short-lived view of the current account, never a browser-persisted identity. */
export function useChatProfile(enabled=true){
  const [profile,setProfile]=useState<ChatProfile|null>(null);
  const [loading,setLoading]=useState(enabled);
  const [error,setError]=useState('');
  const controller=useRef<AbortController|null>(null);
  const generation=useRef(0);

  const refresh=useCallback(async(clear=false)=>{
    const current=++generation.current;
    controller.current?.abort();
    if(clear)setProfile(null);
    if(!enabled){setProfile(null);setLoading(false);return;}
    const request=new AbortController();controller.current=request;
    setLoading(true);setError('');
    try{
      const response=await fetch('/api/chat/session',{
        headers:{'X-Kkeep-Profile':'1'},credentials:'same-origin',cache:'no-store',signal:AbortSignal.any([request.signal,AbortSignal.timeout(12000)]),
      });
      if(response.status===401){if(current===generation.current)setProfile(null);return;}
      if(!response.ok)throw new Error('Your chat profile could not load.');
      const data=await response.json() as {profile:ChatProfile|null};
      if(current===generation.current)setProfile(data.profile);
    }catch(cause){
      if(!request.signal.aborted&&current===generation.current)setError((cause as Error).message);
    }finally{
      if(current===generation.current&&!request.signal.aborted)setLoading(false);
    }
  },[enabled]);

  useEffect(()=>{
    void refresh(true);
    const authChanged=()=>void refresh(true);
    const profileChanged=()=>void refresh();
    window.addEventListener('kkeep-profile-change',authChanged);
    window.addEventListener('kkeep-chat-profile-change',profileChanged);
    return()=>{
      ++generation.current;controller.current?.abort();
      window.removeEventListener('kkeep-profile-change',authChanged);
      window.removeEventListener('kkeep-chat-profile-change',profileChanged);
    };
  },[refresh]);

  return {profile,setProfile,loading,error,refresh};
}
