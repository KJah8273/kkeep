export type WallpaperMedia={id:string;kind:'image'|'video';blob:Blob;poster:Blob;width:number;height:number;name:string;created:number};
const DB_NAME='kkeep-wallpaper-media-v1';
const TYPES=['image/jpeg','image/png','image/webp','image/avif','video/mp4','video/webm'];
export function validateMediaFile(file:Pick<File,'type'|'size'>){if(!TYPES.includes(file.type))throw new Error('Choose a JPG, PNG, WebP, AVIF, MP4, or WebM file.');if(file.size<=0||file.size>(file.type.startsWith('video/')?40:16)*1024*1024)throw new Error('Use an image under 16 MB or a short video under 40 MB.');}
export function validateSignature(bytes:Uint8Array,type:string){
 const starts=(v:number[])=>v.every((n,i)=>bytes[i]===n),text=(a:number,b:number)=>String.fromCharCode(...bytes.slice(a,b));
 const valid=type==='image/png'?starts([137,80,78,71,13,10,26,10]):type==='image/jpeg'?starts([255,216,255]):type==='image/webp'?text(0,4)==='RIFF'&&text(8,12)==='WEBP':type==='image/avif'?text(4,8)==='ftyp'&&/avif|avis/.test(text(8,32)):type==='video/mp4'?text(4,8)==='ftyp'&&!/avif|avis/.test(text(8,32)):type==='video/webm'?starts([26,69,223,163]):false;
 if(!valid)throw new Error('The file contents do not match a supported image or video format.');
}
function database():Promise<IDBDatabase>{return new Promise((resolve,reject)=>{let settled=false;const fail=(message:string)=>{if(settled)return;settled=true;clearTimeout(timeout);reject(new Error(message));};const timeout=setTimeout(()=>fail('Wallpaper storage is taking too long. Try again.'),4000);let r:IDBOpenDBRequest;try{r=indexedDB.open(DB_NAME,1);}catch{fail('Wallpaper storage is unavailable.');return;}r.onupgradeneeded=()=>r.result.createObjectStore('media',{keyPath:'id'});r.onsuccess=()=>{clearTimeout(timeout);if(settled){r.result.close();return;}settled=true;resolve(r.result);};r.onerror=()=>fail('Wallpaper storage is unavailable.');r.onblocked=()=>fail('Close another Kkeep settings window and try again.');});}
async function transaction<T>(mode:IDBTransactionMode,run:(store:IDBObjectStore)=>IDBRequest<T>):Promise<T>{const db=await database();return new Promise((resolve,reject)=>{const t=db.transaction('media',mode),r=run(t.objectStore('media'));t.oncomplete=()=>{db.close();resolve(r.result);};t.onabort=t.onerror=()=>{db.close();reject(new Error('Could not save this wallpaper. Browser storage may be full.'));};});}
export const getMedia=(id:string)=>transaction<WallpaperMedia|undefined>('readonly',s=>s.get(id));
export const listMedia=()=>transaction<WallpaperMedia[]>('readonly',s=>s.getAll());
export const removeMedia=(id:string)=>transaction('readwrite',s=>s.delete(id));
export async function saveMedia(file:File):Promise<WallpaperMedia>{
 validateMediaFile(file);const existing=await listMedia();if(existing.length>=8||existing.reduce((n,m)=>n+m.blob.size,0)+file.size>100*1024*1024)throw new Error('Wallpaper storage has a 100 MB / 8 file limit. Remove an unused upload first.');
 validateSignature(new Uint8Array(await file.slice(0,32).arrayBuffer()),file.type);
 const url=URL.createObjectURL(file),video=file.type.startsWith('video/'),element=video?document.createElement('video'):new Image();
 try{
  if(element instanceof HTMLVideoElement){element.muted=true;element.playsInline=true;element.preload='auto';if(!element.canPlayType(file.type))throw new Error('This browser cannot decode that video format.');}
  await new Promise<void>((resolve,reject)=>{const timeout=setTimeout(()=>{cleanup();reject(new Error('This file could not be decoded in time. Try a smaller file.'));},12000);const cleanup=()=>{clearTimeout(timeout);element.onload=null;element.onerror=null;element.removeEventListener('loadeddata',done);};const done=()=>{cleanup();resolve();};element.onload=done;element.addEventListener('loadeddata',done);element.onerror=()=>{cleanup();reject(new Error('This browser could not decode the file.'));};element.src=url;});
  const width=element instanceof HTMLVideoElement?element.videoWidth:element.naturalWidth,height=element instanceof HTMLVideoElement?element.videoHeight:element.naturalHeight;
  if(width<320||height<180||width>8192||height>8192||width*height>24000000)throw new Error('Use a wallpaper between 320 × 180 and 24 megapixels.');
  if(element instanceof HTMLVideoElement&&(width*height>1920*1080||!Number.isFinite(element.duration)||element.duration>90))throw new Error('Use a looping video up to 1080p and 90 seconds.');
  const canvas=document.createElement('canvas'),scale=Math.min(1,1440/width);canvas.width=Math.round(width*scale);canvas.height=Math.round(height*scale);const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Image preview is unavailable.');ctx.drawImage(element,0,0,canvas.width,canvas.height);
  const poster=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('Could not create the preview.')),'image/jpeg',.85));
  const record:WallpaperMedia={id:'upload:'+crypto.randomUUID(),kind:video?'video':'image',blob:file,poster,width,height,name:file.name.slice(0,80),created:Date.now()};await transaction('readwrite',s=>s.put(record));return record;
 }finally{if(element instanceof HTMLVideoElement){element.pause();element.removeAttribute('src');element.load();}else element.src='';URL.revokeObjectURL(url);}
}
export function preloadImage(src:string,signal?:AbortSignal):Promise<void>{return new Promise((resolve,reject)=>{const image=new Image();let finished=false;const end=(error?:Error)=>{if(finished)return;finished=true;clearTimeout(timeout);image.onload=null;image.onerror=null;signal?.removeEventListener('abort',abort);error?reject(error):resolve();};const abort=()=>{image.src='';end(new Error('Wallpaper selection cancelled.'));};const timeout=setTimeout(()=>end(new Error('Wallpaper did not load. Your previous choice is safe.')),12000);image.onload=()=>end();image.onerror=()=>end(new Error('Wallpaper did not load. Your previous choice is safe.'));signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();else image.src=src;});}
/** Extract a small suggested local accent. No pixels leave the device. */
export async function sampleAccent(blob:Blob):Promise<string>{const url=URL.createObjectURL(blob);try{const img=new Image();img.src=url;await img.decode();const c=document.createElement('canvas');c.width=c.height=24;const ctx=c.getContext('2d');if(!ctx)throw new Error('Palette preview is unavailable.');ctx.drawImage(img,0,0,24,24);const data=ctx.getImageData(0,0,24,24).data;let r=0,g=0,b=0,n=0;for(let i=0;i<data.length;i+=4){if(data[i]+data[i+1]+data[i+2]>80){r+=data[i];g+=data[i+1];b+=data[i+2];n++;}}return '#'+[r,g,b].map(x=>Math.round(160+(x/Math.max(n,1))*95/255).toString(16).padStart(2,'0')).join('');}finally{URL.revokeObjectURL(url);}}

/** Restore only validated account-owned wallpaper media. */
export async function restoreMedia(record:WallpaperMedia){
 if(!/^upload:[a-f0-9-]{36}$/.test(record.id))throw Error('Invalid wallpaper identifier.');
 validateMediaFile(record.blob);validateSignature(new Uint8Array(await record.blob.slice(0,32).arrayBuffer()),record.blob.type);
 if(record.width<320||record.height<180||record.width*record.height>24000000)throw Error('Invalid wallpaper dimensions.');
 await transaction('readwrite',s=>s.put(record));
}
