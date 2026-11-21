'use client';

import {useId} from 'react';
import {Crown} from 'lucide-react';
import {chatNameColor,normalizeChatColor} from '@/lib/chat-client';
import type {ChatUser} from '@/lib/chat-model';

export const AVATAR_DECORATIONS=[
  {id:'none',name:'None'},{id:'solar',name:'Solar halo'},{id:'fangs',name:'Moon fangs'},{id:'wraith',name:'Phantom embrace'},{id:'sakura',name:'Petal ink'},{id:'crescent',name:'Crescent clouds'},{id:'shadow',name:'Shadow thorns'},{id:'wings',name:'Midnight wings'},
] as const;
export const NAMEPLATE_STYLES=[
  {id:'none',name:'None'},{id:'ravens',name:'Raven flight'},{id:'crimson',name:'Crimson branches'},{id:'moonlight',name:'Moonlit clouds'},{id:'ocean',name:'Open water'},{id:'haunted',name:'Ghost traces'},{id:'ink',name:'Ink gaze'},
] as const;
export type AvatarDecoration=typeof AVATAR_DECORATIONS[number]['id'];
export type NameplateStyle=typeof NAMEPLATE_STYLES[number]['id'];

export function ChatAvatarDecoration({kind}:{kind:AvatarDecoration|string|undefined}){
  const id=useId().replace(/:/g,'');
  if(!kind||kind==='none')return null;
  return <svg className={'chat-avatar-decoration chat-decoration-'+kind} viewBox="0 0 100 100" aria-hidden="true" focusable="false">
    <defs><linearGradient id={id+'gold'} x1="0" y1="0" x2="1" y2="1"><stop stopColor="#fff7b6"/><stop offset=".45" stopColor="#ffb428"/><stop offset="1" stopColor="#ca5114"/></linearGradient><linearGradient id={id+'petal'}><stop stopColor="#f7a5b4"/><stop offset=".5" stopColor="#85535e"/><stop offset="1" stopColor="#211a22"/></linearGradient><linearGradient id={id+'wing'}><stop stopColor="#b7a7c4"/><stop offset=".4" stopColor="#40334d"/><stop offset="1" stopColor="#100f16"/></linearGradient><filter id={id+'glow'} x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2"/></filter></defs>
    {kind==='solar'&&<><circle cx="50" cy="50" r="39" fill="none" stroke="#ff9e12" strokeWidth="5" opacity=".65" filter={'url(#'+id+'glow)'}/><circle cx="50" cy="50" r="39" stroke={'url(#'+id+'gold)'} strokeWidth="2" fill="none"/><path d="M15 32 Q19 15 36 12 M64 88 Q80 81 87 65" stroke="#fff0b3" strokeWidth="1.1" strokeLinecap="round" fill="none"/>{[[22,21],[80,30],[69,84],[18,64],[43,10],[88,53]].map(([x,y],i)=><path key={i} d={`M${x-2} ${y}h4 M${x} ${y-2}v4`} stroke="#ffe8a3" strokeWidth=".8" opacity={i%2?.7:1}/>)}</>}
    {kind==='fangs'&&<><path d="M12 42 Q13 20 35 13 L42 8 L50 12 L60 8 L66 14 Q88 21 89 42 L82 30 L76 35 L70 24 L64 32 L57 22 L50 29 L43 22 L36 32 L29 24 L23 36 L18 30Z" fill="#e5e7ec" stroke="#202127" strokeWidth="1.5"/><path d="M14 64 L22 70 L24 61 L31 76 L38 69 L44 81 L50 73 L57 81 L63 68 L70 76 L77 61 L79 70 L87 63 Q84 84 63 89 L50 93 L36 88 Q20 83 14 64Z" fill="#e5e7ec" stroke="#202127" strokeWidth="1.5"/><path d="M28 25 L32 18 M42 21 L43 13 M58 21 L60 13 M73 25 L70 19 M31 79 L30 84 M68 79 L70 84" stroke="#757988" strokeWidth="1.4"/></>}
    {kind==='wraith'&&<><path d="M16 72 C4 49 18 22 34 15 M67 14 C90 20 97 54 82 77" fill="none" stroke="#d9d9e3" strokeWidth="2.4"/><path d="M17 42 L12 28 L16 20 L21 18 L24 29 L28 15 L33 13 L35 18 L31 32 L38 15 L43 15 L44 21 L37 37 M82 48 L89 35 L86 26 L81 24 L77 36 L75 17 L70 14 L68 18 L70 35 L62 18 L58 19 L57 25 L65 41" fill="none" stroke="#d1d0d9" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M78 15 Q92 14 92 29 L95 42 L89 38 L85 43 L80 36 L75 39 L77 26Q72 18 78 15Z" fill="#dbdbe2" stroke="#494752" strokeWidth="1"/><ellipse cx="82" cy="24" rx="2" ry="3" fill="#141318"/><ellipse cx="88" cy="24" rx="1.7" ry="3" fill="#141318"/><path d="M82 31 Q85 28 87 32 L86 36 L83 36Z" fill="#222129"/></>}
    {kind==='sakura'&&<><circle cx="50" cy="50" r="39" fill="none" stroke={'url(#'+id+'petal)'} strokeWidth="4" strokeDasharray="80 9 21 8 60 15" transform="rotate(-35 50 50)"/><circle cx="50" cy="50" r="42" fill="none" stroke="#eab5bd" strokeWidth="1" strokeDasharray="26 12 42 80" opacity=".75"/>{[[22,17,-30],[31,11,20],[70,14,-25],[84,30,35],[14,61,-10],[74,84,45],[45,91,70],[56,9,0]].map(([x,y,r],i)=><ellipse key={i} cx={x} cy={y} rx="3.6" ry="1.9" fill={i%2?'#eb9ba9':'#f7c5ce'} transform={`rotate(${r} ${x} ${y})`}/>)}</>}
    {kind==='crescent'&&<><circle cx="50" cy="50" r="39" fill="none" stroke="#dcd9ff" strokeWidth="3" opacity=".7" filter={'url(#'+id+'glow)'}/><circle cx="50" cy="50" r="39" fill="none" stroke="#f3efff" strokeWidth="1.4"/><path d="M72 11 Q59 24 76 32 Q57 36 57 23 Q58 12 72 11Z" fill="#fff5d8"/><path d="M16 72 Q12 62 20 59 Q26 57 29 65 Q37 59 41 70 Q49 65 54 75 Q64 68 69 77 Q74 65 83 68 Q92 72 88 83 Q76 93 54 90 Q28 91 16 78Z" fill="#a7a8c5" stroke="#e1e0ee" strokeWidth="1"/><path d="M20 76 Q26 69 33 75 Q43 69 50 80 Q56 75 62 82 Q73 75 84 79" fill="none" stroke="#ddddec" strokeWidth="1.7"/><path d="M25 21h5 M27.5 18.5v5 M85 53h4 M87 51v4" stroke="#fff5e1" strokeWidth="1.1"/></>}
    {kind==='shadow'&&<>{Array.from({length:18},(_,i)=>{const a=i*Math.PI/9,r=(distance:number,shift=0)=>[50+Math.cos(a+shift)*distance,50+Math.sin(a+shift)*distance];const [x1,y1]=r(36),[x2,y2]=r(43,.08),[x3,y3]=r(50,-.06),[x4,y4]=r(40,-.1);return <path key={i} d={`M${x1} ${y1}Q${x2} ${y2} ${x3} ${y3}L${x4} ${y4}Z`} fill="#141019" stroke="#51435e" strokeWidth=".6"/>;})}<circle cx="50" cy="50" r="38" fill="none" stroke="#231829" strokeWidth="4"/><circle cx="50" cy="50" r="40" fill="none" stroke="#8a768f" opacity=".5" strokeWidth=".6" strokeDasharray="14 10 5 8"/></>}
    {kind==='wings'&&<>{[false,true].map(mirror=><g key={String(mirror)} transform={mirror?'translate(100 0) scale(-1 1)':undefined}><path d="M31 27 L23 12 L19 2 L17 25 L7 13 L11 37 L3 34 L12 53 L4 55 L18 70 L15 80 L29 76 L23 92 L39 79 Q22 62 26 47 Q28 36 31 27Z" fill={'url(#'+id+'wing)'} stroke="#a99db8" strokeWidth="1"/><path d="M20 16 Q18 47 34 75 M12 28 Q18 51 29 61 M10 43 L27 64 M13 61 L33 75" fill="none" stroke="#d1c6dd" strokeWidth=".7" opacity=".7"/></g>)}</>}
  </svg>;
}

export function ChatNameplateArt({kind}:{kind:NameplateStyle|string|undefined}){
  const id=useId().replace(/:/g,'');
  if(!kind||kind==='none')return null;
  const tones:Record<string,[string,string]>={ravens:['#34363e','#9698a2'],crimson:['#321b24','#9b102c'],moonlight:['#1e2944','#4c47b4'],ocean:['#172d38','#46768a'],haunted:['#25252a','#08080b'],ink:['#22232a','#050508']};
  const tone=tones[kind]||tones.ink;
  return <span className={'chat-nameplate-art chat-nameplate-'+kind} aria-hidden="true"><svg viewBox="0 0 400 100" preserveAspectRatio="xMidYMid slice" focusable="false"><defs><linearGradient id={id+'plate'}><stop stopColor={tone[0]}/><stop offset="1" stopColor={tone[1]}/></linearGradient></defs><rect width="400" height="100" fill={'url(#'+id+'plate)'}/>
    {kind==='ravens'&&<>{[[265,35,1],[350,70,.7],[375,18,.5]].map(([x,y,s],i)=><path key={i} d="M-8 5Q-22-18-55-22Q-37-8-25 3L-40 12L-12 15L-4 29L3 17L29 16L13 6Q30-4 46-23Q18-12 7 1L2-5Z" fill="#111319" opacity=".9" transform={`translate(${x} ${y}) scale(${s}) rotate(-15)`}/>)}</>}
    {kind==='crimson'&&<><path d="M402 98 L358 71 L367 48 L333 31 L326 5 M358 71 L323 78 L295 62 L279 68 M365 48 L393 33 L391 10 M333 31 L298 22 L278 4 M323 78 L310 101" fill="none" stroke="#100a12" strokeWidth="4" strokeLinejoin="round"/><path d="M379 0 L369 20 L346 17 M398 69 L382 70 L377 89 M305 34 L292 44 L269 42" fill="none" stroke="#e52750" strokeWidth="1.6"/></>}
    {kind==='moonlight'&&<><path d="M337 13Q312 37 339 53Q308 62 306 37Q304 17 337 13Z" fill="#fff9dd"/><path d="M208 86Q214 63 232 68Q245 46 264 63Q278 58 283 75Q303 62 319 77Q339 66 348 78Q364 61 377 66L402 59V103H191Z" fill="#7487bf"/><path d="M216 86Q236 71 249 82Q259 68 274 81Q285 75 301 85Q319 74 334 87Q352 73 371 82" fill="none" stroke="#c0c7ea" strokeWidth="2"/>{[[287,20],[368,17],[354,45],[269,41]].map(([x,y],i)=><path key={i} d={`M${x-2} ${y}h4 M${x} ${y-3}v6`} stroke="#e6e6ff" strokeWidth="1"/>)}</>}
    {kind==='ocean'&&<><path d="M180 57 Q220 52 259 57T400 55 M193 70Q231 63 263 70T402 68 M212 83Q245 76 291 82T401 80 M160 94Q209 87 245 94T398 93" fill="none" stroke="#a4c6ce" opacity=".35" strokeWidth="2"/><path d="M285 71 Q307 42 345 20 Q335 45 342 68 L366 75 Q326 84 285 71Z" fill="#1d2932" stroke="#8aa8b7" strokeWidth="1.5"/><path d="M276 78 Q320 89 370 77" fill="none" stroke="#c6e0dd" opacity=".65" strokeWidth="2"/></>}
    {kind==='haunted'&&<>{[[286,29,-20,.9],[359,69,20,.75]].map(([x,y,r,s],i)=><g key={i} transform={`translate(${x} ${y}) rotate(${r}) scale(${s})`} fill="#dddde5" opacity=".72"><ellipse cy="9" rx="9" ry="12"/><ellipse cx="-12" cy="5" rx="3" ry="10" transform="rotate(-25 -12 5)"/><ellipse cx="-7" cy="-10" rx="2.6" ry="11"/><ellipse cx="0" cy="-14" rx="2.6" ry="12"/><ellipse cx="7" cy="-11" rx="2.5" ry="11"/><ellipse cx="13" cy="-6" rx="2.3" ry="9"/><path d="M-6 19L-4 29L7 28L6 18Z"/></g>)}<path d="M231 28l3 2 M251 67l4 1 M306 85l2 2 M381 22l3-1 M331 49l1 2" stroke="#93939e" strokeWidth="3"/></>}
    {kind==='ink'&&<><path d="M238 45Q267 6 305 21Q278 44 243 48Z M298 64Q333 29 377 43Q346 68 302 69Z" fill="#e9e8ee"/><ellipse cx="274" cy="31" rx="7" ry="12" transform="rotate(35 274 31)" fill="#14131a"/><ellipse cx="342" cy="52" rx="7" ry="12" transform="rotate(50 342 52)" fill="#14131a"/><path d="M230 50L265 55L240 66L290 60 M294 25L321 17L304 41 M374 67L391 84L354 78 M263 10L284 6" fill="none" stroke="#aaa6b7" strokeWidth="2"/></>}
  </svg></span>;
}

export function ChatRoleBadges({user,compact=false}:{user:Pick<ChatUser,'roles'|'isOwner'>;compact?:boolean}){
  const roles=user.roles||[],visible=compact?roles.slice(0,user.isOwner?0:1):roles;
  if(!user.isOwner&&!roles.length)return null;
  return <span className="chat-role-badges">{user.isOwner&&<span className="chat-role-badge chat-owner-badge"><Crown size={10}/>Owner</span>}{visible.map(role=><span key={role.id} className="chat-role-badge" style={{color:chatNameColor(role.color,'#202020'),borderColor:normalizeChatColor(role.color)+'55',background:normalizeChatColor(role.color)+'18'}} title={role.name}><i style={{background:normalizeChatColor(role.color)}}/>{role.name}</span>)}{compact&&roles.length>visible.length&&<span className="chat-role-more">+{roles.length-visible.length}</span>}</span>;
}

export function chatUserNameColor(user:Pick<ChatUser,'nameColor'|'roles'|'isOwner'>|null|undefined,background='#111111'){
  if(!user)return chatNameColor(undefined,background);
  const top=(user.roles||[]).reduce<ChatUser['roles'][number]|null>((best,role)=>!best||role.position>best.position?role:best,null);
  return chatNameColor(user.isOwner?'#f1cb80':top?.color||user.nameColor,background);
}
