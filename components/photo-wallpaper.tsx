import type {PhotoWallpaper} from '@/lib/wallpapers';

export default function PhotoBackground({wallpaper}:{wallpaper:PhotoWallpaper}){
  return <div className="photo-wallpaper" aria-hidden="true">
    <img key={wallpaper.id} src={wallpaper.src} width={wallpaper.width} height={wallpaper.height} alt="" decoding="async" fetchPriority="high" style={{objectPosition:wallpaper.position}}/>
  </div>;
}
