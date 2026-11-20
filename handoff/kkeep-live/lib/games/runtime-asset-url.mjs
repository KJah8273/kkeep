// fetch accepts strings, URL objects and Requests. URL.url is undefined; using
// it silently sends the game to a relative file named "undefined" instead.
export function runtimeAssetUrl(input,base,host,config){
 try{
  const url=new URL(input instanceof Request?input.url:String(input),base);
  if(url.origin===host&&url.pathname.startsWith('/games/'))return host+'/api/game-public'+url.pathname+url.search;
  const index=config.origins.indexOf(url.origin);
  return index>=0?host+'/api/game-resource/'+config.slug+'/'+index+url.pathname+url.search:url.href;
 }catch{return input;}
}
