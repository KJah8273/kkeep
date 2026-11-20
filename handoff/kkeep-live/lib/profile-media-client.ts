import {getMedia,restoreMedia} from './living-space/media';
export async function syncSelectedMedia(id:string,direction:'upload'|'download'){
 if(!id.startsWith('upload:'))return;
 const local=await getMedia(id);
 if(direction==='download'&&local)return;
 if(direction==='upload'){
  if(!local)throw Error('This wallpaper file is missing.');
  for(const part of ['blob','poster'] as const){
   const file=local[part],r=await fetch('/api/profile-media?id='+encodeURIComponent(id)+'&part='+part,{method:'PUT',headers:{'X-Kkeep-Profile':'1','Content-Type':file.type,'X-Kkeep-Media':JSON.stringify({width:local.width,height:local.height})},body:file,signal:AbortSignal.timeout(90000)});
   if(!r.ok)throw Error('Wallpaper backup failed. Your local wallpaper is safe.');
  }
 }else{
  const fetchPart=async(part:string)=>{const r=await fetch('/api/profile-media?id='+encodeURIComponent(id)+'&part='+part,{headers:{'X-Kkeep-Profile':'1'},signal:AbortSignal.timeout(90000)});if(!r.ok)throw Error('Could not restore this wallpaper. Try again.');return r;};
  const r=await fetchPart('blob'),info=JSON.parse(r.headers.get('X-Kkeep-Media')||'{}'),blob=await r.blob(),poster=await (await fetchPart('poster')).blob();
  await restoreMedia({id,kind:info.kind,blob,poster,width:info.width,height:info.height,name:'',created:Date.now()});
 }
}
