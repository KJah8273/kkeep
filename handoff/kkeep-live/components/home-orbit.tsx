'use client';

import {useEffect, useRef, useState} from 'react';
import '../app/home-orbit.css';

export type HomeOrbitProps = {
  motion?: 'auto' | 'full' | 'reduced';
  paused?: boolean;
};

// These are local Kkeep covers. The wallpaper never depends on a remote feed.
const orbitGames = [
  {id: 'hgola', image: '/games/covers/hgola-altara.webp', label: 'هجولة الطارة'},
  {id: 'stick', image: '/games/covers/stick-fight.png', label: 'Stick Fight'},
  {id: 'party', image: '/games/covers/234-player-games-official.png', label: '2 3 4 Player Games'},
  {id: 'brawl', image: '/games/covers/brawlhalla-offline.jpg', label: 'Brawlhalla'},
  {id: 'roblox', image: '/games/covers/roblox-blue.svg', label: 'Roblox'},
  {id: 'blumgi', image: '/games/covers/blumgi-racers.jpg', label: 'Blumgi Racers'},
] as const;

/** Decorative motion stays in CSS; React only responds to visibility/settings. */
export default function HomeOrbit({motion = 'auto', paused = false}: HomeOrbitProps) {
  const root = useRef<HTMLDivElement>(null);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    const element = root.current;
    if (!element) return;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let inView = true;
    const sync = () => setRunning(
      !paused && !document.hidden && inView &&
      (motion === 'full' || (motion === 'auto' && !reducedMotion.matches)),
    );
    const observer = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(
      ([entry]) => {
        inView = entry?.isIntersecting ?? false;
        sync();
      },
      {threshold: 0},
    );

    observer?.observe(element);
    document.addEventListener('visibilitychange', sync);
    reducedMotion.addEventListener('change', sync);
    sync();

    return () => {
      observer?.disconnect();
      document.removeEventListener('visibilitychange', sync);
      reducedMotion.removeEventListener('change', sync);
    };
  }, [motion, paused]);

  return (
    <div ref={root} className="home-orbit" data-running={running} data-motion={motion} aria-hidden="true">
      <div className="home-orbit-glow home-orbit-glow-blue" />
      <div className="home-orbit-glow home-orbit-glow-violet" />
      <div className="home-orbit-ring home-orbit-ring-near" />
      <div className="home-orbit-ring home-orbit-ring-far" />
      <div className="home-orbit-stars" />
      {orbitGames.map(game => (
        <div key={game.id} className={`home-orbit-card home-orbit-card-${game.id}`}>
          <div className="home-orbit-card-frame">
            {/* Local artwork is decorative, so it has no accessible name or link. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={game.image} alt="" width={240} height={240} decoding="async" fetchPriority="low" draggable={false} />
            <span className="home-orbit-card-caption" dir="auto">{game.label}</span>
          </div>
        </div>
      ))}
      <div className="home-orbit-shade" />
    </div>
  );
}
