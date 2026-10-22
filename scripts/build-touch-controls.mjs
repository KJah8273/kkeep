import {build} from 'esbuild';
await build({entryPoints:{'kkeep-touch':'lib/touch/bookmark.js','kkeep-touch-embed':'lib/touch/embed.js'},outdir:'public/controls',bundle:true,minify:true,format:'iife',target:['safari15'],loader:{'.css':'text'},legalComments:'none'});
await build({entryPoints:['lib/geforce/touch-controls.js'],outfile:'public/gfn/touch-controls.js',bundle:true,minify:true,format:'iife',target:['safari15'],loader:{'.css':'text'},legalComments:'none'});
console.log('Built Kkeep touch controller');
