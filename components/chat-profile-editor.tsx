'use client';

import {useEffect,useRef,useState,type ChangeEvent,type FormEvent} from 'react';
import {Check,LoaderCircle,Pencil,RotateCcw,Trash2,Upload} from 'lucide-react';
import {Dialog,DialogContent,DialogDescription,DialogHeader,DialogTitle} from '@/components/ui/dialog';
import ChatProfileCard from './chat-profile-card';
import ChatAvatar from './chat-avatar';
import {AVATAR_DECORATIONS,NAMEPLATE_STYLES,PROFILE_FRAMES,ChatNameplateArt,ChatProfileFrameArt,ChatRoleBadges} from './chat-appearance';
import {username as parseUsername} from '@/lib/profile-model';
import {chatRequest,ChatApiError,announceChatProfile,announceChatAccountRename,renameChatAccount,normalizeChatColor,prepareChatMedia} from '@/lib/chat-client';
import {CHAT_BIO_MAX,type ChatProfile} from '@/lib/chat-model';
import '@/app/chat.css';

type ProfileDraft=Pick<ChatProfile,'displayName'|'bio'|'nameColor'|'primaryColor'|'secondaryColor'|'username'|'avatarDecoration'|'nameplateStyle'|'profileFrame'>;
type MediaDraft={action:'replace';blob:Blob;url:string;name:string}|{action:'remove'}|null;
type MediaKind='avatar'|'banner';
type ThemeKey='primaryColor'|'secondaryColor';
const palette=['#1e2c40','#000000','#28282b','#482323','#4b3016','#403711','#193b29','#143a34','#123542','#142d50','#292657','#3c2852','#50264f','#52243c','#561f2e'];
const validColor=(color:string)=>/^#[0-9a-f]{6}$/i.test(color);
const makeDraft=(profile:ChatProfile):ProfileDraft=>({displayName:profile.displayName,bio:profile.bio,nameColor:normalizeChatColor(profile.nameColor),primaryColor:normalizeChatColor(profile.primaryColor,'#181b22'),secondaryColor:normalizeChatColor(profile.secondaryColor,'#121212'),username:profile.username||profile.name,avatarDecoration:profile.avatarDecoration||'none',nameplateStyle:profile.nameplateStyle||'none',profileFrame:profile.profileFrame||'none'});
const fieldsChanged=(draft:ProfileDraft,profile:ChatProfile)=>{const saved=makeDraft(profile);return draft.displayName.trim()!==saved.displayName||draft.bio.trim()!==saved.bio||draft.nameColor.toLowerCase()!==saved.nameColor||draft.primaryColor.toLowerCase()!==saved.primaryColor||draft.secondaryColor.toLowerCase()!==saved.secondaryColor||draft.avatarDecoration!==saved.avatarDecoration||draft.nameplateStyle!==saved.nameplateStyle||draft.profileFrame!==saved.profileFrame;};

export default function ChatProfileEditor({open,onOpenChange,profile,onSaved}:{open:boolean;onOpenChange:(open:boolean)=>void;profile:ChatProfile;onSaved:(profile:ChatProfile)=>void}){
  const [draft,setDraft]=useState<ProfileDraft>(()=>makeDraft(profile));
  const [avatar,setAvatar]=useState<MediaDraft>(null),[banner,setBanner]=useState<MediaDraft>(null);
  const [error,setError]=useState(''),[busy,setBusy]=useState(false),[preparing,setPreparing]=useState<MediaKind|null>(null),[saveStep,setSaveStep]=useState(''),[saved,setSaved]=useState(false),[activeTheme,setActiveTheme]=useState<ThemeKey>('primaryColor');
  const [styleCategory,setStyleCategory]=useState<'avatar'|'nameplate'|'frame'>('avatar');
  const container=useRef<HTMLDivElement>(null),avatarInput=useRef<HTMLInputElement>(null),bannerInput=useRef<HTMLInputElement>(null),primaryInput=useRef<HTMLInputElement>(null),secondaryInput=useRef<HTMLInputElement>(null);
  const active=useRef(true),isOpen=useRef(open),currentIdentity=useRef(profile.id),latestProfile=useRef(profile),operation=useRef<AbortController|null>(null),mediaSequence=useRef({avatar:0,banner:0});
  isOpen.current=open;currentIdentity.current=profile.id;latestProfile.current=profile;

  useEffect(()=>{active.current=true;return()=>{active.current=false;operation.current?.abort();mediaSequence.current.avatar++;mediaSequence.current.banner++;};},[]);
  useEffect(()=>{
    operation.current?.abort();mediaSequence.current.avatar++;mediaSequence.current.banner++;
    setAvatar(null);setBanner(null);setError('');setBusy(false);setPreparing(null);setSaveStep('');setSaved(false);
    if(open){setDraft(makeDraft(latestProfile.current));setActiveTheme('primaryColor');setStyleCategory('avatar');}
    return()=>{operation.current?.abort();mediaSequence.current.avatar++;mediaSequence.current.banner++;};
  },[open,profile.id]);
  useEffect(()=>{if(!open)return;const viewport=window.visualViewport;if(!viewport)return;const update=()=>{container.current?.style.setProperty('--profile-editor-height',viewport.height+'px');container.current?.style.setProperty('--profile-editor-top',viewport.offsetTop+viewport.height/2+'px');};update();viewport.addEventListener('resize',update,{passive:true});viewport.addEventListener('scroll',update,{passive:true});return()=>{viewport.removeEventListener('resize',update);viewport.removeEventListener('scroll',update);};},[open]);
  useEffect(()=>()=>{if(avatar?.action==='replace')URL.revokeObjectURL(avatar.url);},[avatar]);
  useEffect(()=>()=>{if(banner?.action==='replace')URL.revokeObjectURL(banner.url);},[banner]);

  const locked=busy||preparing!==null;
  let usernameKey='',usernameError='';try{usernameKey=parseUsername(draft.username).key;if(usernameKey.length<3)usernameError='Use at least 3 letters or numbers.';}catch(error){usernameError=(error as Error).message;}
  const usernameChanged=usernameKey!==(profile.username||profile.name);
  const dirty=fieldsChanged(draft,profile)||usernameChanged||avatar!==null||banner!==null;
  const colorsValid=validColor(draft.nameColor)&&validColor(draft.primaryColor)&&validColor(draft.secondaryColor);
  const avatarUrl=avatar?.action==='replace'?avatar.url:avatar?.action==='remove'?null:profile.avatarUrl;
  const bannerUrl=banner?.action==='replace'?banner.url:banner?.action==='remove'?null:profile.bannerUrl;
  const preview:ChatProfile={...profile,...draft,displayName:draft.displayName.trim()||'Your name',username:usernameKey||profile.username,name:usernameKey||profile.name,avatarUrl,bannerUrl};
  const update=<K extends keyof ProfileDraft,>(key:K,value:ProfileDraft[K])=>{setDraft(current=>({...current,[key]:value}));setSaved(false);};
  const currentOperation=(controller:AbortController,id:string)=>active.current&&isOpen.current&&!controller.signal.aborted&&operation.current===controller&&currentIdentity.current===id;

  function reset(){
    setDraft(makeDraft(latestProfile.current));setAvatar(null);setBanner(null);setError('');setSaved(false);
  }
  async function chooseMedia(event:ChangeEvent<HTMLInputElement>,kind:MediaKind){
    const file=event.target.files?.[0];event.target.value='';if(!file)return;
    const sequence=++mediaSequence.current[kind],identity=currentIdentity.current;
    const current=()=>active.current&&isOpen.current&&currentIdentity.current===identity&&mediaSequence.current[kind]===sequence;
    setPreparing(kind);setError('');setSaved(false);
    try{
      const blob=await prepareChatMedia(file,kind);if(!current())return;
      const value:MediaDraft={action:'replace',blob,url:URL.createObjectURL(blob),name:file.name};
      if(kind==='avatar')setAvatar(value);else setBanner(value);
    }catch(error){if(current())setError((error as Error).message);}
    finally{if(current())setPreparing(null);}
  }
  function removeMedia(kind:MediaKind){
    if(kind==='avatar')setAvatar(profile.avatarUrl?{action:'remove'}:null);else setBanner(profile.bannerUrl?{action:'remove'}:null);
    setError('');setSaved(false);
  }
  async function save(event:FormEvent){
    event.preventDefault();if(locked||!dirty||!draft.displayName.trim()||!colorsValid||usernameError)return;
    operation.current?.abort();const controller=new AbortController();operation.current=controller;
    const identity=currentIdentity.current,submitted={...draft};let latest=latestProfile.current,completed=0;
    setBusy(true);setError('');setSaved(false);
    const apply=(value:ChatProfile)=>{
      if(!currentOperation(controller,identity))throw new DOMException('Profile editor closed','AbortError');
      if(value.id!==identity)throw new Error('Your account changed. Reopen your profile and try again.');
      latest=value;latestProfile.current=value;onSaved(value);announceChatProfile(value);completed++;
    };
    try{
      for(const [kind,media] of [['avatar',avatar],['banner',banner]] as const){
        if(!media)continue;setSaveStep(media.action==='remove'?'Removing '+kind+'…':'Saving '+kind+'…');
        const result=await chatRequest<{profile:ChatProfile}>('/'+kind,{method:media.action==='remove'?'DELETE':'PUT',...(media.action==='replace'?{body:media.blob}:{}),signal:controller.signal});
        apply(result.profile);if(kind==='avatar')setAvatar(null);else setBanner(null);
      }
      if(fieldsChanged(submitted,latest)){
        setSaveStep('Saving profile…');
        const result=await chatRequest<{profile:ChatProfile}>('/profile',{method:'PATCH',body:{displayName:submitted.displayName.trim(),bio:submitted.bio.trim(),nameColor:submitted.nameColor,primaryColor:submitted.primaryColor,secondaryColor:submitted.secondaryColor,avatarDecoration:submitted.avatarDecoration,nameplateStyle:submitted.nameplateStyle,profileFrame:submitted.profileFrame},signal:controller.signal});
        apply(result.profile);
      }
      let renamed:{id:string;name:string;username:string}|null=null;
      if(parseUsername(submitted.username).key!==(latest.username||latest.name)){
        setSaveStep('Saving username…');const result=await renameChatAccount(submitted.username,controller.signal);
        if(!currentOperation(controller,identity))return;if(result.account.id!==identity)throw new Error('Your account changed. Reopen your profile and try again.');
        renamed=result.account;apply({...latest,name:renamed.username,username:renamed.username});
      }
      if(currentOperation(controller,identity)){setDraft(makeDraft(latest));setSaved(true);if(renamed)announceChatAccountRename(renamed);}
    }catch(error){
      if(!currentOperation(controller,identity))return;
      if(error instanceof ChatApiError&&error.status===401){onOpenChange(false);window.dispatchEvent(new Event('kkeep-profile-change'));}
      else setError((completed?'Some changes were saved. Your remaining edits are still here. ':'')+(error as Error).message);
    }finally{if(active.current&&operation.current===controller){setBusy(false);setSaveStep('');}}
  }
  function openThemePicker(key:ThemeKey){setActiveTheme(key);(key==='primaryColor'?primaryInput:secondaryInput).current?.click();}

  return <Dialog open={open} onOpenChange={next=>{if(!locked)onOpenChange(next);}}>
    <DialogContent ref={container} className="chat-dialog chat-profile-editor">
      <DialogHeader className="chat-profile-editor-heading"><DialogTitle>Your profile</DialogTitle><DialogDescription>Make your Kkeep profile feel like you.</DialogDescription></DialogHeader>
      <form onSubmit={save} className="chat-profile-editor-form">
        <div className="chat-profile-layout">
          <div className="chat-profile-fields">
            <section className="chat-profile-section">
              <label className="chat-profile-field" htmlFor="kkeep-profile-name"><span>Display name <small>{Array.from(draft.displayName).length}/32</small></span><input id="kkeep-profile-name" value={draft.displayName} onChange={event=>update('displayName',event.target.value)} minLength={1} maxLength={32} required disabled={locked} autoComplete="nickname" dir="auto"/></label>
              <div className="chat-name-color-row"><label htmlFor="kkeep-name-color">Name color</label><div className="chat-name-color-input"><input type="color" aria-label="Pick name color" value={normalizeChatColor(draft.nameColor)} onChange={event=>update('nameColor',event.target.value)} disabled={locked}/><input id="kkeep-name-color" value={draft.nameColor} onChange={event=>update('nameColor',event.target.value)} maxLength={7} pattern="#[0-9a-fA-F]{6}" aria-label="Name color hex code" spellCheck={false} autoCapitalize="off" disabled={locked}/></div></div>
              <p className="chat-profile-help">Your display name can be different from your username.</p>
            </section>
            <section className="chat-profile-section">
              <label className="chat-profile-field" htmlFor="kkeep-profile-username"><span>Username</span><div className="chat-username-field"><span>@</span><input id="kkeep-profile-username" value={draft.username} onChange={event=>update('username',event.target.value)} minLength={3} maxLength={24} required disabled={locked} autoComplete="username" autoCapitalize="none" spellCheck={false}/></div></label>
              <p className="chat-profile-help">Letters and numbers; spaces and punctuation are ignored. Use this username to sign in.</p>
              {draft.username!==(profile.username||profile.name)&&(usernameError?<p className="chat-error">{usernameError}</p>:<p className="chat-profile-help">Your username will be @{usernameKey}.</p>)}
            </section>
            <section className="chat-profile-section">
              <h3>Avatar</h3><p>JPG, PNG, WebP or GIF. Animated GIFs stay animated.</p><p className="chat-profile-help">Images up to 12 MB · GIFs up to 8 MB</p>
              <div className="chat-profile-media-actions"><button className="chat-button" type="button" onClick={()=>avatarInput.current?.click()} disabled={locked}>{preparing==='avatar'?<LoaderCircle size={15} className="spin"/>:<Upload size={15}/>} {avatarUrl?'Change avatar':'Upload avatar'}</button>{avatarUrl&&<button className="chat-text-button" type="button" onClick={()=>removeMedia('avatar')} disabled={locked}><Trash2 size={14}/>Remove avatar</button>}</div>
              {avatar?.action==='replace'&&<p className="chat-profile-file" title={avatar.name}>{avatar.name} <span>Ready to save</span></p>}{avatar?.action==='remove'&&<p className="chat-profile-help">Avatar will be removed when you save.</p>}
              <input ref={avatarInput} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="sr-only" aria-label="Choose avatar image or GIF" tabIndex={-1} onChange={event=>void chooseMedia(event,'avatar')} disabled={locked}/>
            </section>
            <section className="chat-profile-section chat-profile-style-section">
              <h3>Profile styles</h3><p>Small details that make your profile your own.</p>
              <div className="chat-style-switcher" role="group" aria-label="Style category"><button type="button" aria-pressed={styleCategory==='avatar'} onClick={()=>setStyleCategory('avatar')}>Avatar</button><button type="button" aria-pressed={styleCategory==='nameplate'} onClick={()=>setStyleCategory('nameplate')}>Nameplate</button><button type="button" aria-pressed={styleCategory==='frame'} onClick={()=>setStyleCategory('frame')}>Profile frame</button></div>
              {styleCategory==='avatar'&&<><p className="chat-style-description">A decoration that follows your avatar everywhere in Kkeep.</p><div className="chat-decoration-options" role="group" aria-label="Avatar decoration">{AVATAR_DECORATIONS.map(option=><button key={option.id} type="button" className={draft.avatarDecoration===option.id?'is-selected':''} aria-pressed={draft.avatarDecoration===option.id} disabled={locked} onClick={()=>update('avatarDecoration',option.id)}><ChatAvatar user={{...preview,avatarDecoration:option.id}} size={50}/><span>{option.name}</span>{draft.avatarDecoration===option.id&&<Check size={13}/>}</button>)}</div></>}
              {styleCategory==='nameplate'&&<><p className="chat-style-description">Atmosphere behind your name in chat, the member list, and friends.</p><div className="chat-nameplate-options" role="group" aria-label="Nameplate style">{NAMEPLATE_STYLES.map(option=><button key={option.id} type="button" className={'chat-nameplate-option '+(draft.nameplateStyle===option.id?'is-selected':'')} aria-pressed={draft.nameplateStyle===option.id} disabled={locked} onClick={()=>update('nameplateStyle',option.id)}><span className="chat-nameplate chat-nameplate-sample"><ChatNameplateArt kind={option.id}/><ChatAvatar user={preview} size={29}/><strong>{preview.displayName}</strong>{draft.nameplateStyle===option.id&&<Check size={15}/>}</span><span>{option.name}</span></button>)}</div></>}
              {styleCategory==='frame'&&<><p className="chat-style-description">A border for the full card people see when they open your profile.</p><div className="chat-frame-options" role="group" aria-label="Profile frame">{PROFILE_FRAMES.map(option=><button key={option.id} type="button" className={'chat-frame-option '+(draft.profileFrame===option.id?'is-selected':'')} aria-pressed={draft.profileFrame===option.id} disabled={locked} onClick={()=>update('profileFrame',option.id)}><span className="chat-frame-sample"><span className="chat-frame-sample-banner" style={{background:normalizeChatColor(preview.primaryColor,'#181b22')}}/><span className="chat-frame-sample-body"><ChatAvatar user={{...preview,avatarDecoration:'none'}} size={21}/><strong>{preview.displayName}</strong><span className="chat-frame-sample-line"/><span className="chat-frame-sample-line short"/><span className="chat-frame-sample-button"/></span><ChatProfileFrameArt kind={option.id}/></span><span>{option.name}</span>{draft.profileFrame===option.id&&<Check size={13}/>}</button>)}</div></>}
            </section>
            <section className="chat-profile-section">
              <h3>Banner</h3><p>Shows your primary color until you add one.</p>
              <div className="chat-profile-media-actions"><button className="chat-button" type="button" onClick={()=>bannerInput.current?.click()} disabled={locked}>{preparing==='banner'?<LoaderCircle size={15} className="spin"/>:<Upload size={15}/>}Change banner</button>{bannerUrl&&<button className="chat-text-button" type="button" onClick={()=>removeMedia('banner')} disabled={locked}>Remove banner</button>}</div>
              {banner?.action==='replace'&&<p className="chat-profile-file" title={banner.name}>{banner.name} <span>Ready to save</span></p>}{banner?.action==='remove'&&<p className="chat-profile-help">Banner will be removed when you save.</p>}
              <input ref={bannerInput} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="sr-only" aria-label="Choose banner image or GIF" tabIndex={-1} onChange={event=>void chooseMedia(event,'banner')} disabled={locked}/>
            </section>
            <section className="chat-profile-section">
              <h3>Profile theme</h3><p>Your card fades from the primary color to the secondary one.</p>
              <div className="chat-theme-stops">
                {(['primaryColor','secondaryColor'] as const).map(key=><div className="chat-theme-stop-wrap" key={key}><button className={'chat-theme-stop '+(activeTheme===key?'is-selected':'')} type="button" aria-pressed={activeTheme===key} aria-label={'Select '+(key==='primaryColor'?'primary':'secondary')+' theme color'} onClick={()=>setActiveTheme(key)} disabled={locked}><span style={{background:normalizeChatColor(draft[key],'#121212')}}/><strong>{key==='primaryColor'?'Primary':'Secondary'}</strong></button><button className="chat-theme-edit" type="button" aria-label={'Choose custom '+(key==='primaryColor'?'primary':'secondary')+' color'} onClick={()=>openThemePicker(key)} disabled={locked}><Pencil size={12}/></button></div>)}
                <span className="chat-theme-connector" style={{background:'linear-gradient(90deg,'+normalizeChatColor(draft.primaryColor,'#181b22')+','+normalizeChatColor(draft.secondaryColor,'#121212')+')'}} aria-hidden="true"/>
              </div>
              <div className="chat-theme-palette" role="group" aria-label={'Choose '+(activeTheme==='primaryColor'?'primary':'secondary')+' color'}>{palette.map(color=><button key={color} type="button" style={{background:color}} aria-label={'Use '+color} aria-pressed={draft[activeTheme].toLowerCase()===color} className={draft[activeTheme].toLowerCase()===color?'is-selected':''} onClick={()=>update(activeTheme,color)} disabled={locked}/>)}<button type="button" className="chat-theme-custom" aria-label="Choose a custom theme color" onClick={()=>openThemePicker(activeTheme)} disabled={locked}/></div>
              <input ref={primaryInput} type="color" value={normalizeChatColor(draft.primaryColor,'#181b22')} aria-label="Primary theme color" className="sr-only" tabIndex={-1} onChange={event=>update('primaryColor',event.target.value)} disabled={locked}/><input ref={secondaryInput} type="color" value={normalizeChatColor(draft.secondaryColor,'#121212')} aria-label="Secondary theme color" className="sr-only" tabIndex={-1} onChange={event=>update('secondaryColor',event.target.value)} disabled={locked}/>
            </section>
            <section className="chat-profile-section">
              <label className="chat-profile-field" htmlFor="kkeep-profile-bio"><span>About me <small>{draft.bio.length}/{CHAT_BIO_MAX}</small></span><textarea id="kkeep-profile-bio" value={draft.bio} onChange={event=>update('bio',event.target.value)} maxLength={CHAT_BIO_MAX} placeholder="Say something about yourself" rows={4} dir="auto" disabled={locked}/></label>
            </section>
          </div>
          <aside className="chat-profile-preview"><h3>Preview</h3><ChatProfileCard profile={preview} preview/><p>People see this full card when they open your avatar.</p><div className="chat-profile-list-preview"><h3>In chat &amp; friends</h3><div className="chat-nameplate chat-member-preview"><ChatNameplateArt kind={preview.nameplateStyle}/><ChatAvatar user={preview} size={38}/><span><strong>{preview.displayName}</strong><ChatRoleBadges user={preview} compact/></span></div></div><p className="chat-profile-color-note">Dark name colors are brightened for readability.</p></aside>
        </div>
        <footer className="chat-profile-save-area">
          {error&&<p role="alert" className="chat-error">{error}</p>}
          <div className={'chat-profile-savebar '+(dirty?'has-changes':'')}><span role="status">{busy?<><LoaderCircle size={16} className="spin"/>{saveStep||'Saving changes…'}</>:preparing?<><LoaderCircle size={16} className="spin"/>Preparing {preparing}…</>:dirty?'Careful, you have unsaved changes.':saved?<><Check size={16}/>Profile saved.</>:'Your profile is up to date.'}</span><button type="button" className="chat-text-button" disabled={locked||(!dirty&&!error)} onClick={reset}><RotateCcw size={14}/>Reset</button><button type="submit" className="chat-button chat-primary" disabled={locked||!dirty||!draft.displayName.trim()||!colorsValid||!!usernameError}>Save changes</button></div>
        </footer>
      </form>
    </DialogContent>
  </Dialog>;
}
