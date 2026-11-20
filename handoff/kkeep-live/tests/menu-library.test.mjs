import test from 'node:test';
import assert from 'node:assert/strict';
import {parseGameLibrary,rememberGame,favoriteGame} from '../lib/menu-library.ts';
import {wallpaperInfo} from '../lib/living-space/scenes.ts';
const ids=Array.from({length:20},(_,i)=>'game-'+i);

test('a returning visitor gets only known unique games from saved data',()=>{
 const raw=JSON.stringify({favorites:[ids[0],ids[0],'javascript:alert(1)',ids[1]],recent:[ids[2],null,ids[2],ids[1]]});
 assert.deepEqual(parseGameLibrary(raw,ids),{favorites:ids.slice(0,2),recent:[ids[2],ids[1]]});
 for(const value of [null,'{bad','null','[]'])assert.deepEqual(parseGameLibrary(value,ids),{favorites:[],recent:[]});
});
test('opening a game moves it to the front and keeps a bounded history without altering favorites',()=>{
 const library={favorites:[ids[5]],recent:ids.slice(0,12)};
 const next=rememberGame(library,ids[4]);
 assert.equal(next.recent[0],ids[4]);assert.equal(next.recent.length,12);assert.equal(new Set(next.recent).size,12);
 assert.deepEqual(rememberGame(next,ids[15]).recent,[ids[15],...next.recent.slice(0,11)]);
 assert.deepEqual(library.recent,ids.slice(0,12));assert.deepEqual(next.favorites,[ids[5]]);
});
test('favorite changes survive reload and never remove recent history',()=>{
 const first={favorites:[],recent:[ids[2]]};
 const saved=parseGameLibrary(JSON.stringify(favoriteGame(first,ids[1])),ids);
 assert.deepEqual(saved,{favorites:[ids[1]],recent:[ids[2]]});
 assert.deepEqual(favoriteGame(saved,ids[1]),first);
});
test('the cabin is the default while explicit wallpaper selections are preserved',()=>{
 assert.equal(wallpaperInfo('original','stars').id,'moving-minecraft-overgrown-cabin');
 assert.equal(wallpaperInfo('missing','stars').id,'moving-minecraft-overgrown-cabin');
 assert.equal(wallpaperInfo('moving-white-topography','stars').id,'moving-white-topography');
 assert.ok(wallpaperInfo('original','stars').moving.touchSrc.endsWith('-ipad.mp4'));
});
