// Each finger owns its input. Releasing an action never releases the movement stick.
export class TouchInput {
 constructor(canvas,win=window){this.canvas=canvas;this.win=win;this.sources=new Map();this.keys=new Set();this.mouseButtons=0;this.started=new Map();this.pending=new Map();}
 set(source,codes){clearTimeout(this.pending.get(source));this.pending.delete(source);if(!this.sources.has(source))this.started.set(source,Date.now());this.sources.set(source,new Set(codes));this.sync();}
 release(source,minimumHold=0){
  const remaining=minimumHold-(Date.now()-(this.started.get(source)||0));
  if(this.sources.has(source)&&remaining>0){clearTimeout(this.pending.get(source));this.pending.set(source,setTimeout(()=>this.release(source),remaining));return;}
  clearTimeout(this.pending.get(source));this.pending.delete(source);this.started.delete(source);this.sources.delete(source);this.sync();
 }
 reset(){for(const timer of this.pending.values())clearTimeout(timer);this.pending.clear();this.started.clear();this.sources.clear();this.sync();}
 sync(){
  const next=new Set([...this.sources.values()].flatMap(v=>[...v]));
  const previous=this.keys;this.keys=next;
  for(const code of previous)if(!next.has(code))this.emit(code,false);
  for(const code of next)if(!previous.has(code))this.emit(code,true);
 }
 emit(code,down){
  if(code.startsWith('Mouse')){const button=Number(code.slice(5));const bit=button===2?2:1;this.mouseButtons=down?this.mouseButtons|bit:this.mouseButtons&~bit;this.mouse(down?'mousedown':'mouseup',button);return;}
  const special={Space:[' ',32],ShiftLeft:['Shift',16],ControlLeft:['Control',17],Tab:['Tab',9],Escape:['Escape',27],Enter:['Enter',13],ArrowUp:['ArrowUp',38],ArrowDown:['ArrowDown',40],ArrowLeft:['ArrowLeft',37],ArrowRight:['ArrowRight',39]};
  const [key,num]=special[code]||(code.startsWith('Key')?[code.slice(3).toLowerCase(),code.charCodeAt(3)]:[code.slice(5),code.charCodeAt(5)]);
  const event=new this.win.KeyboardEvent(down?'keydown':'keyup',{key,code,keyCode:num,which:num,shiftKey:this.keys.has('ShiftLeft'),ctrlKey:this.keys.has('ControlLeft'),bubbles:true,cancelable:true});
  Object.defineProperties(event,{keyCode:{value:num},which:{value:num}});this.canvas.dispatchEvent(event);
 }
 mouse(type,button=0,dx=0,dy=0){
  const r=this.canvas.getBoundingClientRect();
  // A locked mouse stays inside the canvas. Accumulating absolute coordinates
  // eventually put casts outside the game after looking around on an iPad.
  const e=new this.win.MouseEvent(type,{bubbles:true,cancelable:true,button,buttons:this.mouseButtons,clientX:r.left+r.width/2,clientY:r.top+r.height/2,shiftKey:this.keys.has('ShiftLeft'),ctrlKey:this.keys.has('ControlLeft')});
  Object.defineProperties(e,{movementX:{value:dx},movementY:{value:dy}});this.canvas.dispatchEvent(e);
 }
 look(dx,dy){this.mouse('mousemove',0,dx,dy);}
}
export function movement(x,y){const keys=[];if(x<-.25)keys.push('KeyA');if(x>.25)keys.push('KeyD');if(y<-.25)keys.push('KeyW');if(y>.25)keys.push('KeyS');return keys;}
