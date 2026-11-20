'use client';
import {useEffect,useRef,useState} from 'react';
import {Check} from 'lucide-react';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {movingWallpapers} from '@/lib/moving-wallpapers';
import {listMedia,preloadImage,type WallpaperMedia} from '@/lib/living-space/media';
function Upload({media,selected,onSelect}:{media:WallpaperMedia;selected:boolean;onSelect:()=>void}){
 const [url,setUrl]=useState('');useEffect(()=>{const u=URL.createObjectURL(media.poster);setUrl(u);return()=>URL.revokeObjectURL(u);},[media]);
 return <button className="wallpaper-choice" aria-label="Uploaded wallpaper" aria-pressed={selected} onClick={onSelect}>{url&&<img src={url} alt=""/>}{selected&&<Check/>}</button>;
}
export default function WallpaperGallery({open,onOpenChange,value,onSelect}:{open:boolean;onOpenChange:(open:boolean)=>void;value:string;onSelect:(id:string)=>void}){
 const [uploads,setUploads]=useState<WallpaperMedia[]>([]),[error,setError]=useState('');const request=useRef<AbortController|null>(null);
 useEffect(()=>{let live=true;if(open)void listMedia().then(v=>{if(live)setUploads(v);}).catch(()=>{});return()=>{live=false;request.current?.abort();};},[open]);
 async function choose(id:string,src?:string){request.current?.abort();const controller=new AbortController();request.current=controller;setError('');try{if(src)await preloadImage(src,controller.signal);if(!controller.signal.aborted)onSelect(id);}catch(e){if(!controller.signal.aborted)setError((e as Error).message);}}

 return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="proxy-dialog wallpaper-only"><DialogHeader className="sr-only"><DialogTitle>Wallpaper</DialogTitle><DialogDescription>Choose a wallpaper.</DialogDescription></DialogHeader><h2>Moving wallpapers</h2><div className="wallpaper-gallery">{movingWallpapers.map(p=><button key={p.id} className="wallpaper-choice" aria-label={p.name+' moving wallpaper'} aria-pressed={value===p.id} onClick={()=>choose(p.id,p.poster)}><img src={p.previewSrc} alt="" loading="lazy" decoding="async"/>{value===p.id&&<Check/>}</button>)}</div>{error&&<p role="alert">{error}</p>}</DialogContent></Dialog>;
}
