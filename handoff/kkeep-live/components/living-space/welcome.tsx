'use client';
import {useEffect,useRef,useState} from 'react';
import {X} from 'lucide-react';
import {createWelcomeGate,WELCOME} from '@/lib/living-space/model';
// A module belongs to this document, not a route, tab, or persisted account.
const launch=createWelcomeGate();
export default function Welcome({preview=0,reserved=false}:{preview?:number;reserved?:boolean}){
 const [visible,setVisible]=useState(false);
 const claimed=useRef(false);
 useEffect(()=>{if(!preview&&!claimed.current&&!launch.claim())return;claimed.current=true;setVisible(true);const timer=setTimeout(()=>setVisible(false),3100);return()=>clearTimeout(timer);},[preview]);
 if(!visible)return null;
 return <aside className={'living-welcome'+(reserved?' reserved':'')} aria-label="Welcome"><span className="welcome-light" aria-hidden="true"/><span role="status">{WELCOME}</span><button type="button" onClick={()=>setVisible(false)} aria-label="Dismiss welcome"><X size={16}/></button></aside>;
}
