'use client';
import KkeepBackdrop from '../kkeep-appearance';
import type {Preferences} from '@/lib/living-space/model';
// Kept as the legacy integration boundary; saved profiles cannot replace the fixed wallpaper.
export default function LivingWallpaper({paused=false}:{preferences:Preferences;original:string;paused?:boolean;tilt?:boolean;onRotate?:(id:string)=>void}){
  return <KkeepBackdrop paused={paused}/>;
}
