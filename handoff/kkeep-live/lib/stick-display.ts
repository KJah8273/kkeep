// The embedded WebPort UI resizes the canvas behind Unity's back while disabling
// Unity's resize handling. The GL viewport/camera then retains the old size and
// the lower-resolution buffer shows only a cropped part of the arena.
const manualMode='function _WebPortInstallUI(){Module["matchWebGLToCanvasSize"]=false;';
const manualResize='if(key!==lastSize){lastSize=key;canvas.width=width;canvas.height=height}';
export function patchStickDisplay(source:string){
 // Touch only the known adapter, never arbitrary Unity internals. An upstream
 // update with a different implementation keeps its original framework.
 if(source.split(manualMode).length!==2||source.split(manualResize).length!==2)return source;
 return source.replace(manualMode,'function _WebPortInstallUI(){Module["matchWebGLToCanvasSize"]=true;')
  .replace(manualResize,'if(key!==lastSize){lastSize=key;Module["devicePixelRatio"]=ratio}');
}

// Unity can cache its initial canvas selector before WebPort renames the
// element. Emscripten's resize calls then return -4 for the old selector,
// leaving the drawing buffer at its previous size. Both names refer to the
// same game canvas; preserve normal lookup for every other target.
const canvasTarget='function findCanvasEventTarget(target){return findEventTarget(target)}';
const stableCanvasTarget='function findCanvasEventTarget(target){var selector=maybeCStringToJsString(target);if((selector==="#canvas"||selector==="#unity-canvas")&&Module["canvas"])return Module["canvas"];return findEventTarget(target)}';
export function patchStickCanvasTarget(source:string){
 if(source.includes(stableCanvasTarget)||source.split(canvasTarget).length!==2)return source;
 return source.replace(canvasTarget,stableCanvasTarget);
}

// Some game audio updates contain NaN/Infinity coordinates on iOS Safari.
// AudioParam.value rejects those values and throws out of Unity's main loop,
// stopping the entire game. Ignore only the invalid audio update; valid
// positions and all gameplay remain untouched.
const soundPosition='function _JS_Sound_SetPosition(channelInstance,x,y,z){if(WEBAudio.audioWebEnabled==0)return;var channel=WEBAudio.audioInstances[channelInstance];channel.setPosition(x,y,z)}';
const safeSoundPosition='function _JS_Sound_SetPosition(channelInstance,x,y,z){if(WEBAudio.audioWebEnabled==0)return;if(!Number.isFinite(x)||!Number.isFinite(y)||!Number.isFinite(z))return;var channel=WEBAudio.audioInstances[channelInstance];channel.setPosition(x,y,z)}';
export function patchStickAudioPosition(source:string){
 if(source.includes(safeSoundPosition))return source;
 if(source.split(soundPosition).length!==2)return source;
 return source.replace(soundPosition,safeSoundPosition);
}
