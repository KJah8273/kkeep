'use client';
import {useEffect,useState} from 'react';
import {Button} from '@/components/ui/button';

export default function IdeasForm({title='Suggest an idea'}:{title?:string}){
 const [attempt,setAttempt]=useState(0),[loaded,setLoaded]=useState(false),[slow,setSlow]=useState(false);
 useEffect(()=>{if(loaded)return;const timer=setTimeout(()=>setSlow(true),15000);return()=>clearTimeout(timer);},[attempt,loaded]);
 return <section className="ideas-form" aria-labelledby="ideas-heading">
  <h3 id="ideas-heading">{title}</h3>
  <p>Report a problem or share an idea.</p>
  {!loaded&&<p role="status">Loading the ideas form…</p>}
  <iframe key={attempt} className="ideas-embed" title="Kkeep feedback form" src="https://forms.fillout.com/t/cm1NgrsnB5us" sandbox="allow-scripts allow-same-origin allow-forms allow-popups" referrerPolicy="strict-origin-when-cross-origin" onLoad={()=>{setLoaded(true);setSlow(false);}} onError={()=>setSlow(true)}/>
  {slow&&<p>If the form is blank, reload it below. Your page will stay open.</p>}
  <Button type="button" variant="secondary" onClick={()=>{setLoaded(false);setSlow(false);setAttempt(n=>n+1);}}>Reload form</Button>
 </section>;
}
