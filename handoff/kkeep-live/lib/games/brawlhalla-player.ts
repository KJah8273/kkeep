const gameId='1b88ebb9-00f3-484c-8ef1-1777a3d41030';

// This Unity upload is a launcher for OriginalGame, not the game engine itself.
// Resolve its current build, then start the same supplied AIR game directly.
export function brawlhallaAssetBase(frame:string){
 const values=[...frame.matchAll(/streamingAssetsUrl\s*:\s*"([^"<>]+)"/g)];
 for(const match of values){
  const url=new URL(match[1].replaceAll('&amp;','&'));
  if(url.origin==='https://play-prod.struckd.com'&&!url.username&&!url.password&&!url.port&&!url.search&&!url.hash&&
   new RegExp('^/api/v1/games/game/'+gameId+'/build/[a-f0-9-]+/streaming/?$').test(url.pathname)){
   return url.href.replace(/\/?$/,'/')+'OriginalGame/';
  }
 }
 throw Error('The Brawlhalla game build is unavailable.');
}
// StreamingAssets returns a signed redirect. Accept exactly the same file in
// this game's same build on Unity's CDN, never an arbitrary redirect target.
function originalAsset(url:URL){
 if(url.origin!=='https://play-prod.struckd.com'||url.username||url.password||url.port)return null;
 return new RegExp('^/api/v1/games/game/'+gameId+'/build/([a-f0-9-]+)/streaming/OriginalGame/(.+)$').exec(url.pathname);
}
export function brawlhallaAssetRedirect(source:URL,location:string){
 const match=originalAsset(source);if(!match)return null;
 const target=new URL(location,source);
 return target.origin==='https://cdn.play.unity.com'&&!target.username&&!target.password&&!target.port&&
  target.pathname==='/games/'+gameId+'/'+match[1]+'/StreamingAssets/OriginalGame/'+match[2]?target:null;
}
export function brawlhallaAssetType(source:URL){
 if(!originalAsset(source))return null;
 // The supplied Ruffle binary has a .bin suffix but contains WebAssembly.
 if(source.pathname.endsWith('/OriginalGame/runtime/air-runtime.bin'))return 'application/wasm';
 const extension=source.pathname.split('.').pop();
 return ({js:'text/javascript; charset=utf-8',mjs:'text/javascript; charset=utf-8',css:'text/css; charset=utf-8',wasm:'application/wasm',json:'application/json'} as Record<string,string>)[extension||'']||null;
}
export function brawlhallaPlayer(frame:string){
 const base=brawlhallaAssetBase(frame);
 return `<!doctype html><html lang="en"><head><base href="${base}"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover"><title>Brawlhalla Online</title><style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#08080b;color:#fff;font:16px system-ui;overscroll-behavior:none;touch-action:none}#kkeep-launch{position:fixed;inset:0;z-index:1000;display:grid;place-content:center;text-align:center;gap:18px;background:#08080b}#kkeep-launch img{width:280px;max-width:75vw;border-radius:16px}#kkeep-launch h1{font-size:24px;margin:0}#kkeep-launch button{font:inherit;padding:12px;border:0;border-radius:12px}#kkeep-launch[hidden],#kkeep-launch [hidden]{display:none}</style></head><body><div id="kkeep-launch"><img src="/games/covers/brawlhalla-offline.jpg" alt=""><h1>Brawlhalla Online</h1><div id="kkeep-launch-status" role="status">Loading game…</div><button id="kkeep-launch-retry" hidden>Retry loading</button></div><script src="/games/brawlhalla-online/launch.js?v=direct-1" crossorigin="anonymous"></script></body></html>`;
}
