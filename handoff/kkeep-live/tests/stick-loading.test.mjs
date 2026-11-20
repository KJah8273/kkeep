import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../public/stick-runtime.js',import.meta.url),'utf8');
async function run(failBuild=false){
 const messages=[],scripts=[],calls=[];
 const config={dataUrl:'https://example.test/game.data',codeUrl:'https://example.test/game.wasm',frameworkUrl:'https://example.test/framework.js'};
 const context={URLSearchParams,AbortSignal,location:{origin:'https://kkeep.test',search:''},parent:{postMessage:m=>messages.push(m)},window:{addEventListener(){}},matchMedia:()=>({matches:true}),devicePixelRatio:3,setTimeout,clearTimeout,
 fetch:async()=>({ok:!failBuild,json:async()=>({loaderUrl:'https://example.test/loader.js',config})}),
 document:{createElement:()=>({remove(){}}),head:{append:s=>{scripts.push(s.src);queueMicrotask(()=>s.onload());}},querySelector:()=>({focus(){}})},
 createUnityInstance:async(canvas,c,onProgress)=>{calls.push(c);onProgress(.5);return {Quit:async()=>{}};}};
 vm.runInNewContext(source,context);
 await new Promise(resolve=>setTimeout(resolve,10));
 return {messages,scripts,calls};
}
test('current official loader routes all build assets and reports progress then readiness',async()=>{
 const r=await run();assert.equal(r.scripts.length,1);assert.ok(r.scripts[0].startsWith('/api/stick-asset?'));
 for(const key of ['dataUrl','codeUrl','frameworkUrl'])assert.ok(r.calls[0][key].startsWith('/api/stick-asset?'));
 assert.equal(r.calls[0].devicePixelRatio,1);assert.equal(r.calls[0].matchWebGLToCanvasSize,true);assert.equal(r.calls[0].cacheControl(r.calls[0].dataUrl),'immutable');
 assert.ok(r.messages.some(m=>m.event==='progress'));assert.equal(r.messages.at(-1).event,'ready');
});
test('build failure reports error instead of leaving Preparing indefinitely',async()=>{
 const r=await run(true);assert.equal(r.messages.at(-1).event,'error');assert.equal(r.scripts.length,0);assert.equal(r.calls.length,0);
});

test('canvas fills the available viewport in portrait, landscape and fullscreen',()=>{
 const html=readFileSync(new URL('../public/stick-runtime.html',import.meta.url),'utf8');
 assert.match(html,/<canvas id="unity-canvas" width="960" height="540"/);
 assert.match(html,/canvas\{display:block;width:100vw!important;height:100vh!important/);
 assert.match(html,/canvas:fullscreen\{width:100vw!important;height:100vh!important;height:100dvh!important/);
 assert.match(html,/#game #unity-canvas\{inset:0!important;left:0!important;top:0!important;width:100vw!important;height:100vh!important/);
 assert.match(html,/height:100dvh!important/);
 assert.match(html,/stick-viewport-2/);
});
