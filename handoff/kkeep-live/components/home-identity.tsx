'use client';

import {useEffect, useRef, useState} from 'react';
import '@/app/home-identity.css';

// Keep the owner's English and Arabic phrases exactly as they appeared on Kkeep.
const homePhrases = [
  'Tik.k5qq',
  'حيييي',
  'تبي شي كلمني تيك .k5qq',
  'ATHS',
  '67',
  'هجوله خربانه كلمني تيك .k5qq',
  'فرع بني ياس top',
];

type HomeIdentityProps = {
  motion?: 'auto' | 'full' | 'reduced';
  paused?: boolean;
};

export default function HomeIdentity({motion = 'auto', paused = false}: HomeIdentityProps) {
  const root = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(false);
  const [inView, setInView] = useState(false);
  const [deviceReduced, setDeviceReduced] = useState(false);
  const animated = motion === 'full' || (motion === 'auto' && !deviceReduced);

  useEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const visibility = () => setVisible(!document.hidden);
    const preference = () => setDeviceReduced(media.matches);
    visibility();
    preference();
    document.addEventListener('visibilitychange', visibility);
    media.addEventListener('change', preference);
    const observer = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(
      entries => setInView(entries.some(entry => entry.isIntersecting)),
      {threshold: 0},
    );
    if (root.current && observer) observer.observe(root.current);
    else setInView(true);
    return () => {
      observer?.disconnect();
      document.removeEventListener('visibilitychange', visibility);
      media.removeEventListener('change', preference);
    };
  }, []);

  useEffect(() => {
    if (paused || !visible || !inView) return;
    const timer = setInterval(() => setIndex(value => (value + 1) % homePhrases.length), 6000);
    return () => clearInterval(timer);
  }, [paused, visible, inView]);

  return <div ref={root} className="home-identity" data-animated={animated} data-motion-mode={motion}>
    <div className="home-phrase" aria-live="off">
      {homePhrases.map((phrase, item) => <bdi
        key={phrase}
        dir="auto"
        className="home-phrase-text"
        data-state={item === index ? 'current' : item === (index + homePhrases.length - 1) % homePhrases.length ? 'previous' : 'waiting'}
        aria-hidden={item !== index}
      >{phrase}</bdi>)}
    </div>
    <h1 className="home-wordmark" aria-label="Kkeep">
      <span className="home-wordmark-depth" aria-hidden="true">Kkeep</span>
      <span className="home-wordmark-face" aria-hidden="true">Kkeep</span>
    </h1>
    <p className="home-tagline">PLAY <span aria-hidden="true">·</span> WATCH <span aria-hidden="true">·</span> EXPLORE</p>
  </div>;
}
