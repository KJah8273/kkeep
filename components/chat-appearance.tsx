'use client';

import {useId} from 'react';
import {Crown} from 'lucide-react';
import {chatNameColor,normalizeChatColor} from '@/lib/chat-client';
import type {ChatUser} from '@/lib/chat-model';
import '@/app/chat-appearance.css';

export const AVATAR_DECORATIONS=[
  {id:'none',name:'None'},{id:'solar',name:'Solar halo'},{id:'fangs',name:'Moon fangs'},{id:'wraith',name:'Phantom embrace'},{id:'sakura',name:'Petal ink'},{id:'crescent',name:'Crescent clouds'},{id:'shadow',name:'Shadow thorns'},{id:'wings',name:'Midnight wings'},
  {id:'petal-blades',name:'Petal blades'},{id:'blossom-bough',name:'Blossom bough'},{id:'rift',name:'Azure rift'},{id:'soulfire',name:'Soulfire'},{id:'candlelight',name:'Midnight candles'},{id:'web',name:'Silver web'},{id:'vampire',name:'Crimson fangs'},{id:'hellfire',name:'Ember souls'},{id:'bone-jaw',name:'Fossil jaw'},{id:'hood',name:'Night hood'},{id:'scholar',name:'Know it all'},{id:'storm',name:'Golden current'},{id:'phoenix',name:'Crimson wings'},{id:'shark',name:'Deepwater jaws'},{id:'flare',name:'Comic flare'},{id:'hex',name:'Violet hex'},{id:'watcher',name:'All-seeing'},
] as const;
export const NAMEPLATE_STYLES=[
  {id:'none',name:'None'},{id:'ravens',name:'Raven flight'},{id:'crimson',name:'Crimson branches'},{id:'moonlight',name:'Moonlit clouds'},{id:'ocean',name:'Open water'},{id:'haunted',name:'Ghost traces'},{id:'ink',name:'Ink gaze'},
  {id:'orbit',name:'Distant worlds'},{id:'citadel',name:'Moonlit citadel'},{id:'aurora',name:'Starlit veil'},{id:'webbed',name:'Threaded grin'},{id:'fracture',name:'Raven fracture'},{id:'current',name:'Blue current'},{id:'gaze',name:'Violet gaze'},{id:'embers',name:'Ember crowd'},
] as const;
export const PROFILE_FRAMES=[
  {id:'none',name:'None'},{id:'celestial',name:'Silver orbit'},{id:'obsidian-rose',name:'Obsidian roses'},{id:'eclipse',name:'Golden eclipse'},{id:'blue-flame',name:'Azure flames'},{id:'violet-rose',name:'Violet roses'},{id:'thorns',name:'Midnight thorns'},{id:'many-eyes',name:'Watchful eyes'},{id:'frost-rose',name:'Frost roses'},{id:'ivory-rose',name:'Ivory roses'},{id:'ember-flame',name:'Amber flames'},{id:'phantom',name:'Phantom hands'},{id:'blossom',name:'Cherry blossom'},{id:'gilded-thorns',name:'Gilded thorns'},
] as const;
export type AvatarDecoration=typeof AVATAR_DECORATIONS[number]['id'];
export type NameplateStyle=typeof NAMEPLATE_STYLES[number]['id'];
export type ProfileFrame=typeof PROFILE_FRAMES[number]['id'];

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
    <ExpandedAvatarArt kind={kind} id={id}/>
  </svg>;
}

export function ChatNameplateArt({kind}:{kind:NameplateStyle|string|undefined}){
  const id=useId().replace(/:/g,'');
  if(!kind||kind==='none')return null;
  const tones:Record<string,[string,string]>={ravens:['#34363e','#9698a2'],crimson:['#321b24','#9b102c'],moonlight:['#1e2944','#4c47b4'],ocean:['#172d38','#46768a'],haunted:['#25252a','#08080b'],ink:['#22232a','#050508'],orbit:['#182343','#222f83'],citadel:['#303640','#8394aa'],aurora:['#354346','#bdc9b1'],webbed:['#392443','#615080'],fracture:['#23324d','#405ca5'],current:['#172c48','#174a98'],gaze:['#4d4563','#e6dce2'],embers:['#251f29','#381f2c']};
  const tone=tones[kind]||tones.ink;
  return <span className={'chat-nameplate-art chat-nameplate-'+kind} aria-hidden="true"><svg viewBox="0 0 400 100" preserveAspectRatio="xMidYMid slice" focusable="false"><defs><linearGradient id={id+'plate'}><stop stopColor={tone[0]}/><stop offset="1" stopColor={tone[1]}/></linearGradient></defs><rect width="400" height="100" fill={'url(#'+id+'plate)'}/>
    {kind==='ravens'&&<>{[[265,35,1],[350,70,.7],[375,18,.5]].map(([x,y,s],i)=><path key={i} d="M-8 5Q-22-18-55-22Q-37-8-25 3L-40 12L-12 15L-4 29L3 17L29 16L13 6Q30-4 46-23Q18-12 7 1L2-5Z" fill="#111319" opacity=".9" transform={`translate(${x} ${y}) scale(${s}) rotate(-15)`}/>)}</>}
    {kind==='crimson'&&<><path d="M402 98 L358 71 L367 48 L333 31 L326 5 M358 71 L323 78 L295 62 L279 68 M365 48 L393 33 L391 10 M333 31 L298 22 L278 4 M323 78 L310 101" fill="none" stroke="#100a12" strokeWidth="4" strokeLinejoin="round"/><path d="M379 0 L369 20 L346 17 M398 69 L382 70 L377 89 M305 34 L292 44 L269 42" fill="none" stroke="#e52750" strokeWidth="1.6"/></>}
    {kind==='moonlight'&&<><path d="M337 13Q312 37 339 53Q308 62 306 37Q304 17 337 13Z" fill="#fff9dd"/><path d="M208 86Q214 63 232 68Q245 46 264 63Q278 58 283 75Q303 62 319 77Q339 66 348 78Q364 61 377 66L402 59V103H191Z" fill="#7487bf"/><path d="M216 86Q236 71 249 82Q259 68 274 81Q285 75 301 85Q319 74 334 87Q352 73 371 82" fill="none" stroke="#c0c7ea" strokeWidth="2"/>{[[287,20],[368,17],[354,45],[269,41]].map(([x,y],i)=><path key={i} d={`M${x-2} ${y}h4 M${x} ${y-3}v6`} stroke="#e6e6ff" strokeWidth="1"/>)}</>}
    {kind==='ocean'&&<><path d="M180 57 Q220 52 259 57T400 55 M193 70Q231 63 263 70T402 68 M212 83Q245 76 291 82T401 80 M160 94Q209 87 245 94T398 93" fill="none" stroke="#a4c6ce" opacity=".35" strokeWidth="2"/><path d="M285 71 Q307 42 345 20 Q335 45 342 68 L366 75 Q326 84 285 71Z" fill="#1d2932" stroke="#8aa8b7" strokeWidth="1.5"/><path d="M276 78 Q320 89 370 77" fill="none" stroke="#c6e0dd" opacity=".65" strokeWidth="2"/></>}
    {kind==='haunted'&&<>{[[286,29,-20,.9],[359,69,20,.75]].map(([x,y,r,s],i)=><g key={i} transform={`translate(${x} ${y}) rotate(${r}) scale(${s})`} fill="#dddde5" opacity=".72"><ellipse cy="9" rx="9" ry="12"/><ellipse cx="-12" cy="5" rx="3" ry="10" transform="rotate(-25 -12 5)"/><ellipse cx="-7" cy="-10" rx="2.6" ry="11"/><ellipse cx="0" cy="-14" rx="2.6" ry="12"/><ellipse cx="7" cy="-11" rx="2.5" ry="11"/><ellipse cx="13" cy="-6" rx="2.3" ry="9"/><path d="M-6 19L-4 29L7 28L6 18Z"/></g>)}<path d="M231 28l3 2 M251 67l4 1 M306 85l2 2 M381 22l3-1 M331 49l1 2" stroke="#93939e" strokeWidth="3"/></>}
    {kind==='ink'&&<><path d="M238 45Q267 6 305 21Q278 44 243 48Z M298 64Q333 29 377 43Q346 68 302 69Z" fill="#e9e8ee"/><ellipse cx="274" cy="31" rx="7" ry="12" transform="rotate(35 274 31)" fill="#14131a"/><ellipse cx="342" cy="52" rx="7" ry="12" transform="rotate(50 342 52)" fill="#14131a"/><path d="M230 50L265 55L240 66L290 60 M294 25L321 17L304 41 M374 67L391 84L354 78 M263 10L284 6" fill="none" stroke="#aaa6b7" strokeWidth="2"/></>}
    <ExpandedNameplateArt kind={kind} id={id}/>
  </svg></span>;
}

function PetalFlower({x,y,scale=1,color='#f5a6ca'}:{x:number;y:number;scale?:number;color?:string}){
  return <g transform={`translate(${x} ${y}) scale(${scale})`} fill={color} stroke="#8b345d" strokeWidth=".45">{[0,72,144,216,288].map(angle=><path key={angle} transform={`rotate(${angle})`} d="M0 1C-7-2-5-8-1-7L0-5L1-7C6-8 7-2 0 1Z"/>)}<circle r="1.6" fill="#ffe8b5" stroke="none"/></g>;
}

function LittleSkull({x,y,scale=1,color='#9b9ca9',eye='#17151f'}:{x:number;y:number;scale?:number;color?:string;eye?:string}){
  return <g transform={`translate(${x} ${y}) scale(${scale})`}><path d="M-9-2C-9-14 9-14 9-2L7 4L4 5L4 10L-4 10L-4 5L-7 4Z" fill={color} stroke="#1a1821" strokeWidth="1"/><path d="M-6-3L-1-1L-3 3L-6 1ZM6-3L1-1L3 3L6 1Z" fill={eye}/><path d="M0 2L-2 6H2Z" fill="#25202b"/><path d="M-2 7V10M1 7V10" stroke="#39313f" strokeWidth=".7"/></g>;
}

function ExpandedAvatarArt({kind,id}:{kind:string;id:string}){
  switch(kind){
    case 'petal-blades':return <>
      <defs><linearGradient id={id+'steel'}><stop stopColor="#565563"/><stop offset=".4" stopColor="#f6eff2"/><stop offset=".6" stopColor="#9995a5"/><stop offset="1" stopColor="#e8d7a2"/></linearGradient></defs>
      {[false,true].map(mirror=><g key={String(mirror)} transform={mirror?'translate(100 0) scale(-1 1)':undefined}><path d="M15 8Q8 32 13 68L17 70Q13 38 19 6Z" fill={'url(#'+id+'steel)'} stroke="#403943" strokeWidth=".6"/><path d="M18 12Q12 36 16 64" stroke="#fff5d8" strokeWidth=".6"/><path d="M9 69L22 72" stroke="#c2a46b" strokeWidth="2.6"/><path d="M13 72L11 84L15 85L17 73Z" fill="#29252f" stroke="#a59a9d" strokeWidth=".7"/><path d="M12 75L16 78M11.5 79L15 82" stroke="#d7c7be" strokeWidth="1.1"/><path d="M5 64L19 80L28 83M16 76L22 70" stroke="#8b5260" strokeWidth=".8" fill="none"/><PetalFlower x={7} y={67} scale={.45}/><PetalFlower x={21} y={76} scale={.5} color="#f5c5d0"/><PetalFlower x={16} y={86} scale={.34}/></g>)}
    </>;
    case 'blossom-bough':return <>
      <path d="M10 88Q34 84 51 88L63 82Q81 63 83 36L76 18L80 13L88 31L89 48L84 65L81 79L92 86L79 83L73 89L58 87L44 92Z" fill="#69143f" stroke="#d25390" strokeWidth="1"/><path d="M81 36L69 19L43 15L21 19L8 14M76 27L60 7L43 9L33 4M87 43L94 32M82 62L93 58M65 84L58 73L45 79" fill="none" stroke="#d74f91" strokeWidth="1.8" strokeLinecap="round"/>
      {[[11,15,.65],[22,11,.8],[34,12,.62],[46,9,.8],[59,11,.66],[72,16,.8],[84,23,.65],[88,37,.43],[76,79,.47],[39,88,.43]].map(([x,y,s],i)=><PetalFlower key={i} x={x} y={y} scale={s} color={i%2?'#ffcae2':'#f97cbc'}/>)}<path d="M85 55L80 60L83 65L88 59Z M60 83L54 80L52 84L58 87Z" fill="#ff92c7"/>
    </>;
    case 'rift':return <>
      <circle cx="50" cy="50" r="40" stroke="#087bdb" strokeWidth="5" strokeDasharray="53 6 22 5 62 4" opacity=".55"/>
      <path className="chat-art-pulse" d="M19 19L29 13L26 9L39 12L47 7L55 10L68 9L66 13L79 18L77 23L89 29L85 38L94 44L89 51L93 59L87 67L88 75L78 77L70 89L60 87L53 93L43 88L33 91L28 84L18 82L19 73L10 66L14 58L8 49L13 42L9 34L18 31Z" fill="none" stroke="#17d2f5" strokeWidth="2.5" strokeLinejoin="round"/>
      <path d="M16 40Q20 15 45 14M89 51Q87 79 64 86M38 88L23 79L17 66M63 15L75 22L84 37" fill="none" stroke="#b0ffff" strokeWidth="1.2" strokeLinecap="round"/><path d="M8 24L14 22M25 6L34 5M94 35L98 39M85 92L91 88M8 78L12 80" stroke="#13a5f1" strokeWidth="1.3"/>
    </>;
    case 'soulfire':case 'hellfire':{
      const blue=kind==='soulfire',flame=blue?'#70e7ef':'#ff717f',shade=blue?'#258baf':'#a83452';
      return <><defs><clipPath id={id+'fire-edge'}><path d="M0 0H100V100H0ZM50 20A30 30 0 1 0 50 80A30 30 0 1 0 50 20Z" fillRule="evenodd" clipRule="evenodd"/></clipPath></defs><g clipPath={'url(#'+id+'fire-edge)'}><path className="chat-art-flicker" d="M13 75Q2 65 11 51Q9 65 17 62L20 48Q21 62 29 68L31 56L37 71L45 61Q48 44 43 39Q57 45 55 64L61 69L66 52L70 65Q81 57 78 43Q93 54 85 70L92 61Q95 76 82 85L24 89Z" fill={flame} stroke={shade} strokeWidth=".8"/><path d="M21 78L22 69L30 78L42 72L50 57L53 78L65 74L73 68L76 81Z" fill={blue?'#d5fcff':'#ffd3c0'}/></g>{[[22,83,.65],[36,89,.68],[51,90,.76],[68,88,.68],[81,82,.6]].map(([x,y,s],i)=><LittleSkull key={i} x={x} y={y} scale={s} color={i%2?shade:blue?'#91b8c4':'#be8793'} eye={flame}/>)}<path d="M13 40Q10 31 16 29M83 27Q89 32 85 39" fill="none" stroke={flame} strokeWidth="1.5"/></>;
    }
    case 'candlelight':return <>
      <path d="M10 82Q30 90 50 84Q71 91 91 80L87 90L70 93L52 90L29 93L12 88Z" fill="#34343b" stroke="#696975" strokeWidth="1"/>
      {[[15,63,20],[50,81,10],[86,59,25]].map(([x,y,h],i)=><g key={i}><path d={`M${x-6} ${y}L${x-7} ${y+h}Q${x} ${y+h+4} ${x+6} ${y+h}L${x+5} ${y}Z`} fill="#55535c" stroke="#25232b" strokeWidth="1.1"/><ellipse cx={x} cy={y} rx="6" ry="2.5" fill="#aaa7b1"/><path d={`M${x-3} ${y+1}V${y+9}Q${x-1} ${y+12} ${x} ${y+6}V${y+2}M${x+3} ${y+1}V${y+13}`} fill="none" stroke="#8a8792" strokeWidth="2" strokeLinecap="round"/><path className="chat-art-flicker" d={`M${x} ${y-2}Q${x-7} ${y-8} ${x} ${y-21}Q${x+6} ${y-9} ${x} ${y-2}Z`} fill="#3274ed"/><path d={`M${x} ${y-3}Q${x-4} ${y-7} ${x} ${y-14}Q${x+3} ${y-7} ${x} ${y-3}Z`} fill="#83e3ff"/><path d={`M${x} ${y-3}V${y}`} stroke="#201d25" strokeWidth=".8"/></g>)}
    </>;
    case 'web':return <>
      {[36,42,47].map((r,j)=><path key={r} d={Array.from({length:12},(_,i)=>{const a=i*Math.PI/6,b=a+Math.PI/12,c=a+Math.PI/6;return `${i?'L':'M'}${50+Math.cos(a)*r} ${50+Math.sin(a)*r}Q${50+Math.cos(b)*(r-6-j)} ${50+Math.sin(b)*(r-6-j)} ${50+Math.cos(c)*r} ${50+Math.sin(c)*r}`;}).join(' ')+'Z'} fill="none" stroke={j===1?'#eff9fc':'#8fa6b4'} strokeWidth={j===1?1.1:.65}/>)}
      {Array.from({length:12},(_,i)=>{const a=i*Math.PI/6;return <path key={i} d={`M${50+Math.cos(a)*35} ${50+Math.sin(a)*35}L${50+Math.cos(a)*49} ${50+Math.sin(a)*49}`} stroke="#d8eaf0" strokeWidth=".85"/>;})}
    </>;
    case 'vampire':return <>
      <path d="M12 37Q10 14 25 12L35 17L45 12L52 15L61 12L73 18L84 13Q93 21 87 43L81 25L74 28L65 23L57 25L50 22L41 26L32 23L24 28L18 24Z" fill="#782a3a" stroke="#2e1724" strokeWidth="1"/>
      {[[22,17,6,23],[34,17,7,10],[46,16,7,10],[58,16,7,11],[71,18,7,12],[82,18,5,24]].map(([x,y,w,h],i)=><path key={i} d={`M${x-w/2} ${y}Q${x} ${y-3} ${x+w/2} ${y}Q${x+w/2} ${y+h*.5} ${x} ${y+h}Q${x-w/2} ${y+h*.4} ${x-w/2} ${y}Z`} fill="#f7e2df" stroke="#bb777f" strokeWidth=".7"/>)}
      <path d="M14 66Q20 88 35 89L46 86L55 90L67 87L79 82L87 65L84 87Q67 97 50 93Q27 98 14 84Z" fill="#96374b"/>{[[22,80,13],[35,88,12],[47,88,10],[59,88,12],[73,83,17]].map(([x,y,h],i)=><path key={i} d={`M${x-4} ${y}Q${x-4} ${y-h/2} ${x} ${y-h}Q${x+5} ${y-h/2} ${x+4} ${y}Z`} fill="#f2dbdb" stroke="#ae6a79" strokeWidth=".6"/>)}<path d="M17 39V47M83 40V49" stroke="#e43f58" strokeWidth="1.7" strokeLinecap="round"/>
    </>;
    case 'bone-jaw':return <>
      <path d="M50 4C77 4 96 25 96 50C96 78 77 96 50 96C24 96 4 77 4 50C4 23 25 4 50 4ZM50 16A34 34 0 1 0 50 84A34 34 0 1 0 50 16Z" fill="#49474c" fillRule="evenodd" stroke="#1d1c22" strokeWidth="1"/>
      {Array.from({length:18},(_,i)=><g key={i} transform={`translate(50 50) rotate(${i*20}) translate(0 -41)`}><path d="M-6-3Q-5-8 0-7Q6-7 6-2L4 5L0 10L-4 5Z" fill={i%2?'#d5d5d9':'#a5a4ae'} stroke="#34323a" strokeWidth=".65"/><path d="M-3-4L0-2L3-4M-3 0L1 2L3 0M0 3V7" fill="none" stroke="#6c6974" strokeWidth=".5"/></g>)}
    </>;
    case 'hood':return <>
      <defs><linearGradient id={id+'hood'}><stop stopColor="#1a1a24"/><stop offset=".5" stopColor="#6b6b7a"/><stop offset="1" stopColor="#23232e"/></linearGradient></defs>
      <path d="M50 3Q23 5 14 23L5 54L9 77Q18 91 47 94Q78 93 92 80L96 61L84 26Q74 7 50 3ZM50 17Q35 13 27 30Q16 39 15 60Q18 79 50 85Q80 80 85 61Q83 43 72 31Q62 15 50 17Z" fill={'url(#'+id+'hood)'} fillRule="evenodd" stroke="#14141e" strokeWidth="1.2"/><path d="M50 4L48 16M29 12Q21 30 13 44L10 61M69 12Q75 32 86 46L90 65M12 74Q22 86 43 89M87 77Q73 88 57 90" stroke="#898896" strokeWidth=".8" fill="none" opacity=".65"/><ellipse cx="51" cy="91" rx="7" ry="3.3" fill="#b5bac8" stroke="#2c2e38" strokeWidth="1.3"/><ellipse cx="49" cy="90" rx="2.5" ry="1" fill="#eef2fb"/>
    </>;
    case 'scholar':return <>
      <path d="M9 31Q18 27 39 31L43 38H58L62 31Q80 27 92 32L88 49Q86 59 72 58Q60 57 59 43H42Q40 58 27 58Q13 58 12 48Z" fill="none" stroke="#aa96d6" strokeWidth="3" strokeLinejoin="round"/><path d="M11 32L36 33M65 32L89 33" stroke="#dfd3f7" strokeWidth="1"/><path d="M44 34H56L54 41H47Z" fill="#e3c99b" stroke="#4c3c40" strokeWidth=".7"/><path d="M16 80L9 72Q7 67 10 65L14 69L11 60Q11 55 15 57L19 67L17 48Q17 43 21 43Q25 43 25 48L26 69L31 65Q36 64 35 70L32 81Q26 89 16 80Z" fill="#efc49f" stroke="#9d6d57" strokeWidth="1"/><path d="M16 70L19 74M22 68L24 74M27 73L30 69" fill="none" stroke="#b27d61" strokeWidth=".8"/>
    </>;
    case 'storm':return <>
      <circle cx="50" cy="50" r="41" stroke="#8e6514" strokeWidth="1.2" strokeDasharray="31 24 42 33"/>
      <path className="chat-art-pulse" d="M74 15L63 9L59 14L46 8L40 13L29 12L30 19L18 23L21 31L12 36L16 43L8 50L14 57L12 69L23 70L25 81L36 82L40 88L52 90" stroke="#ffc83b" strokeWidth="1.7" fill="none" strokeLinejoin="round"/><path d="M70 10L82 19L77 22L88 31L89 39M82 15L90 23L86 28L94 38" stroke="#ffec9c" strokeWidth=".9" fill="none"/><circle cx="88" cy="36" r="3.8" fill="#eeba37"/><circle cx="88" cy="36" r="1.8" fill="#fff7be"/><path d="M21 27L25 29L20 34M13 58L20 58L17 66M35 82L39 78L46 84" stroke="#fff1b4" strokeWidth=".8" fill="none"/>
    </>;
    case 'phoenix':return <>{[false,true].map(mirror=><g key={String(mirror)} transform={mirror?'translate(100 0) scale(-1 1)':undefined}><path d="M33 16L22 8L11 12L18 15L9 20L15 21L7 29L14 27L6 38L12 36L6 48L13 45L9 58L17 55L14 68L22 63L22 76L29 71L28 83L41 90L33 74Q18 44 33 16Z" fill="#ad343d" stroke="#411b2b" strokeWidth="1"/><path d="M23 14Q12 46 37 84M18 28L15 40M16 45L18 55M21 59L26 68" fill="none" stroke="#ea7470" strokeWidth="1"/><path d="M20 52Q18 76 45 92L25 87L16 73Z" fill="#73273b"/><path d="M26 69L36 83L31 75" stroke="#e45d5f" strokeWidth=".8" fill="none"/></g>)}</>;
    case 'shark':return <>
      <path d="M14 39L5 25L7 51L2 72L14 67L16 83L28 79Q51 97 75 80L86 86L86 68L98 72L91 50L94 28L84 39Q76 9 51 4Q24 10 14 39ZM50 17A34 34 0 1 0 50 85A34 34 0 1 0 50 17Z" fill="#547b9d" fillRule="evenodd" stroke="#263a5e" strokeWidth="1.2"/><path d="M16 38Q27 11 50 9Q74 15 85 39M18 71Q49 96 81 72" stroke="#b4d5df" strokeWidth="2.4" fill="none"/><path d="M31 20L39 16L44 20M57 18L64 17L70 23" stroke="#ebf4ed" strokeWidth="1.4" fill="none"/>
      {Array.from({length:18},(_,i)=><path key={i} transform={`translate(50 51) rotate(${i*20})`} d="M-3-35L0-29L3-35Z" fill="#e4eff2" stroke="#29415b" strokeWidth=".45"/>)}<ellipse cx="19" cy="35" rx="3.5" ry="5" fill="#16213b" transform="rotate(32 19 35)"/><ellipse cx="82" cy="35" rx="3.5" ry="5" fill="#16213b" transform="rotate(-32 82 35)"/><circle cx="19" cy="33" r="1" fill="#e0f6ff"/><circle cx="81" cy="33" r="1" fill="#e0f6ff"/><path d="M10 50L16 45M10 55L16 50M90 50L84 45M91 55L85 51" stroke="#263f61" strokeWidth="1.3"/>
    </>;
    case 'flare':return <>
      <circle cx="50" cy="50" r="42" fill="none" stroke="#e5374c" strokeWidth="2" strokeDasharray="85 28 54 24" transform="rotate(-20 50 50)"/><circle cx="50" cy="50" r="47" fill="none" stroke="#8e293e" strokeWidth=".9" strokeDasharray="64 49 26 36"/>
      <path d="M73 10L74 20L68 24M84 13L81 22L88 27M91 35L82 31L78 38M66 32L73 29L74 38" fill="none" stroke="#ef3548" strokeWidth="3.7" strokeLinecap="round"/><path d="M12 73Q26 65 33 77Q39 87 25 94L13 92L8 96L10 88Q5 80 12 73Z" fill="#fff8ef" stroke="#1c1a23" strokeWidth="1.5"/><path d="M20 76L23 86" stroke="#201c26" strokeWidth="2.8" strokeLinecap="round"/><circle cx="24" cy="90" r="1.6" fill="#201c26"/>
    </>;
    case 'hex':return <>
      {[0,72,144,216,288].map((angle,i)=><g key={angle} transform={`rotate(${angle} 50 50)`}><path d="M22 20Q37-2 62 8L55 14Q76 9 88 32L77 28L82 41Q69 19 55 16Q36 10 22 20Z" fill={i%2?'#65275f':'#8e357f'} stroke="#b751b0" strokeWidth=".7"/><path d="M27 14L34 9L43 10L38 14L42 18" stroke="#ef90e5" strokeWidth="1.3" fill="none"/></g>)}<circle cx="50" cy="50" r="39" fill="none" stroke="#d161be" strokeWidth=".8" strokeDasharray="18 35"/>
    </>;
    case 'watcher':return <>
      <path d="M4 52Q17 3 50 6Q85 5 96 52Q79 94 50 95Q19 94 4 52ZM50 17A34 34 0 1 0 50 85A34 34 0 1 0 50 17Z" fill="#55535c" stroke="#25222b" strokeWidth="1.1" fillRule="evenodd"/><path d="M7 50Q21 9 50 10Q78 9 92 50" fill="none" stroke="#c7c5cb" strokeWidth="3"/><path d="M10 58Q26 88 51 89Q78 86 91 58" fill="none" stroke="#bab9c2" strokeWidth="1.1"/>
      {Array.from({length:15},(_,i)=>{const a=Math.PI*(1.1+i*.057),x=50+Math.cos(a)*39,y=50+Math.sin(a)*40;return <path key={i} d={`M${x} ${y}l${Math.cos(a)*7} ${Math.sin(a)*7+2}`} stroke="#24212a" strokeWidth="1.5"/>;})}<path d="M14 61L16 67M26 75L27 81M39 83L40 89M54 84L55 91M68 79L71 85M81 69L85 73" stroke="#dfdce3" strokeWidth=".75"/>
    </>;
    default:return null;
  }
}

function ExpandedNameplateArt({kind,id}:{kind:string;id:string}){
  switch(kind){
    case 'orbit':return <>
      <defs><radialGradient id={id+'planet'} cx=".75" cy=".2"><stop stopColor="#8fa5ef"/><stop offset=".3" stopColor="#3a3983"/><stop offset=".75" stopColor="#172147"/><stop offset="1" stopColor="#0d1737"/></radialGradient><linearGradient id={id+'rim'} x2=".2" y2="1"><stop stopColor="#e6e8ff"/><stop offset=".4" stopColor="#7179ce"/><stop offset="1" stopColor="#172247"/></linearGradient></defs>
      <path d="M180 110Q215-7 302 27Q343 38 361 110Z" fill={'url(#'+id+'planet)'}/><path d="M180 110Q215-7 302 27Q343 38 361 110" stroke={'url(#'+id+'rim)'} strokeWidth="3" fill="none"/><circle cx="347" cy="31" r="24" fill="#1b2854" stroke="#7192f2" strokeWidth="2.5"/><path d="M250 0L215 99M269 0L235 100" stroke="#dcc2d6" opacity=".13" strokeWidth="8"/>{[[199,17],[290,8],[377,62],[322,13],[390,20]].map(([x,y],i)=><path key={i} d={`M${x-2} ${y}h4M${x} ${y-3}v6`} stroke="#e0ecff" opacity={i%2?.7:1} strokeWidth="1"/>)}
    </>;
    case 'citadel':return <>
      <path d="M155 0L185 100M198 0L213 100M260 0L255 100M305 0L291 100M350 0L326 100M390 0L362 100" stroke="#d4e0e7" strokeWidth="15" opacity=".12"/>
      <path d="M300 100V71L309 65V18L315 4L321 18V62L328 57V34L333 26L338 34V55L346 61V9L350-1L355 8V63L364 70V100Z" fill="#343e50"/><path d="M278 57L295 43L291 32L307 37L316 25L320 38L329 43L346 41L357 48L375 43L366 58L352 63L338 62L327 70L313 64L302 70L296 62Z" fill="#172534" stroke="#9aaebc" strokeWidth=".7"/><path d="M313 53Q285 22 271 21L280 45L296 57M334 53Q356 19 380 19L369 47L349 58" fill="#273748" stroke="#768c9c" strokeWidth="1"/><path d="M298 75L287 82L304 86M346 75L362 83L344 88" fill="none" stroke="#16212e" strokeWidth="4"/>
    </>;
    case 'aurora':return <>
      <path className="chat-art-drift" d="M135 75Q218-4 292 28T420 10M190 109Q234 9 315 51T423 32" stroke="#eaf0cf" opacity=".25" strokeWidth="14" fill="none"/><path d="M162 80Q216 13 288 34T413 15M206 98Q252 29 320 57T409 50" stroke="#f3f1d6" opacity=".55" strokeWidth="1.2" fill="none"/>{Array.from({length:20},(_,i)=>{const x=183+(i*43)%213,y=8+(i*31)%85;return <g key={i} fill="#fafae4"><circle cx={x} cy={y} r={i%3===0?1.5:.7} opacity={.4+(i%3)*.2}/>{i%5===0&&<path d={`M${x-4} ${y}h8M${x} ${y-4}v8`} stroke="#fffce4" strokeWidth=".7"/>}</g>;})}
    </>;
    case 'webbed':return <>
      <g stroke="#c9b5e0" fill="none" strokeWidth=".8" opacity=".5"><path d="M238 3L400 85M270 0L364 100M316 0L321 100M365 0L280 100M400 20L259 64"/><path d="M264 14Q277 29 290 27Q307 42 327 39Q350 49 367 43M282 3Q294 17 309 16Q328 25 344 20Q362 30 382 27M256 42Q275 55 292 50Q312 67 337 61Q361 75 386 66M270 74Q294 86 314 81Q336 97 363 89"/></g>
      <path d="M336 80Q326 69 335 50L334 32L345 38Q358 26 372 39L384 31L381 51Q393 68 378 84L353 89Z" fill="#24202f" stroke="#cec5df" strokeWidth="1.3"/><path d="M343 58L352 65L347 69L341 65M373 58L364 65L369 69L377 65" fill="#dfd8eb"/><path d="M342 74Q358 83 379 70Q369 91 349 84Z" fill="#f3ebce"/><path d="M350 78L351 84M358 79V86M366 77L367 84M374 74L375 79" stroke="#62565f" strokeWidth=".8"/><path d="M330 71L318 65L306 72L307 87M381 71L393 62L401 72" stroke="#bbb0d1" strokeWidth="2.5" fill="none"/>
    </>;
    case 'fracture':return <>
      <path d="M273 0L291 18L288 2L303 23L308 0L319 22L328 5L338 28L351 3L361 29L378 10L385 30L400 21V100L380 85L373 100L357 78L343 100L332 77L314 100L305 78L288 93L290 69L269 83L280 59L258 55L280 43L267 28L285 30Z" fill="#0b101d"/>
      {Array.from({length:11},(_,i)=><g key={i}><path d={`M${275+i*12} 0L${288+i*10} ${22+(i%3)*9}L${283+i*12} 2M${280+i*12} 100L${293+i*10} ${76-(i%3)*8}L${287+i*12} 99`} fill="#a3b6db" stroke="#202e49" strokeWidth=".8"/></g>)}<path d="M265 47L283 47L274 53M300 30L317 42L306 35M350 63L337 77L355 70" stroke="#6c88bf" strokeWidth="1.2" fill="none"/>
    </>;
    case 'current':return <>
      <path className="chat-art-drift" d="M149 16Q225 37 285 14T418 18M142 88Q219 64 293 86T419 83" stroke="#73bcff" strokeWidth="7" opacity=".2" fill="none"/><path d="M143 16Q216 31 286 14T416 19M151 87Q215 70 291 85T419 82" stroke="#b7e7ff" strokeWidth="1.4" opacity=".85" fill="none"/><path d="M207 9Q262 24 310 8T414 12M224 94Q271 76 320 93T418 89" stroke="#529de6" strokeWidth="1" fill="none"/>
    </>;
    case 'gaze':return <>
      <path d="M236-4L270 23L244 16L267 38L230 31L270 51L240 51L277 66L253 75L299 77L287 97L327 89L343 104L365 88L403 101V0Z" fill="#e8e4df"/><path d="M267 22L287 32L263 31M269 57L289 62L267 69M300 86L320 80M363 10L349 20L382 15" stroke="#b6b0c0" strokeWidth="2" fill="none"/><path d="M299 25Q338 29 379 65Q337 70 308 45Z" fill="#282333"/><path d="M311 32Q341 37 368 59Q337 60 317 43Z" fill="#d7c4e7"/><ellipse cx="339" cy="46" rx="9" ry="13" transform="rotate(-48 339 46)" fill="#8768b4"/><ellipse cx="339" cy="46" rx="3.5" ry="10" transform="rotate(-48 339 46)" fill="#30223f"/><circle cx="334" cy="42" r="3" fill="#f8ebff"/><path d="M305 25L297 14M313 27L308 14M376 59L388 65" stroke="#2e2639" strokeWidth="2"/>
    </>;
    case 'embers':return <>
      <path className="chat-art-flicker" d="M230 99Q231 79 221 67Q244 72 250 89L261 69L268 39L277 56L290 38L285 19Q304 33 300 56L317 63L320 40L336 59L349 32L357 48L370 23L376 51L395 34L391 76L411 65V103Z" fill="#a6384c"/><path d="M250 101L261 85L272 91L283 63L293 83L309 73L321 95L335 73L348 86L362 58L375 80L390 68L399 101Z" fill="#ef6871"/>{[[262,89,1.25],[287,66,1.1],[308,92,1.4],[338,75,1.45],[372,50,1.2],[383,89,1.5]].map(([x,y,s],i)=><LittleSkull key={i} x={x} y={y} scale={s} color={i%2?'#69616e':'#98909a'} eye="#c7475d"/>)}
    </>;
    default:return null;
  }
}

const rosePalettes:Record<string,[string,string,string]>={
  'obsidian-rose':['#29252f','#8b7f94','#131218'],
  'violet-rose':['#813aa0','#e5a4ef','#3d2055'],
  'frost-rose':['#6fa4d4','#daf3ff','#29446e'],
  'ivory-rose':['#d4d4e5','#ffffff','#7c789c'],
};

function RoseFlower({x,y,scale=1,palette}:{x:number;y:number;scale?:number;palette:[string,string,string]}){
  const [base,light,shade]=palette;
  return <g transform={`translate(${x} ${y}) scale(${scale})`}>
    <path d="M-4-10Q2-15 7-8Q14-9 13-1Q18 5 9 9Q7 16 0 12Q-8 16-10 8Q-17 4-11-2Q-13-10-4-10Z" fill={base} stroke={light} strokeWidth=".9"/>
    <path d="M-5-8Q-13-1-5 7Q3 14 10 5M5-8Q14 1 5 8Q-4 11-8 3M-7-5Q0-12 7-5Q13 2 5 6Q-3 12-7 3Q-9-4-1-6Q7-6 7 1Q7 7 0 5Q-5 3-1-2Q3-4 4 0Q4 3 1 2" fill="none" stroke={light} strokeWidth=".9" strokeLinecap="round"/>
    <path d="M-9 9L-16 13L-14 6M10 8L16 13L15 4M-9-8L-13-14L-6-11" fill={shade} stroke={light} strokeWidth=".5"/>
  </g>;
}

function FrameEye({x,y,scale=1,angle=0}:{x:number;y:number;scale?:number;angle?:number}){
  return <g transform={`translate(${x} ${y}) rotate(${angle}) scale(${scale})`}><path d="M-15 0Q0-12 15 0Q0 12-15 0Z" fill="#e9e7ee" stroke="#817b90" strokeWidth=".75"/><ellipse rx="4.5" ry="6" fill="#25212e"/><ellipse rx="1.2" ry="4.5" fill="#e9e5ef"/></g>;
}

function FrameEdgeArt({kind,bottom=false}:{kind:string;bottom?:boolean}){
  const rose=rosePalettes[kind];
  if(rose)return <g transform={bottom?'translate(320 64) rotate(180)':undefined}>
    <path d="M5 59Q5 31 16 18Q44 5 115 12M8 38L18 32L12 27M41 10L48 3L56 11M85 9L91 4L99 11" fill="none" stroke={rose[1]} strokeWidth="1.3"/>
    {[[15,28,.72],[22,14,.86],[43,10,.85],[66,13,.8],[87,11,.64],[105,14,.44]].map(([x,y,s],i)=><RoseFlower key={i} x={x} y={y} scale={s} palette={rose}/>)}
  </g>;
  if(kind==='celestial')return bottom?<><path d="M7 44Q9 56 22 57H298Q311 56 313 44" stroke="#bfc4e0" strokeWidth=".8" fill="none"/><path d="M48 57h6m-3-3v6M244 54h5m-2.5-2.5v5M278 57h6m-3-3v6" stroke="#f6f4ff" strokeWidth=".8"/></>:<>
    <path d="M7 58V24Q8 10 23 10H295Q311 12 313 26V59" stroke="#bfc4de" strokeWidth=".8" fill="none"/>
    <ellipse cx="73" cy="23" rx="42" ry="8.5" transform="rotate(-19 73 23)" stroke="#777e9b" strokeWidth="4" fill="none"/><circle cx="73" cy="22" r="21" fill="#bdc0d4" stroke="#edf1ff" strokeWidth=".7"/><path d="M55 13Q72 24 91 16M53 25Q72 36 91 26M60 37Q72 42 83 35" fill="none" stroke="#e6e5f0" strokeWidth="2" opacity=".7"/><path d="M32 35Q66 38 111 13" stroke="#e4e5f5" strokeWidth="2.3" fill="none"/><circle cx="241" cy="17" r="11" fill="#d4d4e3"/><path d="M235 10Q245 15 247 24M237 25Q244 18 247 13" stroke="#f4f2ff" strokeWidth=".8" fill="none"/><path d="M150 15h7m-3.5-3.5v7M286 30h6m-3-3v6M188 8h4m-2-2v4M19 42h4m-2-2v4" stroke="#e7ecff" strokeWidth=".8"/>
  </>;
  if(kind==='eclipse')return <g transform={bottom?'translate(320 64) rotate(180)':undefined}>
    {!bottom&&<><circle cx="179" cy="22" r="21" fill="#181622" stroke="#b57421" strokeWidth="4"/><circle className="chat-art-pulse" cx="179" cy="22" r="21" fill="none" stroke="#ffdf87" strokeWidth="1.5"/><path d="M158 28Q166 47 185 42" stroke="#fff2bb" strokeWidth="2.5" fill="none"/></>}
    <path d="M4 22Q9 9 20 15Q28 5 38 16Q50-1 64 13Q77 4 86 17Q100 8 115 19Q131 10 143 21Q153 14 165 25Q177 19 190 26Q203 10 216 18Q228 1 243 12Q254 5 265 17Q276 7 287 19Q305 9 316 25L313 34Q298 23 285 31Q271 21 259 29Q244 22 229 29Q211 23 196 33Q176 27 158 33Q136 27 118 30Q100 21 84 27Q65 20 48 27Q27 20 7 33Z" fill="#6b351b" stroke="#b8782c" strokeWidth=".7"/><path d="M11 24Q23 12 34 23Q46 10 58 22Q73 12 86 23M216 24Q231 12 244 21Q258 12 271 25Q289 17 303 24" fill="none" stroke="#dc9b45" strokeWidth="2.4" opacity=".7"/>
  </g>;
  if(kind==='blue-flame'||kind==='ember-flame'){
    const blue=kind==='blue-flame',color=blue?'#17bce8':'#ec762a',light=blue?'#a3f4ff':'#ffe393';
    if(bottom)return <><path d="M7 47L9 57L21 59H299L311 56L313 44" stroke={color} strokeWidth="1" fill="none"/><path d="M37 56L33 50M278 58L283 50M112 58L109 54M226 57L228 53" stroke={light} strokeWidth="1.2"/></>;
    return <>
      <path className="chat-art-flicker" d="M4 61L4 30L8 14L13 24L15 6L22 19L32 8L32 23L43 17L40 3L54 20L60 14L67 23L76 10L78 25L89 18L85 6L102 20L111 14L120 22L129 8L137 20L148 12L157 22L166 4L174 24L185 15L194 22L203 9L210 23L220 13L224 26L235 12L246 21L252 2L263 23L275 13L279 25L290 16L295 3L301 23L307 14L316 32L316 61L311 42L307 30L13 31L9 45Z" fill={color}/>
      <path d="M11 38L15 23L22 28L27 18L33 28L47 23L52 29L67 22L75 29L92 24L102 29L119 23L131 29L147 25L164 29L171 18L181 29L195 23L207 29L220 24L234 29L248 21L262 28L278 23L286 29L300 22L308 37L305 30H15Z" fill={light}/><path d="M44 6L39 1M117 9L112 3M219 5L214 1M276 8L272 1" stroke={color} strokeWidth="1.2"/>
    </>;
  }
  if(kind==='thorns'||kind==='gilded-thorns'){
    const gold=kind==='gilded-thorns',stroke=gold?'#b87f39':'#716879',fill=gold?'#271c20':'#17131c';
    return <g transform={bottom?'translate(320 64) rotate(180)':undefined}>
      <path d="M6 61L5 24Q10 11 26 12H294Q312 11 315 27L314 61" fill="none" stroke={fill} strokeWidth="7"/>
      <path d="M7 51L13 36L7 33L15 23L26 22L23 9L40 17L47 4L54 16L63 10L71 18L83 3L88 16L101 10L110 18L123 6L131 16L140 12L151 20L165 5L174 16L188 9L196 18L210 7L218 19L231 9L244 18L252 2L262 18L275 8L283 20L297 11L301 24L313 30L307 38L314 53" fill="none" stroke={stroke} strokeWidth={gold?1.2:.9}/>
      {Array.from({length:15},(_,i)=><path key={i} d={`M${17+i*20} 17L${12+i*20} ${i%3===0?0:5}L${23+i*20} 15L${28+i*20} 7L${27+i*20} 21Z`} fill={fill} stroke={stroke} strokeWidth=".55"/>)}<path d="M7 35L17 27M52 17L59 22M136 17L145 24M234 17L242 23M303 28L312 35" stroke={gold?'#edb863':'#9f90a8'} strokeWidth=".8"/>
    </g>;
  }
  if(kind==='many-eyes')return <g transform={bottom?'translate(320 64) rotate(180)':undefined}>
    <path d="M4 60L5 20Q21 6 46 11Q75-2 104 9Q131-1 158 8Q187-3 215 9Q240 1 265 11Q296 3 315 22L316 60L309 34L300 25H20L11 35Z" fill="#0c0b11" stroke="#76717f" strokeWidth=".8"/>
    {[[22,18,.45,-22],[44,14,.5,15],[69,13,.65,-13],[98,15,.45,23],[129,13,.5,-18],[158,17,1.1,0],[190,13,.5,13],[217,15,.55,-20],[244,14,.65,18],[271,15,.5,-12],[298,20,.4,18]].map(([x,y,s,a],i)=><FrameEye key={i} x={x} y={y} scale={s} angle={a}/>)}
  </g>;
  if(kind==='phantom')return <g transform={bottom?'translate(320 64) rotate(180)':undefined}>
    <path d="M7 57L9 28Q20 14 37 14L53 10L78 18L98 15L121 20L145 15L166 20L187 13L209 18L230 12L252 18L277 14L300 25L311 35L313 58" fill="none" stroke="#a2a1b0" strokeWidth="2"/>
    {!bottom&&<><path d="M24 28L27 8L33 4L40 7L43 20L45 2L52 1L57 5L58 20L63 5L69 5L72 10L69 25L77 16L82 18L81 27L72 36L43 31Z" fill="#797885" stroke="#e0dce5" strokeWidth=".8"/><path d="M29 9L35 10L38 22M48 6L52 7L53 21M65 10L65 23M76 22L72 29" fill="none" stroke="#24212b" strokeWidth="1.7"/><LittleSkull x={248} y={19} scale={1.35} color="#cfccd6"/><path d="M271 18L282 5L290 9L293 23L299 16L305 21L307 33" stroke="#ded9e5" strokeWidth="2" fill="none"/></>}
    {bottom&&Array.from({length:12},(_,i)=><g key={i} transform={`translate(${37+i*22} ${16+(i%2)*3}) rotate(${i%2?12:-12})`}><path d="M-8-4L-4-6L-1-3L5-5L8-1L5 4L1 3L-4 7L-8 3Z" fill="#55515f" stroke="#c8c1d1" strokeWidth=".8"/><path d="M-4-2L3 1" stroke="#211d29" strokeWidth="1"/></g>)}
  </g>;
  if(kind==='blossom')return <g transform={bottom?'translate(320 64) rotate(180)':undefined}>
    <path d="M7 55L8 19Q32 10 57 16L95 12L129 18L162 11L198 16L227 11L265 18L297 13L312 23V56" stroke="#9e4a76" strokeWidth="2" fill="none"/>
    {[[14,23,.7],[31,13,.9],[54,16,.65],[79,13,.8],[104,16,.6],[132,16,.73],[160,12,.95],[185,15,.65],[210,17,.8],[235,12,.73],[259,17,.6],[284,14,.85],[306,23,.62]].map(([x,y,s],i)=><PetalFlower key={i} x={x} y={y} scale={s} color={i%3===0?'#ffd4e5':i%3===1?'#ee9ac0':'#d97da8'}/>)}<path d="M12 37L8 44L15 48L18 41M310 40L304 46L311 50L314 44" fill="#efbed8"/>
  </g>;
  return null;
}

export function ChatProfileFrameArt({kind}:{kind:ProfileFrame|string|undefined}){
  if(!kind||kind==='none'||!PROFILE_FRAMES.some(frame=>frame.id===kind))return null;
  return <span className={'chat-profile-frame-art chat-profile-frame-'+kind} aria-hidden="true">
    <span className="chat-profile-frame-line"/>
    <svg className="chat-profile-frame-top" viewBox="0 0 320 64" focusable="false"><FrameEdgeArt kind={kind}/></svg>
    <svg className="chat-profile-frame-bottom" viewBox="0 0 320 64" focusable="false"><FrameEdgeArt kind={kind} bottom/></svg>
  </span>;
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
