import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {gzipSync,brotliDecompressSync} from 'node:zlib';
import {buildSync} from 'esbuild';
import {findSavedGame} from '../lib/games/save-catalog.ts';
import {gameContent,gameResourceTarget} from '../worker/game-content.ts';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
function harness(extra={}){
 const ctx={URL,Blob,Response,TextDecoder,DecompressionStream,Uint8Array,ArrayBuffer,console:{error(){},log(){}},setTimeout:fn=>fn(),...extra};ctx.window=ctx;vm.createContext(ctx);vm.runInContext(read('public/games/unity-safe-loader.js'),ctx);return ctx;
}
function legacyCompression(ctx){
 const script=read('public/games/pixel-gun-zombie/UnityLoader.js');
 return vm.runInContext('('+script.slice(script.indexOf('Compression:')+'Compression:'.length,-2)+')',ctx);
}
function unityGzip(text){const gz=gzipSync(text);gz[3]=16;return new Uint8Array(Buffer.concat([gz.subarray(0,10),Buffer.from('UnityWeb Compressed Content (gzip)\0'),gz.subarray(10)]));}
test('legacy Unity decodes with native gzip and a synchronous fallback when opaque-frame workers are unavailable',async()=>{
 let workers=0;
 const ctx=harness({Worker:class{constructor(){workers++;throw new Error('SecurityError');}}});
 const bytes=unityGzip('(function(){return 42;});'),compression=legacyCompression(ctx);
 assert.throws(()=>compression.decompress(bytes,()=>{}),/SecurityError/);
 const native=await ctx.KkeepUnity.decode(compression,bytes);assert.equal(new TextDecoder().decode(native),'(function(){return 42;});');
 ctx.DecompressionStream=undefined;
 const fallback=await ctx.KkeepUnity.decode(compression,bytes);assert.deepEqual([...fallback],[...native]);assert.equal(workers,1);
});
test('Drift uses the verified final URL and the relay still rejects arbitrary redirects',async()=>{
 const config=JSON.parse(read('public/games/drift-hunters/dh.json')),game=findSavedGame('drift-hunters');
 for(const property of ['asmCodeUrl','asmMemoryUrl','dataUrl']){
  const url=new URL(config[property]);assert.equal(url.hostname,'raw.githubusercontent.com');const i=game.origins.indexOf(url.origin);assert.ok(i>=0);
  assert.equal(gameResourceTarget(new URL('https://kkeep.test/api/game-resource/drift-hunters/'+i+url.pathname)).href,url.href);
 }
 const response=await gameContent(new Request('https://kkeep.test/api/game-resource/drift-hunters/1/path'),{},{waitUntil(){}},async()=>new Response(null,{status:301,headers:{Location:'https://unapproved.test'}}));assert.equal(response.status,502);
});
test('HTTP errors and incomplete files never become Unity game code; retries are bounded',async()=>{
 let calls=0,completed=false;const errors=[];
 const ctx=harness({document:{baseURI:'https://kkeep.test/games/example/'},XMLHttpRequest:class{open(){}addEventListener(){}send(){calls++;this.status=502;this.response=new TextEncoder().encode('{"error":"unavailable"}').buffer;this.onload();}}});
 const loader={Compression:{decompress:data=>data}};ctx.KkeepUnity.install(loader,{fail:m=>errors.push(m)});
 loader.downloadJob({},{parameters:{url:'code.unityweb'},complete(){completed=true;}});
 assert.equal(calls,3);assert.equal(completed,false);assert.equal(errors.length,1);
 calls=0;errors.length=0;ctx.XMLHttpRequest=class{open(){}addEventListener(){}send(){calls++;this.status=200;this.response=new Uint8Array([1,2]).buffer;this.onload();}};
 ctx.KkeepUnity.install(loader,{fail:m=>errors.push(m),sizes:{'code.unityweb':[100]}});loader.downloadJob({},{parameters:{url:'code.unityweb'},complete(){completed=true;}});
 assert.equal(calls,3);assert.equal(completed,false);assert.equal(errors.length,1);
});
test('a failed download cannot recreate Module.asm is not a function',()=>{
 const errors=[],ctx=harness({document:{baseURI:'https://kkeep.test/'}}),loader={Compression:{decompress:b=>b}};
 ctx.KkeepUnity.install(loader,{fail:m=>errors.push(m)});
 let completed=false;loader.loadCode(new TextEncoder().encode('{"error":"unavailable"}'),()=>completed=true,{});
 assert.equal(completed,false);assert.match(errors[0],/invalid/);
});
test('Basket compression decodes without Worker or origin-bound Cache Storage',async()=>{
 const ctx=harness({Worker:class{constructor(){throw new Error('Worker unavailable');}}});
 const script=read('public/games/basket-battle/loader.js');
 const codecs=vm.runInContext('('+script.slice(script.indexOf('var P=')+6,script.indexOf('function N(n)')).replace(/;$/,'')+')',ctx);
 const compressed=new Uint8Array(readFileSync(new URL('fixtures/unity/basket-framework.unityweb',import.meta.url)));
 assert.equal(codecs.br.hasUnityMarker(compressed),true);
 const decoded=await ctx.KkeepUnity.decode(codecs,compressed);
 assert.deepEqual(Buffer.from(decoded),brotliDecompressSync(compressed));
 const compiled={};vm.runInNewContext(new TextDecoder().decode(decoded),compiled);assert.equal(typeof compiled.unityFramework,'function');
 const start=script.indexOf('function N(n)'),end=script.indexOf('function R()',start);
 assert.ok(!script.slice(start,end).includes('cachedFetch'));
});
test('Basket loads the Profile adapter from Kkeep and passes absolute build URLs to Unity',async()=>{
 const html=read('public/games/basket-battle/index.html');assert.doesNotMatch(html,/<base/);
 const source=/src="([^"]*save\.js)"/.exec(html)[1];assert.equal(new URL(source,'https://kkeep.test/games/basket-battle/index.html').href,'https://kkeep.test/games/basket-battle/save.js');
 const inline=html.match(/<script>([\s\S]*?)<\/script>/)[1];let script,config;
 const node={hidden:false,querySelector:()=>node,focus(){}};
 const ctx=harness({navigator:{maxTouchPoints:5},devicePixelRatio:2,document:{getElementById:()=>node,querySelector:()=>node,createElement:()=>script={},body:{appendChild(){}}},addEventListener(){},createUnityInstance:async(_,settings)=>{config=settings;return{SendMessage(){}};}});
 vm.runInContext(inline,ctx);await script.onload();
 assert.equal(script.src,'loader.js');for(const key of ['dataUrl','frameworkUrl','codeUrl','streamingAssetsUrl'])assert.ok(config[key].startsWith('https://cdn.jsdelivr.net/'));assert.equal(config.devicePixelRatio,1);
});
test('the 2-4 players selection contains exactly the requested three games, in order',()=>{
 const compiled=buildSync({entryPoints:['lib/menu-catalog.ts'],bundle:true,platform:'node',format:'cjs',write:false}).outputFiles[0].text,context={module:{exports:{}},exports:{}};vm.runInNewContext(compiled,context);
 const {games,multiplayerGames}=context.module.exports;assert.ok(games.length>=41);
 assert.deepEqual(Array.from(multiplayerGames,g=>g.id),['234','party-games','stickman-duel']);
 assert.deepEqual(Array.from(multiplayerGames,g=>g.url),['https://player1234.testerqrr1.chatgpt.site/','/party-games','/play/stickman-duel']);
 for(const game of multiplayerGames)assert.ok(game.image&&game.name);
});
test('Drift compiles its module inside the isolated frame without a Safari blob script',()=>{
 const errors=[],ctx=harness(),loader={Compression:{},Cryptography:{md5:()=>new Uint8Array([1,2])}};
 ctx.KkeepUnity.install(loader,{fail:message=>errors.push(message),inlineCode:true});let result;
 loader.loadCode(new TextEncoder().encode('(function(Module){return Module.value+1;})'),key=>{result=loader[key]({value:41});},{});
 assert.equal(result,42);assert.deepEqual(errors,[]);
});
