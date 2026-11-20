import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {brawlhallaAssetBase,brawlhallaPlayer,brawlhallaAssetType} from '../lib/games/brawlhalla-player.ts';
import {gameContent} from '../worker/game-content.ts';
import {gameAssetUrl} from '../lib/games/asset-url.ts';
import {findSavedGame} from '../lib/games/save-catalog.ts';
const root='https://play-prod.struckd.com/api/v1/games/game/1b88ebb9-00f3-484c-8ef1-1777a3d41030/build/653515b1-59ef-447c-b905-1babf2ff1b4f/streaming';
const frame='<!doctype html><script>const config={streamingAssetsUrl:"'+root+'"};</script>';
const source=readFileSync(new URL('../public/games/brawlhalla-online/launch.js',import.meta.url),'utf8');

test('the current Unity upload resolves to its own OriginalGame, without loading Unity first',()=>{
 assert.equal(brawlhallaAssetBase(frame),root+'/OriginalGame/');
 const html=brawlhallaPlayer(frame);
 assert.match(html,/brawlhalla-online\/launch\.js/);
 assert.doesNotMatch(html,/createUnityInstance|game\.wasm|<iframe/);
 for(const invalid of [root.replace('https:','http:'),root.replace('play-prod.struckd.com','evil.test'),root.replace('/streaming','/streaming/../../other'),root+'?url=evil',root.replace('653515b1-59ef-447c-b905-1babf2ff1b4f','not-a-build')]){
  assert.throws(()=>brawlhallaAssetBase(frame.replace(root,invalid)));
 }
 const game=findSavedGame('brawlhalla-offline'),origin='https://kkeep.test';
 assert.equal(gameAssetUrl('/games/brawlhalla-online/launch.js',origin+'/games/brawlhalla-offline/',root+'/OriginalGame/',origin,game),origin+'/api/game-public/games/brawlhalla-online/launch.js');
});

test('entry cache is distinct from the old Unity wrapper',async()=>{
 const prior=Object.getOwnPropertyDescriptor(globalThis,'caches');let lookup;
 Object.defineProperty(globalThis,'caches',{configurable:true,value:{default:{async match(req){lookup=req.url;return undefined;},async put(){}}}});
 try{
  const response=await gameContent(new Request('https://kkeep.test/api/game-entry/brawlhalla-offline'),{}, {waitUntil(){}},async()=>new Response(frame));
  assert.equal(response.status,200);assert.equal(new URL(lookup).searchParams.get('_player'),'direct-1');
  const body=await response.json();assert.match(body.html,/OriginalGame/);assert.equal(body.base,'https://kkeep.test/games/brawlhalla-offline/');
 }finally{if(prior)Object.defineProperty(globalThis,'caches',prior);else delete globalThis.caches;}
});

async function launch(failure){
 const nodes=Object.fromEntries(['kkeep-launch','kkeep-launch-status','kkeep-launch-retry'].map(id=>[id,{hidden:id.includes('retry'),textContent:''}]));
 const head=[],body=[],fetched=[],created=[],revoked=[];
 const document={baseURI:'https://kkeep.test/api/game-resource/brawlhalla-offline/1'+new URL(root).pathname+'/OriginalGame/',getElementById:id=>nodes[id],addEventListener(){},head:{appendChild:n=>head.push(n)},body:{append:(...n)=>body.push(...n)},createElement:tag=>({tag})};
 const page={querySelector:()=>({}),querySelectorAll:()=>[],body:{childNodes:[{tag:'main'},{tag:'span'}]}};
 const URLMock=class extends URL{static createObjectURL(blob){created.push(blob);return 'blob:null/'+created.length}static revokeObjectURL(url){revoked.push(url)}};
 const context={document,window:{},DOMParser:class{parseFromString(){return page}},AbortController,Blob,URL:URLMock,setTimeout,clearTimeout,console:{error(){}},location:{reload(){}},fetch:async url=>{
  fetched.push(url);const name=url.slice(document.baseURI.length);
  return new Response(name==='app.js'?"import {x} from './input-controller.js';":name==='relay-worker.mjs'?"import {x} from './unity-relay.mjs';":'',{status:name===failure?503:200});
 }};
 await vm.runInNewContext(source,context);
 return {nodes,head,body,fetched,created,revoked,context};
}
test('direct bootstrap loads the same supplied modules in one save frame and preserves the Relay worker',async()=>{
 const result=await launch();assert.equal(result.fetched.length,14);assert.equal(result.nodes['kkeep-launch'].hidden,true);
 assert.equal(result.body.length,2);assert.deepEqual(result.head.map(n=>n.tag),['style','script']);
 assert.equal(result.head[1].type,'module');assert.equal(result.context.window.KKEEP_ASSET_BASE,result.context.document.baseURI);
 assert.equal(Object.keys(result.context.window.KKEEP_SCRIPT_URLS).length,5);
 assert.match(result.context.window.KKEEP_RELAY_WORKER_URL,/^blob:null\//);
 const app=await result.created.at(-1).text();assert.match(app,/from "blob:null\//);assert.doesNotMatch(app,/from '\.\//);
});
test('an unavailable upstream file stops startup and offers retry without a partial game',async()=>{
 const result=await launch('app.js');assert.equal(result.nodes['kkeep-launch-retry'].hidden,false);
 assert.match(result.nodes['kkeep-launch-status'].textContent,/Could not download app.js \(503\)/);
 assert.equal(result.head.length,0);assert.equal(result.body.length,0);
});

test('Unity StreamingAssets follows only the same build/file CDN redirect with no credentials',async()=>{
 const path=new URL(root).pathname+'/OriginalGame/runtime/core.js',cdn='https://cdn.play.unity.com/games/1b88ebb9-00f3-484c-8ef1-1777a3d41030/653515b1-59ef-447c-b905-1babf2ff1b4f/StreamingAssets/OriginalGame/runtime/core.js?Signature=example';
 const seen=[];
 const response=await gameContent(new Request('https://kkeep.test/api/game-resource/brawlhalla-offline/1'+path,{headers:{Range:'bytes=0-3',Cookie:'private',Authorization:'private'}}),{}, {waitUntil(){}},async(url,options)=>{
  seen.push({url,options});return seen.length===1?new Response(null,{status:302,headers:{Location:cdn}}):new Response('code',{status:206,headers:{'Content-Type':'application/octet-stream','Content-Range':'bytes 0-3/100'}});
 });
 assert.equal(response.status,206);assert.equal(seen.length,2);assert.equal(seen[1].url,cdn);
 for(const {options} of seen){assert.equal(options.redirect,'manual');assert.equal(options.credentials,'omit');assert.deepEqual(options.headers,{Range:'bytes=0-3'});}
 assert.match(response.headers.get('Content-Type'),/^text\/javascript/);assert.equal(await response.text(),'code');
 for(const bad of [cdn.replace('cdn.play.unity.com','evil.test'),cdn.replace('runtime/core.js','other.js'),cdn.replace('653515b1-59ef-447c-b905-1babf2ff1b4f','different-build')]){
  let calls=0;const rejected=await gameContent(new Request('https://kkeep.test/api/game-resource/brawlhalla-offline/1'+path),{}, {waitUntil(){}},async()=>{calls++;return new Response(null,{status:302,headers:{Location:bad}})});
  assert.equal(calls,1);assert.equal(rejected.status,502);
 }
});

test('the verified AIR WebAssembly binary streams with its real MIME type without reclassifying data packs',()=>{
 assert.equal(brawlhallaAssetType(new URL(root+'/OriginalGame/runtime/air-runtime.bin')),'application/wasm');
 assert.equal(brawlhallaAssetType(new URL(root+'/OriginalGame/assets/data.bin')),null);
 assert.equal(brawlhallaAssetType(new URL('https://evil.test/OriginalGame/runtime/air-runtime.bin')),null);
});
