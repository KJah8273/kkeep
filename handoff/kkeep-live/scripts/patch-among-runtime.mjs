import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
export function patchAmongRuntime(source){
 const replace=(before,after)=>{if(source.split(before).length!==2)throw Error('Among Us runtime changed: '+before.slice(0,75));source=source.replace(before,after);};
 // Legacy Unity must not turn a denied/absent camera API into a fatal startup error.
 replace('MediaStreamTrack.getSources(gotSources)}navigator.mediaDevices.enumerateDevices()',
 'MediaStreamTrack.getSources(gotSources);return}navigator.mediaDevices.enumerateDevices()');
 replace('console.log(err.name+": "+error.message)','console.log(err.name+": "+err.message)');
 // Safari throws for non-finite spatial-audio coordinates. Ignore only invalid updates.
 for(const [name,args,values] of [
  ['SetPosition','channelInstance,x,y,z','x,y,z'],
  ['SetListenerPosition','x,y,z','x,y,z'],
  ['SetListenerOrientation','x,y,z,xUp,yUp,zUp','x,y,z,xUp,yUp,zUp'],
 ]){
  const signature='function _JS_Sound_'+name+'('+args+'){';
  replace(signature,signature+'if(!['+values+'].every(Number.isFinite))return;');
 }
 return source;
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const dir=new URL('../public/games/among-us-old/Build/',import.meta.url);
 const source=readFileSync(new URL('framework.original.js',dir),'utf8');
 const patched=patchAmongRuntime(source);
 writeFileSync(new URL('framework.js',dir),patched);
 writeFileSync(new URL('framework.static.js',dir),'window.KkeepAmongFramework = '+patched+';\n');
 console.log('Patched Among Us runtime; source SHA256 '+createHash('sha256').update(source).digest('hex'));
}
