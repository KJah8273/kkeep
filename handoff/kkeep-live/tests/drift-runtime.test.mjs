import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {applyDriftGraphics,installDriftPreferences} from '../public/games/drift-hunters/preferences.js';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const header=Uint8Array.from([85,110,105,116,121,80,114,102,0,0,1,0,0,0,16,0]);
const join=(...parts)=>Uint8Array.from(parts.flatMap(part=>[...part]));
function integer(key,value){
 const name=new TextEncoder().encode(key),record=new Uint8Array(name.length+6);
 record[0]=name.length;record.set(name,1);record[name.length+1]=254;
 new DataView(record.buffer).setInt32(name.length+2,value,true);return record;
}
test('native Low changes only the two graphics preferences, preserving saved cars, money and other values',()=>{
 const progress=join(integer('money',137500),integer('selectedCar',7));
 const float=Uint8Array.from([3,86,111,108,253,0,0,0,63]);
 const long=join(Uint8Array.from([4,83,97,118,101,128,128,0,0,0]),new Uint8Array(128).fill(65));
 const original=join(header,integer('Graphics',0),progress,float,long,integer('UnityGraphicsQuality',0)),before=original.slice();
 const low=join(integer('UnityGraphicsQuality',2),integer('Graphics',2));
 const output=applyDriftGraphics(original);
 assert.deepEqual(output,join(header,progress,float,long,low));
 assert.deepEqual(original,before);assert.deepEqual(applyDriftGraphics(output),output);
 assert.deepEqual(applyDriftGraphics(null),join(header,low));
});
test('restored preferences are patched once at the native read, including the legacy un-hashed path',()=>{
 for(const path of ['/idbfs/PlayerPrefs','/idbfs/game/PlayerPrefs']){
  const saved=join(header,integer('money',8000),integer('Graphics',0)),files=new Map([[path,saved]]);let writes=0;
  const FS={lookupPath(p){return {exists:files.has(p)};},analyzePath(p){return this.lookupPath(p);},readFile(p){this.lookupPath(p);return files.get(p);},mkdirTree(){},writeFile(p,bytes){this.lookupPath(p);files.set(p,bytes);writes++;}};
  installDriftPreferences(FS);assert.equal(writes,0);
  FS.lookupPath(path);FS.lookupPath(path);FS.lookupPath('/idbfs/other/PlayerPrefs');
  assert.equal(writes,1);assert.deepEqual(files.get(path),applyDriftGraphics(saved));
 }
});
test('unknown and truncated saves stay untouched',()=>{
 const future=header.slice();new DataView(future.buffer).setUint32(8,0x20000,true);
 for(const bytes of [new Uint8Array([1,2]),future,join(header,[4,65]),join(header,[1,65,129]),join(header,[1,65,254,0])]){
  assert.throws(()=>applyDriftGraphics(bytes));
  let writes=0;const FS={lookupPath(){return {exists:true};},analyzePath(){return {exists:true};},readFile(){return bytes;},mkdirTree(){},writeFile(){writes++;}};
  installDriftPreferences(FS);FS.lookupPath('/idbfs/PlayerPrefs');assert.equal(writes,0);
 }
});
test('the real engine waits for storage restore before applying graphics and never changes a failed restore',()=>{
 const framework=read('public/games/drift-hunters/framework.js');
 const callback=framework.match(/FS\.syncfs\(true,\((function\(err\)\{if\(!err[\s\S]*?\})\)\)/)?.[1];assert.ok(callback);
 for(const error of [null,Error('restore failed')]){
  const calls=[];const fn=vm.runInNewContext('('+callback+')',{FS:{},Module:{kkeepPreparePreferences(){calls.push('preferences');},removeRunDependency(){calls.push('ready');}}});
  fn(error);assert.deepEqual(calls,error?['ready']:['preferences','ready']);
 }
});
function player(touch=true){
 const listeners={},alerts=[],messages=[],progress={value:0},span={textContent:''},retry={hidden:true};let options,config,interval;
 const loading={hidden:false,querySelector:selector=>selector==='button'?retry:span};
 const context={navigator:{maxTouchPoints:touch?5:0,userAgent:'Version/27.2 Mobile Safari'},matchMedia:()=>({matches:false}),document:{body:{dataset:{}},getElementById:()=>loading,querySelector:()=>progress,addEventListener:(name,fn)=>listeners[name]=fn},console:{log(){},warn(){},error:(...args)=>messages.push(args)},installDriftPreferences,Uint8Array,TextEncoder,TextDecoder,Event,Error,setTimeout,clearTimeout,setInterval:fn=>interval=fn,alert:message=>alerts.push(message),KkeepUnity:{install(){}},UnityLoader:{Blobs:{},Compression:{},SystemInfo:{hasWebGL:2},instantiate(container,url,settings){options=settings;config=url;return {Module:settings.Module};}}};
 context.window=context;context.addEventListener=(name,fn)=>listeners[name]=fn;context.dispatchEvent=event=>listeners[event.type]?.(event);
 vm.createContext(context);
 const source=read('public/games/drift-hunters/UnityLoader2019.js');
 const errorObject=source.slice(source.indexOf('    Error: {')+11,source.indexOf('    Job: {')).trim().replace(/,$/,'');
 context.UnityLoader.Error=vm.runInContext('('+errorObject+')',context);
 vm.runInContext(read('public/games/drift-hunters/loader-fixes.js'),context);
 vm.runInContext(read('public/games/drift-hunters/runtime.js').replace(/^import[^\n]+\n/,''),context);
 return {context,listeners,alerts,messages,options,config,loading,span,retry,interval};
}
test('Safari runtime errors without blob stacks reach the real failure handler, remain visible and release controls',()=>{
 const h=player();let resets=0,flushes=0;h.listeners['kkeep-drift-failure']=()=>resets++;
 h.context.gameInstance.Module.FS={syncfs(populate,callback){assert.equal(populate,false);flushes++;callback();}};
 h.options.onProgress(h.context.gameInstance,1);assert.equal(h.loading.hidden,true);
 h.listeners.error({message:'Cannot enlarge memory arrays',filename:'https://kkeep.test/api/game-public/games/drift-hunters/framework.js',lineno:1});
 assert.equal(h.alerts.length,0);assert.equal(h.loading.hidden,false);assert.equal(h.retry.hidden,false);assert.match(h.span.textContent,/ran out of memory/);
 assert.equal(resets,1);assert.equal(flushes,1);assert.equal(h.context.document.body.dataset.ready,'false');
 h.options.onProgress(h.context.gameInstance,1);assert.equal(h.loading.hidden,false);assert.equal(h.context.document.body.dataset.ready,'false');
});
test('iPad uses 512 MiB with native Low and desktop keeps its existing settings',()=>{
 const ipad=player(),desktop=player(false);
 assert.equal(ipad.options.Module.TOTAL_MEMORY,536870912);
 assert.equal(ipad.options.Module.kkeepPreparePreferences,installDriftPreferences);
 assert.equal(desktop.options.Module.TOTAL_MEMORY,536870912);
 assert.equal(desktop.options.Module.kkeepPreparePreferences,undefined);
 assert.match(ipad.config,/^dh-ipad\.json\?/);
 const html=read('public/games/drift-hunters/index.html');
 for(const tag of html.match(/<script\b[^>]*src=[^>]+>/g))assert.match(tag,/crossorigin="anonymous"/);
});
