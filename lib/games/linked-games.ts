export type LinkedGame = {
  slug: string;
  name: string;
  url: string;
  cover: string;
  coverFit?: 'contain';
};

// Game-only players stay inside Kkeep. Do not add outside-page fallbacks.
export const linkedGames: readonly LinkedGame[] = [
  {slug:'test',name:'test',url:'/games/test/index.html',cover:'/games/covers/test.svg'},
  {slug:'blumgi-paintball',name:'Blumgi Paintball',url:'https://geometrydashlite.online/blumgi-paintball.embed',cover:'/games/covers/blumgi-paintball.png'},
  {slug:'stickman-hook',name:'Stickman Hook',url:'https://stickman-unblocked.github.io/game/',cover:'/games/covers/stickman-hook.webp'},
  {slug:'drive-mad',name:'Drive Mad',url:'https://drivegame.io/play/drive-mad/',cover:'/games/covers/drive-mad.jpg'},
  {slug:'block-blast',name:'Block Blast Puzzle',url:'https://reunbozdo.github.io/',cover:'/games/covers/block-blast.webp'},
  {slug:'dune',name:'Dune',url:'https://4texas4.github.io/zenith/games/dune.html',cover:'/games/covers/dune.jpg'},
  {slug:'draw-climber',name:'Draw Climber',url:'https://unblockedgames76.gitlab.io/draw-climber/',cover:'/games/covers/draw-climber.webp'},
  {slug:'hypersnake',name:'Hypersnake',url:'https://game-cdn.ikop.xyz/uploads/game/html5/7297/',cover:'/games/covers/hypersnake.jpg'},
  {slug:'tomb-of-the-mask',name:'Tomb of the Mask',url:'https://cbgamesdev.github.io/chilibowlflash/totm/index.html',cover:'/games/covers/tomb-of-the-mask.webp'},
  {slug:'fruit-ninja',name:'Fruit Ninja',url:'https://fruit-ninja-web.testerqrr1.chatgpt.site/',cover:'/games/covers/fruit-ninja.png',coverFit:'contain'},
];
