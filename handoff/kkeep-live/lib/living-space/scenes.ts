import {photoWallpapers} from '../wallpapers.ts';
import {movingWallpapers,defaultMovingWallpaper} from '../moving-wallpapers.ts';
import type {AppearanceColors} from '../wallpapers.ts';
export type Scene={id:string;name:string;category:'Space'|'Nature'|'Abstract';poster:string;motion:'orbit'|'aurora'|'dust'|'ocean'|'paper';accent:string;description:string};
export const scenes:Scene[]=[];
export function wallpaperInfo(id:string,original:string){
 const requested=id==='original'?original:id;
 const resolved=photoWallpapers.some(p=>p.id===requested)||movingWallpapers.some(p=>p.id===requested)||requested.startsWith('upload:')?requested:defaultMovingWallpaper.id;
 const scene=scenes.find(s=>s.id===resolved),photo=photoWallpapers.find(p=>p.id===resolved);
 const moving=movingWallpapers.find(p=>p.id===resolved);
 return {id:resolved,name:moving?.name??scene?.name??photo?.name??(resolved.startsWith('upload:')?'My upload':'Wallpaper'),src:moving?.src??scene?.poster??photo?.src??'',poster:moving?.poster??scene?.poster??photo?.previewSrc??'',scene,photo,moving};
}
export function sceneColors(accent:string):AppearanceColors{return {background:'#0b0e11',surface:'#141a1f',raised:'#243038',text:'#eff5f6',muted:'#b6c3c9',accent,ink:'#111a20',highlight:'#f1f6e7'};}
