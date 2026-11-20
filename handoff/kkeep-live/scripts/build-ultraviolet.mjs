import {readFileSync,writeFileSync,copyFileSync,mkdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=new URL('../',import.meta.url),source=new URL('vendor/ultraviolet-dist/',root),out=new URL('public/uv/',root);
mkdirSync(out,{recursive:true});
for(const name of ['uv.client.js','uv.handler.js','uv.sw.js'])copyFileSync(new URL(name,source),new URL(name,out));
writeFileSync(new URL('uv.bundle.js',out),readFileSync(new URL('uv.bundle.js',source),'utf8')+'\n'+readFileSync(new URL('lib/uv-relay.js',root),'utf8'));
copyFileSync(new URL('LICENSE',source),new URL('LICENSE',out));
execFileSync('tar',['--sort=name','--mtime=UTC 2026-11-02','--owner=0','--group=0','--numeric-owner','-czf','public/source/kkeep-ultraviolet-integration.tar.gz','vendor/ultraviolet-dist','lib/uv-relay.js','lib/proxy-client.ts','lib/proxy-engines.ts','lib/search-providers.ts','components/proxy-picker.tsx','components/search-picker.tsx','public/uv/runtime.js','public/uv/sw.js','public/uv/uv.config.js','scripts/build-ultraviolet.mjs','tests/proxy-ultraviolet.test.mjs'],{cwd:fileURLToPath(root)});
