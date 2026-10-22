import {photoWallpapers} from '../wallpapers.ts';
import type {AppearanceColors} from '../wallpapers.ts';
export type Scene={id:string;name:string;category:'Space'|'Nature'|'Abstract';poster:string;motion:'orbit'|'aurora'|'dust'|'ocean'|'paper';accent:string;description:string};
export const scenes:Scene[]=[
 {id:'deep-orbit',name:'Deep Orbit',category:'Space',poster:'/living-scenes/deep-orbit.svg',motion:'orbit',accent:'#b7d6ff',description:'A distant planet and a quiet field of stars.'},
 {id:'aurora-glass',name:'Aurora Glass',category:'Nature',poster:'/living-scenes/aurora-glass.svg',motion:'aurora',accent:'#96e7cd',description:'Soft ribbons of light above a still horizon.'},
 {id:'desert-after-dark',name:'Desert After Dark',category:'Nature',poster:'/living-scenes/desert-after-dark.svg',motion:'dust',accent:'#edc89b',description:'Midnight dunes, warm edges, and drifting dust.'},
 {id:'lunar-silence',name:'Lunar Silence',category:'Space',poster:'/living-scenes/lunar-silence.svg',motion:'dust',accent:'#c7d2e5',description:'A moonlit landscape with room to breathe.'},
 {id:'midnight-ocean',name:'Midnight Ocean',category:'Nature',poster:'/living-scenes/midnight-ocean.svg',motion:'ocean',accent:'#91d4e4',description:'A dark horizon and slowly shifting reflections.'},
 {id:'paper-depth',name:'Paper Depth',category:'Abstract',poster:'/living-scenes/paper-depth.svg',motion:'paper',accent:'#d1e6a0',description:'Sculpted paper forms with soft, layered shadows.'},
];
export function wallpaperInfo(id:string,original:string){
 const resolved=id==='original'?original:id;
 const scene=scenes.find(s=>s.id===resolved),photo=photoWallpapers.find(p=>p.id===resolved);
 return {id:resolved,name:scene?.name??photo?.name??(resolved==='none'?'No wallpaper':resolved==='constellation'?'Constellation':resolved.startsWith('upload:')?'My upload':'Stars'),src:scene?.poster??photo?.src??'',poster:scene?.poster??photo?.previewSrc??'',scene,photo};
}
export function sceneColors(accent:string):AppearanceColors{return {background:'#0b0e11',surface:'#141a1f',raised:'#243038',text:'#eff5f6',muted:'#b6c3c9',accent,ink:'#111a20',highlight:'#f1f6e7'};}
