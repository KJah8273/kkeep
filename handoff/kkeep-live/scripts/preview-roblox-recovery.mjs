// Build an account-free browser fixture from the actual RobloxPlayer component.
// Only the test origin and endpoints are substituted; production code is unchanged.
import {build} from 'esbuild';
import {readFile,mkdir,writeFile,copyFile} from 'node:fs/promises';
import path from 'node:path';
const root=process.cwd(),output=process.argv[2],mode=process.argv[3]||'recovery';
if(!['recovery','graphics','viewport'].includes(mode))throw new Error('Choose recovery, graphics, or viewport mode');
const graphics=mode==='graphics',viewport=mode==='viewport';
const title=viewport?'Kkeep controlled viewport test':graphics?'Kkeep graphics recovery test':'Kkeep 277 recovery test';

// Serialized only into the account-free fixture. The colored image is generated
// locally and uploaded to a budgeted WebGPU canvas; it never starts a game.
function viewportFixture(){
  const button=document.getElementById('simulate'),intro=document.getElementById('intro');
  let canvas=null,device=null,gpuContext=null,pipeline=null,sampler=null,texture=null,observer=null;
  let mode='starting',reason='',active=false,pending=0,drawing=false,repeat=false,renders=0;
  const status=document.getElementById('qa-status'),pattern=document.createElement('canvas');
  const post=data=>parent.postMessage(data,location.origin);
  function patternFor(width,height){
    pattern.width=width;pattern.height=height;
    const ctx=pattern.getContext('2d'),halfW=width/2,halfH=height/2;
    for(const [color,x,y] of [['#1746a2',0,0],['#087b73',halfW,0],['#a32e4f',0,halfH],['#623ab0',halfW,halfH]]){
      ctx.fillStyle=color;ctx.fillRect(x,y,halfW,halfH);
    }
    ctx.strokeStyle='#ffffff';ctx.lineWidth=3;ctx.strokeRect(2,2,width-4,height-4);
    ctx.strokeStyle='#ffffff80';ctx.lineWidth=1;
    ctx.beginPath();ctx.moveTo(halfW,0);ctx.lineTo(halfW,height);ctx.moveTo(0,halfH);ctx.lineTo(width,halfH);ctx.stroke();
    const size=Math.max(12,Math.min(22,Math.round(Math.min(width,height)*.033)));
    ctx.font='700 '+size+'px system-ui';ctx.fillStyle='white';ctx.textBaseline='middle';
    const pad=Math.max(12,Math.round(size*.8)),top=pad+size*2.8,bottom=height-pad-size;
    ctx.textAlign='left';ctx.fillText('TOP LEFT',pad,top);ctx.fillText('BOTTOM LEFT',pad,bottom);
    ctx.textAlign='right';ctx.fillText('TOP RIGHT',width-pad,top);ctx.fillText('BOTTOM RIGHT',width-pad,bottom);
    ctx.font='600 '+Math.round(size*.8)+'px system-ui';ctx.textAlign='center';
    ctx.fillText('TOP EDGE',halfW,top+size*1.7);ctx.fillText('BOTTOM EDGE',halfW,height-pad-size*2.3);
    ctx.textAlign='left';ctx.fillText('LEFT EDGE',pad,halfH);
    ctx.textAlign='right';ctx.fillText('RIGHT EDGE',width-pad,halfH);
    ctx.textAlign='center';ctx.fillText('CENTER',halfW,halfH-size*4.2);
  }
  function replaceCanvas(){
    const next=document.createElement('canvas');next.id='viewport-canvas';
    next.setAttribute('aria-label','Controlled four-corner viewport pattern');
    observer?.disconnect();
    if(canvas)canvas.replaceWith(next);else document.body.prepend(next);
    canvas=next;observer?.observe(canvas);
  }
  function use2D(message){
    mode='2d';reason=message;gpuContext=null;
    texture?.destroy();texture=null;
    const oldDevice=device;device=null;oldDevice?.destroy();
    // A canvas cannot switch its context type after obtaining WebGPU.
    replaceCanvas();
    document.body.dataset.qaMode='2d';
  }
  async function initializeGPU(){
    if(!navigator.gpu){use2D('WebGPU is unavailable in this browser');return;}
    try{
      const adapter=await navigator.gpu.requestAdapter();
      if(!adapter){use2D('The browser did not provide a WebGPU adapter');return;}
      device=await adapter.requestDevice();
      const currentDevice=device;
      currentDevice.addEventListener('uncapturederror',event=>{
        if(device!==currentDevice)return;
        console.error('[Viewport fixture] WebGPU validation error',event.error);
        use2D('WebGPU validation failed; this is a 2D fallback');schedule();
      });
      currentDevice.lost.then(info=>{
        if(device!==currentDevice||info.reason==='destroyed')return;
        use2D('WebGPU device was lost; this is a 2D fallback');schedule();
      });
      gpuContext=canvas.getContext('webgpu');
      if(!gpuContext)throw new Error('WebGPU canvas context unavailable');
      const shader=currentDevice.createShaderModule({code:`
        struct VertexOutput { @builtin(position) position: vec4f, @location(0) uv: vec2f }
        @vertex fn vertexMain(@builtin(vertex_index) index: u32) -> VertexOutput {
          let points = array<vec2f, 3>(vec2f(-1, -1), vec2f(3, -1), vec2f(-1, 3));
          let point = points[index];
          var output: VertexOutput;
          output.position = vec4f(point, 0, 1);
          output.uv = point * vec2f(0.5, -0.5) + vec2f(0.5, 0.5);
          return output;
        }
        @group(0) @binding(0) var imageSampler: sampler;
        @group(0) @binding(1) var image: texture_2d<f32>;
        @fragment fn fragmentMain(input: VertexOutput) -> @location(0) vec4f {
          return textureSample(image, imageSampler, input.uv);
        }
      `});
      pipeline=await currentDevice.createRenderPipelineAsync({layout:'auto',
        vertex:{module:shader,entryPoint:'vertexMain'},
        fragment:{module:shader,entryPoint:'fragmentMain',targets:[{format:navigator.gpu.getPreferredCanvasFormat()}]},
        primitive:{topology:'triangle-list'}});
      if(device!==currentDevice)return;
      sampler=currentDevice.createSampler({magFilter:'linear',minFilter:'linear'});
      mode='webgpu';document.body.dataset.qaMode='webgpu';
    }catch(error){
      console.warn('[Viewport fixture] WebGPU initialization unavailable',error);
      use2D('WebGPU initialization failed ('+(error?.name||'Error')+'); this is a 2D fallback');
    }
  }
  async function draw(){
    if(drawing){repeat=true;return;}
    drawing=true;
    try{
      const cssWidth=Math.max(1,canvas.clientWidth),cssHeight=Math.max(1,canvas.clientHeight);
      // Match the provider's existing low-resolution budget and DPR rounding.
      let ratio=Math.min(window.devicePixelRatio||1,1);
      const pixels=cssWidth*cssHeight*ratio*ratio;
      if(pixels>1024*576)ratio*=Math.sqrt((1024*576)/pixels);
      ratio=Math.round(ratio*1000)/1000;
      const width=Math.max(1,Math.round(cssWidth*ratio)),height=Math.max(1,Math.round(cssHeight*ratio));
      canvas.width=width;canvas.height=height;patternFor(width,height);
      if(mode==='webgpu'){
        const currentDevice=device;
        currentDevice.pushErrorScope('validation');
        gpuContext.configure({device:currentDevice,format:navigator.gpu.getPreferredCanvasFormat(),alphaMode:'opaque'});
        texture?.destroy();
        texture=currentDevice.createTexture({size:[width,height],format:'rgba8unorm',
          usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST|GPUTextureUsage.RENDER_ATTACHMENT});
        currentDevice.queue.copyExternalImageToTexture({source:pattern},{texture},[width,height]);
        const bindGroup=currentDevice.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:[
          {binding:0,resource:sampler},{binding:1,resource:texture.createView()}]});
        const encoder=currentDevice.createCommandEncoder();
        const pass=encoder.beginRenderPass({colorAttachments:[{view:gpuContext.getCurrentTexture().createView(),
          clearValue:{r:0,g:0,b:0,a:1},loadOp:'clear',storeOp:'store'}]});
        pass.setPipeline(pipeline);pass.setBindGroup(0,bindGroup);pass.draw(3);pass.end();
        currentDevice.queue.submit([encoder.finish()]);
        const validation=await currentDevice.popErrorScope();
        if(validation)throw new Error(validation.message);
        await currentDevice.queue.onSubmittedWorkDone();
        if(device!==currentDevice){repeat=true;return;}
      }else{
        const ctx=canvas.getContext('2d');
        if(!ctx)throw new Error('The browser did not provide a 2D canvas');
        ctx.drawImage(pattern,0,0);
      }
      renders++;
      const state={mode,cssWidth,cssHeight,bufferWidth:width,bufferHeight:height,ratio,renders,reason};
      window.__viewportQA=state;
      status.textContent=(mode==='webgpu'?'WebGPU canvas':'2D fallback · not a WebGPU check')+
        '\nCSS '+cssWidth+' × '+cssHeight+' · buffer '+width+' × '+height+'\n'+
        'Ratio '+ratio+' · synthetic frames '+renders+(reason?'\n'+reason:'')+'\nNo account, game server, or gameplay';
      post({type:'kkeep:roblox-runtime',stage:'running',...(mode==='webgpu'?{gpu:'webgpu'}:{})});
    }catch(error){
      console.error('[Viewport fixture] Rendering failed',error);
      if(mode==='webgpu'){use2D('WebGPU rendering failed ('+(error?.name||'Error')+'); this is a 2D fallback');repeat=true;}
      else{mode='failed';document.body.dataset.qaMode='failed';status.textContent='Controlled viewport test failed: '+(error?.name||'Error')+'\nNo game was started.';}
    }finally{
      drawing=false;if(repeat){repeat=false;schedule();}
    }
  }
  function schedule(){
    if(!active)return;
    cancelAnimationFrame(pending);pending=requestAnimationFrame(()=>{pending=0;draw();});
  }
  button.onclick=async()=>{
    button.disabled=true;intro.hidden=true;status.hidden=false;
    status.textContent='Starting controlled viewport test…';
    replaceCanvas();
    post({type:'webblox:stat',e:'play',p:'123'});
    await initializeGPU();active=true;
    observer=new ResizeObserver(schedule);observer.observe(canvas);window.addEventListener('resize',schedule);
    schedule();
  };
  window.addEventListener('pagehide',()=>{active=false;observer?.disconnect();cancelAnimationFrame(pending);texture?.destroy();device?.destroy();});
}
if(!output||!path.isAbsolute(output))throw new Error('Provide an absolute fixture output directory');
await mkdir(output,{recursive:true});
const bundle=await build({absWorkingDir:root,bundle:true,write:false,format:'iife',platform:'browser',minify:true,
  define:{'process.env.NODE_ENV':'"production"'},
  stdin:{resolveDir:root,sourcefile:'recovery-entry.jsx',loader:'jsx',contents:`
    import React from 'react'; import {createRoot} from 'react-dom/client';
    import RobloxPlayer from './components/roblox-player.tsx';
    Object.defineProperty(navigator,'platform',{configurable:true,value:'MacIntel'});
    Object.defineProperty(navigator,'maxTouchPoints',{configurable:true,value:5});
    localStorage.setItem('kkeep.roblox.fps','30');
    createRoot(document.getElementById('root')).render(<RobloxPlayer/>);
  `},
  plugins:[{name:'owned-recovery-fixture',setup(b){
    b.onResolve({filter:/^@\/lib\/roblox-player$/},()=>({path:'player-library',namespace:'fixture'}));
    b.onLoad({filter:/.*/,namespace:'fixture'},async()=>({loader:'ts',contents:(await readFile(path.join(root,'lib/roblox-player.ts'),'utf8'))
      .replace("'https://kkeep-roblox-runtime.kha971.chatgpt.site'",'globalThis.location.origin')
      .replaceAll("'/_rbx/app/'","'/__qa/catalog'")
      .replaceAll("'/_rbx/signin'","'/__qa/catalog'")
      .replace("'/check'","'/__qa/check'")
      .replace("'/_/cGxheS5yb2Jsb3guY29t/games/start'","'/__qa/game'")}));
    b.onResolve({filter:/^\.\/roblox-snow$/},()=>({path:'snow',namespace:'fixture-snow'}));
    b.onLoad({filter:/.*/,namespace:'fixture-snow'},()=>({contents:'export default function Snow(){return null}',loader:'js'}));
  }}]});
await writeFile(path.join(output,'app.js'),bundle.outputFiles[0].contents);
await copyFile(path.join(root,'app/roblox/roblox.css'),path.join(output,'app.css'));
await copyFile(path.join(root,'public/games/covers/roblox-blue.svg'),path.join(output,'cover.svg'));
await writeFile(path.join(output,'index.html'),`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><link rel="stylesheet" href="/app.css"><style>.qa-banner{position:fixed;top:0;left:0;right:0;z-index:99;background:#24374e;color:white;padding:6px 12px;font:13px system-ui;text-align:center;pointer-events:none}</style></head><body><div class="qa-banner">${viewport?'Controlled viewport test · Synthetic lifecycle events':graphics?'Controlled recovery UI test · Simulated black scene':'Controlled recovery UI test · Simulated disconnect'} · No Roblox account or game server</div><div id="root"></div><script src="/app.js"></script></body></html>`);
const events=graphics?
  [{type:'webblox:stat',e:'play',p:'123'},{type:'kkeep:roblox-runtime',stage:'transport-relay',gpu:'webgpu'},{type:'kkeep:roblox-runtime',stage:'running',gpu:'webgpu'}]:
  [{type:'webblox:stat',e:'play',p:'123'},{type:'kkeep:roblox-runtime',stage:'transport-native',gpu:'webgl'},{type:'kkeep:roblox-runtime',stage:'transport-closed',detail:'NetworkError',gpu:'webgl'},{type:'kkeep:roblox-runtime',stage:'failed',detail:'connection',gpu:'webgl'}];
await writeFile(path.join(output,'catalog.html'),viewport?
  `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Controlled viewport fixture</title><style>
    html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#0b0b0c;color:white;font:16px system-ui}
    #intro{position:fixed;inset:0;display:grid;align-content:center;justify-items:center;gap:12px;padding:30px;text-align:center}
    #intro[hidden],#qa-status[hidden]{display:none}h1,p{margin:0}button{font:inherit;padding:14px 22px;border:0;border-radius:10px;cursor:pointer}
    #viewport-canvas{position:fixed;inset:0;display:block;width:100%;height:100%;border:0}
    #qa-status{position:fixed;z-index:2;top:50%;left:50%;transform:translate(-50%,-50%);box-sizing:border-box;width:max-content;max-width:75vw;padding:18px;border:1px solid #ffffff70;border-radius:12px;background:#07111be8;color:white;text-align:center;white-space:pre-line;font:14px/1.6 system-ui;pointer-events:none}
  </style></head><body><section id="intro"><h1>Controlled viewport test</h1><p>The actual Kkeep player receives synthetic play and running events.</p><p>A local four-corner image checks canvas coverage. No account or game connection is used.</p><button id="simulate">Start controlled viewport test</button></section><output id="qa-status" hidden></output><script>(${viewportFixture.toString()})();</script></body></html>`:
  `<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:180px 20px;background:#0b0b0c;color:white;text-align:center;font:18px system-ui"><h1>Controlled game connection</h1><p>This fixture reports a simulated ${graphics?'loaded WebGPU scene':'direct-connection failure'} to the actual Kkeep player.</p><button id="simulate" style="font:inherit;padding:16px">${graphics?'Load controlled black scene':'Simulate 277 disconnect'}</button><script>document.getElementById('simulate').onclick=()=>{for(const data of ${JSON.stringify(events)})parent.postMessage(data,location.origin);${graphics?"document.body.replaceChildren();":''}};</script></body></html>`);
await writeFile(path.join(output,'game.html'),`<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:180px 20px;background:#0b0b0c;color:white;text-align:center;font:18px system-ui"><h1>Fresh ${graphics?'graphics':'relay'} request received</h1><p>This confirms recovery navigation only. No Roblox game connection was made.</p><p id="settings"></p><script>const q=new URLSearchParams(location.search);document.getElementById('settings').textContent='Experience: '+q.get('placeId')+' · Graphics: '+q.get('gpu')+' · Connection: '+q.get('wt')+' · FPS: '+q.get('fps');</script></body></html>`);
await writeFile(path.join(output,'package.json'),JSON.stringify({type:'module',scripts:{dev:'node serve.mjs'}}));
await writeFile(path.join(output,'serve.mjs'),`import http from 'node:http';import {readFile} from 'node:fs/promises';const files={'/':'index.html','/app.js':'app.js','/app.css':'app.css','/games/covers/roblox-blue.svg':'cover.svg','/__qa/catalog':'catalog.html','/__qa/game':'game.html'};http.createServer(async(req,res)=>{const name=files[new URL(req.url,'http://localhost').pathname];if(!name){res.writeHead(404);res.end();return;}const type=name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':name.endsWith('.svg')?'image/svg+xml':'text/html';res.writeHead(200,{'Content-Type':type,'Cross-Origin-Opener-Policy':'same-origin','Cross-Origin-Embedder-Policy':'require-corp','Cache-Control':'no-store'});res.end(await readFile(new URL(name,import.meta.url)));}).listen(Number(process.env.PORT||4173),'0.0.0.0');`);
console.log('Prepared controlled '+mode+' fixture at '+output);
