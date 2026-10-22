'use client';
import {useEffect,useRef,useState} from 'react';
import {Check} from 'lucide-react';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {photoWallpapers} from '@/lib/wallpapers';
import {scenes} from '@/lib/living-space/scenes';
import {listMedia,preloadImage,type WallpaperMedia} from '@/lib/living-space/media';
function Upload({media,selected,onSelect}:{media:WallpaperMedia;selected:boolean;onSelect:()=>void}){
 const [url,setUrl]=useState('');useEffect(()=>{const u=URL.createObjectURL(media.poster);setUrl(u);return()=>URL.revokeObjectURL(u);},[media]);
 return <button className="wallpaper-choice" aria-label="Uploaded wallpaper" aria-pressed={selected} onClick={onSelect}>{url&&<img src={url} alt=""/>}{selected&&<Check/>}</button>;
}
export default function WallpaperGallery({open,onOpenChange,value,onSelect}:{open:boolean;onOpenChange:(open:boolean)=>void;value:string;onSelect:(id:string)=>void}){
 const [uploads,setUploads]=useState<WallpaperMedia[]>([]),[error,setError]=useState('');const request=useRef<AbortController|null>(null);
 useEffect(()=>{let live=true;if(open)void listMedia().then(v=>{if(live)setUploads(v);}).catch(()=>{});return()=>{live=false;request.current?.abort();};},[open]);
 async function choose(id:string,src?:string){request.current?.abort();const controller=new AbortController();request.current=controller;setError('');try{if(src)await preloadImage(src,controller.signal);if(!controller.signal.aborted)onSelect(id);}catch(e){if(!controller.signal.aborted)setError((e as Error).message);}}
 const images=[...photoWallpapers.map(p=>({id:p.id,src:p.src,poster:p.previewSrc,name:p.name})),...scenes.map(p=>({id:p.id,src:p.poster,poster:p.poster,name:p.name}))];
 return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="proxy-dialog wallpaper-only"><DialogHeader className="sr-only"><DialogTitle>Wallpaper</DialogTitle><DialogDescription>Choose a wallpaper.</DialogDescription></DialogHeader><div className="wallpaper-gallery">
 {['stars','constellation','none'].map(id=><button key={id} className="wallpaper-choice" aria-label={id} aria-pressed={value===id} onClick={()=>choose(id)}><span className={'wallpaper-effect wallpaper-effect-'+id}/>{value===id&&<Check/>}</button>)}
 {images.map(p=><button key={p.id} className="wallpaper-choice" aria-label={p.name} aria-pressed={value===p.id} onClick={()=>choose(p.id,p.src)}><img src={p.poster} alt="" loading="lazy" decoding="async"/>{value===p.id&&<Check/>}</button>)}
 {uploads.map(media=><Upload key={media.id} media={media} selected={value===media.id} onSelect={()=>choose(media.id)}/>)}
 </div>{error&&<p role="alert">{error}</p>}</DialogContent></Dialog>;
}
