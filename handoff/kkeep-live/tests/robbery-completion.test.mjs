import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const portSource=readFileSync(new URL('../public/games/robbery-bob/port.js',import.meta.url),'utf8');
const appSource=readFileSync(new URL('../public/games/robbery-bob/app.js',import.meta.url),'utf8');
// Synthetic test-player snapshots from the original engine, before and after
// completing Suburbs 1. No user account or production progress is included.
const fixture=JSON.parse(readFileSync(new URL('./fixtures/robbery-bob/completion-save.json',import.meta.url),'utf8'));
const progressKey='robbery-bob:kkeep:progress';
function storage(data=new Map()){
  return {getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,String(value))};
}
function newPort(data){
  const context={RobberyPort:class{},Uint8Array,TextEncoder,atob,btoa,localStorage:storage(data)};
  vm.createContext(context);vm.runInContext(portSource,context);
  const port=new context.BobPort();port.M={HEAPU8:new Uint8Array(16384),_free(){}};
  port.objects=new Map();port.seen=new Set();port.log=()=>{};return port;
}
function completedLevels(encoded){
  const bytes=Buffer.from(encoded,'base64');let offset=4;
  while(offset<bytes.length){
    const keyLength=bytes.readUInt32LE(offset);offset+=4;
    const key=bytes.toString('utf8',offset,offset+keyLength);offset+=keyLength;
    const size=bytes.readUInt32LE(offset);offset+=4;
    if(key==='NumLevelsCompleted')return bytes.readUInt32LE(offset);
    offset+=size;
  }
  return 0;
}
function nativeSave(port,encoded,name='userdefaults.gsd'){
  const bytes=Buffer.from(encoded,'base64');port.M.HEAPU8.set(bytes,128);
  port.objects.set(1,name);port.objects.set(2,{ptr:128,length:bytes.length});
  const args=[1,2];port.java('internalSave','(Ljava/lang/String;[B)V',()=>args.shift());
}

test('a completed level survives a transition crash before the two-second save poll',()=>{
  assert.equal(completedLevels(fixture.before),0);assert.equal(completedLevels(fixture.completed),1);
  const data=new Map([[progressKey,fixture.before]]),port=newPort(data);
  port.gameInitialized=true;port.progressRestored=true;
  nativeSave(port,fixture.completed);
  assert.equal(data.get(progressKey),fixture.completed);
  assert.equal(data.get('robbery-bob:kkeep:userdefaults.gsd'),fixture.completed);
  // Reopen without calling saveProgress (the native frame has already failed).
  const reopened=newPort(data);reopened.alloc=()=>128;reopened.object=value=>{reopened.objects.set(3,value);return 3;};
  let restored;
  reopened.entry=(name,[id])=>{
    assert.equal(name,'LoadSavedGame');const a=reopened.objects.get(id);
    restored=Buffer.from(reopened.M.HEAPU8.subarray(a.ptr,a.ptr+a.length)).toString('base64');
  };
  reopened.restoreProgress();assert.equal(completedLevels(restored),1);
});

test('startup saves and unrelated native files cannot overwrite restored Profile progress',()=>{
  const data=new Map([[progressKey,fixture.completed]]),port=newPort(data);
  port.gameInitialized=true;port.progressRestored=false;
  nativeSave(port,fixture.before);assert.equal(data.get(progressKey),fixture.completed);
  port.progressRestored=true;nativeSave(port,fixture.before,'settings.gsd');
  assert.equal(data.get(progressKey),fixture.completed);
});

test('Safari audio exceptions do not unwind the native completion frame',()=>{
  const port=newPort(new Map()),registers=[0,0,3,0],writes=[];
  port.u64=address=>registers[address/8]??0;port.w64=(address,value)=>writes.push([address,value]);
  port.objects.set(3,{method:'stopMusic',signature:'()V',class:{class:'se/leveleight/utils/leSoundManager'}});
  port.audio={call(){throw new Error('Audio device is unavailable');}};
  assert.doesNotThrow(()=>port.jni(0,143));assert.deepEqual(writes,[[0,0]]);
  port.objects.set(3,{method:'BrokenNativeMethod',signature:'()V',class:{class:'se/leveleight/rb/GameActivity'}});
  port.java=()=>{throw Error('Native failure');};
  assert.throws(()=>port.jni(0,143),/Native failure/);
});

async function app({data=new Map([[progressKey,fixture.completed]]),session=new Map(),restored=true,initialized=true}={}){
  const frames=[],timers=[],elements=new Map(),events=new Map(),calls=[];
  const element=id=>{
    if(!elements.has(id))elements.set(id,{style:{},hidden:true,width:1024,height:768,addEventListener(){},setPointerCapture(){}});
    return elements.get(id);
  };
  const context={console:{log(){}},Map,Uint8Array,TextDecoder,URL,AbortSignal,Promise,Date,localStorage:storage(data),sessionStorage:storage(session),
    document:{getElementById:element,baseURI:'https://kkeep.test/',hidden:false,addEventListener(){}},
    location:{reload:()=>calls.push('reload')},performance:{now:()=>0},
    setTimeout:(callback,delay)=>{timers.push({callback,delay});return timers.length;},clearTimeout(){},
    requestAnimationFrame:callback=>frames.push(callback),
    addEventListener:(name,callback)=>events.set(name,callback),
    fetch:async()=>({ok:true,arrayBuffer:async()=>new TextEncoder().encode('{}').buffer}),
    BobAudio:class{resume(){return Promise.resolve();}},
    PortEngine:async()=>({FS:{writeFile(){}},_create_gl(){}}),
    BobPort:class{
      constructor(){this.gameInitialized=initialized;this.progressRestored=restored;}
      async load(){} boot(){} touch(){}
      entry(){calls.push('render');throw Error('Simulated transition failure');}
      saveProgress(){calls.push('unsafe save');data.set(progressKey,'invalid partial state');}
    },
  };
  context.window=context;vm.runInNewContext(appSource,context);
  await new Promise(resolve=>setImmediate(resolve));
  return {context,frames,timers,element,events,calls,data,session};
}

test('a failed transition restores the committed checkpoint without re-entering the broken engine',async()=>{
  const result=await app();result.frames.shift()(32);
  assert.equal(result.element('loading-message').textContent,'Restoring saved progress…');
  assert.equal(result.frames.length,0);assert.equal(result.timers.length,1);
  result.events.get('pagehide')();assert.equal(result.data.get(progressKey),fixture.completed);
  assert.ok(!result.calls.includes('unsafe save'));
  result.timers[0].callback();assert.ok(result.calls.includes('reload'));
  const again=await app({session:result.session});again.frames.shift()(32);
  assert.equal(again.timers.length,0);assert.equal(again.element('start').hidden,false);
});

test('startup, restoration failures, and missing saves never trigger an automatic reload',async()=>{
  for(const options of [{restored:false},{initialized:false},{data:new Map()}]){
    const result=await app(options);result.frames.shift()(32);
    assert.equal(result.timers.length,0);assert.equal(result.element('start').hidden,false);
  }
});

test('blocked session storage falls back to manual retry and keeps the checkpoint',async()=>{
  const result=await app();result.context.sessionStorage={getItem(){throw Error('Storage blocked');}};
  result.frames.shift()(32);
  assert.equal(result.timers.length,0);assert.equal(result.element('start').hidden,false);
  assert.equal(result.data.get(progressKey),fixture.completed);
});
