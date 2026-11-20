import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {transformSync} from 'esbuild';
function harness({mobile=true,storedFps='60',storage='available',device={}}={}){
  const hooks=[],listeners={},navigations=[],messages=[],storageWrites=[],timers=new Map();
  let clock=0,timerId=0;
  const setTimeout=(fn,delay)=>{const id=++timerId;timers.set(id,{fn,at:clock+delay});return id;};
  const clearTimeout=id=>timers.delete(id);
  let cursor=0,pendingEffects=[],dirty=false,tree,frameElement,frameKey;
  const createFrame=()=>({postMessage(data,targetOrigin){messages.push({data,targetOrigin,source:this});}});
  const frame=createFrame();
  const library={exports:{}};
  vm.runInNewContext(transformSync(readFileSync('lib/roblox-player.ts','utf8'),{loader:'ts',format:'cjs'}).code,{module:library,exports:library.exports,URL});
  const react={
    useEffect:(effect,deps)=>{
      const slot=hooks[cursor++]||={};
      if(!slot.deps||!deps||deps.some((value,index)=>!Object.is(value,slot.deps[index]))){slot.deps=deps;pendingEffects.push(()=>{slot.cleanup?.();slot.cleanup=effect();});}
    },
    useRef:initial=>{const slot=hooks[cursor++]||={current:initial};return slot;},
    useState:initial=>{
      const slot=hooks[cursor++]||={value:initial};
      return [slot.value,next=>{const current=typeof next==='function'?next(slot.value):next;if(!Object.is(current,slot.value)){slot.value=current;dirty=true;}if(typeof current==='string'&&current.startsWith('https://'))navigations.push(current);}];
    },
  };
  const module={exports:{}};
  const window={crossOriginIsolated:true,innerWidth:1180,innerHeight:734,addEventListener:(name,fn)=>listeners[name]=fn,removeEventListener(name,fn){if(listeners[name]===fn)delete listeners[name];},setTimeout,clearTimeout};
  const document={visibilityState:'visible',addEventListener:(name,fn)=>listeners[name]=fn,removeEventListener(name,fn){if(listeners[name]===fn)delete listeners[name];}};
  const context={module,exports:module.exports,window,document,URL,clearTimeout,
    navigator:{userAgent:mobile?'Macintosh Safari':'Windows Chrome',platform:mobile?'MacIntel':'Win32',maxTouchPoints:mobile?5:0,onLine:true,...device},
    localStorage:{getItem(){if(storage==='blocked')throw new Error('Storage unavailable');return storedFps;},setItem(key,value){if(storage!=='available')throw new Error('Storage unavailable');storageWrites.push([key,value]);storedFps=value;}},requestAnimationFrame:fn=>{fn(0);return 1;},cancelAnimationFrame(){},
    require:name=>name==='react'?react:name==='react/jsx-runtime'?{jsx:(type,props,key)=>({type,props,key}),jsxs:(type,props,key)=>({type,props,key})}:name==='@/lib/roblox-player'?library.exports:{default:()=>null},
  };
  vm.runInNewContext(transformSync(readFileSync('components/roblox-player.tsx','utf8'),{loader:'tsx',format:'cjs',jsx:'automatic'}).code,context);
  function nodes(value){if(Array.isArray(value))return value.flatMap(nodes);if(!value||typeof value!=='object')return [];return [value,...nodes(value.props?.children)];}
  function text(value){if(Array.isArray(value))return value.map(text).join(' ');if(value&&typeof value==='object')return text(value.props?.children);return typeof value==='string'||typeof value==='number'?String(value):'';}
  function render(){
    let renders=0;
    do{
      assert.ok(renders++<20,'component settles after effects');dirty=false;cursor=0;tree=module.exports.default();
      const iframe=nodes(tree).find(node=>node.type==='iframe');
      if(!frameElement||iframe.key!==frameKey){frameElement={contentWindow:frameElement?createFrame():frame};frameKey=iframe.key;}
      iframe.props.ref.current=frameElement;
      const effects=pendingEffects;pendingEffects=[];for(const effect of effects)effect();
    }while(dirty);
  }
  render();
  return {navigations,messages,storageWrites,frame,replaceFrame(value){frameElement.contentWindow=value;},text:()=>text(tree),
    get currentFrame(){return frameElement.contentWindow;},
    tick(ms){const end=clock+ms;let steps=0;for(;;){const next=[...timers].filter(([,timer])=>timer.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;assert.ok(steps++<100,'timers remain bounded');clock=next[1].at;timers.delete(next[0]);next[1].fn();render();}clock=end;render();},
    online(value){context.navigator.onLine=value;listeners[value?'online':'offline']?.();render();},
    visibility(value){document.visibilityState=value;listeners.visibilitychange?.();render();},
    get iframe(){return nodes(tree).find(node=>node.type==='iframe');},
    get details(){return nodes(tree).find(node=>node.type==='details');},
    get observesResize(){return typeof listeners.resize==='function';},
    resize(width,height){window.innerWidth=width;window.innerHeight=height;listeners.resize?.();render();},
    get alert(){return nodes(tree).some(node=>node.props?.role==='alert');},
    get cover(){return nodes(tree).some(node=>node.props?.className==='roblox-loading');},
    captureLoad(){const load=nodes(tree).find(node=>node.type==='iframe').props.onLoad,element=frameElement;return()=>{load({currentTarget:element});render();};},
    error(){nodes(tree).find(node=>node.type==='iframe').props.onError({currentTarget:frameElement});render();},
    click(label){const button=nodes(tree).find(node=>node.type==='button'&&text(node)===label);assert.ok(button,'button exists: '+label);button.props.onClick();render();},
    send(data,source=frame,origin='https://kkeep-roblox-runtime.kha971.chatgpt.site'){listeners.message({data,source,origin});render();},
    close(){for(const slot of hooks)if(typeof slot.cleanup==='function')slot.cleanup();}};
}
test('a fresh iPad starts its catalog and retry at 30 FPS without recording a user choice',()=>{
  const h=harness({storedFps:null});
  try{
    assert.equal(new URL(h.iframe.props.src).searchParams.get('fps'),'30');
    assert.deepEqual(h.storageWrites,[],'the automatic default is not an explicit user preference');
    h.send({type:'webblox:stat',e:'play',p:'123'});
    assert.equal(h.navigations.length,1,'the provider retains its original first join');
    h.click('Loading help');
    assert.match(h.text(),/Mobile performance mode ·\s+30\s+FPS target/);
    h.click('Rejoin this game');
    assert.equal(new URL(h.iframe.props.src).searchParams.get('fps'),'30');
  }finally{h.close();}
});

test('iPad defaults survive unavailable or invalid storage while desktop keeps its 60 FPS default',()=>{
  for(const mobile of [true,false])for(const options of [{storedFps:null},{storedFps:'45'},{storedFps:'invalid'},{storedFps:'60',storage:'blocked'}]){
    const h=harness({mobile,...options});
    try{
      assert.equal(new URL(h.iframe.props.src).searchParams.get('fps'),mobile?'30':'60');
      assert.deepEqual(h.storageWrites,[]);
    }finally{h.close();}
  }
});

test('the lighter iPad default does not change iPhone, Android or touch-PC defaults',()=>{
  for(const device of [
    {userAgent:'iPhone Safari',platform:'iPhone',maxTouchPoints:5},
    {userAgent:'Android Mobile Chrome',platform:'Linux armv8l',maxTouchPoints:5},
    {userAgent:'Windows Chrome',platform:'Win32',maxTouchPoints:10},
    {userAgent:'Macintosh Safari',platform:'MacIntel',maxTouchPoints:0},
  ]){
    const h=harness({device,storedFps:null});
    try{assert.equal(new URL(h.iframe.props.src).searchParams.get('fps'),'60');}finally{h.close();}
  }
});

test('exact saved 30 and 60 FPS choices take precedence over either device default',()=>{
  for(const mobile of [true,false])for(const storedFps of ['30','60']){
    const h=harness({mobile,storedFps,storage:'readonly'});
    try{
      assert.equal(new URL(h.iframe.props.src).searchParams.get('fps'),storedFps);
      assert.deepEqual(h.storageWrites,[]);
    }finally{h.close();}
  }
});

test('choosing 60 FPS on a default 30 FPS iPad persists the explicit choice and menu cap',()=>{
  const h=harness({storedFps:null});
  try{
    h.send({type:'webblox:stat',e:'play',p:'123'});h.click('Loading help');
    h.click('Use 60 FPS target');
    assert.deepEqual(h.storageWrites,[['kkeep.roblox.fps','60']]);
    assert.equal(new URL(h.iframe.props.src).searchParams.get('fps'),'60');
    h.captureLoad()();h.click('Loading help');h.click('Roblox menu');
    assert.equal(new URL(h.iframe.props.src).pathname,'/_rbx/app/');
    assert.equal(new URL(h.iframe.props.src).searchParams.get('fps'),'60');
  }finally{h.close();}
});

test('iPad keeps the first join document without interrupting or duplicating the launch',()=>{
  const h=harness();
  try{
    h.send({type:'webblox:stat',e:'play',p:'123'});
    assert.deepEqual(h.navigations,['https://kkeep-roblox-runtime.kha971.chatgpt.site/_rbx/app/?fps=60']);
    h.send({type:'webblox:stat',e:'play',p:'123'});
    assert.equal(h.navigations.length,1);
  }finally{h.close();}
});
test('iPad play and viewport changes keep the same full-size, untransformed game frame',()=>{
  const h=harness();
  try{
    const frame=h.currentFrame,source=h.iframe.props.src,key=h.iframe.key;
    for(const [width,height] of [[1180,734],[820,1060],[1180,735]]){
      h.resize(width,height);
      h.send({type:'webblox:stat',e:'play',p:'123'});
      assert.equal(h.currentFrame,frame,'play does not replace the selected game document');
      assert.equal(h.iframe.props.src,source,'play does not navigate or replay the join');
      assert.equal(h.iframe.key,key);
      assert.equal(h.iframe.props.className,'roblox-frame');
      assert.equal(h.iframe.props.style,undefined,'render budget must not shrink or transform the iframe viewport');
      assert.equal(h.iframe.props.width,undefined);
      assert.equal(h.iframe.props.height,undefined);
      assert.equal(h.observesResize,false,'the host does not schedule geometry changes during engine startup');
    }
    assert.equal(h.navigations.length,1);
  }finally{h.close();}
});
test('saved lighter mode reaches the catalog before the game and stale frames cannot navigate',()=>{
  const h=harness({storedFps:'30'});
  try{
    h.send({type:'webblox:stat',e:'play',p:'123'});
    assert.equal(new URL(h.navigations[0]).searchParams.get('fps'),'30');
    const replacement={};h.replaceFrame(replacement);
    h.send({type:'webblox:stat',e:'exit',p:'123'});
    h.send({type:'webblox:stat',e:'play',p:'123'},replacement);
    assert.deepEqual(h.navigations,['https://kkeep-roblox-runtime.kha971.chatgpt.site/_rbx/app/?fps=30']);
  }finally{h.close();}
});
test('switching experiences does not add another navigation or discard the chosen server',()=>{
  const h=harness();
  try{
    h.send({type:'webblox:stat',e:'play',p:'123'});
    h.send({type:'webblox:stat',e:'exit',p:'123'});
    h.send({type:'webblox:stat',e:'play',p:'456'});
    assert.equal(h.navigations.length,1);
    assert.equal(new URL(h.navigations[0]).pathname,'/_rbx/app/');
  }finally{h.close();}
});
test('desktop and untrusted messages do not trigger automatic re-navigation',()=>{
  const h=harness({mobile:false});
  try{
    h.send({type:'webblox:stat',e:'play',p:'123'});
    h.send({type:'webblox:stat',e:'play',p:'456'},h.frame,'https://evil.test');
    assert.equal(h.navigations.length,1);
  }finally{h.close();}
});

test('a queued iframe load cannot hide a reported session startup failure',()=>{
  const h=harness();
  try{
    const loaded=h.captureLoad();
    h.send({type:'kkeep:roblox-runtime',stage:'session-failed',detail:'service-worker'});
    loaded();
    assert.equal(h.alert,true);
    assert.match(h.text(),/sign-in could not start its browser session/);
    h.send({type:'kkeep:roblox-runtime',stage:'session-ready'});
    assert.equal(h.alert,false);
    assert.match(h.text(),/Loading help/);
  }finally{h.close();}
});

test('session readiness and iframe load do not dismiss an engine startup failure',()=>{
  const h=harness();
  try{
    const loaded=h.captureLoad();
    h.send({type:'kkeep:roblox-runtime',stage:'failed',detail:'memory'});
    h.send({type:'kkeep:roblox-runtime',stage:'session-ready'});
    loaded();
    assert.equal(h.alert,true);assert.match(h.text(),/could not reserve memory/);
    h.send({type:'kkeep:roblox-runtime',stage:'running'});
    assert.equal(h.alert,false);
  }finally{h.close();}
});

test('leaving an experience clears its recovery target and retries the catalog',()=>{
  const h=harness();
  try{
    h.captureLoad()();
    h.send({type:'webblox:stat',e:'play',p:'123'});
    h.send({type:'kkeep:roblox-runtime',stage:'failed',detail:'connection'});
    assert.match(h.text(),/Rejoin using relay/);
    h.click('Rejoin using relay');
    assert.equal(new URL(h.navigations.at(-1)).searchParams.get('placeId'),'123');
    h.send({type:'webblox:stat',e:'exit',p:'123'},h.currentFrame);
    // Exiting must not interrupt the provider's own return to the catalog.
    assert.equal(new URL(h.navigations.at(-1)).searchParams.get('placeId'),'123');
    assert.equal(h.alert,false);
    h.click('Loading help');
    assert.doesNotMatch(h.text(),/Rejoin this game|disconnected/);
    h.click('Retry');
    assert.equal(new URL(h.navigations.at(-1)).pathname,'/_rbx/app/');
  }finally{h.close();}
});

test('untrusted startup status cannot cover the live sign-in form',()=>{
  const h=harness();
  try{
    h.captureLoad()();
    h.send({type:'kkeep:roblox-runtime',stage:'session-failed',detail:'service-worker'},h.frame,'https://evil.test');
    h.send({type:'kkeep:roblox-runtime',stage:'session-failed',detail:'service-worker'},{});
    assert.equal(h.alert,false);
    assert.match(h.text(),/Loading help/);
  }finally{h.close();}
});

test('277 recovery starts a fresh relay join and preserves the working graphics and FPS',()=>{
  const h=harness({storedFps:'30'});
  try{
    h.send({type:'webblox:stat',e:'play',p:'123'});
    h.send({type:'kkeep:roblox-runtime',stage:'transport-native',gpu:'webgl'});
    h.send({type:'kkeep:roblox-runtime',stage:'failed',detail:'connection',gpu:'webgl',jobId:'old-job',ticket:'private'});
    assert.equal(h.alert,true);
    assert.match(h.text(),/Game connection ·\s+Direct/);
    assert.equal(h.navigations.length,1,'no automatic join retry');
    h.click('Rejoin using relay');
    const url=new URL(h.navigations.at(-1));
    assert.equal(url.pathname,'/_/cGxheS5yb2Jsb3guY29t/games/start');
    assert.deepEqual([...url.searchParams], [['placeId','123'],['perf','performance'],['fps','30'],['res','auto'],['gpu','webgl'],['wt','relay']]);
    assert.equal(h.navigations.length,2,'exactly one fresh join per click');
    h.captureLoad()();h.click('Loading help');h.click('Use 60 FPS target');
    const tuned=new URL(h.navigations.at(-1));
    assert.equal(tuned.searchParams.get('fps'),'60');
    assert.equal(tuned.searchParams.get('gpu'),'webgl');
    assert.equal(tuned.searchParams.get('wt'),'relay');
  }finally{h.close();}
});

test('a selected relay is shown honestly and a manual retry retains its selection',()=>{
  const h=harness();
  try{
    h.send({type:'webblox:stat',e:'play',p:'123'});
    h.send({type:'kkeep:roblox-runtime',stage:'transport-relay',gpu:'webgl'});
    h.send({type:'kkeep:roblox-runtime',stage:'transport-closed',detail:'NetworkError'});
    h.send({type:'kkeep:roblox-runtime',stage:'failed',detail:'connection',gpu:'webgl'});
    assert.match(h.text(),/Game connection ·\s+Relay/);
    assert.match(h.text(),/Game server connection closed · NetworkError/);
    assert.doesNotMatch(h.text(),/Rejoin using relay/);
    h.click('Rejoin this game');
    assert.equal(new URL(h.navigations.at(-1)).searchParams.get('wt'),'relay');
  }finally{h.close();}
});

test('untrusted connection preferences cannot change a later recovery URL',()=>{
  const h=harness();
  try{
    h.send({type:'webblox:stat',e:'play',p:'123'});
    h.send({type:'kkeep:roblox-runtime',stage:'transport-relay',gpu:'webgpu'},{});
    h.send({type:'kkeep:roblox-runtime',stage:'failed',detail:'connection',gpu:'https://untrusted.invalid'});
    h.click('Rejoin using relay');
    const url=new URL(h.navigations.at(-1));
    assert.equal(url.searchParams.has('gpu'),false);
    assert.equal(url.searchParams.get('wt'),'relay');
  }finally{h.close();}
});

test('late connection status from an exited game does not suppress relay recovery in the next game',()=>{
  const h=harness();
  try{
    h.send({type:'webblox:stat',e:'play',p:'123'});
    h.send({type:'kkeep:roblox-runtime',stage:'transport-relay',gpu:'webgl'});
    h.send({type:'webblox:stat',e:'exit',p:'123'});
    h.send({type:'kkeep:roblox-runtime',stage:'transport-relay',gpu:'webgpu'});
    h.send({type:'webblox:stat',e:'play',p:'456'});
    h.send({type:'kkeep:roblox-runtime',stage:'failed',detail:'connection'});
    assert.match(h.text(),/Rejoin using relay/);
    assert.doesNotMatch(h.text(),/Game connection ·\s+Relay/);
    h.click('Rejoin using relay');
    const url=new URL(h.navigations.at(-1));
    assert.equal(url.searchParams.get('placeId'),'456');
    assert.equal(url.searchParams.has('gpu'),false);
  }finally{h.close();}
});

test('a running iPad game can manually retry compatibility graphics from Loading help',()=>{
  const h=harness({storedFps:'30'});
  try{
    h.send({type:'webblox:stat',e:'play',p:'123'});
    h.send({type:'kkeep:roblox-runtime',stage:'transport-relay',gpu:'webgpu'});
    h.send({type:'kkeep:roblox-runtime',stage:'running',gpu:'webgpu',jobId:'old-job',ticket:'old-ticket'});
    assert.equal(h.alert,false);
    h.click('Loading help');
    assert.match(h.text(),/Graphics ·\s+WebGPU/);
    assert.match(h.text(),/Game connection ·\s+Relay/);
    assert.match(h.text(),/Try compatibility graphics/);
    assert.equal(h.navigations.length,1,'a renderer report and opening help do not restart the game');
    h.click('Try compatibility graphics');
    const url=new URL(h.navigations.at(-1));
    assert.equal(url.pathname,'/_/cGxheS5yb2Jsb3guY29t/games/start');
    assert.deepEqual([...url.searchParams],[['placeId','123'],['perf','performance'],['fps','30'],['res','auto'],['gpu','webgl'],['wt','relay']]);
    assert.equal(h.navigations.length,2,'one fresh join starts only after the manual action');

    h.captureLoad()();h.click('Loading help');
    assert.doesNotMatch(h.text(),/Graphics ·|Try compatibility graphics/,'the requested mode is not displayed as a confirmed report');
    h.send({type:'kkeep:roblox-runtime',stage:'running',gpu:'webgpu'});
    assert.doesNotMatch(h.text(),/Graphics ·|Try compatibility graphics/,'the replaced frame cannot restore its old graphics mode');
    h.send({type:'webblox:stat',e:'play',p:'123'},h.currentFrame);
    h.send({type:'kkeep:roblox-runtime',stage:'running',gpu:'webgl'},h.currentFrame);
    h.click('Loading help');
    assert.match(h.text(),/Graphics ·\s+WebGL/);
    assert.doesNotMatch(h.text(),/Try compatibility graphics/,'WebGL does not offer the same switch again');
    assert.equal(h.navigations.length,2);
  }finally{h.close();}
});

test('unknown graphics and untrusted renderer reports do not offer a compatibility restart',()=>{
  const h=harness();
  try{
    h.send({type:'webblox:stat',e:'play',p:'123'});
    h.send({type:'kkeep:roblox-runtime',stage:'running'});
    h.click('Loading help');
    assert.doesNotMatch(h.text(),/Graphics ·|Try compatibility graphics/);
    h.send({type:'kkeep:roblox-runtime',stage:'features-ready',gpu:'webgpu'},{});
    h.send({type:'kkeep:roblox-runtime',stage:'features-ready',gpu:'webgpu'},h.currentFrame,'https://evil.test');
    h.send({type:'kkeep:roblox-runtime',stage:'features-ready',gpu:'WEBGPU'});
    assert.doesNotMatch(h.text(),/Graphics ·|Try compatibility graphics/);
    h.send({type:'kkeep:roblox-runtime',stage:'features-ready',gpu:'webgl'});
    h.send({type:'kkeep:roblox-runtime',stage:'features-ready',gpu:'webgpu'},{});
    assert.match(h.text(),/Graphics ·\s+WebGL/);
    assert.doesNotMatch(h.text(),/Try compatibility graphics/);
    assert.equal(h.navigations.length,1);
  }finally{h.close();}
});

test('graphics reports are cleared when another experience starts or the game exits',()=>{
  const h=harness();
  try{
    h.send({type:'webblox:stat',e:'play',p:'123'});
    h.send({type:'kkeep:roblox-runtime',stage:'running',gpu:'webgpu'});
    h.send({type:'webblox:stat',e:'play',p:'456'});
    h.click('Loading help');
    assert.doesNotMatch(h.text(),/Graphics ·|Try compatibility graphics/);
    h.send({type:'kkeep:roblox-runtime',stage:'running',gpu:'webgpu'});
    h.click('Loading help');
    assert.match(h.text(),/Try compatibility graphics/);
    h.send({type:'webblox:stat',e:'exit',p:'456'});
    h.send({type:'kkeep:roblox-runtime',stage:'features-ready',gpu:'webgpu'});
    h.click('Loading help');
    assert.doesNotMatch(h.text(),/Graphics ·|Try compatibility graphics|Rejoin this game/);
    assert.equal(h.navigations.length,1);
  }finally{h.close();}
});

test('desktop compatibility recovery keeps desktop preferences and requests one fresh join',()=>{
  const h=harness({mobile:false});
  try{
    h.send({type:'webblox:stat',e:'play',p:'123'});
    h.send({type:'kkeep:roblox-runtime',stage:'running',gpu:'webgpu'});
    h.click('Loading help');
    assert.match(h.text(),/Graphics ·\s+WebGPU/);
    assert.match(h.text(),/Try compatibility graphics/);
    assert.equal(h.navigations.length,1);
    h.click('Try compatibility graphics');
    const url=new URL(h.navigations.at(-1));
    assert.equal(url.pathname,'/_/cGxheS5yb2Jsb3guY29t/games/start');
    assert.deepEqual([...url.searchParams],[['placeId','123'],['gpu','webgl']]);
    assert.equal(h.navigations.length,2);
    assert.doesNotMatch(h.text(),/Mobile performance mode/);
  }finally{h.close();}
});

const viewReport=(overrides={})=>({type:'kkeep:roblox-view',revision:'join18',canvas:{cssWidth:1180,cssHeight:734,width:1416,height:881},startup:null,lifecycle:null,...overrides});

test('optional view checks request only on game help or refresh and preserve the live join document',()=>{
  const h=harness();
  try{
    h.captureLoad()();h.click('Loading help');
    assert.equal(h.messages.length,0,'catalog help does not request game diagnostics');
    assert.equal(h.details,undefined);
    h.click('Show player');
    h.send({type:'webblox:stat',e:'play',p:'123'});
    h.send({type:'kkeep:roblox-runtime',stage:'transport-stream-ready'});
    assert.equal(h.messages.length,0,'play and connection events do not request diagnostics');
    const frame=h.currentFrame,source=h.iframe.props.src,key=h.iframe.key,navigations=h.navigations.length;
    h.click('Loading help');
    assert.equal(h.messages.length,1);
    assert.equal(h.messages[0].source,frame);
    assert.equal(h.messages[0].targetOrigin,'https://kkeep-roblox-runtime.kha971.chatgpt.site');
    assert.deepEqual(JSON.parse(JSON.stringify(h.messages[0].data)),{type:'kkeep:roblox-view-request'});
    assert.equal(h.details.props.open,undefined,'native details start collapsed');
    assert.match(h.text(),/Engine startup size not reported/);
    h.send(viewReport());
    assert.match(h.text(),/Runtime revision\s+join18/);
    assert.match(h.text(),/Current view\s+1180 × 734 CSS pixels/);
    assert.match(h.text(),/Current backing size\s+1416 × 881 pixels/);
    assert.match(h.text(),/Engine startup size not reported/);
    assert.match(h.text(),/No native game event reported/);
    assert.match(h.text(),/Game data stream opened/,'the existing connection stage stays visible');
    assert.match(h.text(),/These checks do not confirm that the game is playable\./);
    h.click('Refresh details');
    assert.equal(h.messages.length,2);
    assert.equal(h.messages[1].source,frame);
    assert.equal(h.messages[1].targetOrigin,h.messages[0].targetOrigin);
    assert.deepEqual(JSON.parse(JSON.stringify(h.messages[1].data)),{type:'kkeep:roblox-view-request'});
    assert.equal(h.currentFrame,frame);assert.equal(h.iframe.props.src,source);assert.equal(h.iframe.key,key);
    assert.equal(h.navigations.length,navigations,'help, a report and refresh never navigate or replay the join');
    assert.equal(h.alert,false);
  }finally{h.close();}
});

test('view responses cannot clear failures or promote a native game event to connection success',()=>{
  const h=harness();
  try{
    h.send({type:'webblox:stat',e:'play',p:'123'});
    h.send({type:'kkeep:roblox-runtime',stage:'transport-closed',detail:'NetworkError'});
    h.send({type:'kkeep:roblox-runtime',stage:'failed',detail:'memory'});
    assert.equal(h.messages.length,0,'automatic error help does not request a view snapshot');
    const report=viewReport({startup:{cssWidth:1180,cssHeight:734,width:1416,height:880,effectiveDpr:1.2,rawDpr:1.2},stage:'running',detail:'raw private details',log:'raw private log'});
    h.send(report,h.currentFrame,'https://evil.test');
    h.send(report,{});
    h.send({...report,revision:'join20'});
    h.send({...report,canvas:{...report.canvas,width:Infinity}});
    assert.doesNotMatch(h.text(),/join18|Startup size reported/);
    for(const [lifecycle,label] of [['join-reported','Join reported'],['scripts-starting','Game scripts starting'],['game-closed','Game closed']]){
      h.send({...report,lifecycle});
      assert.match(h.text(),new RegExp(label));
      assert.equal(h.alert,true);
      assert.match(h.text(),/could not reserve memory/);
      assert.match(h.text(),/Game server connection closed · NetworkError/);
      assert.doesNotMatch(h.text(),/raw private|Engine ready|Join confirmed/);
    }
    assert.match(h.text(),/Startup size reported/);
    assert.match(h.text(),/1416\s+×\s+880\s+backing pixels/);
    assert.equal(h.navigations.length,1);
  }finally{h.close();}
});

test('view snapshots reset on restart, a new experience and exit while replaced frames stay excluded',()=>{
  const h=harness();
  try{
    h.captureLoad()();h.send({type:'webblox:stat',e:'play',p:'123'});h.click('Loading help');
    h.send(viewReport());assert.match(h.text(),/join18/);
    const previousFrame=h.currentFrame;
    h.click('Rejoin this game');h.captureLoad()();h.click('Loading help');
    assert.notEqual(h.currentFrame,previousFrame);
    assert.doesNotMatch(h.text(),/join18|1180 × 734/,'a manual restart clears the old snapshot');
    h.send(viewReport(),previousFrame);
    assert.doesNotMatch(h.text(),/join18/,'a replaced document cannot restore its snapshot');
    h.send(viewReport(),h.currentFrame);assert.match(h.text(),/join18/);
    h.send({type:'webblox:stat',e:'play',p:'456'},h.currentFrame);h.click('Loading help');
    assert.doesNotMatch(h.text(),/join18/,'a different experience clears the snapshot');
    h.send(viewReport(),h.currentFrame);assert.match(h.text(),/join18/);
    h.send({type:'webblox:stat',e:'exit',p:'456'},h.currentFrame);
    h.send(viewReport(),h.currentFrame);h.click('Loading help');
    assert.equal(h.details,undefined,'an exited game cannot keep a diagnostic panel');
    h.click('Show player');
    h.send({type:'webblox:stat',e:'play',p:'789'},h.currentFrame);h.click('Loading help');
    assert.doesNotMatch(h.text(),/join18/,'late reports after exit do not carry into another experience');
    assert.equal(h.navigations.length,2,'only the explicit rejoin navigated');
  }finally{h.close();}
});

test('a reported zero startup size remains distinct from no native size report',()=>{
  const h=harness();
  try{
    h.captureLoad()();h.send({type:'webblox:stat',e:'play',p:'123'});h.click('Loading help');
    h.send(viewReport({canvas:null,startup:{cssWidth:0,cssHeight:0,width:0,height:0,effectiveDpr:1,rawDpr:1}}));
    assert.match(h.text(),/Startup size reported/);
    assert.match(h.text(),/0\s+×\s+0\s+CSS pixels/);
    assert.doesNotMatch(h.text(),/Engine startup size not reported/);
    assert.equal(h.alert,false);
    assert.equal(h.navigations.length,1);
  }finally{h.close();}
});

test('sign-in automatic recovery opens help without replacing the form and readiness clears it',()=>{
  const h=harness();
  try{
    const initial=h.currentFrame,load=h.captureLoad();
    h.send({type:'kkeep:roblox-runtime',stage:'session-recovering',detail:'service-worker'});
    assert.match(h.text(),/Restoring the Roblox browser connection automatically/);
    assert.match(h.text(),/Stop automatic recovery/);
    load();assert.equal(h.cover,true,'an iframe load cannot hide recovery status');
    h.tick(120000);assert.equal(h.currentFrame,initial,'runtime owns sign-in repair, not a host reload timer');
    h.send({type:'kkeep:roblox-runtime',stage:'session-ready'});
    assert.equal(h.cover,false);assert.equal(h.alert,false);assert.match(h.text(),/Loading help/);
    assert.equal(h.navigations.length,1);
  }finally{h.close();}
});

test('interactive sign-in and verification help stays nonblocking and never retries the form',()=>{
  const h=harness();
  try{
    h.send({type:'kkeep:roblox-runtime',stage:'session-recovering',detail:'connection'});
    h.send({type:'kkeep:roblox-runtime',stage:'session-help',detail:'input'});
    assert.equal(h.cover,false);assert.match(h.text(),/Complete the Roblox sign-in or verification/);
    h.tick(300000);assert.equal(h.navigations.length,1);
    h.click('Dismiss');assert.equal(h.cover,false);assert.match(h.text(),/Loading help/);
    h.send({type:'kkeep:roblox-runtime',stage:'session-help',detail:'input'},{});
    assert.doesNotMatch(h.text(),/Complete the Roblox/);
  }finally{h.close();}
});

test('stopping sign-in recovery sends only a scoped cancel command to the current runtime',()=>{
  const h=harness();
  try{
    h.send({type:'kkeep:roblox-runtime',stage:'session-waiting',detail:'offline'});
    h.click('Stop automatic recovery');
    assert.equal(h.messages.length,1);
    assert.equal(h.messages[0].source,h.currentFrame);
    assert.equal(h.messages[0].targetOrigin,'https://kkeep-roblox-runtime.kha971.chatgpt.site');
    assert.deepEqual(JSON.parse(JSON.stringify(h.messages[0].data)),{type:'kkeep:roblox-recovery',action:'stop'});
    h.send({type:'kkeep:roblox-runtime',stage:'session-paused',detail:'user'});
    assert.match(h.text(),/Automatic sign-in recovery is paused/);
    h.tick(300000);assert.equal(h.navigations.length,1);
    h.send({type:'kkeep:roblox-runtime',stage:'session-ready'});
    assert.equal(h.cover,false,'a usable form can still finish after pause');
  }finally{h.close();}
});

test('a confirmed disconnect automatically starts a fresh relay join with the same experience and preferences',()=>{
  const h=harness({storedFps:'30'});
  try{
    h.send({type:'webblox:stat',e:'play',p:'123'});
    h.send({type:'kkeep:roblox-runtime',stage:'failed',detail:'connection',gpu:'webgl'});
    h.send({type:'kkeep:roblox-runtime',stage:'failed',detail:'connection',gpu:'webgl'});
    assert.match(h.text(),/Rejoining this game using the relay connection automatically/);
    h.tick(2999);assert.equal(h.navigations.length,1);
    h.tick(1);
    const url=new URL(h.navigations.at(-1));
    assert.deepEqual([...url.searchParams],[['placeId','123'],['perf','performance'],['fps','30'],['res','auto'],['gpu','webgl'],['wt','relay']]);
    assert.equal(h.navigations.length,2,'duplicates schedule just one fresh join');
    h.send({type:'kkeep:roblox-runtime',stage:'failed',detail:'connection'},h.frame);
    h.tick(10000);assert.equal(h.navigations.length,2,'the obsolete frame cannot restart the new one');
  }finally{h.close();}
});

test('automatic game recovery has a finite budget even if the engine briefly reports running between failures',()=>{
  for(const detail of ['connection','transport-lost']){
    const h=harness();
    try{
      h.send({type:'webblox:stat',e:'play',p:'123'});
      const fail=()=>h.send({type:'kkeep:roblox-runtime',stage:'failed',detail},h.currentFrame);
      fail();h.tick(3000);
      h.send({type:'kkeep:roblox-runtime',stage:'running'},h.currentFrame);
      fail();h.tick(5999);assert.equal(h.navigations.length,2,detail);h.tick(1);
      assert.equal(h.navigations.length,3,detail);
      h.send({type:'kkeep:roblox-runtime',stage:'running'},h.currentFrame);
      fail();h.tick(300000);
      assert.equal(h.navigations.length,3,detail);assert.match(h.text(),/Automatic recovery has reached its limit/,detail);
      assert.equal(h.alert,true,detail);
    }finally{h.close();}
  }
});

test('automatic graphics fallback uses an actual WebGPU failure and never flips back repeatedly',()=>{
  const h=harness({storedFps:'30'});
  try{
    h.send({type:'webblox:stat',e:'play',p:'123'});
    h.send({type:'kkeep:roblox-runtime',stage:'transport-relay',gpu:'webgpu'});
    h.send({type:'kkeep:roblox-runtime',stage:'failed',detail:'graphics-init',gpu:'webgpu'});
    h.tick(3000);
    const url=new URL(h.navigations.at(-1));
    assert.equal(url.searchParams.get('gpu'),'webgl');assert.equal(url.searchParams.get('wt'),'relay');
    assert.equal(url.searchParams.get('fps'),'30');assert.equal(url.searchParams.get('placeId'),'123');
    h.send({type:'kkeep:roblox-runtime',stage:'failed',detail:'graphics-init',gpu:'webgl'},h.currentFrame);
    h.tick(300000);assert.equal(h.navigations.length,2);
  }finally{h.close();}
});

test('offline or hidden pages wait and resume a single pending game recovery',()=>{
  const h=harness();
  try{
    h.send({type:'webblox:stat',e:'play',p:'123'});
    h.online(false);h.send({type:'kkeep:roblox-runtime',stage:'failed',detail:'download'});
    h.tick(300000);assert.equal(h.navigations.length,1);assert.match(h.text(),/Waiting for your connection/);
    h.visibility('hidden');h.online(true);h.tick(300000);assert.equal(h.navigations.length,1);
    h.visibility('visible');h.tick(2999);assert.equal(h.navigations.length,1);h.tick(1);
    assert.equal(h.navigations.length,2);
    h.send({type:'kkeep:roblox-runtime',stage:'failed',detail:'download'},h.currentFrame);
    h.tick(300000);assert.equal(h.navigations.length,2,'the same failed download is not retried forever');
  }finally{h.close();}
});

test('stop, exit, successful startup and manual retry cancel a pending automatic rejoin',()=>{
  for(const action of ['stop','exit','running','retry']){
    const h=harness();
    try{
      h.send({type:'webblox:stat',e:'play',p:'123'});
      h.send({type:'kkeep:roblox-runtime',stage:'failed',detail:action==='running'?'download':'connection'});
      if(action==='stop')h.click('Stop automatic recovery');
      if(action==='exit')h.send({type:'webblox:stat',e:'exit',p:'123'});
      if(action==='running')h.send({type:'kkeep:roblox-runtime',stage:'running'});
      if(action==='retry')h.click('Rejoin using relay');
      h.tick(10000);assert.equal(h.navigations.length,action==='retry'?2:1,action);
    }finally{h.close();}
  }
});

test('advisory transport errors, unsupported features and unknown engine errors do not trigger guessed retries',()=>{
  for(const detail of ['engine','memory','jspi','isolation','compile','instantiate']){
    const h=harness();
    try{
      h.send({type:'webblox:stat',e:'play',p:'123'});
      h.send({type:'kkeep:roblox-runtime',stage:'transport-handshake',detail:'NetworkError'});
      h.tick(10000);assert.equal(h.navigations.length,1);
      h.send({type:'kkeep:roblox-runtime',stage:'failed',detail,gpu:'webgpu'});
      h.tick(300000);assert.equal(h.navigations.length,1,detail);assert.equal(h.alert,true);
    }finally{h.close();}
  }
});

test('a long join opens a nonblocking help notice without hiding the player or replaying the join',()=>{
  const h=harness();
  try{
    h.send({type:'webblox:stat',e:'play',p:'123'});
    h.tick(60000);assert.match(h.text(),/Roblox is taking longer to join/);assert.equal(h.cover,false);
    assert.equal(h.navigations.length,1);assert.equal(h.messages.length,1);
    h.send({type:'kkeep:roblox-runtime',stage:'running'});
    assert.doesNotMatch(h.text(),/taking longer/);assert.equal(h.cover,false);
  }finally{h.close();}
});

test('Show player remains visible after the asynchronous sign-in pause acknowledgement',()=>{
  const h=harness();
  try{
    h.send({type:'kkeep:roblox-runtime',stage:'session-recovering',detail:'connection'});
    h.click('Show player');assert.equal(h.cover,false);
    h.send({type:'kkeep:roblox-runtime',stage:'session-paused',detail:'user'});
    assert.equal(h.cover,false);assert.match(h.text(),/Automatic sign-in recovery is paused/);
    h.tick(300000);assert.equal(h.navigations.length,1);
  }finally{h.close();}
});

test('late sign-in errors cannot cover an active game and startup checks are not treated as stalled joins',()=>{
  const h=harness();
  try{
    h.send({type:'webblox:stat',e:'play',p:'123'});
    h.send({type:'kkeep:roblox-runtime',stage:'running'});
    h.send({type:'kkeep:roblox-runtime',stage:'session-failed',detail:'connection'});
    assert.equal(h.cover,false);
    h.click('Loading help');h.click('Run startup check');h.captureLoad()();h.tick(300000);
    assert.doesNotMatch(h.text(),/taking longer to join/);
    assert.equal(new URL(h.navigations.at(-1)).pathname,'/check');
  }finally{h.close();}
});

test('a failed recovery document stops progress while a slow recovery reveals its continuing player',()=>{
  for(const failure of [true,false]){
    const h=harness();
    try{
      h.send({type:'webblox:stat',e:'play',p:'123'});
      h.send({type:'kkeep:roblox-runtime',stage:'failed',detail:'connection'});h.tick(3000);
      if(failure){h.error();assert.doesNotMatch(h.text(),/automatically|Stop automatic recovery/);assert.equal(h.alert,true);}
      else{h.tick(60000);assert.equal(h.cover,false);assert.match(h.text(),/taking longer to join/);}
      assert.equal(h.navigations.length,2);
    }finally{h.close();}
  }
});

test('a catalog failure opens help and only catalog readiness clears it',()=>{
  const h=harness();
  try{
    const loaded=h.captureLoad();
    h.send({type:'kkeep:roblox-runtime',stage:'catalog-failed',detail:'connection'});
    assert.equal(h.alert,true);assert.match(h.text(),/Roblox menu could not connect/);
    loaded();h.send({type:'kkeep:roblox-runtime',stage:'session-ready'});
    assert.equal(h.alert,true);assert.match(h.text(),/Roblox menu could not connect/);
    h.tick(300000);assert.equal(h.navigations.length,1,'a catalog error does not replay an account request');
    h.send({type:'kkeep:roblox-runtime',stage:'catalog-ready'});
    assert.equal(h.cover,false);assert.doesNotMatch(h.text(),/could not connect/);
  }finally{h.close();}
});

test('catalog messages cannot override a sign-in or game failure or cover a running game',()=>{
  for(const stage of ['session-failed','failed','running']){
    const h=harness();
    try{
      if(stage==='running')h.send({type:'webblox:stat',e:'play',p:'123'});
      h.send({type:'kkeep:roblox-runtime',stage,detail:stage==='failed'?'memory':'connection'});
      const before=h.text(),covered=h.cover;
      h.send({type:'kkeep:roblox-runtime',stage:'catalog-failed',detail:'version'});
      h.send({type:'kkeep:roblox-runtime',stage:'catalog-ready'});
      assert.equal(h.text(),before);assert.equal(h.cover,covered);
    }finally{h.close();}
  }
});

test('catalog help remains dismissed after Show player until an explicit retry',()=>{
  const h=harness();
  try{
    h.send({type:'kkeep:roblox-runtime',stage:'catalog-failed',detail:'version'});
    assert.match(h.text(),/Roblox menu needs an update/);
    h.click('Show player');assert.equal(h.cover,false);
    h.send({type:'kkeep:roblox-runtime',stage:'catalog-failed',detail:'connection'});
    h.send({type:'kkeep:roblox-runtime',stage:'session-ready'});
    assert.equal(h.cover,false);assert.match(h.text(),/Roblox menu could not connect/);
    h.click('Loading help');h.click('Retry');
    h.send({type:'kkeep:roblox-runtime',stage:'catalog-failed',detail:'version'},h.currentFrame);
    assert.equal(h.alert,true);assert.equal(h.navigations.length,2);
  }finally{h.close();}
});

test('catalog status accepts only the current origin and frame and displays no raw error details',()=>{
  const h=harness();
  try{
    h.captureLoad()();
    const failure={type:'kkeep:roblox-runtime',stage:'catalog-failed',detail:'private-value https://example.invalid/?token=secret'};
    h.send(failure,{},'https://kkeep-roblox-runtime.kha971.chatgpt.site');
    h.send(failure,h.frame,'https://other.invalid');
    assert.equal(h.cover,false);
    h.send(failure);assert.equal(h.alert,true);
    assert.match(h.text(),/This Roblox page could not load/);
    assert.doesNotMatch(h.text(),/private-value|example.invalid|token=secret/);
    h.click('Retry');const before=h.text();
    h.send({type:'kkeep:roblox-runtime',stage:'catalog-ready'},h.frame);
    h.send(failure,h.frame);
    assert.equal(h.text(),before,'obsolete frame notifications are ignored');
  }finally{h.close();}
});

test('queued sign-in progress cannot undo Stop or Show player before pause acknowledgement',()=>{
  for(const action of ['Stop automatic recovery','Show player']){
    const h=harness();
    try{
      h.send({type:'kkeep:roblox-runtime',stage:'session-recovering',detail:'connection'});
      h.click(action);
      const covered=h.cover;
      for(const stage of ['session-recovering','session-waiting'])h.send({type:'kkeep:roblox-runtime',stage,detail:'connection'});
      assert.equal(h.cover,covered);assert.doesNotMatch(h.text(),/Stop automatic recovery|Reconnecting Roblox sign-in automatically/);
      assert.equal(h.messages.length,1,'one cancellation is enough for queued progress events');
      h.send({type:'kkeep:roblox-runtime',stage:'session-paused',detail:'user'});
      assert.equal(h.cover,covered);
      if(!h.cover)h.click('Loading help');
      h.click('Retry');
      h.send({type:'kkeep:roblox-runtime',stage:'session-recovering',detail:'connection'},h.currentFrame);
      assert.match(h.text(),/Stop automatic recovery/,'explicit retry allows the new session to recover');
      assert.equal(h.navigations.length,2);
    }finally{h.close();}
  }
});

test('verified in-place sign-in repair keeps the form visible through offline waiting and Stop',()=>{
  const h=harness();
  try{
    const frame=h.currentFrame;
    h.send({type:'kkeep:roblox-runtime',stage:'session-recovering',detail:'connection',preserveForm:true});
    assert.equal(h.cover,false);assert.match(h.text(),/Reconnecting Roblox sign-in automatically/);
    assert.match(h.text(),/Stop automatic recovery/);
    h.send({type:'kkeep:roblox-runtime',stage:'session-waiting',detail:'offline',preserveForm:true});
    assert.equal(h.cover,false);assert.match(h.text(),/Waiting for your connection/);
    h.click('Stop automatic recovery');assert.equal(h.cover,false);
    h.send({type:'kkeep:roblox-runtime',stage:'session-paused',detail:'user'});
    h.send({type:'kkeep:roblox-runtime',stage:'session-recovering',detail:'connection',preserveForm:true});
    assert.equal(h.cover,false);assert.match(h.text(),/Automatic sign-in recovery is paused/);
    assert.doesNotMatch(h.text(),/Stop automatic recovery/);
    h.tick(300000);assert.equal(h.currentFrame,frame);assert.equal(h.navigations.length,1);
  }finally{h.close();}
});

test('failed in-place repair explains the connection problem without replacing or covering the form',()=>{
  const h=harness();
  try{
    h.send({type:'kkeep:roblox-runtime',stage:'session-help',detail:'connection'});
    assert.equal(h.cover,false);assert.match(h.text(),/sign-in connection could not be restored/);
    assert.doesNotMatch(h.text(),/Complete the Roblox sign-in or verification/);
    h.tick(300000);assert.equal(h.navigations.length,1);
    h.click('Loading help');h.click('Show player');
    h.send({type:'kkeep:roblox-runtime',stage:'session-failed',detail:'connection'});
    assert.equal(h.cover,false,'a late terminal error does not cover the preserved form');
  }finally{h.close();}
});

test('a prepared worker or non-boolean preservation hint never counts as a visible sign-in form',()=>{
  for(const preserveForm of [undefined,'true',1,{}]){
    const h=harness();
    try{
      h.send({type:'kkeep:roblox-runtime',stage:'session-ready'});
      h.send({type:'kkeep:roblox-runtime',stage:'session-recovering',detail:'service-worker',preserveForm});
      assert.equal(h.cover,true);
    }finally{h.close();}
  }
});

test('a new experience clears an earlier menu failure and still detects a long join',()=>{
  const h=harness();
  try{
    h.send({type:'kkeep:roblox-runtime',stage:'catalog-failed',detail:'connection'});
    h.click('Show player');
    h.send({type:'webblox:stat',e:'play',p:'123'});
    assert.equal(h.cover,false);assert.doesNotMatch(h.text(),/menu could not connect/);
    h.tick(60000);assert.match(h.text(),/Roblox is taking longer to join/);
    assert.equal(h.navigations.length,1);
  }finally{h.close();}
});

test('a definitive nonrecoverable failure cancels an earlier pending automatic join',()=>{
  for(const detail of ['memory','jspi','compile','engine','graphics-init']){
    const h=harness();
    try{
      h.send({type:'webblox:stat',e:'play',p:'123'});
      h.send({type:'kkeep:roblox-runtime',stage:'failed',detail:'connection',gpu:'webgl'});
      assert.match(h.text(),/Stop automatic recovery/);
      h.send({type:'kkeep:roblox-runtime',stage:'failed',detail,gpu:'webgl'});
      const message=h.text();assert.doesNotMatch(message,/Stop automatic recovery/);
      h.tick(300000);assert.equal(h.navigations.length,1);assert.equal(h.text(),message);
      assert.equal(h.alert,true);
    }finally{h.close();}
  }
});

test('an established transport loss after gameplay opens help and rejoins once with the existing preferences',()=>{
  const h=harness({storedFps:'30'});
  try{
    h.send({type:'webblox:stat',e:'play',p:'123'});
    h.send({type:'kkeep:roblox-runtime',stage:'transport-native',gpu:'webgl'});
    h.send({type:'kkeep:roblox-runtime',stage:'running',gpu:'webgl'});
    h.send({type:'kkeep:roblox-runtime',stage:'transport-closed',detail:'NetworkError'});
    h.tick(10000);assert.equal(h.cover,false);assert.equal(h.navigations.length,1,'an advisory close alone does not authorize a new join');
    h.send({type:'kkeep:roblox-runtime',stage:'failed',detail:'transport-lost'},{});
    h.send({type:'kkeep:roblox-runtime',stage:'failed',detail:'transport-lost'},h.frame,'https://other.invalid');
    assert.equal(h.cover,false,'a loss signal must belong to the current runtime origin and frame');
    h.send({type:'kkeep:roblox-runtime',stage:'transport-lost',detail:'NetworkError'});
    const lost={type:'kkeep:roblox-runtime',stage:'failed',detail:'transport-lost',gpu:'webgl',jobId:'old-job',ticket:'private-ticket'};
    h.send(lost);h.send(lost);
    assert.equal(h.alert,true);assert.match(h.text(),/Rejoining this game using the relay connection automatically/);
    assert.match(h.text(),/Established game connection lost · NetworkError/);
    assert.doesNotMatch(h.text(),/277|old-job|private-ticket/);
    h.tick(2999);assert.equal(h.navigations.length,1);h.tick(1);
    assert.equal(h.navigations.length,2);
    assert.deepEqual([...new URL(h.navigations.at(-1)).searchParams],[['placeId','123'],['perf','performance'],['fps','30'],['res','auto'],['gpu','webgl'],['wt','relay']]);
    h.send(lost,h.frame);h.tick(10000);assert.equal(h.navigations.length,2,'the retired iframe cannot restart the replacement');
  }finally{h.close();}
});

test('a terminal connection loss cannot be erased by a late running event or iframe load from the same launch',()=>{
  for(const detail of ['connection','transport-lost']){
    const h=harness();
    try{
      h.send({type:'webblox:stat',e:'play',p:'123'});
      h.send({type:'kkeep:roblox-runtime',stage:'running',gpu:'webgl'});
      const loaded=h.captureLoad();
      h.send({type:'kkeep:roblox-runtime',stage:'failed',detail,gpu:'webgl'});
      h.send({type:'kkeep:roblox-runtime',stage:'running',gpu:'webgpu'});
      loaded();
      assert.equal(h.alert,true,detail);assert.match(h.text(),/Stop automatic recovery/,detail);
      h.tick(3000);assert.equal(h.navigations.length,2,detail);
      assert.equal(new URL(h.navigations.at(-1)).searchParams.get('gpu'),'webgl','a stale running message cannot change the selected graphics');
      h.send({type:'kkeep:roblox-runtime',stage:'running',gpu:'webgl'},h.currentFrame);
      assert.equal(h.cover,false,detail+': the replacement launch can report readiness normally');
    }finally{h.close();}
  }
});

test('a game connection failure or late readiness after Exit cannot cover or clear the current menu',()=>{
  for(const detail of ['connection','transport-lost']){
    const h=harness();
    try{
      h.send({type:'webblox:stat',e:'play',p:'123'});
      h.send({type:'kkeep:roblox-runtime',stage:'running'});
      h.send({type:'webblox:stat',e:'exit',p:'123'});
      h.send({type:'kkeep:roblox-runtime',stage:'transport-lost',detail:'NetworkError'});
      h.send({type:'kkeep:roblox-runtime',stage:'failed',detail});
      h.tick(10000);assert.equal(h.cover,false,detail);assert.equal(h.navigations.length,1,detail);
      h.send({type:'kkeep:roblox-runtime',stage:'catalog-failed',detail:'connection'});
      h.send({type:'kkeep:roblox-runtime',stage:'running'});
      assert.equal(h.alert,true,detail);assert.match(h.text(),/Roblox menu could not connect/,detail);
      h.send({type:'webblox:stat',e:'play',p:'456'});
      h.send({type:'kkeep:roblox-runtime',stage:'running'});
      assert.equal(h.cover,false,detail+': a real new experience resets the retired launch');
      h.send({type:'kkeep:roblox-runtime',stage:'failed',detail:'transport-lost'});
      h.tick(3000);assert.equal(new URL(h.navigations.at(-1)).searchParams.get('placeId'),'456');
    }finally{h.close();}
  }
});

test('Stop keeps a terminal transport loss visible and an explicit retry resets recovery for the new launch',()=>{
  const h=harness();
  try{
    h.send({type:'webblox:stat',e:'play',p:'123'});
    h.send({type:'kkeep:roblox-runtime',stage:'running',gpu:'webgl'});
    h.send({type:'kkeep:roblox-runtime',stage:'failed',detail:'transport-lost',gpu:'webgl'});
    h.click('Stop automatic recovery');
    assert.match(h.text(),/The established game connection was lost/);
    assert.doesNotMatch(h.text(),/277|Stop automatic recovery/);
    h.send({type:'kkeep:roblox-runtime',stage:'running'});
    h.tick(300000);assert.equal(h.alert,true);assert.equal(h.navigations.length,1);
    h.click('Rejoin using relay');
    h.send({type:'kkeep:roblox-runtime',stage:'running',gpu:'webgl'},h.currentFrame);
    assert.equal(h.cover,false);assert.equal(h.navigations.length,2);
    h.send({type:'kkeep:roblox-runtime',stage:'failed',detail:'transport-lost',gpu:'webgl'},h.currentFrame);
    assert.match(h.text(),/Requesting a fresh game connection automatically/);
    h.tick(3000);assert.equal(h.navigations.length,3);
    const url=new URL(h.navigations.at(-1));assert.equal(url.searchParams.get('placeId'),'123');assert.equal(url.searchParams.get('wt'),'relay');
  }finally{h.close();}
});

test('pre-play startup failures still open help before a real game launch is reported',()=>{
  for(const detail of ['memory','jspi','download','connection','transport-lost']){
    const h=harness();
    try{
      h.send({type:'kkeep:roblox-runtime',stage:'failed',detail});
      assert.equal(h.alert,true,detail);h.tick(10000);assert.equal(h.navigations.length,1,detail);
      h.send({type:'webblox:stat',e:'play',p:'123'});
      h.send({type:'kkeep:roblox-runtime',stage:'running'});
      assert.equal(h.cover,false,detail+': an actual new launch retires the previous startup failure');
    }finally{h.close();}
  }
});
