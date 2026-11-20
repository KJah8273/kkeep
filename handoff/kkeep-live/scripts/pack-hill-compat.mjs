import {readFile,writeFile} from 'node:fs/promises';
import {brotliCompress,brotliDecompressSync,constants} from 'node:zlib';
import {promisify} from 'node:util';
const [input,output,prepared]=process.argv.slice(2);
if(!input||!output)throw Error('Usage: node scripts/pack-hill-compat.mjs input.wasm output.bin [prepared.br]');
const bytes=await readFile(input);
const packed=prepared?await readFile(prepared):await promisify(brotliCompress)(bytes,{params:{
 [constants.BROTLI_PARAM_QUALITY]:11,[constants.BROTLI_PARAM_LGWIN]:24,[constants.BROTLI_PARAM_SIZE_HINT]:bytes.length
}});
if(!brotliDecompressSync(packed).equals(bytes))throw Error('Compressed engine did not preserve the tested Wasm');
await writeFile(output,packed);
console.log('Verified compressed engine: '+packed.length+' bytes');
