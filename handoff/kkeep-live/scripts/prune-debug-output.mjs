// Keep source maps in Git for debugging; production does not need to serve them.
import {readdir, readFile, rm} from 'node:fs/promises';

let removed = 0, bytes = 0;
for (const folder of ['dist/client/engine', 'dist/client/gfn/engine', 'dist/client/xbox/engine']) {
  for (const file of await readdir(folder)) {
    if (!/\.(?:m?js)\.map$/.test(file)) continue;
    const path = folder + '/' + file;
    const contents = await readFile(path);
    const map = JSON.parse(contents.toString('utf8'));
    if (map.version !== 3 || !Array.isArray(map.sources)) throw Error('Unexpected debug asset: ' + path);
    await rm(path);
    removed++;
    bytes += contents.length;
  }
}
console.log(`Omitted ${removed} production source maps (${bytes} bytes); source copies are retained.`);
