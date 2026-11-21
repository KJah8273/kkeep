'use client';

import {useEffect,useId,useRef,useState} from 'react';
import {Check,Clock3,LoaderCircle} from 'lucide-react';
import {Dialog,DialogContent,DialogDescription,DialogHeader,DialogTitle} from './ui/dialog';
import {chatRequest,ChatApiError} from '@/lib/chat-client';
import type {ChatPoll} from '@/lib/chat-model';

const ballotKey=(ids:string[])=>[...ids].sort().join('|');
const aborted=(error:unknown)=>(error as Error)?.name==='AbortError';
function remainingTime(remaining:number){
  const seconds=Math.max(0,Math.ceil(remaining/1000));
  if(seconds<60)return seconds+'s left';
  const minutes=Math.ceil(seconds/60);if(minutes<60)return minutes+'m left';
  const hours=Math.floor(minutes/60),rest=minutes%60;if(hours<24)return hours+'h'+(rest?' '+rest+'m':'')+' left';
  const days=Math.floor(hours/24);return days+'d'+(hours%24?' '+hours%24+'h':'')+' left';
}

export default function ChatPollCard({poll,viewerId,joinLabel,disabledReason,allowClose,onJoin,onUpdate,onAuthError}:{poll:ChatPoll;viewerId:string|null;joinLabel:string;disabledReason?:string;allowClose:boolean;onJoin:()=>void;onUpdate:(poll:ChatPoll)=>void;onAuthError:(error:unknown)=>void}){
  const [selected,setSelected]=useState<string[]>(poll.viewerOptionIds),[error,setError]=useState(''),[busy,setBusy]=useState(''),[closeOpen,setCloseOpen]=useState(false),[now,setNow]=useState(poll.serverNow),[refreshing,setRefreshing]=useState(false);
  const radioName=useId(),alive=useRef(true),identity=useRef(viewerId),operation=useRef<AbortController|null>(null),expiryOperation=useRef<AbortController|null>(null),expiryRequested=useRef(false),busyRef=useRef(false),previousBallot=useRef(ballotKey(poll.viewerOptionIds)),accessKey=useRef(String(allowClose)+'|'+(disabledReason||'')),latest=useRef({onUpdate,onAuthError,poll});
  identity.current=viewerId;latest.current={onUpdate,onAuthError,poll};
  const savedBallot=ballotKey(poll.viewerOptionIds),closed=poll.closed||poll.closedAt!==null||now>=poll.closesAt;
  const changed=ballotKey(selected)!==savedBallot,canVote=!!viewerId&&poll.canVote&&!closed&&!disabledReason;
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;operation.current?.abort();expiryOperation.current?.abort();};},[]);
  useEffect(()=>{operation.current?.abort();expiryOperation.current?.abort();busyRef.current=false;setBusy('');setError('');setCloseOpen(false);setRefreshing(false);setSelected(poll.viewerOptionIds);previousBallot.current=ballotKey(poll.viewerOptionIds);expiryRequested.current=false;},[viewerId,poll.messageId]);
  useEffect(()=>{const previous=previousBallot.current;setSelected(current=>ballotKey(current)===previous?[...poll.viewerOptionIds]:current);previousBallot.current=savedBallot;},[savedBallot]);
  async function refreshResults(){
    expiryOperation.current?.abort();const controller=new AbortController(),viewer=identity.current;expiryOperation.current=controller;setRefreshing(true);setError('');
    const current=()=>alive.current&&!controller.signal.aborted&&identity.current===viewer&&expiryOperation.current===controller;
    try{const result=await chatRequest<{poll:ChatPoll}>('/polls/'+poll.messageId,{signal:controller.signal});if(current())latest.current.onUpdate(result.poll);}
    catch(error){if(!aborted(error)&&current()){setError('Poll results could not be refreshed. Please try again.');if(error instanceof ChatApiError&&error.status===401)latest.current.onAuthError(error);}}
    finally{if(current())setRefreshing(false);}
  }
  useEffect(()=>{const key=String(allowClose)+'|'+(disabledReason||'');if(key!==accessKey.current){accessKey.current=key;void refreshResults();}},[allowClose,disabledReason]);
  useEffect(()=>{
    const start=performance.now(),server=poll.serverNow;let stopped=false,timer:ReturnType<typeof setTimeout>|undefined;
    const tick=()=>{
      clearTimeout(timer);if(stopped||document.hidden)return;const value=server+performance.now()-start;setNow(value);
      if(poll.closed||poll.closedAt!==null)return;
      const remaining=poll.closesAt-value;
      if(remaining<=0){if(!expiryRequested.current){expiryRequested.current=true;void refreshResults();}return;}
      timer=setTimeout(tick,Math.min(remaining,remaining<60000?1000:30000));
    };
    tick();document.addEventListener('visibilitychange',tick);return()=>{stopped=true;clearTimeout(timer);document.removeEventListener('visibilitychange',tick);};
  },[poll.messageId,poll.serverNow,poll.closesAt,poll.closed,poll.closedAt]);
  useEffect(()=>{if(closed){setSelected(latest.current.poll.viewerOptionIds);setCloseOpen(false);}},[closed]);

  async function perform(action:'vote'|'close',optionIds:string[]=[]){
    if(busyRef.current)return;busyRef.current=true;setBusy(action);setError('');operation.current?.abort();const controller=new AbortController(),viewer=identity.current;operation.current=controller;
    const current=()=>alive.current&&!controller.signal.aborted&&identity.current===viewer&&operation.current===controller;
    try{
      const result=await chatRequest<{poll:ChatPoll}>('/polls/'+poll.messageId+(action==='vote'?'/vote':'/close'),{method:action==='vote'?'PUT':'POST',body:action==='vote'?{optionIds}:{},signal:controller.signal});
      if(!current())return;setSelected(result.poll.viewerOptionIds);previousBallot.current=ballotKey(result.poll.viewerOptionIds);latest.current.onUpdate(result.poll);setCloseOpen(false);
    }catch(error){
      if(!current()||aborted(error))return;setError((error as Error).message||'Your vote could not be saved. Please try again.');
      if(error instanceof ChatApiError){
        if(error.status===401||['chat_banned','chat_timeout','permission_changed','permission_required'].includes(error.code))latest.current.onAuthError(error);
        if(error.status===403||error.status===409)try{const result=await chatRequest<{poll:ChatPoll}>('/polls/'+poll.messageId,{signal:controller.signal});if(current())latest.current.onUpdate(result.poll);}catch{/* The original action error remains visible. */}
      }
    }finally{if(current()){busyRef.current=false;setBusy('');}}
  }
  function choose(id:string,checked:boolean){if(!canVote||busyRef.current)return;setSelected(current=>poll.allowMultiple?checked?[...current.filter(value=>value!==id),id]:current.filter(value=>value!==id):[id]);setError('');}
  const total=poll.allowMultiple?poll.totalVoters.toLocaleString()+' '+(poll.totalVoters===1?'voter':'voters')+' · '+poll.totalVotes.toLocaleString()+' '+(poll.totalVotes===1?'vote':'votes'):poll.totalVotes.toLocaleString()+' '+(poll.totalVotes===1?'vote':'votes');
  return <div className={'chat-poll-card '+(closed?'is-closed':'')}>
    <div className="chat-poll-heading"><h3 dir="auto">{poll.question}</h3>{poll.canClose&&allowClose&&!disabledReason&&!closed&&<button className="chat-text-button" onClick={()=>setCloseOpen(true)} disabled={!!busy} aria-label="Close poll early">Close poll</button>}</div>
    {!closed&&<p className="chat-poll-choice-hint">{poll.allowMultiple?'Choose one or more answers.':'Choose one answer.'}</p>}
    <fieldset className="chat-poll-options" disabled={!canVote||!!busy}><legend className="sr-only">{poll.question}</legend>{poll.options.map(option=>{const chosen=selected.includes(option.id),voted=poll.viewerOptionIds.includes(option.id);return <label key={option.id} className={'chat-poll-option '+(voted?'is-voted ':'')+(chosen?'is-chosen':'')}><input className="sr-only" type={poll.allowMultiple?'checkbox':'radio'} name={radioName} value={option.id} checked={closed?voted:chosen} onChange={event=>choose(option.id,event.target.checked)}/><span className="chat-poll-bar" style={{width:Math.max(0,Math.min(100,option.percentage))+'%'}} aria-hidden="true"/><span className="chat-poll-option-label" dir="auto">{option.label}</span><span className="chat-poll-result"><span className="chat-poll-vote-count">{option.votes.toLocaleString()} {option.votes===1?'vote':'votes'}</span><strong>{Math.round(option.percentage)}%</strong><span className={'chat-poll-selection '+(voted?'is-saved':'')} aria-hidden="true">{(voted||chosen)&&<Check size={13}/>}</span></span></label>;})}</fieldset>
    <div className="chat-poll-footer"><strong>{total}</strong><span aria-hidden="true">·</span><time dateTime={new Date(closed?(poll.closedAt??poll.closesAt):poll.closesAt).toISOString()} title={(closed?'Closed ':'Closes ')+new Date(closed?(poll.closedAt??poll.closesAt):poll.closesAt).toLocaleString()}>{closed?'Poll closed':remainingTime(poll.closesAt-now)}</time></div>
    {poll.allowMultiple&&<p className="chat-poll-percent-note">Percentages are based on voters, so they may add up to more than 100%.</p>}
    {!closed&&<div className="chat-poll-actions">{!viewerId?<button className="chat-button chat-primary" onClick={onJoin}>{joinLabel}</button>:disabledReason?<p>{disabledReason}</p>:poll.canVote?<><button className="chat-button chat-primary" disabled={!!busy||!selected.length||!changed} onClick={()=>void perform('vote',selected)}>{busy==='vote'&&<LoaderCircle className="spin" size={14}/>} {savedBallot?changed?'Update vote':'Voted':'Vote'}</button>{!!savedBallot&&<button className="chat-text-button" disabled={!!busy} onClick={()=>void perform('vote',[])}>Remove vote</button>}</>:<p>Voting is unavailable for this poll.</p>}</div>}
    {error&&<p className="chat-poll-error" role="alert">{error}</p>}{closed&&(error||refreshing)&&<button className="chat-text-button chat-poll-refresh" disabled={refreshing} onClick={()=>void refreshResults()}>{refreshing&&<LoaderCircle className="spin" size={13}/>} {refreshing?'Refreshing results…':'Refresh results'}</button>}
    <Dialog open={closeOpen} onOpenChange={next=>{if(!busy)setCloseOpen(next);}}><DialogContent className="chat-dialog"><DialogHeader><DialogTitle>Close this poll?</DialogTitle><DialogDescription>Voting will end immediately. Everyone can still see the final results.</DialogDescription></DialogHeader><p className="chat-poll-close-question" dir="auto">{poll.question}</p>{error&&<p className="chat-error" role="alert">{error}</p>}<div className="chat-dialog-actions"><button className="chat-button" disabled={!!busy} onClick={()=>setCloseOpen(false)}>Keep voting open</button><button className="chat-button chat-primary" disabled={!!busy||closed||!poll.canClose||!allowClose||!!disabledReason} onClick={()=>void perform('close')}>{busy==='close'?<LoaderCircle className="spin" size={15}/>:<Clock3 size={15}/>}Close poll</button></div></DialogContent></Dialog>
  </div>;
}
