'use client';
import {useEffect,useMemo,useState} from 'react';
import Link from 'next/link';
import {ArrowLeft,CalendarDays,Film,LoaderCircle,Play,Radio,RefreshCw,Search,Trophy,X} from 'lucide-react';
import SportsPlayer,{type SportsSelection as Selection} from '@/components/sports-player';
import {sportsPhoto} from '@/lib/sports-media';
import MovieAppearance from '@/components/movie-appearance';
import {eventTitle,sportGroup,normalizeEvents,type SportsEvent} from '@/lib/sports';

function useSportsFeed(){
 const [items,setItems]=useState<SportsEvent[]>([]),[error,setError]=useState(''),[loading,setLoading]=useState(true),[revision,setRevision]=useState(0),[updated,setUpdated]=useState('');
 useEffect(()=>{
  const controller=new AbortController();let busy=false;
  async function refresh(){
   if(busy)return;busy=true;
   try{let data;
    try{const r=await fetch('/api/sports/schedule',{signal:controller.signal});if(!r.ok)throw Error('Server feed unavailable');data=await r.json();if(!Array.isArray(data.items))throw Error('Invalid feed');}
    catch(e){if(controller.signal.aborted)throw e;const r=await fetch('https://matchora.to/api/v1/schedule?watchable=1',{signal:controller.signal,credentials:'omit',referrerPolicy:'no-referrer'});if(!r.ok)throw Error('The sports feed is unavailable. Try again shortly.');const raw=await r.json();data={items:normalizeEvents(raw),updatedAt:new Date().toISOString()};}if(!controller.signal.aborted){setItems(data.items);setUpdated(data.updatedAt);setError('');}}
   catch(e){if(!controller.signal.aborted)setError(e instanceof Error?e.message:'Unable to load sports.');}
   finally{busy=false;if(!controller.signal.aborted)setLoading(false);}
  }
  void refresh();const timer=setInterval(()=>{if(!document.hidden)void refresh();},60000);
  return()=>{controller.abort();clearInterval(timer);};
 },[revision]);
 return {items,error,loading,updated,retry:()=>{setLoading(true);setRevision(x=>x+1);}};
}
function Badge({src,name}:{src:string;name:string}){const [failed,setFailed]=useState(false);return src&&!failed?<img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" onError={()=>setFailed(true)}/>:<span className="sports-monogram" aria-hidden="true">{name.slice(0,2).toUpperCase()||'VS'}</span>;}
function when(e:SportsEvent){if(e.live)return e.score?'LIVE · '+e.score:'LIVE';if(e.finished)return 'Finished';return e.kickoff?new Date(e.kickoff*1000).toLocaleString(undefined,{weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}):'Time to be announced';}
function EventCard({event,onSelect}:{event:SportsEvent;onSelect:(s:Selection)=>void}){return <button className="sports-card" type="button" onClick={()=>onSelect({title:eventTitle(event),url:event.url,feeds:event.feeds,photo:sportsPhoto(sportGroup(event))})} aria-label={'Watch '+eventTitle(event)}>
 <div className={'sports-card-art'+(sportGroup(event)==='UFC & MMA'?' sports-combat':'')}><img className="sports-card-photo" src={sportsPhoto(sportGroup(event))} alt="" loading="lazy"/><div className="sports-card-top"><span>{sportGroup(event)}</span>{event.live&&<span className="sports-live"><i/>LIVE</span>}</div><div className="sports-matchup"><Badge src={event.homeBadge} name={event.home}/>{event.away?<><span className="sports-vs">VS</span><Badge src={event.awayBadge} name={event.away}/></>:<Trophy size={44} aria-hidden="true"/>}</div><span className="sports-card-play"><Play size={20} fill="currentColor"/></span></div>
 <strong>{eventTitle(event)}</strong><small>{event.league||event.sport}</small><span className="sports-time">{when(event)}</span>
 </button>;}
export default function SportsCatalog(){
 const [query,setQuery]=useState(''),[sport,setSport]=useState('All sports'),[timing,setTiming]=useState('All events'),[limit,setLimit]=useState(36),[selection,setSelection]=useState<Selection|null>(null);
 const events=useSportsFeed();
 const [now,setNow]=useState(0);useEffect(()=>{setNow(Date.now());const timer=setInterval(()=>setNow(Date.now()),60000);return()=>clearInterval(timer);},[]);
 useEffect(()=>setLimit(36),[query,sport,timing]);
 const active=events.items.filter(e=>!e.finished),live=active.filter(e=>e.live);
 const sorted=useMemo(()=>[...events.items].sort((a,b)=>Number(b.live)-Number(a.live)||Number(a.finished)-Number(b.finished)||a.kickoff-b.kickoff),[events.items]);
 const hero=sorted.find(e=>e.live)||sorted.find(e=>!e.finished&&e.kickoff*1000>now)||sorted.find(e=>!e.finished);
 const groups=['All sports','Football','UFC & MMA','Basketball','Motorsport','Combat','More'];
 const filtered=sorted.filter(e=>{
  const group=sportGroup(e),sportMatch=sport==='All sports'||(sport==='More'?!groups.includes(group):group===sport);
  const today=now>0&&new Date(e.kickoff*1000).toDateString()===new Date(now).toDateString();
  return sportMatch&&(timing==='All events'||timing==='Live now'&&e.live||timing==='Today'&&today||timing==='Upcoming'&&!e.live&&!e.finished&&e.kickoff*1000>now)&&(eventTitle(e)+' '+e.league+' '+group).toLowerCase().includes(query.toLowerCase());
 });
 const feed=events,count=filtered.length;
 return <main className="movie-app sports-app">
  <header className="movie-topbar"><Link href="/" prefetch={false} className="movie-back" aria-label="Back to Kkeep"><ArrowLeft size={18}/><img src="/kkeep-portrait.png?v=1" alt="" width={23} height={23}/><span>kkeep</span></Link><div className="movie-active-tab"><Trophy size={16}/>Live Sports</div><Link className="sports-movie-link" href="/movies" prefetch={false}><Film size={16}/>Movie</Link><div className="movie-topbar-end"><MovieAppearance paused={!!selection}/></div></header>
  <div className="movie-container"><div className="movie-heading"><h1><Radio size={20}/>Live Sports</h1><div className="movie-search"><Search size={18}/><input aria-label="Search sports" placeholder="Teams, leagues, UFC…" value={query} onChange={e=>setQuery(e.target.value)} maxLength={120}/>{query&&<button type="button" aria-label="Clear sports search" onClick={()=>setQuery('')}><X size={17}/></button>}</div></div>
  {!query&&sport==='All sports'&&hero&&<section className="sports-hero" aria-label="Featured event"><img className="sports-hero-photo" src={sportsPhoto(sportGroup(hero))} alt="" fetchPriority="high"/><div className="sports-hero-pitch" aria-hidden="true"><div/><span/></div><div className="sports-hero-copy"><div className="sports-eyebrow">{hero.live?<span className="sports-live"><i/>LIVE NOW</span>:'COMING UP'}<span>{sportGroup(hero)}</span></div><p className="sports-league">{hero.league}</p><h2>{hero.home}{hero.away&&<><span>vs</span>{hero.away}</>}</h2><p className="sports-hero-date"><CalendarDays size={16}/>{when(hero)}</p><button type="button" className="movie-primary" onClick={()=>setSelection({title:eventTitle(hero),url:hero.url,feeds:hero.feeds,photo:sportsPhoto(sportGroup(hero))})}><Play size={16} fill="currentColor"/>{hero.live?'Watch live':'Open player'}</button></div><div className="sports-hero-badges"><Badge src={hero.homeBadge} name={hero.home}/>{hero.away&&<Badge src={hero.awayBadge} name={hero.away}/>}</div><div className="sports-hero-bottom"><span>FOOTBALL · UFC & MMA · MORE</span><span>{live.length?live.length+' live events':'Explore the schedule'}</span></div></section>}
  <div className="sports-browse-tools"><div className="sports-filters" aria-label="Sport">{groups.map(g=><button type="button" key={g} aria-pressed={sport===g} onClick={()=>setSport(g)}>{g}</button>)}</div><button type="button" className="sports-refresh" aria-label="Refresh sports" onClick={feed.retry}><RefreshCw size={16}/></button></div>
  <div className="sports-section-head"><h2>{sport==='All sports'?'Match centre':sport}</h2><select aria-label="Event time filter" value={timing} onChange={e=>setTiming(e.target.value)}>{['All events','Live now','Today','Upcoming'].map(t=><option key={t}>{t}</option>)}</select></div>
  {feed.error&&<div className="movie-error" role="alert"><span>{feed.error}{feed.items.length>0?' Showing the last loaded listings.':''}</span><button type="button" onClick={feed.retry}>Retry</button></div>}
  {feed.loading&&!feed.items.length?<div className="sports-loading" role="status"><LoaderCircle className="spin" size={20}/>Loading sports…</div>:<><div className="sports-grid">{filtered.slice(0,limit).map(e=><EventCard key={e.id} event={e} onSelect={setSelection}/>)}</div>{!count&&!feed.error&&<div className="sports-empty"><Radio size={30}/><h3>{timing==='Live now'?'No live events listed right now':'No matches found'}</h3><p>{timing==='Live now'?'Check today’s matches or upcoming events.':'Try another sport or search term.'}</p></div>}{count>limit&&<button className="sports-more" type="button" onClick={()=>setLimit(n=>n+36)}>Show more ({count-limit})</button>}</>}
  <footer className="sports-footer"><span>Listings by Matchora · Photos are cover artwork, not live snapshots.</span><span>Event and regional availability can change. {feed.updated&&'Updated '+new Date(feed.updated).toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'})}</span></footer>
  </div>{selection&&<SportsPlayer key={selection.url} selection={selection} onClose={()=>setSelection(null)}/>}
 </main>;
}
