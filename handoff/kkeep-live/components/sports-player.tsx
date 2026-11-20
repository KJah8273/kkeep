'use client';

import { useEffect, useState } from 'react';
import { ExternalLink, LoaderCircle, Play, RefreshCw, X } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { broadcasterLink, channelLogo, sportsPhoto } from '@/lib/sports-media';
import type { SportsFeed } from '@/lib/sports';

export type SportsSelection = { title: string; url: string; feeds: SportsFeed[]; photo?: string };

export default function SportsPlayer({ selection, onClose }: { selection: SportsSelection; onClose: () => void }) {
  const choices = selection.feeds.some(feed => feed.url === selection.url)
    ? selection.feeds
    : [{ name: 'Match player', url: selection.url }, ...selection.feeds];
  const [url, setUrl] = useState(selection.url);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<'poster' | 'loading' | 'opened' | 'failed'>('poster');
  const feed = choices.find(item => item.url === url);
  const name = feed?.name || selection.title;
  const official = broadcasterLink(name);
  const logo = channelLogo(name);
  const photo = selection.photo || sportsPhoto(name);

  useEffect(() => {
    if (state !== 'loading') return;
    const timeout = setTimeout(() => setState('failed'), 12000);
    return () => clearTimeout(timeout);
  }, [state, url, attempt]);

  function play() { setAttempt(value => value + 1); setState('loading'); }
  const embedded = state === 'loading' || state === 'opened';

  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent className="sports-dialog" showCloseButton={false}>
      <DialogHeader className="sports-player-head">
        <div><DialogTitle>{selection.title}</DialogTitle><DialogDescription>{official ? 'Abu Dhabi Sports · broadcaster viewing option' : 'Choose a channel and tap play. Availability varies by region.'}</DialogDescription></div>
        <button type="button" aria-label="Close sports player" onClick={onClose}><X size={22}/></button>
      </DialogHeader>
      <div className="sports-player-tools">
        <label>Channel<select aria-label="Playback channel" value={url} onChange={event => { setUrl(event.target.value); setState('poster'); }}>
          {choices.map((item, index) => <option key={item.url + index} value={item.url}>{item.name}</option>)}
        </select></label>
        <a href={official || url} target="_blank" rel="noopener noreferrer"><ExternalLink size={15}/>{official ? 'Open broadcaster' : 'Open player in new tab'}</a>
        {embedded && <button type="button" onClick={() => setState('failed')}>Player blank?</button>}
      </div>
      <div className="sports-player-stage">
        {embedded ? <>
          {state === 'loading' && <div className="sports-player-loading" role="status"><LoaderCircle className="spin" size={24}/><span>Opening player…</span></div>}
          <iframe key={url + attempt} className={state === 'loading' ? 'sports-frame-loading' : ''} src={url} title={selection.title + ' player'} onLoad={() => setState(value => value === 'loading' ? 'opened' : value)} onError={() => setState('failed')} allow="autoplay; fullscreen; encrypted-media; picture-in-picture" allowFullScreen referrerPolicy="strict-origin-when-cross-origin"/>
        </> : <div className="sports-player-poster">
          <img className="sports-player-photo" src={photo} alt=""/>
          <div className="sports-player-poster-copy">
            {logo && <img className="sports-player-logo" src={logo} alt={name + ' logo'}/>}
            <h3>{name === 'Match player' ? selection.title : name}</h3>
            <p role={state === 'failed' ? 'alert' : undefined}>{official ? 'The embedded feed is unavailable. Open the broadcaster to watch this channel.' : state === 'failed' ? 'This feed did not play. Try another channel or open the player in a new tab.' : 'Ready when you are.'}</p>
            <div className="sports-player-actions">
              {official ? <a className="sports-watch-button" href={official} target="_blank" rel="noopener noreferrer"><ExternalLink size={18}/>Watch on broadcaster</a> : <button className="sports-watch-button" type="button" onClick={play}>{state === 'failed' ? <RefreshCw size={18}/> : <Play size={18} fill="currentColor"/>}{state === 'failed' ? 'Retry in Kkeep' : 'Play in Kkeep'}</button>}
              <a href={url} target="_blank" rel="noopener noreferrer">{official ? 'Try alternate provider' : 'Open player'}<ExternalLink size={14}/></a>
            </div>
          </div>
        </div>}
      </div>
      <p className="sports-player-note">{official ? 'The broadcaster may require an account. Access depends on your location and the programme.' : state === 'opened' ? 'If the player is blank or shows an error, tap “Player blank?” or choose another channel. Provider ads may appear.' : 'Upcoming events may start broadcasting near kickoff. Provider ads may appear.'}</p>
    </DialogContent>
  </Dialog>;
}
