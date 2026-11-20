// Account-free integration preview: actual main component and runtime parser,
// with explicitly simulated native stdout. Never starts a Roblox game.
import {spawnSync} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const output=process.argv[2],runtimeRoot=process.argv[3];
if(!output||!runtimeRoot||!path.isAbsolute(output)||!path.isAbsolute(runtimeRoot))
  throw new Error('Provide absolute output and runtime checkout paths');
const prepared=spawnSync(process.execPath,['scripts/preview-roblox-recovery.mjs',output,'graphics'],{stdio:'inherit'});
if(prepared.status!==0)throw new Error('Could not build the actual player fixture');
const {runtimeBootstrap}=await import(pathToFileURL(path.join(runtimeRoot,'worker/runtime.js')).href);
const targets="const TARGETS = ['https://kkeep.fun', 'https://kkeep.kha971.chatgpt.site'];";
const original=runtimeBootstrap.toString();
if(original.split(targets).length!==2)throw new Error('Runtime target declaration changed');
const bootstrap=original.replace(targets,'const TARGETS = [location.origin];');
const index=await readFile(path.join(output,'index.html'),'utf8');
await writeFile(path.join(output,'index.html'),index
  .replace('Kkeep graphics recovery test','Kkeep local view diagnostic test')
  .replace('Controlled recovery UI test · Simulated black scene','Controlled diagnostic UI test · Simulated native output'));
await writeFile(path.join(output,'catalog.html'),`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Controlled view diagnostic fixture</title><style>
  html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#0b0b0c;color:white;font:16px/1.5 system-ui}
  #canvas{position:fixed;inset:0;width:100%;height:100%;display:block}
  main{position:fixed;inset:0;display:grid;align-content:center;justify-items:center;gap:14px;text-align:center;padding:32px}
  h1,p{margin:0;max-width:620px}button{font:inherit;padding:14px 22px;border:0;border-radius:10px;cursor:pointer}
  #note{white-space:pre-line;font:14px/1.6 system-ui}
</style></head><body><canvas id="canvas" width="300" height="150"></canvas><main><h1>Controlled view diagnostic test</h1><p>This uses the actual Kkeep player and runtime observer. The native size and game events below are simulated. No account or game server is used.</p><button id="simulate">Report sample native startup</button><button id="join">Report sample native join</button><p id="note">Open Loading help after reporting a sample.</p></main><script>
  (${bootstrap})();
  const canvas=document.getElementById('canvas'),note=document.getElementById('note');
  document.getElementById('simulate').onclick=()=>{
    const width=canvas.clientWidth,height=canvas.clientHeight;
    const ratio=Math.min(1,1024/width,1024/height,Math.sqrt((1024*576)/(width*height)));
    canvas.width=Math.round(width*ratio);canvas.height=Math.round(height*ratio);
    window.__kkeepRuntime.engineOutput('Canvas: '+width+'x'+height+' CSS, '+Math.trunc(width*ratio)+'x'+Math.trunc(height*ratio)+' backing (effective dpr='+ratio.toFixed(2)+', raw='+ratio.toFixed(2)+')');
    parent.postMessage({type:'webblox:stat',e:'play',p:'123'},location.origin);
    window.__kkeepRuntime.connection('transport-ready','');
    note.textContent='Sample startup reported. The canvas is '+width+' × '+height+' CSS pixels. Open Loading help → Troubleshooting details.';
  };
  document.getElementById('join').onclick=()=>{
    window.__kkeepRuntime.engineOutput('[LIFECYCLE] joinGameSucceeded');
    note.textContent='Sample native join event reported. This is still a controlled fixture, not gameplay. Open Loading help → Troubleshooting details.';
  };
</script></body></html>`);
console.log('Prepared local view diagnostic integration fixture at '+output);
