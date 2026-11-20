'use client';
import {RadioGroup,RadioGroupItem} from '@/components/ui/radio-group';
import {isWallpaper,type Wallpaper} from '@/lib/themes';
import {photoWallpapers} from '@/lib/wallpapers';

const effects=[
  {id:'stars',name:'Moving stars'},
  {id:'constellation',name:'Constellation'},
  {id:'none',name:'Plain background'},
] as const;

function EffectPreview({id}:{id:typeof effects[number]['id']}){
  return <span className={`wallpaper-effect wallpaper-effect-${id}`} aria-hidden="true">
    {id==='constellation'&&<svg viewBox="0 0 180 112" preserveAspectRatio="xMidYMid slice">
      <path d="M18 81 48 35 92 58 125 23 159 51 142 92 92 58 69 97M48 35 125 23" fill="none" stroke="currentColor" strokeWidth=".7" opacity=".45"/>
      {[[18,81],[48,35],[92,58],[125,23],[159,51],[142,92],[69,97]].map(([cx,cy])=><circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="1.7" fill="currentColor"/>)}
    </svg>}
  </span>;
}

export default function WallpaperPicker({value,onChange}:{value:Wallpaper;onChange:(value:Wallpaper)=>void}){
  return <RadioGroup className="wallpaper-picker" value={value} onValueChange={next=>{if(isWallpaper(next))onChange(next);}} aria-labelledby="wallpaper-heading">
    <div className="wallpaper-gallery">
      {photoWallpapers.map(wallpaper=><label htmlFor={`wallpaper-${wallpaper.id}`} className={'wallpaper-choice '+(value===wallpaper.id?'selected':'')} key={wallpaper.id}>
        <img src={wallpaper.previewSrc} width={wallpaper.width} height={wallpaper.height} alt="" loading="lazy" decoding="async" style={{objectPosition:wallpaper.position}}/>
        <RadioGroupItem id={`wallpaper-${wallpaper.id}`} className="sr-only" value={wallpaper.id} aria-label={wallpaper.name}/>
      </label>)}
    </div>
  </RadioGroup>;
}
