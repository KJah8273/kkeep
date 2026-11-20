import {readFile,mkdir,writeFile,cp} from 'node:fs/promises';
await mkdir('dist/server',{recursive:true});
await mkdir('dist/.openai',{recursive:true});
const paths=['worker/engine.js','worker/engine-loader.js','worker/session.js','worker/session-state.js','worker/session-check.js','worker/signin.js','worker/proxy-session.js','worker/relay.js','worker/transport.js','worker/preferences.js','worker/runtime.js','worker/graphics.js','worker/gateway.js','worker/check.js','worker/public-assets.js','worker/launch-data.json','worker/launch-shell.js','worker/index.js'];
const files=await Promise.all(paths.map(p=>readFile(p,'utf8')));
await writeFile('dist/server/index.js',files.map((s,i)=>{if(paths[i]==='worker/launch-data.json')return 'const pinnedLaunchData = '+s.trim()+';';s=s.replace(/^import .*;\n/gm,'');return i===files.length-1?s:s.replace(/^export /gm,'');}).join('\n'));
await cp('.openai/hosting.json','dist/.openai/hosting.json');
console.log('Built isolated Roblox runtime');
