'use client';
import {useCallback,useEffect,useRef,useState,type ReactNode} from 'react';
import Link from 'next/link';
import {ArrowLeft,ChevronLeft,ChevronRight,Film,Info,LoaderCircle,Play,RotateCw,Search,Star,X} from 'lucide-react';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import MoviePlayer from '@/components/movie-player';
import MovieServerSelect from '@/components/movie-server-select';
import MovieAppearance from '@/components/movie-appearance';
import KkeepRail from '@/components/kkeep-rail';
import MovieSiteBrowser from '@/components/movie-site-browser';
import {Tabs,TabsContent,TabsList,TabsTrigger} from '@/components/ui/tabs';
import {movieRequest,movieTitle,movieYear,movieImage,readRecentMovies,RECENT_MOVIES_KEY,type MediaType,type Movie,type MovieList,type MovieServerChoice,type RecentMovie,type Episode} from '@/lib/movies';

function useMovieData<T>(endpoint:string,params:Record<string,string|number>,enabled=true){
  const [data,setData]=useState<T|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(enabled),[retry,setRetry]=useState(0);
  const serialized=JSON.stringify(params);
  useEffect(()=>{
    if(!enabled){setLoading(false);return;}
    const controller=new AbortController();setLoading(true);setError('');setData(null);
    movieRequest<T>(endpoint,JSON.parse(serialized),controller.signal).then(result=>{if(!controller.signal.aborted)setData(result);}).catch(err=>{if(!controller.signal.aborted)setError(err.message);}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return()=>controller.abort();
  },[endpoint,serialized,enabled,retry]);
  return {data,error,loading,retry:()=>setRetry(n=>n+1)};
}
function Rating({value}:{value?:number}){return value?<span className="movie-rating"><Star size={13} fill="currentColor"/>{value.toFixed(1)}</span>:null;}
function Card({item,type,onSelect,rank,portrait=false,progress}:{item:Movie;type:MediaType;onSelect:(item:Movie,type:MediaType)=>void;rank?:number;portrait?:boolean;progress?:number}){
  const image=movieImage(portrait?item.poster_path:item.backdrop_path||item.poster_path,portrait?'w500':'w780');
  return <button type="button" className={'movie-card'+(portrait?' movie-card-portrait':'')} onClick={()=>onSelect(item,type)} aria-label={'Open '+movieTitle(item)}>
    <div className="movie-card-art">{image&&<img src={image} alt="" loading="lazy" decoding="async"/>}<Film className="movie-art-fallback" aria-hidden="true"/>{rank&&<span className="movie-rank">{rank}</span>}<span className="movie-card-play"><Play size={22} fill="currentColor"/></span>{progress!==undefined&&<span className="movie-progress" style={{width:Math.min(100,Math.max(0,progress))*1+'%'}}/>}</div>
    <span className="movie-card-title">{movieTitle(item)}</span><span className="movie-card-meta"><span>{type==='tv'?'SERIES':'MOVIE'}</span>{movieYear(item)}<Rating value={item.vote_average}/></span>
  </button>;
}
function Row({title,items,type,onSelect,numbered=false,loading,error,retry,controls}:{title:string;items?:Movie[];type:MediaType;onSelect:(item:Movie,type:MediaType)=>void;numbered?:boolean;loading?:boolean;error?:string;retry?:()=>void;controls?:ReactNode}){
  const rail=useRef<HTMLDivElement>(null);
  return <section className="movie-section" aria-label={title}><div className="movie-section-head"><h2>{title}</h2><div className="movie-row-controls">{controls}<button type="button" aria-label={'Scroll '+title+' left'} onClick={()=>rail.current?.scrollBy({left:-(rail.current.clientWidth*.8),behavior:'smooth'})}><ChevronLeft size={18}/></button><button type="button" aria-label={'Scroll '+title+' right'} onClick={()=>rail.current?.scrollBy({left:rail.current.clientWidth*.8,behavior:'smooth'})}><ChevronRight size={18}/></button></div></div>
    {error?<div className="movie-error" role="alert"><span>{error}</span><button type="button" onClick={retry}><RotateCw size={15}/>Retry</button></div>:<div className="movie-rail" ref={rail}>{loading?Array.from({length:5},(_,i)=><div key={i} className="movie-skeleton" aria-hidden="true"/>):items?.map((item,i)=><Card key={item.id} item={item} type={type} rank={numbered?i+1:undefined} onSelect={onSelect}/>)}</div>}
    {!loading&&!error&&!items?.length&&<p className="movie-empty">No titles available.</p>}
  </section>;
}
function TypeSwitch({value,onChange,label}:{value:MediaType;onChange:(type:MediaType)=>void;label:string}){return <div className="movie-type-switch" role="group" aria-label={label}><button type="button" aria-pressed={value==='movie'} onClick={()=>onChange('movie')}>Movies</button><button type="button" aria-pressed={value==='tv'} onClick={()=>onChange('tv')}>TV Shows</button></div>;}

function MovieDetails({item,type,recent,server,onServerChange,onProgress,onClose,startPlaying=false}:{item:Movie;type:MediaType;recent?:RecentMovie;server:MovieServerChoice;onServerChange:(server:MovieServerChoice)=>void;onProgress:(entry:RecentMovie)=>void;onClose:()=>void;startPlaying?:boolean}){
  const [playing,setPlaying]=useState(startPlaying&&type==='movie'),[season,setSeason]=useState(recent?.season||1),[episode,setEpisode]=useState(recent?.episode||1);
  const info=useMovieData<Movie>('info',{tmdbId:item.id,type});
  const episodes=useMovieData<{episodes:Episode[]}>('season',{tmdbId:item.id,s:season,type:'tv'},type==='tv'&&!playing);
  const detail=info.data?{...item,...info.data}:item;
  const seasons=detail.seasons?.filter(s=>s.season_number>0)||[];
  const entry=recent&&recent.season===season&&recent.episode===episode?recent:undefined;
  return <Dialog open onOpenChange={open=>{if(!open)onClose();}}><DialogContent className="movie-dialog" showCloseButton={false}>
    <DialogHeader className="sr-only"><DialogTitle>{movieTitle(item)}</DialogTitle><DialogDescription>Movie details, episodes, and playback.</DialogDescription></DialogHeader>
    <button type="button" className="movie-dialog-close" aria-label="Close movie" onClick={onClose}><X size={22}/></button>
    {playing?<MoviePlayer key={item.id+'-'+season+'-'+episode} item={detail} type={type} season={season} episode={episode} server={server} onServerChange={onServerChange} resume={entry?.time||0} onBack={()=>setPlaying(false)} onProgress={(time,duration)=>onProgress({item:{id:item.id,title:movieTitle(detail),backdrop_path:detail.backdrop_path,poster_path:detail.poster_path,vote_average:detail.vote_average,release_date:detail.release_date,first_air_date:detail.first_air_date},type,season,episode,time,duration})}/>:<>
      <div className="movie-detail-art" style={detail.backdrop_path?{backgroundImage:`linear-gradient(0deg,#101012 0%,transparent 100%),url("${movieImage(detail.backdrop_path,'w1280')}")`}:undefined}/>
      <div className="movie-detail-copy"><div className="movie-eyebrow">{type==='tv'?'TV SERIES':'MOVIE'}</div><h2>{movieTitle(detail)}</h2><div className="movie-detail-meta"><Rating value={detail.vote_average}/><span>{movieYear(detail)}</span>{detail.runtime&&<span>{Math.floor(detail.runtime/60)}h {detail.runtime%60}m</span>}{detail.genres?.map(g=><span key={g.id}>{g.name}</span>)}</div>
      <p>{detail.overview||'Choose a title to start watching.'}</p>
      {type==='movie'?<button type="button" className="movie-primary" onClick={()=>setPlaying(true)}><Play size={18} fill="currentColor"/>{entry&&entry.time<entry.duration-30?'Resume':'Play movie'}</button>:<div className="movie-episodes"><label className="movie-season-label">Season<select aria-label="Select season" value={season} onChange={e=>{setSeason(Number(e.target.value));setEpisode(1);}}>{seasons.length?seasons.map(s=><option value={s.season_number} key={s.season_number}>{s.name||'Season '+s.season_number}</option>):<option value={season}>Season {season}</option>}</select></label>
        {episodes.loading?<div className="movie-empty" role="status"><LoaderCircle className="spin" size={20}/>Loading episodes…</div>:episodes.error?<div className="movie-error" role="alert">{episodes.error}<button type="button" onClick={episodes.retry}>Retry</button></div>:episodes.data?.episodes?.length?<div className="movie-episode-list">{episodes.data.episodes.map(ep=><button type="button" key={ep.id||ep.episode_number} onClick={()=>{setEpisode(ep.episode_number);setPlaying(true);}} aria-label={`Play episode ${ep.episode_number}: ${ep.name}`}><span className="movie-episode-number">{ep.episode_number}</span>{ep.still_path&&<img src={movieImage(ep.still_path,'w300')} alt="" loading="lazy"/>}<span><strong>{ep.name}</strong><small>{ep.overview}</small></span><Play size={18}/></button>)}</div>:<p className="movie-empty">No episodes are available for this season.</p>}
      </div>}
      {info.error&&<p className="movie-detail-note">Additional details could not load. <button type="button" onClick={info.retry}>Retry details</button></p>}
      </div>
    </>}
  </DialogContent></Dialog>;
}

const providers=[{id:8,name:'Netflix',mark:'N',color:'#e50914'},{id:350,name:'Apple TV+',mark:'tv+',color:'#fff'},{id:9,name:'Amazon Prime',mark:'prime',color:'#00a8e1'},{id:15,name:'Hulu',mark:'hulu',color:'#1ce783'},{id:1899,name:'Max',mark:'max',color:'#8985ff'},{id:531,name:'Paramount+',mark:'P+',color:'#639bff'},{id:337,name:'Disney+',mark:'D+',color:'#7baaff'}];
const movieWebsites=[{id:'movy',name:'Movy',url:'https://www.movy.sx/'},{id:'cinera',name:'Cinera',url:'https://cinera.cfd/'}];
const sourceStorageKey='kkeep-movie-source-v1';
export default function MovieCatalog(){
  const [source,setSource]=useState('movies'),[sourceReady,setSourceReady]=useState(false),[notice,setNotice]=useState('');
  const canFallback=useRef(true);
  const [server,setServer]=useState<MovieServerChoice>('auto');
  const [query,setQuery]=useState(''),[debounced,setDebounced]=useState(''),[searchType,setSearchType]=useState<'all'|MediaType>('all');
  const [provider,setProvider]=useState(8),[providerType,setProviderType]=useState<MediaType>('movie'),[genreType,setGenreType]=useState<MediaType>('movie'),[genre,setGenre]=useState(28);
  const [heroIndex,setHeroIndex]=useState(0),[recent,setRecent]=useState<RecentMovie[]>([]),[selection,setSelection]=useState<{item:Movie;type:MediaType;play?:boolean}|null>(null);
  const input=useRef<HTMLInputElement>(null);
  const libraryActive=sourceReady&&source==='movies';
  const trending=useMovieData<MovieList>('trending',{type:'movie'},libraryActive);
  // One real catalogue request checks availability. Avoid sending the other
  // four requests to an unavailable service or keeping them alive off-tab.
  const libraryAvailable=libraryActive&&!!trending.data&&!trending.error;
  const shows=useMovieData<MovieList>('trending',{type:'tv'},libraryAvailable);
  const byProvider=useMovieData<MovieList>('discover',{type:providerType,provider},libraryAvailable);
  const genres=useMovieData<{genres:{id:number;name:string}[]}>('genres',{type:genreType},libraryAvailable);
  const byGenre=useMovieData<MovieList>('discover',{type:genreType,genre},libraryAvailable);
  const searchMovies=useMovieData<MovieList>('search',{type:'movie',q:debounced},libraryAvailable&&!!debounced&&searchType!=='tv');
  const searchShows=useMovieData<MovieList>('search',{type:'tv',q:debounced},libraryAvailable&&!!debounced&&searchType!=='movie');
  const top=trending.data?.results.slice(0,5)||[],hero=top[heroIndex%Math.max(1,top.length)];
  const select=useCallback((item:Movie,type:MediaType)=>setSelection({item,type}),[]);
  const chooseSource=useCallback((value:string)=>{
    if(value!=='movies'&&!movieWebsites.some(site=>site.id===value))return;
    canFallback.current=false;setSelection(null);setNotice('');setSource(value);
    try{sessionStorage.setItem(sourceStorageKey,value);}catch{}
  },[]);
  useEffect(()=>{
    setRecent(readRecentMovies());
    try{const saved=sessionStorage.getItem(sourceStorageKey);if(saved==='movies'||movieWebsites.some(site=>site.id===saved)){canFallback.current=false;setSource(saved!);}}catch{}
    setSourceReady(true);
  },[]);
  useEffect(()=>{
    if(!libraryActive||!trending.error||!canFallback.current)return;
    canFallback.current=false;setSource('cinera');
    setNotice('Library is unavailable right now. Cinera has been opened so you can keep browsing.');
  },[libraryActive,trending.error]);
  useEffect(()=>{const timer=setTimeout(()=>setDebounced(query.trim()),300);return()=>clearTimeout(timer);},[query]);
  useEffect(()=>{
    if(source!=='movies')return;
    const key=(e:KeyboardEvent)=>{if(e.key==='/'&&!selection&&!['INPUT','TEXTAREA','SELECT'].includes((e.target as HTMLElement).tagName)){e.preventDefault();input.current?.focus();}if(e.key==='Escape'&&!selection)setQuery('');};
    window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);
  },[selection,source]);
  useEffect(()=>{if(source!=='movies'||selection||query||top.length<2||window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;const timer=setInterval(()=>{if(!document.hidden)setHeroIndex(i=>(i+1)%top.length);},8000);return()=>clearInterval(timer);},[selection,query,top.length,source]);
  useEffect(()=>{if(genres.data?.genres.length&&!genres.data.genres.some(g=>g.id===genre))setGenre(genres.data.genres[0].id);},[genres.data,genre]);
  const saveProgress=useCallback((entry:RecentMovie)=>{
    const entries=[entry,...readRecentMovies().filter(x=>x.item.id!==entry.item.id||x.type!==entry.type)].slice(0,20);
    try{localStorage.setItem(RECENT_MOVIES_KEY,JSON.stringify(entries));}catch{}
    setRecent(entries);
  },[]);
  const searching=!!query.trim();
  const results=[...(searchType!=='tv'?(searchMovies.data?.results||[]).map(item=>({item,type:'movie' as const})):[]),...(searchType!=='movie'?(searchShows.data?.results||[]).map(item=>({item,type:'tv' as const})):[])];
  const searchLoading=query.trim()!==debounced||(searchType!=='tv'&&searchMovies.loading)||(searchType!=='movie'&&searchShows.loading);
  const searchError=(searchType!=='tv'&&searchMovies.error)||(searchType!=='movie'&&searchShows.error);
  return <Tabs value={source} onValueChange={chooseSource} asChild><main className="movie-app movie-with-sources">
    <KkeepRail active="movies"/>
    <header className="movie-topbar"><Link href="/" prefetch={false} className="kkeep-corner-logo" aria-label="Back to Kkeep"><img src="/kkeep-icon.png" alt="" width={31} height={31}/></Link><span className="movie-wordmark">Movies</span><div className="movie-topbar-end"><MovieAppearance paused={!!selection||source!=='movies'}/></div></header>
    <div className="movie-source-toolbar"><TabsList className="movie-source-tabs" aria-label="Movie sources"><TabsTrigger value="movies">Library</TabsTrigger>{movieWebsites.map(site=><TabsTrigger key={site.id} value={site.id}>{site.name}</TabsTrigger>)}</TabsList>{source==='movies'&&<MovieServerSelect label="Library playback server" value={server} onChange={setServer}/>}</div>
    {notice&&<div className="movie-source-notice" role="status"><span>{notice}</span><button type="button" onClick={()=>setNotice('')} aria-label="Dismiss source notice"><X size={18}/></button></div>}
    <TabsContent value="movies" forceMount hidden={source!=='movies'} className="movie-source-panel movie-catalog-panel">
    {!libraryAvailable?<div className="movie-container"><section className="movie-library-status" aria-label="Library status">
      {trending.error?<><Film size={30}/><h1>Library is temporarily unavailable</h1><p>Its catalogue service could not connect. Try another movie source inside Kkeep, or retry Library.</p><div className="movie-recovery-actions"><button type="button" className="movie-primary" onClick={()=>chooseSource('cinera')}>Use Cinera</button><button type="button" className="movie-secondary" onClick={()=>chooseSource('movy')}>Use Movy</button><button type="button" className="movie-secondary" onClick={trending.retry}><RotateCw size={17}/>Retry Library</button></div></>:<div className="movie-loading" role="status"><LoaderCircle className="spin"/>Loading movies…</div>}
    </section></div>:<>
    <div className="movie-container"><div className="movie-heading"><h1><Film size={20}/>Movies & Shows</h1><div className="movie-search"><Search size={18}/><input ref={input} aria-label="Search movies and TV shows" placeholder="Search movies & shows" value={query} onChange={e=>setQuery(e.target.value)} maxLength={120} autoComplete="off"/>{query?<button type="button" aria-label="Clear movie search" onClick={()=>{setQuery('');input.current?.focus();}}><X size={17}/></button>:<kbd>/</kbd>}</div></div>
    {searching?<section className="movie-search-results" aria-label="Search results"><div className="movie-search-filters" role="group" aria-label="Search type">{(['all','movie','tv'] as const).map(t=><button type="button" key={t} aria-pressed={searchType===t} onClick={()=>setSearchType(t)}>{t==='all'?'All':t==='movie'?'Movies':'TV Shows'}</button>)}</div><h2>Results for “{query.trim()}”</h2>{searchLoading?<div className="movie-empty" role="status"><LoaderCircle className="spin" size={20}/>Searching…</div>:<>{searchError&&<div className="movie-error" role="alert"><span>Some search results could not load.</span><button type="button" onClick={()=>{searchMovies.retry();searchShows.retry();}}>Retry</button></div>}<div className="movie-grid">{results.map(({item,type})=><Card key={type+item.id} item={item} type={type} onSelect={select} portrait/>)}</div>{!results.length&&!searchError&&<p className="movie-empty">No movies or shows found. Try another title.</p>}</>}</section>:<>
      <section className="movie-hero" aria-label="Featured movie" style={hero?.backdrop_path?{backgroundImage:`linear-gradient(90deg,rgba(0,0,0,.9),rgba(0,0,0,.5) 48%,rgba(0,0,0,.05)),linear-gradient(0deg,rgba(0,0,0,.65),transparent 60%),url("${movieImage(hero.backdrop_path,'w1280')}")`}:undefined}>
        {hero?<><div className="movie-hero-copy"><span className="movie-eyebrow">FEATURED MOVIE</span><h2>{movieTitle(hero)}</h2><div className="movie-hero-meta"><Rating value={hero.vote_average}/><span>{movieYear(hero)}</span></div><p>{hero.overview}</p><div className="movie-hero-actions"><button type="button" className="movie-primary" onClick={()=>setSelection({item:hero,type:'movie',play:true})}><Play size={17} fill="currentColor"/>Play</button><button type="button" className="movie-secondary" onClick={()=>select(hero,'movie')}><Info size={18}/>Details</button></div></div><div className="movie-hero-dots" aria-label="Featured movies">{top.map((item,i)=><button type="button" key={item.id} aria-label={'Feature '+movieTitle(item)} aria-pressed={heroIndex%top.length===i} onClick={()=>setHeroIndex(i)}/>)}</div></>:<div className="movie-hero-copy">{trending.error?<><h2>Movies & Shows</h2><p>{trending.error}</p><button type="button" className="movie-primary" onClick={trending.retry}><RotateCw size={17}/>Retry</button></>:<div className="movie-loading" role="status"><LoaderCircle className="spin"/>Loading movies…</div>}</div>}
      </section>
      {!!recent.length&&<section className="movie-section"><div className="movie-section-head"><h2>Continue watching</h2><button type="button" className="movie-clear-history" onClick={()=>{try{localStorage.removeItem(RECENT_MOVIES_KEY);}catch{}setRecent([]);}}>Clear</button></div><div className="movie-rail">{recent.map(entry=><Card key={entry.type+entry.item.id} item={entry.item} type={entry.type} progress={entry.time/entry.duration*100} onSelect={(item,type)=>setSelection({item,type,play:type==='movie'})}/>)}</div></section>}
      <Row title="Top 10 Movies" items={trending.data?.results.slice(0,10)} type="movie" numbered onSelect={select} loading={trending.loading} error={trending.error} retry={trending.retry}/>
      <Row title="Top 10 Shows" items={shows.data?.results.slice(0,10)} type="tv" numbered onSelect={select} loading={shows.loading} error={shows.error} retry={shows.retry}/>
      <section className="movie-section movie-provider-section" aria-label="Streaming providers"><div className="movie-section-head"><h2>Streaming providers</h2><TypeSwitch value={providerType} onChange={setProviderType} label="Provider titles"/></div><div className="movie-provider-chips">{providers.map(p=><button type="button" key={p.id} aria-pressed={provider===p.id} onClick={()=>setProvider(p.id)}><span style={{color:p.color}}>{p.mark}</span>{p.name}</button>)}</div><Row title={providers.find(p=>p.id===provider)?.name||'Provider'} items={byProvider.data?.results} type={providerType} onSelect={select} loading={byProvider.loading} error={byProvider.error} retry={byProvider.retry}/></section>
      <section className="movie-section" aria-label="Browse by genre"><div className="movie-section-head"><h2>Browse by genre</h2><TypeSwitch value={genreType} onChange={setGenreType} label="Genre titles"/></div><div className="movie-genre-chips">{genres.data?.genres?.map(g=><button type="button" key={g.id} aria-pressed={genre===g.id} onClick={()=>setGenre(g.id)}>{g.name}</button>)}</div>{genres.error&&<div className="movie-error">Genres could not load.<button type="button" onClick={genres.retry}>Retry</button></div>}{byGenre.error?<div className="movie-error" role="alert">{byGenre.error}<button type="button" onClick={byGenre.retry}>Retry</button></div>:<div className="movie-grid">{byGenre.loading?Array.from({length:12},(_,i)=><div className="movie-skeleton movie-skeleton-poster" key={i}/>):byGenre.data?.results?.map(item=><Card key={item.id} item={item} type={genreType} onSelect={select} portrait/>)}</div>}{!byGenre.loading&&!byGenre.error&&!byGenre.data?.results?.length&&<p className="movie-empty">No titles available in this genre.</p>}</section>
    </>}
    <footer className="movie-footer">Movie information and artwork from TMDB. Playback is provided by external services.</footer></div>
    </>}
    {selection&&<MovieDetails key={selection.type+selection.item.id} item={selection.item} type={selection.type} server={server} onServerChange={setServer} startPlaying={selection.play} recent={recent.find(x=>x.item.id===selection.item.id&&x.type===selection.type)} onClose={()=>setSelection(null)} onProgress={saveProgress}/>}
    </TabsContent>
    {movieWebsites.map(site=><TabsContent key={site.id} value={site.id} className="movie-source-panel">{source===site.id&&<MovieSiteBrowser name={site.name} url={site.url}/>}</TabsContent>)}
  </main></Tabs>;
}
