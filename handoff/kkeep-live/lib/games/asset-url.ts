// Local wrappers can use a CDN <base> for engine files while retaining Kkeep's
// shared player, cover and save adapter. Root /games/ assets belong to Kkeep
// only when the entry document itself is hosted here.
export function gameAssetUrl(value:string,entry:string,documentBase:string,origin:string,game:{slug:string;origins:readonly string[]}){
 try{
  const localEntry=new URL(entry,origin);
  const localAsset=localEntry.origin===origin&&localEntry.pathname.startsWith('/games/')&&value.startsWith('/games/');
  const url=new URL(value,localAsset?localEntry:documentBase),index=game.origins.indexOf(url.origin);
  if(url.origin===origin&&url.pathname.startsWith('/games/'))return origin+'/api/game-public'+url.pathname+url.search+url.hash;
  return index<0?url.href:origin+'/api/game-resource/'+game.slug+'/'+index+url.pathname+url.search+url.hash;
 }catch{return value;}
}
