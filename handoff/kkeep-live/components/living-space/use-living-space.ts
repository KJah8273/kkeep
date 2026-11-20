'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {captureOriginal,defaults,readPreferences,SETTINGS_KEY,validatePreferences,type LegacyAppearance,type Preferences} from '@/lib/living-space/model';
import {toast} from 'sonner';
export function useLivingSpace(ready:boolean,legacy:LegacyAppearance){
 const [preferences,setPreferences]=useState<Preferences>(defaults),[original,setOriginal]=useState<LegacyAppearance>(legacy),[loaded,setLoaded]=useState(false);
 const previous=useRef<Preferences|null>(null),current=useRef(preferences);current.current=preferences;
 const hydrated=useRef(false);
 useEffect(()=>{if(!ready||hydrated.current)return;hydrated.current=true;try{setOriginal(captureOriginal(localStorage,legacy));const saved=readPreferences(localStorage);if(!localStorage.getItem(SETTINGS_KEY)){saved.motion=legacy.moving?'system':'reduced';saved.particles=legacy.dense?32:24;}setPreferences(saved);}catch{}setLoaded(true);},[ready,legacy]);
 const commit=useCallback((value:Preferences,remember=true)=>{const valid=validatePreferences(value);if(remember)previous.current=current.current;current.current=valid;setPreferences(valid);try{localStorage.setItem(SETTINGS_KEY,JSON.stringify(valid));return true;}catch{toast('Applied for this visit. Appearance storage is unavailable.');return false;}},[]);
 const undo=useCallback(()=>{if(previous.current){const value=previous.current;previous.current=null;commit(value,false);toast('Previous appearance restored.');}},[commit]);
 useEffect(()=>{const change=(event:StorageEvent)=>{if(event.key===SETTINGS_KEY){setPreferences(readPreferences(localStorage));}};window.addEventListener('storage',change);return()=>window.removeEventListener('storage',change);},[]);
 return {preferences,original,loaded,commit,undo,restoreOriginal:setOriginal};
}
