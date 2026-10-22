import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
for(const engine of ['engine','gfn/engine','xbox/engine'])test(engine+': bundled Scramjet WASM rewrites real HTML resources and JavaScript',async()=>{
 globalThis.self=globalThis;
 await import('../public/'+engine+'/scramjet.js');
 const sj=globalThis.$scramjet;
 sj.setWasm(await fs.readFile(new URL('../public/'+engine+'/scramjet.wasm',import.meta.url)));
 const context={config:sj.defaultConfig,prefix:new URL('https://proxy.example/browse/test/'),cookieJar:new sj.CookieJar(),interface:{codecEncode:encodeURIComponent,codecDecode:decodeURIComponent,getInjectScripts:()=>[]},hooks:{rewriter:{html:sj.Tap.create()}}};
 const meta={origin:new URL('https://example.com/'),base:new URL('https://example.com/page/')};
 const html=sj.rewriteHtml('<html><head></head><body><a href="/next">Next</a><img src="/test.png"><script src="/app.js"></script></body></html>',context,meta,{loadScripts:false,inline:false,source:'https://example.com/page/'});
 assert.match(html,/https:\/\/proxy.example\/browse\/test\/https%3A%2F%2Fexample.com%2Fnext/);
 assert.match(html,/https%3A%2F%2Fexample.com%2Ftest.png/);
 assert.match(html,/https%3A%2F%2Fexample.com%2Fapp.js/);
 const rewritten=sj.rewriteJs('window.location.href; fetch("/api/data");','https://example.com/app.js',context,meta,false);
 assert.match(String(rewritten),/scramjet/);
 assert.equal(sj.versionInfo.version,'2.0.67-alpha.2');
});
