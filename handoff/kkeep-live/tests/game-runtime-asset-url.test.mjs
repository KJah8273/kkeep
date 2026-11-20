import test from 'node:test';
import assert from 'node:assert/strict';
import {runtimeAssetUrl} from '../lib/games/runtime-asset-url.mjs';
const host='https://kkeep.test',base=host+'/api/game-resource/brawlhalla-offline/1/build/OriginalGame/';
const config={slug:'brawlhalla-offline',origins:['https://play.unity.com','https://play-prod.struckd.com']};
test('fetch(URL) reaches the exact Brawlhalla data index instead of a file named undefined',()=>{
 const url=new URL('runtime/rawdata-records.json',base);
 for(const input of [url,url.href,new Request(url)])assert.equal(runtimeAssetUrl(input,base,host,config),url.href);
 assert.equal(runtimeAssetUrl('runtime/rawdata-records.json',base,host,config),url.href);
});
test('all fetch input forms retain the existing external relay and local game routing',()=>{
 const external=new URL('https://play-prod.struckd.com/build/file.pack?version=2');
 for(const input of [external,external.href,new Request(external)])assert.equal(runtimeAssetUrl(input,base,host,config),host+'/api/game-resource/brawlhalla-offline/1/build/file.pack?version=2');
 for(const input of ['/games/test/player.js?v=1',new URL('/games/test/player.js?v=1',host)])assert.equal(runtimeAssetUrl(input,base,host,config),host+'/api/game-public/games/test/player.js?v=1');
 assert.equal(runtimeAssetUrl('blob:null/test',base,host,config),'blob:null/test');
 assert.equal(runtimeAssetUrl('https://other.test/path',base,host,config),'https://other.test/path');
});
