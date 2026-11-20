import channelLogos from './sports-channel-logos.json' with { type: 'json' };

// Local artwork stays visible even when a broadcaster or its image host is offline.
export function sportsPhoto(sport = '') {
  if (/abu\s*dhabi\s*sport/i.test(sport)) return '/sports/abu-dhabi-cover.png';
  if (/ufc|mma|combat|fight|boxing/i.test(sport)) return '/sports/combat.jpg';
  if (/basketball|nba|wnba/i.test(sport)) return '/sports/basketball.jpg';
  return '/sports/stadium.jpg';
}

export function channelLogo(name: string) {
  const exact = (channelLogos as Record<string, string>)[name.split(' · ')[0]];
  if (exact) return exact;
  if (/abu\s*dhabi\s*sports\s*[23]\b/i.test(name)) return '';
  const networks: [RegExp, string][] = [
    [/abu\s*dhabi\s*sport/i, 'abu-dhabi'], [/\bbein\b/i, 'bein'],
    [/\bespn\b/i, 'espn'], [/\btnt\s*sport/i, 'tnt'],
    [/\bdubai\s*sport/i, 'dubai'], [/\beurosport/i, 'eurosport'],
    [/\bnba\s*tv\b/i, 'nba'], [/\bnfl\s*network/i, 'nfl'],
    [/al\s*kass/i, 'alkass'], [/\bdazn\s*1\b/i, 'dazn'],
    [/sky\s*sports\s*main\s*event/i, 'sky'],
  ];
  const match = networks.find(([pattern]) => pattern.test(name));
  return match ? '/sports/' + match[1] + '.png' : '';
}

export function broadcasterLink(name: string) {
  const match = name.split(' · ')[0].trim().match(/^abu\s*dhabi\s*sports\s*([12])?$/i);
  if (!match) return '';
  const channel = match[1] === '2' ? '2/720335400127' : '1/720335400126';
  return 'https://starzplay.com/en/admn/movies/abu-dhabi-sports-' + channel;
}
