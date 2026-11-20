'use client';
import {useEffect,useState} from 'react';
import {createPortal} from 'react-dom';
import KkeepBackdrop,{WallpaperColorButton} from './kkeep-appearance';
export default function MovieAppearance({paused}:{paused:boolean}){
  const [background,setBackground]=useState<Element|null>(null);
  useEffect(()=>setBackground(document.querySelector('.movie-app')),[]);
  return <><WallpaperColorButton/>{background&&createPortal(<KkeepBackdrop paused={paused}/>,background)}</>;
}
