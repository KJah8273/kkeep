'use client';
import {useEffect,useMemo,useRef,useState,type FormEvent,type MouseEvent as ReactMouseEvent,type PointerEvent as ReactPointerEvent,type ReactNode} from 'react';
import {UserRound,Search,ArrowRight,Lightbulb,Star,Clock3,Shuffle,Play,ArrowUpRight,SlidersHorizontal,Flame,Sparkles,Palette,Globe2,Gamepad2,ChevronLeft,ChevronRight} from 'lucide-react';
import KkeepRail from './kkeep-rail';
import MenuMotion from './menu-motion';
import MenuEffectsControls,{useMenuEffects} from './menu-effects-controls';
import HomeIdentity from './home-identity';
import HomeOrbit from './home-orbit';
import '@/app/menu-orbit.css';
import {games,multiplayerGames} from '@/lib/menu-catalog';
import {GAME_LIBRARY_KEY,parseGameLibrary,rememberGame,favoriteGame,type GameLibrary} from '@/lib/menu-library';
import KkeepBackdrop,{WallpaperColorButton,WallpaperSwatches} from './kkeep-appearance';
import {inCategory,newGameIds,validPopularGames,type GameCategory,type PopularGame} from '@/lib/game-discovery';
import FeedbackFrame from './feedback-frame';
import ProfilePanel from './profile-panel';
import ProxyPicker from './proxy-picker';
import SearchPicker from './search-picker';
import {defaultSearchProvider,readSearchProvider,saveSearchProvider,type SearchProvider} from '@/lib/search-providers';
import {readProxyEngine,saveProxyEngine,type ProxyEngine} from '@/lib/proxy-engines';
import {useLivingSpace} from './living-space/use-living-space';
import {validateLegacy,type LegacyAppearance} from '@/lib/living-space/model';
import type {ProfileSnapshot} from '@/lib/profile-model';

const gameIds=games.map(game=>game.id);
const multiplayerIds=multiplayerGames.map(game=>game.id);
const gamesPerPage=24;
const collections:GameCategory[]=['Racing','Arcade','Puzzle','Action','Sports','Tycoon','.io','2–4 players'];
const homeGames=['roblox','hgola-altara','stick-fight','brawlhalla-offline'].flatMap(id=>games.filter(game=>game.id===id));
const collectionCoverIds:Partial<Record<GameCategory,string[]>>={
  Racing:['hgola-altara','blumgi-racers','monster-tracks'],
  Arcade:['geometry-dash','stickman-hook','subway-surfers'],
  Puzzle:['block-blast','cut-the-rope-2','trivia-crack'],
  Action:['vex-7','astro-survivors','mob-control'],
  Sports:['retro-bowl','soccer-skills','volley-random'],
  Tycoon:['monkey-mart','cookie-clicker','idle-mining-empire'],
  '.io':['paperio-2','harvest-io','state-io'],
  '2–4 players':['party-games','234','stickman-duel'],
};
const services=[['GeForce NOW','nvidia.svg','/gfn/'],['Xbox Cloud','xbox.svg','/xbox/index.html'],['GhostCloud','ghostcloud.svg','/browser?cloud=ghost'],['Roblox','roblox.svg','/roblox']];
type Game=(typeof games)[number];
type Shelf='discover'|'recent'|'favorites';

function GameCard({game:g,favorite,onFavorite,onPlay,eager=false}:{game:Game;favorite:boolean;onFavorite:()=>void;onPlay:()=>void;eager?:boolean}){
  return <article className="game-tile">
    <a className="game-card" href={g.url} onClick={onPlay} aria-label={'Play '+g.name}>
      <div className="game-cover"><img src={g.image} alt="" width={320} height={200} loading={eager?'eager':'lazy'} decoding="async" draggable={false}/><span className="game-play" aria-hidden="true"><Play size={18} fill="currentColor"/></span></div>
      <span className="game-name" dir="auto">{g.name}</span>
    </a>
    <button className="game-favorite" aria-label={(favorite?'Remove ':'Add ')+g.name+(favorite?' from favorites':' to favorites')} aria-pressed={favorite} onClick={onFavorite}><Star size={18} fill={favorite?'currentColor':'none'}/></button>
  </article>;
}

function FeaturedGameDeck({items,renderCard}:{items:Game[];renderCard:(game:Game)=>ReactNode}){
  const [active,setActive]=useState(0);
  const gesture=useRef<{id:number;x:number;y:number;dragging:boolean}|null>(null);
  const suppressClick=useRef(false);
  const move=(direction:number)=>setActive(index=>(index+direction+items.length)%items.length);

  function start(event:ReactPointerEvent<HTMLDivElement>){
    if(!event.isPrimary||event.button!==0)return;
    suppressClick.current=false;
    gesture.current={id:event.pointerId,x:event.clientX,y:event.clientY,dragging:false};
  }
  function drag(event:ReactPointerEvent<HTMLDivElement>){
    const current=gesture.current;
    if(!current||event.pointerId!==current.id)return;
    const x=event.clientX-current.x,y=event.clientY-current.y;
    if(!current.dragging){
      if(Math.abs(y)>10&&Math.abs(y)>Math.abs(x)){gesture.current=null;return;}
      if(Math.abs(x)<10||Math.abs(x)<=Math.abs(y))return;
      current.dragging=true;
      suppressClick.current=true;
      event.currentTarget.setPointerCapture(event.pointerId);
      event.currentTarget.dataset.dragging='true';
    }
    event.currentTarget.style.setProperty('--deck-drag',Math.max(-90,Math.min(90,x*.55))+'px');
  }
  function finish(event:ReactPointerEvent<HTMLDivElement>,commit:boolean){
    const current=gesture.current;
    if(!current||event.pointerId!==current.id)return;
    gesture.current=null;
    delete event.currentTarget.dataset.dragging;
    event.currentTarget.style.removeProperty('--deck-drag');
    const distance=event.clientX-current.x;
    if(commit&&current.dragging&&Math.abs(distance)>36)move(distance<0?1:-1);
  }

  return <div className="home-deck" role="group" aria-label="Featured games" aria-roledescription="carousel">
    <div className="home-deck-stage" onPointerDown={start} onPointerMove={drag} onPointerUp={event=>finish(event,true)} onPointerCancel={event=>finish(event,false)} onLostPointerCapture={event=>finish(event,false)}
      onPointerLeave={event=>{if(!gesture.current?.dragging)finish(event,false);}}
      onDragStart={event=>event.preventDefault()}
      onClickCapture={event=>{if(event.detail&&suppressClick.current){event.preventDefault();event.stopPropagation();suppressClick.current=false;}}}
      onKeyDown={event=>{if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();move(event.key==='ArrowLeft'?-1:1);}}}>
      {items.map((game,index)=><div key={game.id} hidden={index!==active&&index!==(active+1)%items.length&&index!==(active-1+items.length)%items.length} className="home-deck-item" data-position={index===active?'center':index===(active+1)%items.length?'next':'previous'}>{renderCard(game)}</div>)}
    </div>
    <div className="home-deck-controls">
      <button type="button" aria-label="Previous featured game" onClick={()=>move(-1)}><ChevronLeft size={19}/></button>
      <span className="home-deck-indicators" aria-hidden="true">{items.map((game,index)=><span key={game.id} data-current={index===active}/>)}</span>
      <button type="button" aria-label="Next featured game" onClick={()=>move(1)}><ChevronRight size={19}/></button>
    </div>
    <span className="sr-only" aria-live="polite">{items[active]?.name}</span>
  </div>;
}

export default function KkeepMenu({initialRoute='home'}:{initialRoute?:'home'|'games'}={}){
  const menu=useRef<HTMLDivElement>(null);
  const {effects:homeEffects}=useMenuEffects();
  const transitionTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const [leaving,setLeaving]=useState(false);
  useEffect(()=>()=>{if(transitionTimer.current)clearTimeout(transitionTimer.current);},[]);
  function navigate(event:ReactMouseEvent<HTMLDivElement>){
    if(event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.altKey||event.shiftKey)return;
    const anchor=(event.target as Element).closest<HTMLAnchorElement>('a[href]');
    if(!anchor||anchor.target||anchor.hasAttribute('download'))return;
    const url=new URL(anchor.href,location.href);
    if(url.origin!==location.origin||!['/','/games'].includes(url.pathname)||url.search)return;
    const next=url.hash.slice(1)||(url.pathname==='/games'?'games':'home');
    if(!['home','games','cloud','settings','feedback'].includes(next))return;
    event.preventDefault();
    if(transitionTimer.current)clearTimeout(transitionTimer.current);
    const commit=()=>{
      if(location.pathname+location.hash!==url.pathname+url.hash)history.pushState(null,'',url.pathname+url.hash);
      window.dispatchEvent(new Event('kkeep-menu-navigate'));
      window.scrollTo({top:0,behavior:'instant'});
      setRoute(next);setLeaving(false);transitionTimer.current=null;
    };
    if(next===route||menu.current?.dataset.motion==='off'){commit();return;}
    setLeaving(true);transitionTimer.current=setTimeout(commit,200);
  }
  const [category,setCategory]=useState<GameCategory>('All'),[popular,setPopular]=useState<PopularGame[]>([]);
  const [shown,setShown]=useState(gamesPerPage);
  const moreGames=useRef<HTMLButtonElement>(null);
  useEffect(()=>{const controller=new AbortController();fetch('/api/games/hot',{signal:controller.signal}).then(r=>r.ok?r.json():null).then(data=>setPopular(validPopularGames(data?.games,gameIds))).catch(()=>{});return()=>controller.abort();},[]);
  const [engine,setEngine]=useState<ProxyEngine>('scramjet-v2');
  const [searchProvider,setSearchProvider]=useState<SearchProvider>(defaultSearchProvider);
  const [library,setLibrary]=useState<GameLibrary>({favorites:[],recent:[]});
  const [shelf,setShelf]=useState<Shelf>('discover'),[notice,setNotice]=useState('');
  const searchOptions=useRef<HTMLDetailsElement>(null);
  useEffect(()=>{
    const outside=(event:PointerEvent)=>{if(searchOptions.current&&!searchOptions.current.contains(event.target as Node))searchOptions.current.open=false;};
    const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'&&searchOptions.current?.open){searchOptions.current.open=false;searchOptions.current.querySelector('summary')?.focus();}};
    document.addEventListener('pointerdown',outside);document.addEventListener('keydown',escape);
    return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape);};
  },[]);
  useEffect(()=>{
    setEngine(readProxyEngine());setSearchProvider(readSearchProvider());
    const read=()=>{try{setLibrary(parseGameLibrary(localStorage.getItem(GAME_LIBRARY_KEY),gameIds));}catch{}};
    const sync=(event:StorageEvent)=>{if(event.key===GAME_LIBRARY_KEY||event.key===null)read();};
    read();window.addEventListener('storage',sync);return()=>window.removeEventListener('storage',sync);
  },[]);
  function saveLibrary(next:GameLibrary){
    setLibrary(next);
    try{localStorage.setItem(GAME_LIBRARY_KEY,JSON.stringify(next));}
    catch{setNotice('Saved for this visit. Browser storage is unavailable.');}
  }
  function track(id:string){saveLibrary(rememberGame(library,id));}
  function favorite(game:Game){
    setNotice(library.favorites.includes(game.id)?game.name+' removed from favorites':game.name+' added to favorites');
    saveLibrary(favoriteGame(library,game.id));
  }
  function surprise(){
    const available=games.filter(game=>game.url.startsWith('/')&&!library.recent.slice(0,3).includes(game.id));
    const game=available[Math.floor(Math.random()*available.length)]||games[0];
    if(game){track(game.id);location.assign(game.url);}
  }
  function chooseSearchProvider(value:SearchProvider){setSearchProvider(value);saveSearchProvider(value);}
  function chooseEngine(value:ProxyEngine){setEngine(value);saveProxyEngine(value);}
  const [route,setRoute]=useState<string>(initialRoute),[query,setQuery]=useState(''),[clock,setClock]=useState(''),[profileOpen,setProfileOpen]=useState(false),[ready,setReady]=useState(false),[legacy,setLegacy]=useState<LegacyAppearance>(validateLegacy({}));
  const living=useLivingSpace(ready,legacy);
  useEffect(()=>{document.title=route==='home'?'Kkeep fun':({games:'Games',cloud:'Cloud gaming',settings:'Settings',feedback:'Fix or idea'}[route]||'Kkeep')+' · Kkeep fun';},[route]);
  useEffect(()=>{
    try{setLegacy(validateLegacy({theme:localStorage.getItem('kkeep-theme-v1'),wallpaper:localStorage.getItem('kkeep-wallpaper')}));}catch{}
    setReady(true);
    const change=()=>{
      const url=new URL(location.href),next=url.hash.slice(1)||(url.pathname==='/games'?'games':'home');
      if(transitionTimer.current){clearTimeout(transitionTimer.current);transitionTimer.current=null;}
      setLeaving(false);
      if(next==='movies'){location.replace('/movies');return;}
      if((!url.hash&&url.searchParams.get('panel')==='profile')||next==='profile'){setProfileOpen(true);setRoute('home');}
      else setRoute(url.hash?(next==='wallpapers'?'settings':next):url.searchParams.has('games')?'games':url.searchParams.get('panel')==='wallpaper'?'settings':next);
    };
    change();window.addEventListener('hashchange',change);window.addEventListener('popstate',change);
    const tick=()=>setClock(new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}));
    tick();const timer=setInterval(tick,30000);
    return()=>{window.removeEventListener('hashchange',change);window.removeEventListener('popstate',change);clearInterval(timer);};
  },[initialRoute]);
  function restore(data:ProfileSnapshot){setLegacy(data.legacy);living.restoreOriginal(data.original);living.commit(data.preferences,false);}
  function search(e:FormEvent<HTMLFormElement>){
    e.preventDefault();const value=String(new FormData(e.currentTarget).get('address')||'').trim();
    if(value&&!/^(?:javascript|data|file|vbscript):/i.test(value))location.assign('/browser?engine='+engine+'&search='+searchProvider+'&launch='+encodeURIComponent(value));
  }
  function card(game:Game,eager=false){return <GameCard key={game.id} game={game} eager={eager} favorite={library.favorites.includes(game.id)} onFavorite={()=>favorite(game)} onPlay={()=>track(game.id)}/>;}
  const filtered=useMemo(()=>{
    const searchTerm=query.trim().toLowerCase();
    return games.filter(g=>inCategory(g.id,category,multiplayerIds,library.favorites)&&g.name.toLowerCase().includes(searchTerm));
  },[category,query,library.favorites]);
  useEffect(()=>{
    if(route!=='games'||shown>=filtered.length||!moreGames.current||typeof IntersectionObserver==='undefined')return;
    const observer=new IntersectionObserver(entries=>{
      if(entries.some(entry=>entry.isIntersecting)){observer.disconnect();setShown(shown+gamesPerPage);}
    },{rootMargin:'480px 0px'});
    observer.observe(moreGames.current);
    return()=>observer.disconnect();
  },[route,shown,filtered]);
  const hotGames=popular.flatMap(item=>games.filter(g=>g.id===item.id));
  const shelfGames=shelf==='discover'?homeGames:library[shelf].flatMap(id=>games.filter(game=>game.id===id)).slice(0,3);
  return <div className="kkeep-menu" ref={menu} data-route={route}>
    <KkeepBackdrop variant="ambient" paused={profileOpen||route==='feedback'} pauseOnTouch={route==='games'}/>
    <MenuMotion root={menu} route={route} paused={profileOpen||route==='feedback'}/>
    <div className="menu-interface" onClickCapture={navigate}>
      <a className="skip" href="#main" onClick={e=>{e.preventDefault();document.getElementById('main')?.focus();}}>Skip to content</a>
      <KkeepRail active={route==='feedback'?'settings':route}/>
      <div className="shell">
        <header className="topbar">
          <a className="kkeep-corner-logo" href="/" aria-label="Kkeep home"><img src="/kkeep-icon.png" alt="" width={31} height={31}/></a>
          <div className="top-actions">
            <time data-nosnippet>{clock}</time>
            <WallpaperColorButton accent/>
            <button className="avatar-button" onClick={()=>setProfileOpen(true)} aria-label="Open Profile"><UserRound/></button>
          </div>
        </header>
        <main id="main" className="menu-screen" data-leaving={leaving} key={route} tabIndex={-1}>
          {route==='games'?<section className="page games-page">
            <div className="page-head"><div className="page-title"><span className="title-icon violet"><Gamepad2/></span><h1>Games</h1><span className="total-count">{games.length}</span></div><button className="surprise-button" onClick={surprise}><Shuffle size={17}/><span>Surprise me</span></button></div>
            {!query&&category==='All'&&hotGames.length>0&&<section className="featured-games" aria-label="Hot games"><div className="section-heading"><h2><Flame className="warm"/>Hot games</h2><span className="section-meta">Most played · 7 days</span></div><div className="hot-game-grid">{hotGames.map((g,i)=><div className="hot-game" key={g.id}><span className="game-rank" aria-label={'Rank '+(i+1)}>{String(i+1).padStart(2,'0')}</span>{card(g,true)}</div>)}</div></section>}
            <div className="browse-heading"><h2>Browse</h2><label className="game-search"><Search size={17}/><input type="search" placeholder="Search games" aria-label="Find a game" value={query} onChange={e=>{setQuery(e.target.value);setShown(gamesPerPage);}}/></label></div>
            <div className="filter-chips" role="group" aria-label="Game category">{(['All','New','Racing','.io','Tycoon','Arcade','Puzzle','Sports','Action','2–4 players','Favorites'] as GameCategory[]).map(item=><button key={item} aria-pressed={category===item} onClick={()=>{setCategory(item);setShown(gamesPerPage);}}>{item==='Favorites'&&<Star size={14}/>} {item}</button>)}</div>
            <p className="game-count" aria-live="polite">{filtered.length} games</p>
            <div className="game-grid" id="games-list">{filtered.slice(0,shown).map(g=>card(g))}</div>
            {shown<filtered.length&&<button className="more-games" ref={moreGames} type="button" aria-controls="games-list" onClick={()=>setShown(shown+gamesPerPage)}>More games</button>}
            {!filtered.length&&<div className="empty-shelf"><Star/><p>{category==='Favorites'?'No favorites yet':'No games found'}</p><button onClick={()=>{setQuery('');setCategory('All');setShown(gamesPerPage);}}>All games <ArrowRight/></button></div>}
          </section>:
          route==='cloud'?<section className="page"><div className="page-head"><h1>Cloud gaming</h1></div><div className="cloud-grid">{services.map(([name,img,url])=><a key={name} className="cloud-card" href={url}><img src={'/icons/'+img} alt=""/><h2>{name}</h2><ArrowUpRight/></a>)}</div></section>:
          route==='feedback'?<FeedbackFrame onSignIn={()=>setProfileOpen(true)}/>:
          route==='settings'?<section className="page settings-page">
            <div className="page-head"><h1>Settings</h1></div>
            <div className="settings-grid"><div className="settings-card"><h2><span className="title-icon violet"><Globe2/></span>Search</h2><div className="setting-row"><span>Proxy</span><ProxyPicker value={engine} onChange={chooseEngine}/></div><div className="setting-row"><span>Search engine</span><SearchPicker value={searchProvider} onChange={chooseSearchProvider}/></div></div>
            <div className="settings-card"><h2><span className="title-icon mint"><Palette/></span>Appearance</h2><div className="setting-row colors-row"><span>Accent color</span><WallpaperSwatches accent/></div><MenuEffectsControls/></div>
            <div className="settings-card"><h2><span className="title-icon warm"><UserRound/></span>Profile</h2><button className="settings-action" onClick={()=>setProfileOpen(true)}>Profile & saves<ArrowRight size={17}/></button></div>
            <div className="settings-card"><h2><span className="title-icon blue"><Lightbulb/></span>Feedback</h2><a className="settings-action" href="#feedback">Fix or idea<ArrowUpRight size={17}/></a></div></div>
          </section>:
          <section className="home">
            <div className="hero">
              <HomeOrbit motion={homeEffects.motion} paused={profileOpen||leaving}/>
              <div className="hero-content">
              <HomeIdentity motion={homeEffects.motion} paused={profileOpen||leaving}/>
              <form className="search-form" role="search" onSubmit={search}><Search/><input type="search" name="address" placeholder="Search or enter a URL" aria-label="Search the web or enter a URL" autoComplete="off" autoCapitalize="none" spellCheck={false} required/><details className="search-options" ref={searchOptions}><summary aria-label="Search options"><SlidersHorizontal size={18}/></summary><div className="search-options-panel"><ProxyPicker value={engine} onChange={chooseEngine}/><SearchPicker value={searchProvider} onChange={chooseSearchProvider}/></div></details><button type="submit" aria-label="Open in Kkeep Browser"><ArrowRight/></button></form>
              <div className="hero-actions"><a href="/games">Browse games<ArrowRight size={17}/></a><button type="button" onClick={surprise}><Shuffle size={17}/>Surprise me</button></div>
              <nav className="home-socials" aria-label="Social apps">{[['TikTok','tiktok.svg','/tiktok'],['Snapchat','snapchat.svg','/snapchat'],['YouTube','youtube.svg','/youtube'],['Kick','kick-mark.svg','/kick']].map(([name,img,url])=><a key={name} href={url}><span className={'social-icon social-'+name.toLowerCase()}><img src={'/icons/'+img} alt="" width={38} height={38}/></span><span>{name}</span></a>)}</nav>
              </div>
              <button type="button" className="hero-scroll-cue" onClick={()=>window.dispatchEvent(new Event('kkeep-menu-featured'))} aria-label="Explore featured games"><ArrowRight size={18}/></button>
            </div>
            <section id="featured" className="home-library" aria-label="Your games"><div className="section-heading"><div className="shelf-tabs" role="group" aria-label="Choose games to show"><button aria-pressed={shelf==='discover'} onClick={()=>setShelf('discover')}>For you</button><button aria-pressed={shelf==='recent'} onClick={()=>setShelf('recent')}>Recent</button><button aria-pressed={shelf==='favorites'} onClick={()=>setShelf('favorites')}>Favorites</button></div><a className="all-games" href="/games">All games<ArrowRight size={13}/></a></div>
              {shelf==='discover'&&shelfGames.length>1?<FeaturedGameDeck items={shelfGames} renderCard={game=>card(game,true)}/>:<div className="home-game-grid">{shelfGames.map(g=>card(g,true))}</div>}
              {!shelfGames.length&&<div className="empty-shelf">{shelf==='recent'?<Clock3/>:<Star/>}<p>{shelf==='recent'?'No recent games':'No favorites yet'}</p><a href="/games">Explore games <ArrowRight/></a></div>}
            </section>
            <section className="home-collections" aria-label="Game collections"><div className="section-heading"><h2>Find your next favorite</h2><a className="all-games" href="/games">All games<ArrowRight size={15}/></a></div><div className="collection-grid">{collections.map(item=>{
              const items=games.filter(game=>inCategory(game.id,item,multiplayerIds,[]));
              const selected=(collectionCoverIds[item]||[]).flatMap(id=>items.filter(game=>game.id===id));
              const previews=[...selected,...items.filter(game=>!selected.includes(game))].slice(0,3);
              return <a className="collection-card" href="/games" key={item} onClick={()=>{setCategory(item);setQuery('');setShown(gamesPerPage);}}><span className="collection-covers" aria-hidden="true">{previews.map(game=><img src={game.image} alt="" key={game.id} width={100} height={100} loading="lazy"/>)}</span><span className="collection-name">{item}<ArrowUpRight size={17}/></span><span className="collection-count">{items.length} games</span></a>;
            })}</div></section>
          </section>}
        </main>
        <p className="sr-only" role="status" aria-live="polite">{notice}</p>
      </div>
    </div>
    <ProfilePanel open={profileOpen} onOpenChange={setProfileOpen} ready={living.loaded} data={{version:1,preferences:living.preferences,legacy,original:living.original}} onRestore={restore}/>
  </div>;
}
