import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {hunterFile,HUNTER_ID,HUNTER_BUILD,hunterDataUrl} from '../worker/hunter-file.ts';
import {ropeStreaming,ROPE_ID,ROPE_BUILD} from '../worker/rope-streaming.ts';
import {findSavedGame} from '../lib/games/save-catalog.ts';
const hunterURL=`https://cdn.play.unity.com/games/${HUNTER_ID}/${HUNTER_BUILD}/game.data?Signature=test`;
test('Hunter serves exact native engine bytes, never the full Unity archive',async()=>{
 let calls=0;const r=await hunterFile(new Request(`https://kkeep.test/api/hunter-file/${HUNTER_BUILD}/engine.wasm`),async(url,options)=>{
  calls++;assert.equal(options.credentials,'omit');
  if(calls===1)return new Response(`<script>const dataUrl='${hunterURL}'</script>`);
  assert.equal(url,hunterURL);assert.deepEqual(options.headers,{Range:'bytes=108688380-158070068'});
  return new Response('wasm',{status:206,headers:{'Content-Range':'bytes 108688380-158070068/189056865','Content-Length':'49381689'}});
 });assert.equal(r.status,200);assert.equal(r.headers.get('Content-Type'),'application/wasm');assert.equal(await r.text(),'wasm');
});
test('Hunter rejects wrong archive responses, unknown members, and foreign build URLs',async()=>{
 for(const status of [200,404,502]){let n=0;const r=await hunterFile(new Request(`https://kkeep.test/api/hunter-file/${HUNTER_BUILD}/engine.wasm`),async()=>++n===1?new Response(`"${hunterURL}"`):new Response('wrong',{status}));assert.equal(r.status,502);}
 for(const name of ['secret','../other','engine.wasm?url=x'])assert.equal((await hunterFile(new Request(`https://kkeep.test/api/hunter-file/${HUNTER_BUILD}/${name}`),()=>{throw Error('Must not fetch');})).status,404);
 assert.throws(()=>hunterDataUrl(`"${hunterURL.replace(HUNTER_BUILD,'other')}"`));
});
test('Cut the Rope assets have playable MIME types and strictly matched redirects',async()=>{
 for(const [name,type] of [['native-engine.bin','application/wasm'],['audio/music.m4a','audio/mp4'],['assets.json','application/json']]){
 let n=0;const r=await ropeStreaming(new Request(`https://kkeep.test/api/rope-streaming/${ROPE_BUILD}/Ctr2/${name}`),async()=>++n===1?new Response(null,{status:302,headers:{Location:`https://cdn.play.unity.com/games/${ROPE_ID}/${ROPE_BUILD}/StreamingAssets/Ctr2/${name}?Signature=test`}}):new Response('bytes'));assert.equal(r.status,200);assert.equal(r.headers.get('Content-Type'),type);
 }
 const r=await ropeStreaming(new Request(`https://kkeep.test/api/rope-streaming/${ROPE_BUILD}/Ctr2/assets.bin`),async()=>new Response(null,{status:302,headers:{Location:'https://example.com/file'}}));assert.equal(r.status,502);
});
test('Hunter native progress restores and round-trips through Profile-compatible storage',()=>{
 const data=new Map([['hunter-assassin:kkeep:prefs','{"missionNo":7}'],['hunter-assassin:kkeep:files','{"/save/progress":"AP8B"}']]);
 const fs=new Map();const ctx={BobPort:class{},Uint8Array,TextDecoder,TextEncoder,Map,atob,btoa,localStorage:{getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v)},window:{}};
 vm.createContext(ctx);vm.runInContext(readFileSync('public/games/hunter-assassin/hunter.js','utf8'),ctx);
 const p=new ctx.HunterPort();p.M={FS:{mkdirTree(){},writeFile:(k,v)=>fs.set(k,v),readdir:()=>['.','..','progress'],stat:()=>({mode:0}),isDir:()=>false,readFile:k=>fs.get(k)}};p.log=()=>{};p.images=[{base:0}];p.assets=new Map();p.load=async()=>{};
 return p.prepare(async name=>new TextEncoder().encode(name==='hooks.json'?'{}':name==='assets.json'?'[]':'')).then(()=>{assert.equal(p.prefs.missionNo,7);assert.deepEqual([...fs.get('/save/progress')],[0,255,1]);p.prefs.missionNo=8;p.save();assert.equal(JSON.parse(data.get('hunter-assassin:kkeep:prefs')).missionNo,8);assert.equal(JSON.parse(data.get('hunter-assassin:kkeep:files'))['/save/progress'],'AP8B');});
});
test('both games use saved-game runtime with photo/name loading and no nested iframe',()=>{
 for(const slug of ['cut-the-rope-2','hunter-assassin']){const g=findSavedGame(slug);assert.equal(g.gameOnly,true);assert.ok(g.loadingCover);assert.equal(g.entry,`/games/${slug}/index.html`);const html=readFileSync('public'+g.entry,'utf8');assert.ok(!html.includes('<iframe'));}
});
test('Hunter mobile byte ranges are relative to the member and cannot escape it',async()=>{
 let calls=0;const r=await hunterFile(new Request(`https://kkeep.test/api/hunter-file/${HUNTER_BUILD}/engine.wasm`,{headers:{Range:'bytes=0-3'}}),async(url,options)=>{
  if(++calls===1)return new Response(`"${hunterURL}"`);
  assert.equal(options.headers.Range,'bytes=108688380-108688383');return new Response('wasm',{status:206,headers:{'Content-Range':'bytes 108688380-108688383/189056865','Content-Length':'4'}});
 });assert.equal(r.status,206);assert.equal(r.headers.get('Content-Range'),'bytes 0-3/49381689');assert.equal(await r.text(),'wasm');assert.ok(r.headers.get('Access-Control-Expose-Headers').includes('Content-Range'));
 for(const range of ['bytes=49381688-49381690','bytes=8-4','bytes=-10','bytes=0-3,5-8'])assert.equal((await hunterFile(new Request(`https://kkeep.test/api/hunter-file/${HUNTER_BUILD}/engine.wasm`,{headers:{Range:range}}),()=>{throw Error('Must not fetch');})).status,416);
});
