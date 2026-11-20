import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
import {transformSync,buildSync} from 'esbuild';
import {createRequire} from 'node:module';
import React from 'react';
import {renderToString} from 'react-dom/server';
import {defaults,readPreferences,validatePreferences,validateLegacy,captureOriginal,profile,qualityBudget,personalize,exportAppearance,importAppearance,createWelcomeGate,WELCOME,SETTINGS_KEY,ORIGINAL_KEY,sceneIds,nextFavorite,contrastAccent} from '../lib/living-space/model.ts';
import {validateMediaFile,validateSignature,preloadImage,listMedia,saveMedia} from '../lib/living-space/media.ts';
import {photoWallpapers} from '../lib/wallpapers.ts';
import {scenes,wallpaperInfo} from '../lib/living-space/scenes.ts';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const storage=(entries={})=>{const map=new Map(Object.entries(entries));return {getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v),map};};
const desktop={reducedMotion:false,coarse:false,saveData:false,cores:8};
test('migration captures every existing photo and palette without writing browsing keys',()=>{
 for(const photo of photoWallpapers){const s=storage({'kkeep-ads':'false','kha-lite':'true','kkeep-touch-v1':'saved'});const old={theme:'mint',wallpaper:photo.id,match:false,moving:false,dense:true};assert.deepEqual(captureOriginal(s,old),old);assert.equal(s.map.size,4);assert.equal(s.getItem('kkeep-touch-v1'),'saved');assert.equal(s.getItem('kha-lite'),'true');assert.equal(s.getItem('kkeep-ads'),'false');}
});
test('the first Original snapshot is never overwritten by subsequent appearance changes',()=>{const s=storage();const a={theme:'midnight',wallpaper:'open-meadow',match:true,moving:true,dense:false};captureOriginal(s,a);assert.deepEqual(captureOriginal(s,{...a,wallpaper:'stars'}),a);});
test('corrupt optional settings, denied storage, and future versions recover safely',()=>{
 for(const raw of ['not json','null','[]','{"version":7}','{"wallpaper":"javascript:alert(1)"}'])assert.equal(readPreferences(storage({[SETTINGS_KEY]:raw})).wallpaper,'original');
 assert.equal(readPreferences({getItem(){throw new Error('blocked');}}).quality,'auto');
 assert.doesNotThrow(()=>captureOriginal({getItem(){throw new Error('blocked');},setItem(){throw new Error();}},validateLegacy({})));
});
test('invalid numeric and enum settings are bounded; URLs and executable values are excluded',()=>{
 const v=validatePreferences({quality:'ultra',wallpaper:'https://external.example/image',brightness:Infinity,blur:-100,particles:100000,parallax:NaN,rotation:1,accent:'url(javascript:x)',focalX:200,glass:0,proxy:'unknown'});
 assert.equal(v.quality,'auto');assert.equal(v.wallpaper,'original');assert.equal(v.brightness,100);assert.equal(v.blur,0);assert.equal(v.particles,60);assert.equal(v.parallax,12);assert.equal(v.rotation,0);assert.equal(v.accent,'');assert.equal(v.focalX,100);assert.equal(v.glass,92);assert.equal(v.proxy,undefined);
});
test('Original restores a still presentation, Quiet reduces all decorative work',()=>{
 assert.equal(profile('Original',{...defaults,wallpaper:'deep-orbit'}).wallpaper,'original');
 const p=profile('Quiet',defaults);assert.equal(p.quiet,true);assert.equal(p.solid,true);assert.equal(qualityBudget(p,desktop).fps,0);
});
test('quality falls back on touch, data saver, low concurrency, slow samples, and system reduced motion',()=>{
 assert.equal(qualityBudget(defaults,desktop).tier,'balanced');
 for(const patch of [{coarse:true},{saveData:true},{cores:2},{slow:true}]){const b=qualityBudget(defaults,{...desktop,...patch});assert.equal(b.tier,'low');assert.equal(b.fps,15);assert.ok(b.particles<=12);}
 for(const patch of [{quiet:true},{mode:'original'},{motion:'reduced'},{quality:'static'}])assert.equal(qualityBudget({...defaults,...patch},desktop).fps,0);
 assert.equal(qualityBudget({...defaults,quality:'high'},{...desktop,reducedMotion:true}).fps,0);
 assert.equal(qualityBudget({...defaults,quality:'high'},{...desktop,coarse:true}).parallax,0);
 assert.equal(qualityBudget({...defaults,quality:'high'},desktop).dpr,1.5);
});
test('welcome is exact and its frequency gate is scoped to one document',()=>{
 assert.equal(WELCOME,'yo to the best proxy kkeep');const documentA=createWelcomeGate();assert.equal(documentA.claim(),true);assert.equal(documentA.claim(),false);assert.equal(documentA.claim(),false);const reloaded=createWelcomeGate();assert.equal(reloaded.claim(),true);
 const source=read('components/living-space/welcome.tsx');assert.match(source,/3100/);assert.doesNotMatch(source,/localStorage|sessionStorage|\.focus\(/);assert.match(source,/Dismiss welcome/);
});
test('local helper only proposes validated, reversible appearance settings',()=>{
 for(const request of ['make it darker','use my original wallpaper','less movement','make the buttons bigger','make it easier on my iPad','make a calm space theme']){const p=personalize(request,defaults);assert.ok(p);assert.deepEqual(Object.keys(p.next).sort(),Object.keys(defaults).sort());}
 assert.equal(personalize('fetch my cookies and clear my proxy',defaults),null);assert.equal(personalize('<script>location.href="https://external.example"</script>',defaults),null);
 assert.equal(personalize('make it darker',defaults).next.dimming,20);assert.equal(defaults.dimming,8);
});
test('appearance export excludes cookies, tokens, URLs, history and uploaded files',()=>{
 const json=exportAppearance({...defaults,favorites:['deep-orbit'],cookies:'secret',history:['sensitive']},validateLegacy({wallpaper:'open-meadow'}));const v=JSON.parse(json);assert.equal(v.wallpaperFilesIncluded,false);assert.equal(v.preferences.cookies,undefined);assert.equal(v.preferences.history,undefined);assert.deepEqual(importAppearance(json).preferences.favorites,['deep-orbit']);
});
test('imports reject executable wallpaper URLs, unsupported fields, oversized data, and future schemas',()=>{
 for(const bad of ['oops',' '.repeat(64001),JSON.stringify({format:'kkeep-appearance',version:2,preferences:defaults}),JSON.stringify({format:'kkeep-appearance',version:1,preferences:{...defaults,wallpaper:'data:text/html,<script>x</script>'}}),JSON.stringify({format:'kkeep-appearance',version:1,preferences:{...defaults,proxyEndpoint:'https://other.example'}})])assert.throws(()=>importAppearance(bad));
});
test('favorites are deduplicated and rotation is deterministic with one next selection',()=>{const p=validatePreferences({...defaults,favorites:['deep-orbit','deep-orbit','javascript:x','paper-depth']});assert.deepEqual(p.favorites,['deep-orbit','paper-depth']);assert.equal(nextFavorite('deep-orbit',p.favorites),'paper-depth');assert.equal(nextFavorite('paper-depth',p.favorites),'deep-orbit');assert.equal(nextFavorite('deep-orbit',['deep-orbit']),null);});
test('new scenes are distinct, small local SVG posters without script or external media',()=>{
 assert.deepEqual(scenes.map(s=>s.id),[...sceneIds]);const hashes=new Set();let bytes=0;
 for(const s of scenes){const text=read('public'+s.poster);assert.ok(text.length<25000);bytes+=text.length;hashes.add(createHash('sha256').update(text).digest('hex'));assert.match(text,/viewBox="0 0 1600 1000"/);assert.doesNotMatch(text,/<script|<foreignObject|<image|<text|\son[a-z]+=|href=/i);}
 assert.equal(hashes.size,6);assert.ok(bytes<60000);
 assert.equal(wallpaperInfo('original','purple-sunset').src,'/wallpapers/8k/purple-sunset.webp');
});
test('upload validation rejects HTML, SVG, empty data, oversized files and unsupported MIME types',()=>{
 for(const file of [{type:'text/html',size:500},{type:'image/svg+xml',size:500},{type:'image/png',size:0},{type:'image/png',size:17*1048576},{type:'video/mp4',size:41*1048576},{type:'application/octet-stream',size:500}])assert.throws(()=>validateMediaFile(file));
 assert.doesNotThrow(()=>validateMediaFile({type:'image/png',size:1048576}));assert.doesNotThrow(()=>validateMediaFile({type:'video/mp4',size:1048576}));
});
test('spoofed media extensions fail signature checks before decode',()=>{
 const svg=new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg">');assert.throws(()=>validateSignature(svg,'image/png'));
 assert.doesNotThrow(()=>validateSignature(new Uint8Array([137,80,78,71,13,10,26,10]),'image/png'));
 assert.doesNotThrow(()=>validateSignature(new TextEncoder().encode('RIFF0000WEBP'), 'image/webp'));
 assert.doesNotThrow(()=>validateSignature(new TextEncoder().encode('0000ftypisom'), 'video/mp4'));
 assert.throws(()=>validateSignature(new TextEncoder().encode('0000ftypavif'), 'video/mp4'));
});
test('failed or cancelled wallpaper decodes never resolve as ready, late loads are ignored',async()=>{
 const before=globalThis.Image;const images=[];globalThis.Image=class{constructor(){images.push(this);}set src(v){this.value=v;}};
 try{const abort=new AbortController(),pending=preloadImage('/a.jpg',abort.signal);abort.abort();await assert.rejects(pending,/cancelled/);assert.equal(images[0].onload,null);assert.equal(images[0].onerror,null);
 const failed=preloadImage('/missing.jpg');images[1].onerror();await assert.rejects(failed,/previous choice is safe/);
 const ready=preloadImage('/good.jpg');images[2].onload();await ready;assert.equal(images[2].onload,null);
 }finally{globalThis.Image=before;}
});
test('wallpaper quota limits are checked before a new media decoder is allocated',async()=>{
 const before=globalThis.indexedDB;let closed=0;const existing=Array.from({length:8},(_,i)=>({id:'upload:'+i,blob:{size:1024}}));
 globalThis.indexedDB={open(){const r={result:{close(){closed++;},transaction(){const t={objectStore(){return {getAll(){const request={result:existing};queueMicrotask(()=>t.oncomplete());return request;}};}};return t;}}};queueMicrotask(()=>r.onsuccess());return r;}};
 try{await assert.rejects(saveMedia({type:'image/png',size:1000}),/100 MB \/ 8 file limit/);assert.equal(closed,1);}finally{globalThis.indexedDB=before;}
});
test('IndexedDB transaction failures close the database and return a recoverable error',async()=>{
 const before=globalThis.indexedDB;let closed=0;globalThis.indexedDB={open(){const r={result:{close(){closed++;},transaction(){const t={objectStore(){return {getAll(){queueMicrotask(()=>t.onabort());return {};}};}};return t;}}};queueMicrotask(()=>r.onsuccess());return r;}};
 try{await assert.rejects(listMedia(),/storage may be full/);assert.equal(closed,1);}finally{globalThis.indexedDB=before;}
});
test('decorative scheduler pauses when hidden and releases animation/listeners/observer on cleanup',()=>{
 const callbacks=new Map(),listeners=new Map();let id=0,cleanup,disconnected=0,draws=0;
 const context={clearRect(){},setTransform(){},beginPath(){},arc(){},fill(){draws++;}};const canvas={getContext:()=>context,getBoundingClientRect:()=>({width:1000,height:700})};
 const doc={hidden:false,addEventListener:(k,f)=>listeners.set(k,f),removeEventListener:k=>listeners.delete(k)};
 const react={useRef:()=>({current:canvas}),useEffect:f=>{cleanup=f();}};
 const module={exports:{}};const code=transformSync(read('components/living-space/atmosphere.tsx'),{loader:'tsx',format:'cjs',jsx:'automatic'}).code;
 vm.runInNewContext(code,{module,exports:module.exports,require:name=>name==='react'?react:{jsx:()=>null},document:doc,ResizeObserver:class{observe(){}disconnect(){disconnected++;}},requestAnimationFrame:f=>{callbacks.set(++id,f);return id;},cancelAnimationFrame:id=>callbacks.delete(id)});
 module.exports.default({count:12,fps:15,dpr:1,speed:35,paused:false});assert.equal(callbacks.size,1);assert.equal(draws,12);doc.hidden=true;listeners.get('visibilitychange')();assert.equal(callbacks.size,0);doc.hidden=false;listeners.get('visibilitychange')();assert.equal(callbacks.size,1);cleanup();assert.equal(callbacks.size,0);assert.equal(listeners.size,0);assert.equal(disconnected,1);
});
test('no graphics context leaves the static wallpaper intact without starting a scheduler',()=>{
 let starts=0;const module={exports:{}};vm.runInNewContext(transformSync(read('components/living-space/atmosphere.tsx'),{loader:'tsx',format:'cjs',jsx:'automatic'}).code,{module,exports:module.exports,require:name=>name==='react'?{useRef:()=>({current:{getContext:()=>null}}),useEffect:fn=>fn()}:{jsx:()=>null},requestAnimationFrame:()=>starts++});assert.doesNotThrow(()=>module.exports.default({count:12,fps:15,dpr:1,speed:35,paused:false}));assert.equal(starts,0);
});
test('proxy lifecycle, original assets, routes, manifests and server contracts match the reviewed baseline',()=>{
 // TikTok desktop/swipe update refreshes only apps, proxy-client and ProxyView snapshots.
 const baseline=JSON.parse(read('tests/living-baseline.json'));for(const [file,sha] of Object.entries(baseline)){if(file==='lib/games/linked-games.ts')continue; // Catalog is intentionally changed by the owner's removal request.
 let data;if(file==='ProxyView'){const source=read('components/proxy-browser.tsx');data=source.slice(source.indexOf('function ProxyView'),source.indexOf('export default function ProxyBrowser'));}else data=readFileSync(new URL('../'+file,import.meta.url));assert.equal(createHash('sha256').update(data).digest('hex'),sha,file);}
 const source=read('components/proxy-browser.tsx');assert.match(source,/<TabsContent forceMount key=\{tab.id\}/);assert.match(source,/<ProxyView key=\{tab.id\+'-'\+\(tab.restart\?\?0\)\}/);assert.doesNotMatch(source,/kha-proxy-source.zip|>Source</);
 assert.equal(existsSync(new URL('../public/source/kha-proxy-source.zip',import.meta.url)),false);
});
test('new CSS remains scoped to shell and studio with explicit motion and touch fallbacks',()=>{
 const css=read('app/living-space.css');assert.match(css,/prefers-reduced-motion/);assert.match(css,/pointer-events:none/);assert.match(css,/100dvh/);assert.match(css,/safe-area-inset/);assert.match(css,/\.living-settings/);assert.doesNotMatch(css,/iframe\s*\{|user-select:none|touch-action:none|\.hgola-game/);
 // Radix/Tailwind centers the dialog with the CSS translate property. A second transform would move it offscreen.
 assert.doesNotMatch(css,/\.living-settings\s*\{[^}]*transform\s*:/);
});
test('first-paint poster boot reads only appearance data and selects from its closed catalog',()=>{
 const writes=[];vm.runInNewContext(read('public/living-space-boot.js'),{localStorage:storage({'kkeep-wallpaper':'sleepy-train'}),document:{documentElement:{style:{setProperty:(...v)=>writes.push(v)}}}});assert.deepEqual(writes,[['--living-boot-wallpaper','url("/wallpapers/sleepy-train-enhanced.png")']]);
 const bad=[];vm.runInNewContext(read('public/living-space-boot.js'),{localStorage:storage({[SETTINGS_KEY]:JSON.stringify({wallpaper:'javascript:alert(1)'})}),document:{documentElement:{style:{setProperty:(...v)=>bad.push(v)}}}});assert.equal(bad.length,0);
});
test('body and secondary text maintain contrast on bright and dark wallpapers at minimum glass opacity',()=>{
 const module={exports:{}};vm.runInNewContext(transformSync(read('lib/themes.ts'),{loader:'ts',format:'cjs'}).code,{module,exports:module.exports,require:()=>({photoWallpapers})});
 const rgb=s=>[1,3,5].map(i=>parseInt(s.slice(i,i+2),16)),lum=rgb=>rgb.map(c=>c/255).map(c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4).reduce((a,c,i)=>a+c*[.2126,.7152,.0722][i],0),contrast=(a,b)=>(Math.max(lum(a),lum(b))+.05)/(Math.min(lum(a),lum(b))+.05);
 for(const p of [...photoWallpapers.map(p=>({name:p.id,...p.colors})),...module.exports.themes])for(const text of ['text','muted'])for(const backdrop of [0,255])assert.ok(contrast(rgb(p[text]),rgb(p.surface).map(c=>.92*c+.08*backdrop))>=4.5,p.name+' '+text);
 assert.ok(contrast(rgb(contrastAccent('#ffffff',true)),rgb('#ffffff'))>=4.5);assert.ok(contrast(rgb(contrastAccent('#a0a0a0',false)),rgb('#13202c'))>=4.5);
});
test('actual shell server rendering produces the real navigation and visible Wallpaper and Profile without browser-only failures',()=>{
 const require=createRequire(import.meta.url),module={exports:{}};
 const code=buildSync({entryPoints:[new URL('../components/proxy-browser.tsx',import.meta.url).pathname],bundle:true,platform:'node',format:'cjs',packages:'external',loader:{'.css':'empty'},write:false}).outputFiles[0].text;
 vm.runInNewContext(code,{module,exports:module.exports,require,console,URL,setTimeout,clearTimeout,AbortController});
 const html=renderToString(React.createElement(module.exports.default));
 for(const path of ['/youtube','/tiktok','/gfn/index.html','/xbox/index.html','/snapchat','/hgola-altara','/stick-fight'])assert.ok(html.includes(path),path);
 assert.match(html,/>Wallpaper</);assert.match(html,/>Profile</);assert.doesNotMatch(html,/kkeep-settings-trigger|Make it yours/);assert.doesNotMatch(html,/data-living|living-welcome|quiet-tool|home-suggestions/);assert.match(html,/Open Games/);assert.match(html,/Open 4-2 players/);assert.doesNotMatch(html,/<iframe|kha-proxy-source.zip/);
});
test('reordering shortcuts changes DOM and keyboard order while retaining every original shortcut',()=>{
 const require=createRequire(import.meta.url),module={exports:{}};
 const code=buildSync({entryPoints:[new URL('../components/living-space/shortcut-dock.tsx',import.meta.url).pathname],bundle:true,platform:'node',format:'cjs',packages:'external',loader:{'.css':'empty'},write:false}).outputFiles[0].text;
 vm.runInNewContext(code,{module,exports:module.exports,require});const {default:Dock,ShortcutSlot:Slot}=module.exports;
 const children=['YouTube','Snapchat','Games'].map(id=>React.createElement(Slot,{id,key:id},React.createElement('button',{},id)));
 const html=renderToString(React.createElement(Dock,{order:['Games','Snapchat','YouTube']},children));assert.ok(html.indexOf('>Games<')<html.indexOf('>Snapchat<'));assert.ok(html.indexOf('>Snapchat<')<html.indexOf('>YouTube<'));
});
test('appearance commit reports quota failure without touching session storage or losing the in-memory choice',()=>{
 let saved,notices=0;const module={exports:{}};
 const code=transformSync(read('components/living-space/use-living-space.ts'),{loader:'ts',format:'cjs'}).code;
 vm.runInNewContext(code,{module,exports:module.exports,require:name=>name==='react'?{useState:v=>[v,value=>{saved=value;}],useRef:v=>({current:v}),useCallback:fn=>fn,useEffect(){}}:name==='sonner'?{toast(){notices++;}}:{defaults,validatePreferences,readPreferences,captureOriginal,SETTINGS_KEY},localStorage:{setItem(){throw new Error('QuotaExceededError');}}});
 const api=module.exports.useLivingSpace(true,validateLegacy({}));assert.equal(api.commit({...defaults,wallpaper:'paper-depth'}),false);assert.equal(saved.wallpaper,'paper-depth');assert.equal(notices,1);
});

test('classic home keeps the studio but excludes the reverted Living Space shell',()=>{
 const shell=read('components/proxy-browser.tsx'),studio=read('components/living-space/settings.tsx'),css=read('app/living-space.css');
 assert.doesNotMatch(shell,/Make it yours|Open wallpaper studio|kkeep-settings-trigger/);
 assert.match(shell,/<WallpaperGallery open=/);
 assert.match(shell,/<ProfilePanel open=/);
 assert.match(shell,/<LivingWallpaper preferences=\{preferences\}/);
 assert.doesNotMatch(shell,/<Welcome|<LivingSettings|data-living=|quiet-tool|settingsIntro/);
 assert.doesNotMatch(studio,/Preview welcome message|Local helper|Shell fallback|Shortcut layout|Appearance profiles/);
 assert.match(studio,/<DialogTitle>Wallpaper studio<\/DialogTitle>/);
 assert.doesNotMatch(css,/\.workspace|\.living-welcome|settings-intro/);
});
test('Mr Bullet is unavailable and Stickman Duel appears only in the 4-2 players gallery',async()=>{
 const home=read('components/kkeep-home.tsx'),catalog=read('lib/games/linked-games.ts');
 const games=home.slice(home.indexOf('<DialogTitle>Games</DialogTitle>'),home.indexOf('<DialogTitle>4-2 players</DialogTitle>'));
 const players=home.slice(home.indexOf('<DialogTitle>4-2 players</DialogTitle>'));
 assert.doesNotMatch(catalog,/mr-bullet|Mr Bullet/);
 assert.doesNotMatch(games,/stickman-duel|Stickman Duel/);
 assert.match(players,/href="\/play\/stickman-duel"/);
 assert.match(players,/src="\/games\/covers\/stickman-duel.webp"/);
 assert.equal(home.split('>Stickman Duel<').length-1,1);
 const require=createRequire(import.meta.url),module={exports:{}};
 const code=buildSync({entryPoints:[new URL('../app/play/[slug]/page.tsx',import.meta.url).pathname],bundle:true,platform:'node',format:'cjs',packages:'external',loader:{'.css':'empty'},write:false}).outputFiles[0].text;
 vm.runInNewContext(code,{URL,module,exports:module.exports,require:name=>name==='next/navigation'?{notFound(){throw new Error('NOT_FOUND');}}:require(name)});
 await assert.rejects(module.exports.default({params:Promise.resolve({slug:'mr-bullet'})}),/NOT_FOUND/);
 for(const slug of ['blumgi-paintball','stickman-hook','drive-mad']){
  const page=await module.exports.default({params:Promise.resolve({slug})});
  assert.match(renderToString(page),slug==='blumgi-paintball'?/<iframe/:/Restoring progress/);
 }
});
