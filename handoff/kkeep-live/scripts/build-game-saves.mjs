import {readFile,writeFile} from 'node:fs/promises';
import {build} from 'esbuild';
await build({entryPoints:['lib/games/save-runtime.mjs'],bundle:true,format:'iife',target:['safari16','chrome100'],outfile:'public/games/save-runtime.js',minify:true,legalComments:'eof'});
console.log('Built isolated game save runtime');

const runtime=await readFile('public/games/save-runtime.js','utf8');
await writeFile('public/games/save-frame.html',`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>html,body{margin:0;background:#08080b;color:#ddd;font:14px system-ui;height:100%;display:grid;place-items:center}</style></head><body><p role="status">Restoring game progress…</p><script>${runtime.replaceAll('</script','<\\/script')}</script></body></html>`);

await writeFile('lib/games/poki-source.ts','// Generated from the existing Kkeep lifecycle adapter.\nexport default '+JSON.stringify(await readFile('public/games/poki-adapter.js','utf8'))+';\n');

// Package the checked games' local scripts with the launcher. The isolated
// frame can boot them from the entry document in one request. CDN assets keep
// their original base, and the frame retains its opaque origin.
const packedLaunchers = [
  'moto-x3m', 'moto-x3m-2', 'moto-x3m-3', 'moto-x3m-spooky',
  'stack', 'angry-sharks', 'defend-the-tank',
  'rise-higher', 'soccer-skills',
];
for (const slug of packedLaunchers) {
  const directory = 'public/games/' + slug;
  let html = await readFile(directory + '/index.html','utf8');
  const scripts = Array.from(html.matchAll(/<script\s[^>]*src="(\/games\/[\w./-]+\.js)"[^>]*>\s*<\/script>/g));
  for (const [tag,path] of scripts) {
    if (path.includes('..')) throw Error('Invalid game script path: ' + path);
    const script = await readFile('public' + path,'utf8');
    html = html.replace(tag,() => '<script>\n' + script.replace(/<\/script/gi,'<\\/script') + '\n</script>');
  }
  await writeFile(directory + '/play.html',html);
}
