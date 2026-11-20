import assets from './wallpaper-assets.json' with {type:'json'};
export type AppearanceColors={background:string;surface:string;raised:string;text:string;muted:string;accent:string;ink:string;highlight:string};
const colors:AppearanceColors={background:'#0b0e11',surface:'#141a1f',raised:'#243038',text:'#eff5f6',muted:'#b6c3c9',accent:'#b5f4df',ink:'#111a20',highlight:'#f1f6e7'};
export const photoWallpapers=assets.map(asset=>({...asset,position:'center',colors}));
export type PhotoWallpaper=typeof photoWallpapers[number];
