'use client';
import {Search,Gamepad2,Film,Trophy} from 'lucide-react';
import {useEffect,useState,type FormEvent,type MouseEvent} from 'react';
import Link from 'next/link';
import {apps,clashRoyaleUrl,type App} from '@/lib/apps';
import {linkedGames} from '@/lib/games/linked-games';
import {prepareProxy} from '@/lib/proxy-client';
import {Button} from '@/components/ui/button';
import ProxyPicker from './proxy-picker';
import SearchPicker from './search-picker';
import type {SearchProvider} from '@/lib/search-providers';
import type {ProxyEngine} from '@/lib/proxy-engines';
import {Dialog,DialogTrigger,DialogContent,DialogHeader,DialogTitle,DialogDescription} from '@/components/ui/dialog';

function enterGameFullscreen(event:MouseEvent<HTMLAnchorElement>){
  if(event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
  const page=document.documentElement as HTMLElement & {webkitRequestFullscreen?:()=>void};
  // Keep the fullscreen request inside the tap; client navigation retains this document.
  try{
    if(!document.fullscreenElement){
      if(page.requestFullscreen)void page.requestFullscreen().catch(()=>{});
      else page.webkitRequestFullscreen?.();
    }
  }catch{/* The game still fills the window when native fullscreen is unavailable. */}
}

export default function KkeepHome({onSearch,onApp,onFocusChange,onBusyChange,engine,onEngineChange,searchProvider,onSearchProviderChange}:{searchProvider:SearchProvider;onSearchProviderChange:(value:SearchProvider)=>void;engine:ProxyEngine;onEngineChange:(value:ProxyEngine)=>void;onFocusChange?:(value:boolean)=>void;onBusyChange?:(value:boolean)=>void;onSearch:(value:string)=>void;onApp:(app:App)=>void}){
  const [query,setQuery]=useState(''),[gamesOpen,setGamesOpen]=useState(false),[playersOpen,setPlayersOpen]=useState(false);
  useEffect(()=>{const params=new URLSearchParams(location.search),panel=params.get('panel');if(params.get('games')==='1'||panel==='games'){setGamesOpen(true);onBusyChange?.(true);history.replaceState(null,'','/');}else if(panel==='players'){setPlayersOpen(true);onBusyChange?.(true);history.replaceState(null,'','/');}},[]);
  useEffect(()=>()=>{onFocusChange?.(false);onBusyChange?.(false);},[onFocusChange,onBusyChange]);
  function submit(event:FormEvent){event.preventDefault();if(query.trim())onSearch(query);}
  return <section className="home-content" aria-label="Kkeep home">
    <div className="home-inner">
      <h1 className="home-wordmark">kkeep</h1>
      <form className="home-search" onSubmit={submit} role="search">
        <Search size={24} aria-hidden="true"/><div className="search-choices"><ProxyPicker value={engine} onChange={onEngineChange}/><SearchPicker value={searchProvider} onChange={onSearchProviderChange}/></div>
        <input aria-label="Search or enter URL" placeholder="Search or enter URL…" value={query} onFocus={()=>{prepareProxy();onFocusChange?.(true);}} onBlur={()=>onFocusChange?.(false)} onChange={event=>setQuery(event.target.value)} autoComplete="off" autoCapitalize="none" spellCheck={false}/>
        {query.trim()&&<Button type="submit" variant="ghost" className="search-submit">Go</Button>}
      </form>
      <nav className="home-shortcuts" aria-label="Apps">
        <Link href="/movies" prefetch={false} className="shortcut" aria-label="Open Movie"><Film size={39} aria-hidden="true"/><span>Movie</span></Link>
        {apps.filter(app=>app.cloud!=='clash'&&app.cloud!=='roblox').sort((a,b)=>(a.name==='TikTok'?0:a.name==='YouTube'?1:2)-(b.name==='TikTok'?0:b.name==='YouTube'?1:2)).map(app=><a className="shortcut" key={app.name} href={app.external?app.url:app.path} aria-label={'Open '+app.name+(app.external||app.native?'':' through Kkeep')}
          onPointerEnter={app.native||app.engine||app.external?undefined:prepareProxy} onPointerDown={app.native||app.engine||app.external?undefined:prepareProxy} onFocus={app.native||app.engine||app.external?undefined:prepareProxy}
          onClick={event=>{if(app.native||app.engine||app.external||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;event.preventDefault();onApp(app);}}>
          <img src={app.icon} width={48} height={48} alt=""/>
          <span>{app.name}</span>
        </a>)}
        <Dialog open={gamesOpen} onOpenChange={value=>{setGamesOpen(value);onBusyChange?.(value);}}>
          <DialogTrigger asChild><button type="button" className="shortcut" data-menu-panel="games" aria-label="Open Games"><Gamepad2 size={39} aria-hidden="true"/><span>Games</span></button></DialogTrigger>
          <DialogContent className="proxy-dialog games-dialog">
            <DialogHeader><DialogTitle>Games</DialogTitle><DialogDescription className="sr-only">Choose a game to play.</DialogDescription></DialogHeader>
            <div className="game-library">
              <a href="/roblox" aria-label="Play Roblox"><img className="player-game-cover" src="/icons/roblox.svg" width={160} height={100} alt="" loading="lazy"/><span>Roblox</span></a>
              {linkedGames.filter(game=>!game.mainMenu).map(game=>
                <Link key={game.slug} href={`/play/${game.slug}`} prefetch={false} onClick={enterGameFullscreen} aria-label={`Play ${game.name}`}>
                  <img className={game.coverFit==='contain'?'player-game-cover':undefined} src={game.cover} width={160} height={100} alt="" loading="lazy"/><span>{game.name}</span>
                </Link>
              )}
              <a href={clashRoyaleUrl}><img src="/icons/clash-royale.webp" width={160} height={100} alt="" loading="lazy"/><span>Clash Royale</span></a>
              <a href="/play/how-to-fish"><img src="/games/covers/how-to-fish.webp" width={160} height={100} alt="" loading="lazy"/><span>How to Fish</span></a>
              <a href="/play/stick-war-legacy"><img src="/games/covers/stick-war-legacy.webp" width={160} height={100} alt="" loading="lazy"/><span>Stick War: Legacy</span></a>
              <a href="/play/subway-surfers"><img src="/games/covers/subway-surfers.webp" width={160} height={100} alt="" loading="lazy"/><span>Subway Surfers</span></a>
              <a href="/play/idle-mining-empire"><img src="/games/covers/idle-mining-empire.webp" width={160} height={100} alt="" loading="lazy"/><span>Idle Mining Empire</span></a>
              <a href="/play/solar-smash"><img src="/games/covers/solar-smash.webp" width={160} height={100} alt="" loading="lazy"/><span>Solar Smash</span></a>
              <a href="/play/kick-the-buddy"><img src="/games/covers/kick-the-buddy.webp" width={160} height={100} alt="" loading="lazy"/><span>Kick the Buddy</span></a>
              <a href="/play/geometry-dash"><img src="/games/covers/geometry-dash.webp" width={160} height={100} alt="" loading="lazy"/><span>Geometry Dash</span></a>
              <a href="/play/bad-piggies"><img src="/games/covers/bad-piggies.webp" width={160} height={100} alt="" loading="lazy"/><span>Bad Piggies</span></a>
              <a href="/play/trees-hate-you"><img src="/games/covers/trees-hate-you.webp" width={160} height={100} alt="" loading="lazy"/><span>Trees Hate You</span></a>
              <a href="/play/angry-birds"><img src="/games/covers/angry-birds.webp" width={160} height={100} alt="" loading="lazy"/><span>Angry Birds</span></a>
            </div>
          </DialogContent>
        </Dialog>
        <Dialog open={playersOpen} onOpenChange={value=>{setPlayersOpen(value);onBusyChange?.(value);}}>
          <DialogTrigger asChild><button type="button" className="shortcut" data-menu-panel="players" aria-label="Open 4-2 players"><span style={{display:"flex",width:72,height:48,gap:3,alignItems:"center"}}><img src="/games/covers/234-player-games-official.png" style={{width:34,height:44,objectFit:"cover",borderRadius:7}} alt=""/><img src="/games/covers/1234-unity.png" style={{width:34,height:44,objectFit:"cover",borderRadius:7}} alt=""/></span><span>4-2 players</span></button></DialogTrigger>
          <DialogContent className="proxy-dialog games-dialog">
            <DialogHeader><DialogTitle>4-2 players</DialogTitle><DialogDescription className="sr-only">Choose a game to play together.</DialogDescription></DialogHeader>
            <div className="game-library">
              <Link href="/party-games" prefetch={false} onClick={enterGameFullscreen}><img className="player-game-cover" src="/games/covers/1234-unity.png" width={160} height={100} alt="" loading="lazy"/><span>1 2 3 4 Player Games</span></Link>
              <a href="https://player1234.testerqrr1.chatgpt.site/"><img className="player-game-cover" src="/games/covers/234-player-games-official.png" width={160} height={100} alt="" loading="lazy"/><span>2 3 4 Player Games</span></a>
              <a href="/play/stickman-duel"><img src="/games/covers/stickman-duel.webp" width={160} height={100} alt="" loading="lazy"/><span>Stickman Duel</span></a>
            </div>
          </DialogContent>
        </Dialog>
        <Link href="/roblox" prefetch={false} className="shortcut" onClick={enterGameFullscreen} aria-label="Open Roblox"><img className="hgola-cover" src="/games/covers/roblox-blue.svg" width={72} height={54} alt=""/><span>Roblox</span></Link>
        <Link href="/hgola-altara" prefetch={false} className="shortcut" onClick={enterGameFullscreen} aria-label="افتح هجولة الطارة">
          <img className="hgola-cover" src="/games/covers/hgola-altara.webp" width={72} height={54} alt=""/>
          <span lang="ar" dir="rtl">هجولة الطارة</span>
        </Link>
        <Link href="/stick-fight" prefetch={false} className="shortcut" onClick={enterGameFullscreen} aria-label="Open Stick Fight"><img className="hgola-cover" src="/games/covers/stick-fight.png" width={72} height={54} alt=""/><span>Stick Fight</span></Link>
        {linkedGames.filter(game=>game.mainMenu).map(game=><Link key={game.slug} href={`/play/${game.slug}`} prefetch={false} className="shortcut" onClick={enterGameFullscreen} aria-label={`Open ${game.name}`}><img className="hgola-cover" src={game.cover} width={72} height={54} alt=""/><span>{game.name}</span></Link>)}
      </nav>
    </div>
  </section>;
}
