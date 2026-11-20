import assets from './moving-wallpapers.json' with {type:'json'};
export const movingWallpapers=assets;
export const movingWallpaperIds=movingWallpapers.map(w=>w.id);
export const defaultMovingWallpaper=movingWallpapers.find(w=>w.id==='moving-minecraft-overgrown-cabin')!;
