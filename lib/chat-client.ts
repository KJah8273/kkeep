import {CHAT_GIF_MAX,type ChatProfile} from './chat-model';

export class ChatApiError extends Error {
  constructor(message: string, public status: number, public retryAfter = 0) {super(message);this.name='ChatApiError';}
}

type ChatRequestOptions = {method?: string; body?: unknown; signal?: AbortSignal; contentType?: string};
export async function chatRequest<T>(path: string, options: ChatRequestOptions = {}): Promise<T> {
  const raw = options.body instanceof Blob;
  const timeout = AbortSignal.timeout(20000);
  const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
  const response = await fetch('/api/chat'+path, {
    method: options.method || 'GET', credentials:'same-origin', cache:'no-store', signal,
    headers: {'X-Kkeep-Profile':'1', ...(options.body!==undefined ? {'Content-Type':options.contentType || (raw ? (options.body as Blob).type : 'application/json')} : {})},
    body: options.body===undefined ? undefined : raw ? options.body as Blob : JSON.stringify(options.body),
  });
  const result = await response.json().catch(()=>({error:'Chat could not be reached. Please try again.'}));
  if (!response.ok) throw new ChatApiError(result.error || 'Chat could not be reached. Please try again.', response.status, Number(response.headers.get('Retry-After') || 0));
  return result as T;
}

export function announceChatProfile(profile: ChatProfile) {
  window.dispatchEvent(new CustomEvent('kkeep-chat-profile-change', {detail:profile}));
}

/** Prepare static images for upload while preserving the original frames of GIFs. */
export async function prepareChatMedia(file: File, kind: 'avatar' | 'banner'): Promise<Blob> {
  const header=new Uint8Array(await file.slice(0,12).arrayBuffer());
  const gif=header.length>=10&&String.fromCharCode(...header.slice(0,6)).match(/^GIF8[79]a$/)!==null;
  if(gif){
    if(file.size>CHAT_GIF_MAX)throw new Error('Choose a GIF smaller than 8 MB.');
    const width=header[6]|header[7]<<8,height=header[8]|header[9]<<8;
    if(width<32||height<32)throw new Error('Choose a GIF that is at least 32 × 32 pixels.');
    const maxHeight=kind==='banner'?1024:2048;
    if(width>2048||height>maxHeight)throw new Error('Choose a '+kind+' GIF no larger than 2048 × '+maxHeight+' pixels.');
    if(width*height>2100000)throw new Error('Choose a smaller GIF, up to 2.1 million pixels.');
    return file.type==='image/gif'?file:new Blob([file],{type:'image/gif'});
  }
  if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw new Error('Choose a JPG, PNG, WebP, or GIF.');
  if(file.size>12*1024*1024)throw new Error('Choose an image smaller than 12 MB.');
  const url=URL.createObjectURL(file);
  try{
    const image=await new Promise<HTMLImageElement>((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(new Error('This image could not be opened. Try another file.'));img.src=url;});
    if(!image.naturalWidth||!image.naturalHeight)throw new Error('This image has no image data.');
    const width=kind==='avatar'?256:960,height=kind==='avatar'?256:320;
    const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
    const context=canvas.getContext('2d');if(!context)throw new Error('Image editing is unavailable in this browser.');
    const ratio=width/height,sourceWidth=Math.min(image.naturalWidth,image.naturalHeight*ratio),sourceHeight=sourceWidth/ratio;
    context.fillStyle='#17181c';context.fillRect(0,0,width,height);
    context.drawImage(image,(image.naturalWidth-sourceWidth)/2,(image.naturalHeight-sourceHeight)/2,sourceWidth,sourceHeight,0,0,width,height);
    return await new Promise<Blob>((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('This image could not be prepared.')),'image/png'));
  }finally{URL.revokeObjectURL(url);}
}

export const prepareChatAvatar=(file:File)=>prepareChatMedia(file,'avatar');

export function normalizeChatColor(value:string|null|undefined,fallback='#eeeeee'):string{
  return value&&/^#[0-9a-f]{6}$/i.test(value)?value.toLowerCase():fallback;
}

/** Preserve a chosen name hue, brightening it only when it is hard to read. */
export function chatNameColor(value:string|null|undefined,background='#111111'):string{
  const hex=normalizeChatColor(value),bg=normalizeChatColor(background,'#111111');
  const rgb=(color:string)=>[1,3,5].map(index=>parseInt(color.slice(index,index+2),16));
  const luminance=(color:number[])=>color.map(value=>{const channel=value/255;return channel<=.04045?channel/12.92:((channel+.055)/1.055)**2.4;}).reduce((total,channel,index)=>total+channel*[.2126,.7152,.0722][index],0);
  const base=rgb(hex),back=luminance(rgb(bg));
  const contrast=(color:number[])=>{const front=luminance(color);return(Math.max(front,back)+.05)/(Math.min(front,back)+.05);};
  if(contrast(base)>=4.5)return hex;
  const target=(back+.05)/.05>1.05/(back+.05)?0:255;
  for(let step=1;step<=20;step++){
    const adjusted=base.map(channel=>Math.round(channel+(target-channel)*step/20));
    if(contrast(adjusted)>=4.5)return '#'+adjusted.map(channel=>channel.toString(16).padStart(2,'0')).join('');
  }
  return target===0?'#000000':'#ffffff';
}
