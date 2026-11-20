import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {buildSync} from 'esbuild';
import React from 'react';
import {renderToString} from 'react-dom/server';
import {bindWallpaperPlayback,pauseWallpaperVideo} from '../lib/living-space/video-playback.ts';
import {defaults,qualityBudget} from '../lib/living-space/model.ts';
import {movingWallpapers} from '../lib/moving-wallpapers.ts';

function fixture(){
 const page=new EventTarget();page.hidden=false;
 const window=new EventTarget(),video=new EventTarget();
 video.attributes=new Map();video.plays=0;video.pauses=0;video.blocked=false;
 video.setAttribute=(name,value)=>video.attributes.set(name,value);
 video.pause=()=>video.pauses++;
 video.play=()=>{video.plays++;assert.equal(video.muted,true);assert.equal(video.defaultMuted,true);assert.equal(video.playsInline,true);return video.blocked?Promise.reject(new Error('NotAllowedError')):Promise.resolve();};
 return {page,window,video};
}

test('explicit video selection plays even when device effects use a still frame',()=>{
 const p={...defaults,wallpaper:movingWallpapers[0].id};
 assert.equal(qualityBudget(p,{reducedMotion:true,coarse:true,saveData:false,cores:4}).fps,0);
 assert.equal(pauseWallpaperVideo(p,false,false),false);
 for(const patch of [{quiet:true},{motion:'reduced'},{speed:0}])assert.equal(pauseWallpaperVideo({...p,...patch},false,false),true);
 assert.equal(pauseWallpaperVideo(p,true,false),true);
 assert.equal(pauseWallpaperVideo(p,false,true),true);
});

test('autoplay denial retries directly on a completed touch or click',async()=>{
 const {video,page,window}=fixture();video.blocked=true;
 const dispose=bindWallpaperPlayback(video,false,page,window);
 await Promise.resolve();assert.equal(video.plays,1);
 video.blocked=false;
 for(const name of ['touchend','click','pointerup','keydown'])page.dispatchEvent(new Event(name));
 assert.equal(video.plays,5);
 assert.ok(video.attributes.has('muted'));assert.ok(video.attributes.has('playsinline'));
 dispose();
});

test('backgrounding pauses; returning and media readiness resume playback',()=>{
 const {video,page,window}=fixture();const dispose=bindWallpaperPlayback(video,false,page,window);
 page.hidden=true;page.dispatchEvent(new Event('visibilitychange'));
 const plays=video.plays;page.dispatchEvent(new Event('touchend'));assert.equal(video.plays,plays);
 page.hidden=false;page.dispatchEvent(new Event('visibilitychange'));
 window.dispatchEvent(new Event('pageshow'));video.dispatchEvent(new Event('canplay'));
 assert.equal(video.plays,plays+3);assert.ok(video.pauses>0);dispose();
});

test('paused or removed wallpapers cannot restart from stale page listeners',()=>{
 const {video,page,window}=fixture();const dispose=bindWallpaperPlayback(video,true,page,window);
 page.dispatchEvent(new Event('touchend'));video.dispatchEvent(new Event('canplay'));assert.equal(video.plays,0);dispose();
 const active=bindWallpaperPlayback(video,false,page,window);assert.equal(video.plays,1);active();
 for(const name of ['click','touchend','pointerup','keydown','visibilitychange'])page.dispatchEvent(new Event(name));
 window.dispatchEvent(new Event('pageshow'));video.dispatchEvent(new Event('loadeddata'));assert.equal(video.plays,1);
});

test('the fixed wallpaper renders its 4K video and poster before playback',()=>{
 const module={exports:{}};
 const code=buildSync({entryPoints:[new URL('../components/living-space/wallpaper.tsx',import.meta.url).pathname],bundle:true,platform:'node',format:'cjs',packages:'external',write:false}).outputFiles[0].text;
 vm.runInNewContext(code,{module,exports:module.exports,require:createRequire(import.meta.url)});
 const html=renderToString(React.createElement(module.exports.default,{preferences:defaults,original:'original'}));
 const video=html.match(/<video\b[^>]*>/)?.[0];
 assert.ok(video);
 assert.match(video,/src="\/kkeep-orbit-4k\.mp4"/);
 assert.match(video,/poster="\/kkeep-orbit-poster\.webp"/);
 assert.match(video,/muted=""/);
 assert.match(video,/playsInline=""/i);
 assert.match(video,/loop=""/);
 assert.doesNotMatch(video,/opacity|display:none|visibility:hidden/);
});
