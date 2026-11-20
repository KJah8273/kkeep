export const MENU_EFFECTS_KEY='kkeep-menu-effects-v1';
export const MENU_EFFECTS_EVENT='kkeep-menu-effects-change';
export type MenuEffects={motion:'auto'|'full'|'reduced';snow:boolean;smooth:boolean};
export const defaultMenuEffects:MenuEffects={motion:'full',snow:true,smooth:true};
export function parseMenuEffects(raw:string|null):MenuEffects{
  try{
    const value=JSON.parse(raw||'null');
    if(!value||typeof value!=='object')return {...defaultMenuEffects};
    return {motion:['auto','full','reduced'].includes(value.motion)?value.motion:defaultMenuEffects.motion,snow:typeof value.snow==='boolean'?value.snow:true,smooth:typeof value.smooth==='boolean'?value.smooth:true};
  }catch{return {...defaultMenuEffects};}
}
export function menuMotionAllowed(effects:MenuEffects,reducedByDevice:boolean){
  return effects.motion==='full'||effects.motion==='auto'&&!reducedByDevice;
}
export function readMenuEffects(storage:Pick<Storage,'getItem'>):MenuEffects{
  // This scene has its own controls. An old video-wallpaper preference must not hide it.
  try{return parseMenuEffects(storage.getItem(MENU_EFFECTS_KEY));}catch{return {...defaultMenuEffects};}
}
