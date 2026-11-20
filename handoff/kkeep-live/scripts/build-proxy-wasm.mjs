import {readFileSync,writeFileSync} from 'node:fs';
// Match controller.api.js's virtualWasmPath payload for uncontrolled Safari workers.
const wasm=readFileSync(new URL('../public/engine/scramjet.wasm',import.meta.url));
writeFileSync(new URL('../public/engine/scramjet.wasm.js',import.meta.url),`self.WASM = '${wasm.toString('base64')}';\n`);
