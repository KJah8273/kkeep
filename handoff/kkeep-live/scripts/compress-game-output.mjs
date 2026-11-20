import {readFileSync,writeFileSync,unlinkSync} from 'node:fs';
import {gzipSync,gunzipSync} from 'node:zlib';
import {packedGameEntries} from '../lib/games/packed-entries.mjs';
for(const entry of packedGameEntries){
 const path='dist/client'+entry;
 const raw=readFileSync(path),compressed=gzipSync(raw,{level:9});
 if(!gunzipSync(compressed).equals(raw))throw Error('Player compression verification failed: '+entry);
 writeFileSync(path+'.gz',compressed);unlinkSync(path);
}
for(const name of ['game.data','game.wasm']){
const path='dist/client/games/among-us-old/Build/'+name;
const raw=readFileSync(path),compressed=gzipSync(raw,{level:9});
if(!gunzipSync(compressed).equals(raw))throw Error('Lossless compression check failed');
writeFileSync(path+'.gz',compressed);unlinkSync(path);
console.log(`Losslessly packed game data: ${raw.length} -> ${compressed.length} bytes`);

}
