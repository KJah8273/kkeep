// Deterministic asset resizing: preserves the supplied artwork, no generated detail.
import {readFile,mkdir,stat} from 'node:fs/promises';
import {spawn} from 'node:child_process';
const assets=JSON.parse(await readFile(new URL('../lib/wallpaper-assets.json',import.meta.url)));
const run=args=>new Promise((resolve,reject)=>{const p=spawn('magick',args,{stdio:['ignore','ignore','inherit']});p.on('error',reject);p.on('exit',code=>code?reject(Error('Image conversion failed: '+code)):resolve());});
await mkdir('public/wallpapers/8k',{recursive:true});await mkdir('public/wallpapers/thumbs',{recursive:true});
let index=0;
async function worker(){while(index<assets.length){const item=assets[index++],src='public'+item.originalSrc;
 await run(['-limit','thread','2',src,'-auto-orient','-filter','Lanczos','-resize','7680x4320^','-gravity','center','-extent','7680x4320','-strip','-quality','88','-define','webp:method=2','public'+item.src]);
 await run(['-limit','thread','2',src,'-auto-orient','-thumbnail','640x360^','-gravity','center','-extent','640x360','-strip','-quality','80','public'+item.previewSrc]);
 console.log(item.id,Math.round((await stat('public'+item.src)).size/1024)+' KB');
}}
await Promise.all([worker(),worker()]);
