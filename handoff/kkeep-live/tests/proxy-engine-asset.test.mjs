import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {proxyEngineAsset} from '../worker/proxy-engine-asset.ts';

test('Safari worker fallback serves only the public pinned engine payload',()=>{
 assert.equal(proxyEngineAsset('/browse/62qt0rnm/kwnpdguj/scramjet.wasm.js'),'/engine/scramjet.wasm.js');
 for(const path of ['/browse/a/b/https%3A%2F%2Fkick.com','/browse/a/b/inject.js','/browse/a/b/scramjet.wasm.js/extra','/browse/a/b/../scramjet.wasm.js','/gfn/browse/a/b/scramjet.wasm.js'])assert.equal(proxyEngineAsset(path),null);
 const context={self:{}};
 vm.runInNewContext(readFileSync(new URL('../public/engine/scramjet.wasm.js',import.meta.url),'utf8'),context);
 assert.deepEqual(Buffer.from(context.self.WASM,'base64'),readFileSync(new URL('../public/engine/scramjet.wasm',import.meta.url)));
});

test('service worker recovery serves engine bytes without restoring expired remote sessions',async()=>{
 const requests=[];const context={importScripts(){},self:{addEventListener(){}},URL,Response,fetch:async(url)=>{requests.push(String(url));return new Response('engine');}};
 vm.createContext(context);vm.runInContext(readFileSync(new URL('../public/proxy-sw.js',import.meta.url),'utf8'),context);
 assert.equal(await (await context.recover({url:'https://kkeep.test/browse/abc/def/scramjet.wasm.js',destination:'script'})).text(),'engine');
 assert.deepEqual(requests,['https://kkeep.test/engine/scramjet.wasm.js']);
 assert.equal(context.recover({url:'https://kkeep.test/browse/abc/def/https%3A%2F%2Fkick.com',destination:'script'}).status,410);
});
