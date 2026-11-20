import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const dir=new URL('../public/games/among-us-old/',import.meta.url);
const adapter=readFileSync(new URL('loader-compat.js',dir),'utf8');
const loaderSource=readFileSync(new URL('Build/UnityLoader.js',dir),'utf8');
const start=loaderSource.lastIndexOf('decompress:function(e,t){')+'decompress:'.length;
const end=loaderSource.indexOf(',serverSetupWarningEnabled:',start);
function makeContext(){
 const tasks=[];let workers=0;
 const scope={setTimeout:fn=>tasks.push(fn),Worker:function(){workers++;throw Error('Blob workers unavailable');},URL:{createObjectURL:()=>{throw Error('Blob URLs unavailable');}},Blob:function(){throw Error('Blob execution unavailable');}};
 vm.createContext(scope);vm.runInContext(adapter,scope);
 const decompressor=vm.runInContext('('+loaderSource.slice(start,end)+')',scope);
 const loader={Compression:{decompress:decompressor,gzip:{hasUnityMarker:()=>false},brotli:{hasUnityMarker:()=>false},identity:{require:()=>({}),decompress:x=>x}},loadCode(){throw Error('Dynamic engine execution unavailable');}};
 return {scope,loader,tasks,workers:()=>workers};
}
test('real legacy decompressor processes raw game files without Blob or Worker support',()=>{
 const {scope,loader,tasks,workers}=makeContext();const bytes=new Uint8Array([0,97,115,109]);
 assert.throws(()=>loader.Compression.decompress(bytes,()=>{}),/Blob/);
 scope.installAmongLoader(loader,()=>{},'https://kkeep.fun/engine.js',assert.fail);
 let result;loader.Compression.decompress(bytes,value=>{result=value;});
 assert.equal(result,undefined);assert.equal(tasks.length,1);tasks.shift()();
 assert.equal(result,bytes);assert.equal(bytes.byteLength,4);assert.equal(workers(),0);
 assert.equal(loader.Compression.decompress(bytes),bytes);
});
test('framework starts from a registered factory without blob execution',()=>{
 const {scope,loader}=makeContext();let received,complete=0;
 scope.installAmongLoader(loader,module=>{received=module;},'/engine.js',assert.fail);
 const module={wasmBinary:new Uint8Array([0,97,115,109])};
 loader.processWasmFrameworkJob(module,{complete:()=>complete++});
 assert.equal(received,module);assert.equal(module.mainScriptUrlOrBlob,'/engine.js');assert.equal(complete,1);
});
test('framework exceptions report their actual cause and never complete the startup job',()=>{
 const {scope,loader}=makeContext();let failure;
 scope.installAmongLoader(loader,()=>{throw Error('Memory allocation failed');},'/engine.js',message=>{failure=message;});
 loader.processWasmFrameworkJob({}, {complete:()=>assert.fail('Failed startup must not complete')});
 assert.equal(failure,'Unity startup: Memory allocation failed');
});
test('published framework is valid classic JavaScript and registers without starting the game',()=>{
 const scope={window:{}};
 vm.runInNewContext(readFileSync(new URL('Build/framework.static.js',dir),'utf8'),scope);
 assert.equal(typeof scope.window.KkeepAmongFramework,'function');
});
