'use client';
import {useEffect,useState} from 'react';
import ProfilePanel from './profile-panel';
import {useLivingSpace} from './living-space/use-living-space';
import {validateLegacy,ORIGINAL_KEY,type LegacyAppearance} from '@/lib/living-space/model';
import type {ProfileSnapshot} from '@/lib/profile-model';
export default function GameProfile({open,onOpenChange}:{open:boolean;onOpenChange:(value:boolean)=>void}){
 const [ready,setReady]=useState(false),[legacy,setLegacy]=useState<LegacyAppearance>(validateLegacy({}));
 const living=useLivingSpace(ready,legacy);
 useEffect(()=>{try{setLegacy(validateLegacy({theme:localStorage.getItem('kkeep-theme-v1'),wallpaper:localStorage.getItem('kkeep-wallpaper'),match:localStorage.getItem('kkeep-wallpaper-colors')!=='false',moving:localStorage.getItem('kkeep-particles')!=='false',dense:localStorage.getItem('kkeep-dense-stars')==='true'}));}catch{}setReady(true);},[]);
 function restore(value:ProfileSnapshot){setLegacy(value.legacy);living.restoreOriginal(value.original);living.commit(value.preferences,false);try{localStorage.setItem(ORIGINAL_KEY,JSON.stringify(value.original));}catch{}}
 return <ProfilePanel open={open} onOpenChange={onOpenChange} data={{version:1,preferences:living.preferences,legacy,original:living.original}} ready={living.loaded} onRestore={restore}/>;
}
