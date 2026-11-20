export type SportsFeed={name:string;url:string};
export type SportsEvent={id:string;home:string;away:string;league:string;sport:string;homeBadge:string;awayBadge:string;kickoff:number;live:boolean;finished:boolean;score:string;url:string;feeds:SportsFeed[]};
export type SportsChannel={id:string;name:string;quality:string;feeds:SportsFeed[]};
export function sportsEmbed(value:unknown):string{
 if(typeof value!=='string')return '';
 try{const u=new URL(value);return u.origin==='https://matchora.to'&&!u.username&&!u.password&&/^\/embed\/(match|channel)\/\d+$/.test(u.pathname)&&!u.search&&!u.hash?u.href:'';}catch{return '';}
}
export const eventTitle=(event:SportsEvent)=>event.home+(event.away?' vs '+event.away:'');
export function sportGroup(event:SportsEvent){
 if(/\b(?:ufc|mma|fight night)\b/i.test(eventTitle(event)+' '+event.league))return 'UFC & MMA';
 return ({Soccer:'Football',Fighting:'Combat',Motorsport:'Motorsport'} as Record<string,string>)[event.sport]||event.sport||'Other';
}

const text=(v:unknown,max=160)=>typeof v==='string'?v.slice(0,max):'';
const record=(v:unknown):Record<string,unknown>=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:{};
const array=(v:unknown):unknown[]=>Array.isArray(v)?v:[];
function image(v:unknown){try{const u=new URL(text(v,1500));return u.origin==='https://matchora.to'&&u.pathname==='/img'?u.href:'';}catch{return '';}}
function feeds(v:unknown):SportsFeed[]{return array(v).slice(0,40).map(record).filter(x=>x.dead!==true).map(x=>({name:text(x.name||x.label)+(text(x.lang)?' · '+text(x.lang):''),url:sportsEmbed(x.embed_url)})).filter(x=>x.url&&x.name);}
export function normalizeEvents(data:unknown):SportsEvent[]{
 const rows=record(data).events;if(!Array.isArray(rows))throw Error('Invalid schedule');
 return rows.slice(0,1500).map(record).map(x=>({id:text(x.id,30),home:text(x.home),away:text(x.away),league:text(x.league),sport:text(x.sport,60),homeBadge:image(x.home_badge),awayBadge:image(x.away_badge),kickoff:typeof x.kickoff==='number'&&Number.isFinite(x.kickoff)?x.kickoff:0,live:x.live===true,finished:x.finished===true,score:text(x.score,30),url:sportsEmbed(x.embed_url),feeds:feeds(x.channels)})).filter(x=>/^\d+$/.test(x.id)&&x.home&&x.url);
}
export function normalizeChannels(data:unknown):SportsChannel[]{
 const rows=record(data).channels;if(!Array.isArray(rows))throw Error('Invalid channels');
 return rows.slice(0,2500).map(record).map(x=>({id:'',name:text(x.name),quality:text(x.quality,20),feeds:feeds(x.feeds)})).filter(x=>x.name&&x.feeds.length&&/sport|espn|bein|ufc|fight|mma|boxing|tennis|golf|cricket|football|soccer|nba|nfl|nhl|mlb|racing|motors|eurosport|dazn|willow|tsn|supersport|fubo|ssc|premier|laliga|bundesliga/i.test(x.name)).map(x=>({...x,id:x.feeds[0].url.split('/').pop()!}));
}
