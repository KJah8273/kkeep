export const newGameIds=['temple-run-2','ovo','dogeminer','cookie-clicker','flappy-bird','adventure-drivers','endless-truck','vex-7','vex-6','volley-random','soccer-random','pou','bolly-beat','attack-hole','trivia-crack','pac-man-superfast','vex-3','vex-4','vex-5','ball-blast','pokey-ball','basketball-frvr','bottle-jump-3d','bouncemasters','there-is-no-game','retro-bowl','8-ball-classic','cannon-balls-3d','parking-rush','tower-crash-3d','coreball','rolly-vortex','maze-speedrun','one-puzzle','wordle-unlimited','ten-basket','2048-cupcakes','hextris','flappy-2048','wall-kickers','3d-bowling','sushi-roll','blumgi-bloom','blumgi-castle','find-the-needle-in-haystack','my-perfect-hotel','longcat','apple-worm','jumping-shell','sandtris','drift-boss','idle-breakout','gunspin','murder','unicycle-hero','red-ball-4','astro-survivors','neon-swing','blumgi-splash','stacky-dash','mob-control','mountain-bike-xtreme','brain-test','slime-dunk','crazy-bikes','tiny-towers','basket-random','boxing-random','moto-x3m','moto-x3m-2','moto-x3m-3','moto-x3m-spooky','archery-world-tour','draw-the-hill','blumgi-slime','doctor-acorn-2','rabbit-samurai','rabbit-samurai-2','penalty-shooters-2','swingo','roper','stack','stickman-bike','jump-only','color-fill','go-escape','angry-sharks','defend-the-tank','rise-higher','slope-ball','soccer-skills','factory-balls','eggy-car','merge-round-racers','blumgi-rocket','harvest-io','state-io','idle-ants','idle-dice','kiwi-clicker','capybara-clicker','monkey-mart','tiny-fishing','blumgi-bounce','stickman-climb-2','stick-merge','dreadhead-parkour','color-match','dig-deep','tall-man-run','carrom-clash','cannon-basketball-4','stacktris'];
export const gameCategories={
  Action:['vex-6','vex-7','vex-3','vex-4','vex-5','astro-survivors','mob-control','tiny-towers','angry-sharks','defend-the-tank'],
  Sports:['soccer-random','volley-random','basketball-frvr','retro-bowl','8-ball-classic','ten-basket','3d-bowling','basket-random','boxing-random','archery-world-tour','penalty-shooters-2','soccer-skills','slime-dunk'],
  Racing:['adventure-drivers','endless-truck','mountain-bike-xtreme','crazy-bikes','moto-x3m','moto-x3m-2','moto-x3m-3','moto-x3m-spooky','draw-the-hill','stickman-bike','eggy-car','merge-round-racers','blumgi-rocket','drift-hunters','hill-climb-racing','drive-mad','monster-tracks','dr-driving','hgola-altara','blumgi-racers'],
  '.io':['harvest-io','state-io','paperio-2','hole-io','snake-io'],
  Tycoon:['cookie-clicker','dogeminer','idle-ants','idle-dice','kiwi-clicker','capybara-clicker','monkey-mart','idle-mining-empire','dig-deep','tiny-fishing','how-to-fish'],
  Puzzle:['trivia-crack','there-is-no-game','chess-classic','parking-rush','maze-speedrun','one-puzzle','wordle-unlimited','2048-cupcakes','hextris','stacky-dash','brain-test','doctor-acorn-2','color-fill','go-escape','factory-balls','color-match','cannon-basketball-4','stacktris','block-blast','bad-piggies','cut-the-rope-2','amaze','tomb-of-the-mask','angry-birds'],
  Arcade:['pou','pac-man-superfast','attack-hole','bolly-beat','flappy-bird','ovo','temple-run-2','ball-blast','pokey-ball','bottle-jump-3d','bouncemasters','cannon-balls-3d','tower-crash-3d','coreball','rolly-vortex','wall-kickers','sushi-roll','flappy-2048','blumgi-splash','blumgi-slime','rabbit-samurai','rabbit-samurai-2','swingo','roper','stack','neon-swing','jump-only','rise-higher','slope-ball','blumgi-bounce','stickman-climb-2','stick-merge','dreadhead-parkour','tall-man-run','carrom-clash','stickman-hook','subway-surfers','crossy-road','fruit-ninja','dune','geometry-dash','space-waves','stack-bounce','sausage-flip','turbo-stars','bridge-race','bowmasters'],
} as const;
export type GameCategory='All'|'New'|keyof typeof gameCategories|'2–4 players'|'Favorites';
export function inCategory(id:string,category:GameCategory,multiplayerIds:readonly string[],favorites:readonly string[]){
  if(category==='All')return true;
  if(category==='New')return newGameIds.includes(id);
  if(category==='Favorites')return favorites.includes(id);
  if(category==='2–4 players')return multiplayerIds.includes(id);
  return (gameCategories[category] as readonly string[]).includes(id);
}
export type PopularGame={id:string;plays:number};
export function validPopularGames(value:unknown,allowed:readonly string[]):PopularGame[]{
  if(!Array.isArray(value))return [];
  const seen=new Set<string>();
  return value.filter((v):v is PopularGame=>!!v&&typeof v==='object'&&allowed.includes(v.id)&&Number.isSafeInteger(v.plays)&&v.plays>0&&!seen.has(v.id)&&!!seen.add(v.id)).sort((a,b)=>b.plays-a.plays||a.id.localeCompare(b.id)).slice(0,6);
}
