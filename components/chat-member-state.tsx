'use client';

import {useCallback,useEffect,useRef,useState} from 'react';
import {chatRequest,ChatApiError} from '@/lib/chat-client';
import type {ChatPresencePage} from '@/lib/chat-model';

type Lease={online:boolean;expiresAt:number|null;serverNow:number};
const aborted=(error:unknown)=>(error as Error)?.name==='AbortError';

/** Presence is scoped to this mounted Chat tab; it never claims site-wide activity. */
export function useChatMembers({viewerId,checking,enabled,publishPresence,onAuthError}:{viewerId:string|null;checking:boolean;enabled:boolean;publishPresence:boolean;onAuthError:(error:unknown)=>void}){
  const [data,setData]=useState<ChatPresencePage|null>(null),[loading,setLoading]=useState(false),[loadingMore,setLoadingMore]=useState(false),[error,setError]=useState(''),[status,setStatus]=useState<'online'|'connecting'|'offline'>('offline'),[pageNumber,setPageNumber]=useState(1);
  const current=useRef({viewerId,checking,enabled,publishPresence}),onError=useRef(onAuthError),page=useRef<ChatPresencePage|null>(null),generation=useRef(0),rosterController=useRef<AbortController|null>(null),inFlight=useRef<Promise<boolean>|null>(null),ready=useRef<Promise<unknown>|null>(null),refreshRef=useRef<()=>Promise<boolean>>(async()=>false),pageCursors=useRef<Array<string|null>>([null]),pageIndex=useRef(0),dataViewer=useRef<string|null|undefined>(undefined);
  current.current={viewerId,checking,enabled,publishPresence};onError.current=onAuthError;page.current=data;

  const fetchPage=useCallback(async(direction:'refresh'|'next'|'previous'='refresh'):Promise<boolean>=>{
    if(current.current.checking||!current.current.enabled)return false;
    if(inFlight.current)return inFlight.current;
    const moving=direction!=='refresh',identity=current.current.viewerId,version=generation.current;
    const target=direction==='next'?pageIndex.current+1:direction==='previous'?Math.max(0,pageIndex.current-1):pageIndex.current;
    const cursor=direction==='next'?page.current?.nextCursor:pageCursors.current[target];
    if(direction==='next'&&!cursor)return false;
    const controller=new AbortController();rosterController.current=controller;
    const run=async()=>{
      if(moving)setLoadingMore(true);else setLoading(true);
      try{
        await ready.current;
        if(controller.signal.aborted||generation.current!==version||current.current.viewerId!==identity||current.current.checking)return false;
        const result=await chatRequest<ChatPresencePage>('/presence?limit=50'+(cursor?'&cursor='+encodeURIComponent(cursor):''),{signal:controller.signal});
        if(controller.signal.aborted||generation.current!==version||current.current.viewerId!==identity)return false;
        if(direction==='next')pageCursors.current=[...pageCursors.current.slice(0,target),cursor!];
        pageIndex.current=target;setPageNumber(target+1);dataViewer.current=identity;page.current=result;setData(result);
        setError('');return true;
      }catch(error){
        if(!aborted(error)&&generation.current===version&&!controller.signal.aborted){setError((error as Error).message||'Members could not be refreshed.');if(error instanceof ChatApiError&&error.status===401)onError.current(error);}
        return false;
      }finally{if(generation.current===version){setLoading(false);setLoadingMore(false);inFlight.current=null;if(rosterController.current===controller)rosterController.current=null;}}
    };
    const promise=run();inFlight.current=promise;return promise;
  },[]);
  const refresh=useCallback((force=false)=>{if(force){generation.current++;rosterController.current?.abort();rosterController.current=null;inFlight.current=null;}return fetchPage('refresh');},[fetchPage]);
  const loadMore=useCallback(()=>fetchPage('next'),[fetchPage]);
  const previous=useCallback(()=>fetchPage('previous'),[fetchPage]);
  refreshRef.current=refresh;

  useEffect(()=>{
    generation.current++;rosterController.current?.abort();rosterController.current=null;inFlight.current=null;ready.current=null;pageCursors.current=[null];pageIndex.current=0;dataViewer.current=undefined;page.current=null;setPageNumber(1);setData(null);setError('');setLoading(false);setLoadingMore(false);
    if(checking||!viewerId||!publishPresence){setStatus('offline');return;}
    const clientId=crypto.randomUUID(),identity=viewerId;let stopped=false,running=false,sequence=0,lastAttempt=0,expires=0,failures=0,timer:ReturnType<typeof setTimeout>|undefined,expiryTimer:ReturnType<typeof setTimeout>|undefined,controller:AbortController|null=null;
    const stillCurrent=()=>!stopped&&!current.current.checking&&current.current.viewerId===identity;
    const leave=()=>{
      clearTimeout(timer);clearTimeout(expiryTimer);controller?.abort();if(!stopped)setStatus('offline');expires=0;
      const body=JSON.stringify({clientId,sequence:++sequence});
      void fetch('/api/chat/presence',{method:'DELETE',credentials:'same-origin',cache:'no-store',keepalive:true,headers:{'X-Kkeep-Profile':'1','Content-Type':'application/json'},body}).catch(()=>{});
    };
    const heartbeat=async()=>{
      if(!stillCurrent()||running||document.hidden)return;
      const wait=5000-(Date.now()-lastAttempt);if(wait>0){clearTimeout(timer);timer=setTimeout(()=>void heartbeat(),wait);return;}
      running=true;lastAttempt=Date.now();controller=new AbortController();if(!expires)setStatus('connecting');
      try{
        const result=await chatRequest<Lease>('/presence',{method:'PUT',body:{clientId,sequence:++sequence},signal:controller.signal});
        if(!stillCurrent()||controller.signal.aborted||document.hidden)return;
        failures=0;expires=result.online&&result.expiresAt?Date.now()+Math.max(0,result.expiresAt-result.serverNow):0;setStatus(expires?'online':'offline');clearTimeout(expiryTimer);
        if(expires)expiryTimer=setTimeout(()=>{if(stillCurrent())setStatus('offline');},Math.max(0,expires-Date.now()));
      }catch(error){
        if(!aborted(error)&&stillCurrent()){failures++;if(expires<Date.now())setStatus('offline');if(error instanceof ChatApiError&&error.status===401)onError.current(error);}
      }finally{running=false;if(stillCurrent()&&!document.hidden)timer=setTimeout(()=>void heartbeat(),Math.min(120000,30000*2**Math.min(failures,2)));}
    };
    const first=heartbeat();ready.current=first;
    const visible=()=>{
      if(document.hidden){leave();return;}
      clearTimeout(timer);const attempt=heartbeat();ready.current=attempt;void attempt.then(()=>{if(stillCurrent()&&current.current.enabled)void refreshRef.current();});
    };
    const focus=()=>{if(!document.hidden&&Date.now()-lastAttempt>=30000)visible();};
    const pagehide=()=>leave();
    document.addEventListener('visibilitychange',visible);window.addEventListener('focus',focus);window.addEventListener('pagehide',pagehide);
    return()=>{stopped=true;leave();document.removeEventListener('visibilitychange',visible);window.removeEventListener('focus',focus);window.removeEventListener('pagehide',pagehide);};
  },[viewerId,checking,publishPresence]);

  useEffect(()=>{
    if(checking||!enabled){rosterController.current?.abort();return;}
    void refresh();
  },[viewerId,checking,enabled,refresh]);
  useEffect(()=>()=>{generation.current++;rosterController.current?.abort();},[]);
  return {data:!checking&&dataViewer.current===viewerId?data:null,loading,loadingMore,error,status,refresh,loadMore,previous,pageNumber};
}
