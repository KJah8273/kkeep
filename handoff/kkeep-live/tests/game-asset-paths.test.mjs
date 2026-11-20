import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {gameAssetUrl} from '../lib/games/asset-url.ts';
import {findSavedGame} from '../lib/games/save-catalog.ts';
const origin='https://kkeep.test';
test('local game wrappers retain their own cover and adapter with an external base',()=>{
 const game=findSavedGame('hunter-assassin'),base='https://cdn.example/game/';
 for(const resource of [game.loadingCover,'/games/hunter-assassin/app.js']){
  assert.ok(existsSync('public'+resource));assert.equal(gameAssetUrl(resource,origin+game.entry,base,origin,game),origin+'/api/game-public'+resource);
 }
});
test('remote game roots, relative CDN assets, query strings and fragments retain their meaning',()=>{
 const game={slug:'example',origins:['https://cdn.example']},base='https://cdn.example/release/';
 assert.equal(gameAssetUrl('/games/player.js?v=2#start',origin+'/games/test/index.html',base,origin,game),origin+'/api/game-public/games/player.js?v=2#start');
 assert.equal(gameAssetUrl('/games/player.js','https://cdn.example/index.html',base,origin,game),origin+'/api/game-resource/example/0/games/player.js');
 assert.equal(gameAssetUrl('/assets/image.png',origin+'/games/test/index.html',base,origin,game),origin+'/api/game-resource/example/0/assets/image.png');
 assert.equal(gameAssetUrl('//other.example/games/file.js',origin+'/games/test/index.html',base,origin,game),'https://other.example/games/file.js');
});
