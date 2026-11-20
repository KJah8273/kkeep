'use client';
import {Search,Gamepad2} from 'lucide-react';
import {useEffect,useState,type FormEvent,type MouseEvent} from 'react';
import Link from 'next/link';
import {apps,clashRoyaleUrl,type App} from '@/lib/apps';
import {linkedGames} from '@/lib/games/linked-games';
import {prepareProxy} from '@/lib/proxy-client';
import {Button} from '@/components/ui/button';
import {Dialog,DialogTrigger,DialogContent,DialogHeader,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import HomeIdentity from '@/components/home-identity';
import HomeOrbit,{type HomeOrbitProps} from '@/components/home-orbit';
import '@/app/legacy-home-orbit.css';

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

type KkeepHomeProps=HomeOrbitProps&{
  onFocusChange?:(value:boolean)=>void;
  onBusyChange?:(value:boolean)=>void;
  onSearch:(value:string)=>void;
  onApp:(app:App)=>void;
};

export default function KkeepHome({onSearch,onApp,onFocusChange,onBusyChange,motion='auto',paused=false}:KkeepHomeProps){
  const [query,setQuery]=useState('');
  useEffect(()=>()=>{onFocusChange?.(false);onBusyChange?.(false);},[onFocusChange,onBusyChange]);
  function submit(event:FormEvent){event.preventDefault();if(query.trim())onSearch(query);}
  return <section className="home-content legacy-home-orbit" aria-label="Kkeep home">
    <HomeOrbit motion={motion} paused={paused}/>
    <div className="home-inner">
      <HomeIdentity motion={motion} paused={paused}/>
      <form className="home-search" onSubmit={submit} role="search">
        <Search size={24} aria-hidden="true"/>
        <input aria-label="Search or enter URL" placeholder="Search or enter URL…" value={query} onFocus={()=>{prepareProxy();onFocusChange?.(true);}} onBlur={()=>onFocusChange?.(false)} onChange={event=>setQuery(event.target.value)} autoComplete="off" autoCapitalize="none" spellCheck={false}/>
        {query.trim()&&<Button type="submit" variant="ghost" className="search-submit">Go</Button>}
      </form>
      <nav className="home-shortcuts" aria-label="Apps">
        {apps.filter(app=>app.cloud!=='clash').map(app=><a className="shortcut" key={app.name} href={app.external?app.url:app.path} aria-label={'Open '+app.name+(app.external?'':' through Kkeep')}
          onPointerEnter={app.engine||app.external?undefined:prepareProxy} onPointerDown={app.engine||app.external?undefined:prepareProxy} onFocus={app.engine||app.external?undefined:prepareProxy}
          onClick={event=>{if(app.engine||app.external||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;event.preventDefault();onApp(app);}}>
          <img src={app.icon} width={48} height={48} alt=""/>
          <span>{app.name}</span>
        </a>)}
        <Dialog onOpenChange={value=>onBusyChange?.(value)}>
          <DialogTrigger asChild><button type="button" className="shortcut" aria-label="Open Games"><Gamepad2 size={39} aria-hidden="true"/><span>Games</span></button></DialogTrigger>
          <DialogContent className="proxy-dialog games-dialog">
            <DialogHeader><DialogTitle>Games</DialogTitle><DialogDescription className="sr-only">Choose a game to play.</DialogDescription></DialogHeader>
            <div className="game-library">
              {linkedGames.map(game=>
                <Link key={game.slug} href={`/play/${game.slug}`} prefetch={false} onClick={enterGameFullscreen} aria-label={`Play ${game.name}`}>
                  <img className={game.coverFit==='contain'?'player-game-cover':undefined} src={game.cover} width={160} height={100} alt="" loading="lazy"/><span>{game.name}</span>
                </Link>
              )}
              <a href={clashRoyaleUrl}><img src="/icons/clash-royale.webp" width={160} height={100} alt="" loading="lazy"/><span>Clash Royale</span></a>
              <a href="/games/how-to-fish/"><img src="/games/covers/how-to-fish.webp" width={160} height={100} alt="" loading="lazy"/><span>How to Fish</span></a>
              <a href="/games/stick-war-legacy/"><img src="/games/covers/stick-war-legacy.webp" width={160} height={100} alt="" loading="lazy"/><span>Stick War: Legacy</span></a>
              <a href="/games/subway-surfers/"><img src="/games/covers/subway-surfers.webp" width={160} height={100} alt="" loading="lazy"/><span>Subway Surfers</span></a>
              <a href="/games/idle-mining-empire/"><img src="/games/covers/idle-mining-empire.webp" width={160} height={100} alt="" loading="lazy"/><span>Idle Mining Empire</span></a>
              <a href="/games/solar-smash/"><img src="/games/covers/solar-smash.webp" width={160} height={100} alt="" loading="lazy"/><span>Solar Smash</span></a>
              <a href="/games/kick-the-buddy/"><img src="/games/covers/kick-the-buddy.webp" width={160} height={100} alt="" loading="lazy"/><span>Kick the Buddy</span></a>
              <a href="/games/geometry-dash/"><img src="/games/covers/geometry-dash.webp" width={160} height={100} alt="" loading="lazy"/><span>Geometry Dash</span></a>
              <a href="/games/bad-piggies/"><img src="/games/covers/bad-piggies.webp" width={160} height={100} alt="" loading="lazy"/><span>Bad Piggies</span></a>
              <a href="/games/trees-hate-you/"><img src="/games/covers/trees-hate-you.webp" width={160} height={100} alt="" loading="lazy"/><span>Trees Hate You</span></a>
              <a href="/games/angry-birds/"><img src="/games/covers/angry-birds.webp" width={160} height={100} alt="" loading="lazy"/><span>Angry Birds</span></a>
            </div>
          </DialogContent>
        </Dialog>
        <Dialog onOpenChange={value=>onBusyChange?.(value)}>
          <DialogTrigger asChild><button type="button" className="shortcut" aria-label="Open 4 players"><img src="/games/covers/234-player-games-official.png" width={48} height={48} alt=""/><span>4 players</span></button></DialogTrigger>
          <DialogContent className="proxy-dialog games-dialog">
            <DialogHeader><DialogTitle>4 players</DialogTitle><DialogDescription className="sr-only">Choose a game to play together.</DialogDescription></DialogHeader>
            <div className="game-library">
              <a href="https://player1234.testerqrr1.chatgpt.site/"><img className="player-game-cover" src="/games/covers/234-player-games-official.png" width={160} height={100} alt="" loading="lazy"/><span>2 3 4 Player Games</span></a>
              <a href="/games/stickman-duel/"><img src="/games/covers/stickman-duel.webp" width={160} height={100} alt="" loading="lazy"/><span>Stickman Duel</span></a>
            </div>
          </DialogContent>
        </Dialog>
        <Link href="/hgola-altara" prefetch={false} className="shortcut" onClick={enterGameFullscreen} aria-label="افتح هجولة الطارة">
          <img className="hgola-cover" src="/games/covers/hgola-altara.webp" width={72} height={54} alt=""/>
          <span lang="ar" dir="rtl">هجولة الطارة</span>
        </Link>
        <Link href="/stick-fight" prefetch={false} className="shortcut" onClick={enterGameFullscreen} aria-label="Open Stick Fight"><img className="hgola-cover" src="/games/covers/stick-fight.png" width={72} height={54} alt=""/><span>Stick Fight</span></Link>
      </nav>

    </div>
  </section>;
}
