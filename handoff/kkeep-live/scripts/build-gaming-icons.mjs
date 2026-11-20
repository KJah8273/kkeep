// Rasterize existing brand assets for iPad and web app manifests.
// Run manually when source logos change; generated PNGs are committed.
import sharp from 'sharp';
import {readFileSync} from 'node:fs';
const root = new URL('../public/', import.meta.url);
for (const [app, logo, background] of [['xbox','xbox','#107c10'],['gfn','nvidia','#101410']]) {
  for (const size of [180,192,512]) {
    const inset = Math.round(size * 0.15);
    const mark = await sharp(readFileSync(new URL(`icons/${logo}.svg`,root)))
      .resize(size - inset * 2,size - inset * 2).png().toBuffer();
    await sharp({create:{width:size,height:size,channels:3,background}})
      .composite([{input:mark,gravity:'centre'}]).png()
      .toFile(new URL(`${app}/${size === 180 ? 'apple-touch-icon' : `icon-${size}`}.png`,root).pathname);
  }
}
