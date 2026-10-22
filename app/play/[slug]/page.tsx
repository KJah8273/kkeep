import type {Metadata} from 'next';
import {notFound} from 'next/navigation';
import {linkedGames} from '@/lib/games/linked-games';

type Props = {params:Promise<{slug:string}>};

export async function generateMetadata({params}:Props):Promise<Metadata>{
  const {slug}=await params;
  const game=linkedGames.find(item=>item.slug===slug);
  return {title:game?`${game.name} · Kkeep`:'Game · Kkeep'};
}

export default async function LinkedGamePage({params}:Props){
  const {slug}=await params;
  const game=linkedGames.find(item=>item.slug===slug);
  if(!game)notFound();
  return <main className="linked-game-player" aria-label={game.name}>
    <iframe src={game.url} title={game.name} allow="autoplay; fullscreen; gamepad" allowFullScreen
      sandbox="allow-scripts allow-same-origin allow-forms allow-pointer-lock allow-orientation-lock allow-modals"
      referrerPolicy="strict-origin-when-cross-origin"/>
  </main>;
}
