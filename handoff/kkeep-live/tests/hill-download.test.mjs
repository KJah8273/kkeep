import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import '../public/games/ipad-imports/assets/hill-download.js';
const urls=['https://cdn.example/hcr.data.part4','https://backup.example/hcr.data.part4'];
test('short 200 response retries backup and overwrites incomplete bytes',async()=>{
 const bytes=new Uint8Array(512);const calls=[];
 await globalThis.KkeepHcrDownload({urls,expectedSize:512,pause:async()=>{},onChunk:(chunk,offset)=>bytes.set(chunk,offset),fetcher:async(url,options)=>{calls.push({url,options});return new Response(new Uint8Array(calls.length===1?199:512).fill(calls.length));}});
 assert.equal(calls.length,2);assert.match(calls[1].url,/backup.example/);assert.match(calls[1].url,/retry=/);assert.equal(calls[1].options.cache,'no-store');assert.ok(bytes.every(x=>x===2));
});
test('persistent failures stop after bounded retries',async()=>{
 let count=0;await assert.rejects(globalThis.KkeepHcrDownload({urls,expectedSize:512,pause:async()=>{},onChunk:()=>{},fetcher:async()=>{count++;return new Response('bad',{status:503});}}),/HTTP 503/);assert.equal(count,4);
});
test('Hill inline scripts parse and removed games are absent from catalog',()=>{
 const html=fs.readFileSync('public/games/ipad-imports/hill-climb-racing.html','utf8');
 for(const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g))new vm.Script(match[1]);
 const catalog=fs.readFileSync('lib/games/linked-games.ts','utf8');assert.doesNotMatch(catalog,/slug: 'level-devil'|slug: 'plants-vs-zombies-2'/);
});
