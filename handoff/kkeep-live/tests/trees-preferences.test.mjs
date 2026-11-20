import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {applyForestGraphics,installForestPreferences} from '../public/games/trees-hate-you/preferences.js';

const encoder=new TextEncoder();
const header=Uint8Array.from([85,110,105,116,121,80,114,102,0,0,1,0,0,0,16,0]);
function concat(...parts){const bytes=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}return bytes;}
function integer(name,value){const key=encoder.encode(name),bytes=new Uint8Array(key.length+6);bytes[0]=key.length;bytes.set(key,1);bytes[key.length+1]=254;new DataView(bytes.buffer).setInt32(key.length+2,value,true);return bytes;}
test('first launch selects native Low (index 2), rather than this game’s High (index 0)',()=>{
 assert.deepEqual(applyForestGraphics(null),concat(header,integer('UnityGraphicsQuality',2)));
});
test('saved High is replaced while progress, sound and other record types remain intact',()=>{
 const progress=integer('Level',4),volume=Uint8Array.from([3,86,111,108,253,0,0,0,63]);
 const text=Uint8Array.from([4,83,97,118,101,5,104,101,108,108,111]);
 const longText=concat(Uint8Array.from([3,75,101,121,128,128,0,0,0]),new Uint8Array(128).fill(65));
 const input=concat(header,integer('UnityGraphicsQuality',0),progress,volume,text,longText),before=input.slice();
 const updated=applyForestGraphics(input);
 assert.deepEqual(updated,concat(header,progress,volume,text,longText,integer('UnityGraphicsQuality',2)));
 assert.deepEqual(input,before);assert.deepEqual(applyForestGraphics(updated),updated);
});
test('malformed or future preference formats cannot overwrite a save file',()=>{
 const future=header.slice();new DataView(future.buffer).setUint32(8,0x20000,true);
 for(const bad of [encoder.encode('unknown save'),future,concat(header,Uint8Array.from([5,65])),concat(header,Uint8Array.from([1,65,129]))]){
  const path='/idbfs/forest/PlayerPrefs';let writes=0,errors=0;
  const FS={lookupPath(){return {exists:true};},analyzePath(){return {exists:true};},readFile(){return bad;},mkdirTree(){},writeFile(){writes++;}};
  installForestPreferences(FS,()=>assert.fail('Invalid file should not be changed'),()=>errors++);FS.lookupPath(path);
  assert.equal(errors,1);assert.equal(writes,0);
 }
});
test('the first native read receives Low after hydration and other games remain untouched',()=>{
 const path='/idbfs/forest/PlayerPrefs',other='/idbfs/fish/PlayerPrefs',saved=concat(header,integer('Level',5),integer('UnityGraphicsQuality',0));
 const files=new Map([[path,saved],[other,saved]]);let writes=0,applied=0;
 const FS={lookupPath(p){return {exists:files.has(p)};},analyzePath(p){return this.lookupPath(p);},readFile(p){this.lookupPath(p);return files.get(p);},mkdirTree(){},writeFile(p,bytes){this.lookupPath(p);files.set(p,bytes);writes++;}};
 installForestPreferences(FS,()=>applied++);assert.equal(writes,0);
 FS.lookupPath(path);FS.lookupPath(path);FS.lookupPath(other);
 assert.equal(writes,1);assert.equal(applied,1);assert.deepEqual(files.get(path),applyForestGraphics(saved));assert.equal(files.get(other),saved);
});
test('the actual framework installs the preset before releasing the filesystem startup dependency',()=>{
 const source=readFileSync(new URL('../public/games/trees-hate-you/engine.framework.js',import.meta.url),'utf8');
 const hook=source.match(/Module\.kkeepPreparePreferences\?\.\(FS\);Module\.removeRunDependency\("JS_FileSystem_Mount"\)/g);
 assert.equal(hook?.length,1);
 const calls=[],FS={};vm.runInNewContext(hook[0],{FS,Module:{kkeepPreparePreferences(value){assert.equal(value,FS);calls.push('preferences');},removeRunDependency(name){assert.equal(name,'JS_FileSystem_Mount');calls.push('ready');}}});
 assert.deepEqual(calls,['preferences','ready']);
});
