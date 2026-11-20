import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {build} from 'esbuild';
import vm from 'node:vm';

test('proxy assets preload once in parallel but scripts execute in order',async()=>{
 const result=await build({entryPoints:[new URL('../lib/proxy-client.ts',import.meta.url).pathname],bundle:true,write:false,format:'cjs',platform:'browser'});
 const code=result.outputFiles[0].text;
 const links=[],scripts=[],callbacks={};let mounted=0;
 const engine={setLite(){},setAdBlock(){},mount(){mounted++;return Promise.resolve({});}};
 const context=vm.createContext({exports:{},module:{exports:{}},URL,setTimeout,clearTimeout,navigator:{serviceWorker:{}},window:{isSecureContext:true,KHAProxy:engine},document:{createElement:tag=>({tag,remove(){}}),head:{appendChild(node){if(node.tag==='link')links.push(node);else {scripts.push(node);queueMicrotask(()=>node.onload());}}}}});
 vm.runInContext(code,context);
 const api=context.module.exports;
 api.prepareProxy();api.prepareProxy();
 assert.equal(links.length,3);assert.equal(scripts.length,0);
 assert.ok(links.every(link=>link.rel==='preload'&&link.as==='script'&&link.href.startsWith('/engine/')));
 await Promise.all([api.mountProxy({},callbacks),api.mountProxy({},callbacks)]);
 assert.equal(mounted,2);assert.equal(scripts.length,3);
 assert.deepEqual(scripts.map(script=>script.src),links.map(link=>link.href));
 assert.ok(scripts.every(script=>script.async===false));
});

test('home stays compact while all opened websites use normal scale',()=>{
 const css=readFileSync(new URL('../app/globals.css',import.meta.url),'utf8');
 assert.match(css,/:root\{--kkeep-zoom:\.75\}/);
 assert.match(css,/\.workspace:not\(\.home-mode\)\{--kkeep-zoom:1\}/);
 const home=readFileSync(new URL('../components/kkeep-home.tsx',import.meta.url),'utf8');
 assert.match(home,/app.engine\|\|app.external\|\|event.button!==0\|\|event.metaKey\|\|event.ctrlKey\|\|event.shiftKey\|\|event.altKey/);
 assert.match(home,/event.preventDefault\(\);onApp\(app\)/);
 const browser=readFileSync(new URL('../components/proxy-browser.tsx',import.meta.url),'utf8');
 assert.match(browser,/onApp=\{openApp\}/);
});
