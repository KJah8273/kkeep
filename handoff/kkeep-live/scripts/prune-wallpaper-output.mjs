// Keep source originals in Git; deploy only the current image variants.
import {readdir,rm} from 'node:fs/promises';
// The fixed vector wallpaper is bundled in the interface. Archive originals remain in Git.
await rm('dist/client/wallpapers',{recursive:true,force:true});
console.log('Omitted retired wallpaper videos and picker media.');

// Interrupted transfer fragments are not game assets.
for (const name of await readdir("dist/client/games/packed/stickman-duel")) {
 if (/^\.wasm\.part[0-9]+\.[A-Za-z0-9]{6}$/.test(name)) await rm("dist/client/games/packed/stickman-duel/"+name);
}
