'use client';
import AccountAvatar from './account-avatar';
import ProfileSocial from './profile-social';
import {useEffect,useRef,useState,type FormEvent} from 'react';
import {CloudCheck,CloudOff,RotateCw,LoaderCircle,LogOut} from 'lucide-react';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {Button} from '@/components/ui/button';
import {syncSelectedMedia} from '@/lib/profile-media-client';
import {snapshot,type ProfileSnapshot} from '@/lib/profile-model';
const api=async(input?:unknown)=>{const r=await fetch('/api/profile',{method:input?'POST':'GET',headers:{'X-Kkeep-Profile':'1',...(input?{'Content-Type':'application/json'}:{})},body:input?JSON.stringify(input):undefined,credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(20000)});const d=await r.json();if(!r.ok)throw Error(d.error||'Profile is unavailable.');return d;};
export default function ProfilePanel({open,onOpenChange,data,onRestore,ready}:{open:boolean;onOpenChange:(open:boolean)=>void;data:ProfileSnapshot;onRestore:(v:ProfileSnapshot)=>void;ready:boolean}){
 const [name,setName]=useState(''),[mode,setMode]=useState<'login'|'signup'>('login'),[error,setError]=useState(''),[busy,setBusy]=useState(false),[sync,setSync]=useState<'off'|'busy'|'saved'|'error'>('off');
 const gate=useRef(false),revision=useRef(0),saved=useRef(''),pending=useRef<ProfileSnapshot|null>(null),working=useRef(false),latest=useRef(data),restore=useRef(onRestore),alive=useRef(true);latest.current=data;restore.current=onRestore;
 async function connect(requireAccount=false){
  gate.current=false;const result=await api();if(!alive.current)return;
  setName(result.account?.name||'');revision.current=result.revision||0;
  if(!result.account){setSync('off');if(requireAccount)throw Error('Login cookie could not be saved. Allow website cookies and try again.');return;}
  if(result.data){const valid=snapshot(result.data);await syncSelectedMedia(valid.preferences.wallpaper,'download');saved.current=JSON.stringify(valid);restore.current(valid);latest.current=valid;}
  else saved.current='';
  gate.current=true;setSync('saved');window.dispatchEvent(new Event('kkeep-profile-change'));
  // Existing Hgola backups are adopted server-side without replacing newer saves.
  void fetch('/api/hgola-save',{headers:{'X-Kkeep-Hgola':'1'},cache:'no-store'}).catch(()=>{});
  if(!result.data)void persist(latest.current);
 }
 async function persist(next:ProfileSnapshot){
  if(!gate.current)return;pending.current=next;if(working.current)return;working.current=true;
  try{while(pending.current&&gate.current){const value=pending.current;pending.current=null;const json=JSON.stringify(value);if(json===saved.current)continue;setSync('busy');if(value.preferences.wallpaper!==JSON.parse(saved.current||'{}').preferences?.wallpaper)await syncSelectedMedia(value.preferences.wallpaper,'upload');const result=await api({action:'save',revision:revision.current,data:value});revision.current=result.revision;saved.current=json;setSync('saved');}}
  catch(e){gate.current=false;setSync('error');setError((e as Error).message);}
  finally{working.current=false;}
 }
 useEffect(()=>{alive.current=true;if(ready)void connect().catch(()=>{if(alive.current)setSync('off');});return()=>{alive.current=false;gate.current=false;};},[ready]);
 useEffect(()=>{if(!ready||!gate.current)return;const timer=setTimeout(()=>void persist(data),700);return()=>clearTimeout(timer);},[data,ready,name]);
 async function submit(e:FormEvent<HTMLFormElement>){e.preventDefault();const fields=new FormData(e.currentTarget);setBusy(true);setError('');try{await api({action:mode,username:fields.get('username'),password:fields.get('password')});await connect(true);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 async function logout(){setBusy(true);try{await persist(latest.current);await api({action:'logout'});gate.current=false;setName('');setSync('off');window.dispatchEvent(new Event('kkeep-profile-change'));}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="proxy-dialog profile-dialog"><DialogHeader className="sr-only"><DialogTitle>Profile</DialogTitle><DialogDescription>Sign up or log in to restore your Kkeep profile.</DialogDescription></DialogHeader>
 <div className="profile-avatar"><AccountAvatar size={72}/></div>
 {name?<><strong className="profile-name">{name}</strong><span role="status" aria-label={sync==='saved'?'Profile saved':sync==='busy'?'Saving profile':'Sync needs attention'}>{sync==='busy'?<LoaderCircle className="spin"/>:sync==='error'?<CloudOff/>:<CloudCheck/>}</span><Button variant="secondary" disabled={busy||sync==='busy'} onClick={logout}><LogOut size={18}/>Log out</Button></>:<><div className="profile-tabs"><button type="button" aria-pressed={mode==='signup'} onClick={()=>{setMode('signup');setError('');}}>Sign up</button><button type="button" aria-pressed={mode==='login'} onClick={()=>{setMode('login');setError('');}}>Log in</button></div><form className="profile-form" onSubmit={submit}>
 <input name="username" aria-label="Username" placeholder="Username" required minLength={3} maxLength={24} autoComplete="username" autoCapitalize="none" spellCheck={false}/>
 <input name="password" type="password" aria-label="Password" placeholder="Password" required minLength={10} maxLength={72} autoComplete={mode==='signup'?'new-password':'current-password'}/>
 <Button type="submit" disabled={busy}>{busy?<LoaderCircle className="spin" aria-label="Please wait"/>:mode==='signup'?'Sign up':'Log in'}</Button></form></>}
 {open&&name&&<ProfileSocial/>}
 {error&&<p role="alert">{error}</p>}{name&&sync==='error'&&<Button variant="secondary" aria-label="Restore saved profile" onClick={()=>{setError('');void connect(true).catch(e=>setError(e.message));}}><RotateCw size={18}/></Button>}
 </DialogContent></Dialog>;
}
