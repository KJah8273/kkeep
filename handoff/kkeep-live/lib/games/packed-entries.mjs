// These large, self-contained players are compressed only in deployment output.
export const packedGameEntries = new Set([
  'dogeminer',
  'cookie-clicker',
  'adventure-drivers',
  'endless-truck',
  'vex-7',
  'vex-6',
  'bolly-beat',
  'attack-hole',
  '8-ball-classic', 'chess-classic', 'vex-3', 'vex-4', 'vex-5',
  'ball-blast', 'pokey-ball', 'basketball-frvr', 'bottle-jump-3d',
  'bouncemasters', 'there-is-no-game', 'retro-bowl',
].map(slug => `/games/${slug}/index.html`));

// Preserve these existing engines byte-for-byte while leaving room for games.
for (const file of [
  '3d-bowling/game.js', 'truffled-imports/amaze-main.js',
  'dr-driving/game-fallback.js', 'moto-x3m-3/runtime.js',
  'maze-speedrun/engine-0.js', 'moto-x3m-spooky/runtime.js',
  'angry-sharks/runtime.js', 'moto-x3m-2/runtime.js',
]) packedGameEntries.add('/games/' + file);
