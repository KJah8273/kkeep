import type {Metadata} from 'next';
import {notFound} from 'next/navigation';
import {cookies,headers} from 'next/headers';
import {findSavedGame} from '@/lib/games/save-catalog';
import SavedGamePlayer from '@/components/saved-game-player';
import '../game-player.css';

type Props = {params:Promise<{slug:string}>};

export async function generateMetadata({params}:Props):Promise<Metadata>{
  const {slug}=await params;
  const game=findSavedGame(slug);
  return {title:game?`${game.name} · Kkeep`:'Game · Kkeep'};
}

export default async function LinkedGamePage({params}:Props){
  const {slug}=await params;
  const game=findSavedGame(slug);
  if(!game)notFound();
  if(game.underReview)return <main className="saved-game-page" aria-label={game.name}>
    <div className="saved-game-loading">
      {game.loadingCover&&<img src={game.loadingCover} alt="" width={220} style={{maxWidth:'65vw',borderRadius:16}}/>}
      <h1>{game.name}</h1>
      <p>This game is temporarily unavailable while its build is checked.</p>
      <a className="game-back-link" href="/games">Back to Games</a>
    </div>
  </main>;
  if(!game.external){
    const requestHeaders=await headers();
    // A cross-site navigation can omit a SameSite=Strict Profile cookie.
    const guest=(requestHeaders.get('sec-fetch-site')==='same-origin')&&!(await cookies()).has('__Host-kkeep-profile');
    return <SavedGamePlayer key={game.slug} game={game} initialGuest={guest}/>;
  }
  return <main className="linked-game-player" aria-label={game.name}>
    <iframe src={game.entry} title={game.name} allow="autoplay; fullscreen; gamepad" allowFullScreen
      sandbox="allow-scripts allow-same-origin allow-forms allow-pointer-lock allow-orientation-lock allow-modals"
      referrerPolicy="strict-origin-when-cross-origin"/>
  </main>;
}
