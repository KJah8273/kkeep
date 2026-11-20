import test from 'node:test';
import assert from 'node:assert/strict';
import {inCategory,newGameIds,validPopularGames} from '../lib/game-discovery.ts';
import {findSavedGame} from '../lib/games/save-catalog.ts';
test('discovery categories preserve favorites, multiplayer, new and genre filters',()=>{
 assert.equal(new Set(newGameIds).size,newGameIds.length);
 assert.ok(newGameIds.length >= 58);
 assert.equal(inCategory('eggy-car','Racing',[],[]),true);
 assert.equal(inCategory('monkey-mart','Racing',[],[]),false);
 assert.equal(inCategory('monkey-mart','Tycoon',[],[]),true);
 assert.equal(inCategory('harvest-io','.io',[],[]),true);
 assert.equal(inCategory('stickman-duel','2–4 players',['stickman-duel'],[]),true);
 assert.equal(inCategory('monkey-mart','Favorites',[],['monkey-mart']),true);
 assert.equal(inCategory('monkey-mart','Favorites',[],[]),false);
});
test('new hosted games open their supplied players from New games',()=>{
 const cloudfront='https://d1a9n6wbsc5thc.cloudfront.net';
 const entries={
  'brain-test':cloudfront+'/lg/braintest/index.html',
  'slime-dunk':cloudfront+'/lg/slimedunk/index.html',
  'crazy-bikes':cloudfront+'/lg/crazybikes/index.html',
  'tiny-towers':cloudfront+'/lg/tinytowers/index.html',
  'blumgi-splash':"https://d1a9n6wbsc5thc.cloudfront.net/lg/blumgisplash/index.html",
  'astro-survivors':"https://d1a9n6wbsc5thc.cloudfront.net/lg/astrosurvivors/index.html",
  'neon-swing':"https://d1a9n6wbsc5thc.cloudfront.net/lg/neonswing/index.html",
  'stacky-dash':"https://d1a9n6wbsc5thc.cloudfront.net/a/EhNOAxZbQxURVFQITR9eBE0LHFYLQgxNVlQOVVwMBx5bG1QVUA9IWxFUDw",
  'mob-control':"https://d1a9n6wbsc5thc.cloudfront.net/a/EhNOAxZbQxURVFQITR9eBE0LHFYLQgxNVlQOVVwMBx5bG1QVUwVIWxFUDw",
  'mountain-bike-xtreme':"https://www.madkidgames.com/full/mountain-bike-xtreme",
 };
 for(const [slug,entry] of Object.entries(entries)){
  const game=findSavedGame(slug);
  assert.equal(inCategory(slug,'New',[],[]),true);
  const local=['blumgi-splash','astro-survivors','neon-swing'].includes(slug);
  assert.equal(game?.entry,local?'/games/'+slug+'/index.html':entry);
  assert.equal(game?.external,!local);
  assert.equal(game?.gameOnly,true);
  assert.ok(!game?.underReview);
  assert.deepEqual(game?.origins,local?[cloudfront]:[]);
 }
});
test('hot game data rejects unknown IDs, fake counts and duplicates before ranking',()=>{
 assert.deepEqual(validPopularGames([{id:'a',plays:3},{id:'b',plays:9},{id:'a',plays:3},{id:'c',plays:-1},{id:'unknown',plays:99},{id:'d',plays:'5'}],['a','b','c','d']),[{id:'b',plays:9},{id:'a',plays:3}]);
 assert.deepEqual(validPopularGames(null,['a']),[]);
});
