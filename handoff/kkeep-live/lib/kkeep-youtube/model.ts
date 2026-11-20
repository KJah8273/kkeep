export const VIDEO_ID=/^[A-Za-z0-9_-]{11}$/;
export const CHANNEL_ID=/^UC[A-Za-z0-9_-]{22}$/;
export type VideoCard={id:string;title:string;author:string;channel:string;length:number;views:number;published:string;live:boolean};
export type SavedVideo=VideoCard&{position:number;duration:number;watched:number;saved:boolean;liked:boolean;updated:number};
export type Channel={id:string;name:string};
export type VideoState={account:{id:string;name:string};configured:boolean;history:SavedVideo[];saved:SavedVideo[];liked:SavedVideo[];subscriptions:Channel[]};
export type VideoDetails=VideoCard&{description:string;related:VideoCard[];formats:{itag:string;label:string;type:string}[];unavailable:boolean};
const clean=(value:unknown,max:number)=>typeof value==='string'?value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,'').slice(0,max):'';
export function card(value:unknown):VideoCard|null{
 if(!value||typeof value!=='object')return null;const v=value as Record<string,unknown>;
 if(!VIDEO_ID.test(String(v.videoId||''))||v.paid||v.premium)return null;
 return {id:String(v.videoId),title:clean(v.title,240)||'Untitled video',author:clean(v.author,140),channel:CHANNEL_ID.test(String(v.authorId))?String(v.authorId):'',length:Number.isFinite(v.lengthSeconds)?Math.max(0,Number(v.lengthSeconds)):0,views:Number.isFinite(v.viewCount)?Math.max(0,Number(v.viewCount)):0,published:clean(v.publishedText,80),live:v.liveNow===true};
}
export function cards(value:unknown):VideoCard[]{if(!Array.isArray(value))return [];const seen=new Set<string>();return value.map(card).filter((v):v is VideoCard=>!!v&&!seen.has(v.id)&&!!seen.add(v.id)).slice(0,60);}
export const duration=(seconds:number)=>{const s=Math.max(0,Math.floor(seconds));return s>=3600?`${Math.floor(s/3600)}:${String(Math.floor(s/60)%60).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`:`${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;};
