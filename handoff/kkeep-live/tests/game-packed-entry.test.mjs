import test from 'node:test';
import assert from 'node:assert/strict';
import {gzipSync} from 'node:zlib';
import {packedGameEntry} from '../worker/packed-game-entry.ts';

test('packed players stream exact HTML through direct and game-public URLs',async()=>{
 const html='<!doctype html><title>Kkeep</title><script>const title="مرحبا";</script>';
 for(const prefix of ['', '/api/game-public']){
  const assets={fetch:async request=>{assert.equal(new URL(request.url).pathname,'/games/vex-4/index.html.gz');return new Response(gzipSync(html),{headers:{'Content-Type':'text/html'}});}};
  const response=await packedGameEntry(new Request('https://kkeep.fun'+prefix+'/games/vex-4/index.html'),assets);
  assert.equal(await response.text(),html);
  assert.equal(response.headers.get('Content-Encoding'),null);
  assert.match(response.headers.get('Content-Type'),/^text\/html/);
 }
});

test('packed players support HEAD, avoid unknown paths and retain source preview fallback',async()=>{
 let calls=0;
 const assets={fetch:async()=>{calls++;return new Response(null,{headers:{'Content-Type':'application/octet-stream'}});}};
 const head=await packedGameEntry(new Request('https://kkeep.fun/games/vex-4/index.html',{method:'HEAD'}),assets);
 assert.equal(await head.text(),'');
 assert.equal(await packedGameEntry(new Request('https://kkeep.fun/games/other/index.html'),assets),null);
 assert.equal(calls,1);
 const preview=await packedGameEntry(new Request('https://kkeep.fun/games/vex-4/index.html'),{fetch:async()=>new Response('<html>app fallback</html>',{headers:{'Content-Type':'text/html'}})});
 assert.equal(preview,null);
});

test('compressed existing engines retain executable MIME and exact source',async()=>{
 const source='window.originalEngine = "unchanged";';
 const response=await packedGameEntry(new Request('https://kkeep.fun/api/game-public/games/3d-bowling/game.js'),{
  fetch:async request=>{assert.equal(new URL(request.url).pathname,'/games/3d-bowling/game.js.gz');return new Response(gzipSync(source),{headers:{'Content-Type':'text/javascript'}});},
 });
 assert.equal(await response.text(),source);
 assert.match(response.headers.get('Content-Type'),/^text\/javascript/);
});
