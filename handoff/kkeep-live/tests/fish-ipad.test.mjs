import test from 'node:test';
import assert from 'node:assert/strict';
import {applyFishGraphics,installFishPreferences,prepareFishFramework,FISH_GRAPHICS} from '../public/games/how-to-fish/preferences.js';
import {actions,FingerLook} from '../public/games/how-to-fish/control-model.js';
import {TouchInput} from '../public/games/touch-input.js';

const enc=new TextEncoder();
// Header layout verified against the pinned engine's native writer.
const header=Uint8Array.from([85,110,105,116,121,80,114,102,0,0,1,0,0,0,16,0]);
function concat(...arrays){const out=new Uint8Array(arrays.reduce((n,a)=>n+a.length,0));let p=0;for(const a of arrays){out.set(a,p);p+=a.length;}return out;}
function int(key,value){const out=new Uint8Array(key.length+6);out[0]=key.length;out.set(enc.encode(key),1);out[key.length+1]=254;new DataView(out.buffer).setInt32(key.length+2,value,true);return out;}
test('the preset replaces only the four graphics values, preserving unrelated save bytes',()=>{
 const save=Uint8Array.from([4,83,97,118,101,5,104,101,108,108,111]);
 const float=Uint8Array.from([3,86,111,108,253,0,0,0,63]);
 const longString=concat(Uint8Array.from([3,75,101,121,128,128,0,0,0]),new Uint8Array(128).fill(65));
 const original=concat(header,int('AmbientOcclusion',1),save,int('ShadowQuality',2),float,longString,int('Decals',1),int('Decorations',1));
 const patched=applyFishGraphics(original);
 const expected=concat(header,save,float,longString,...Object.entries(FISH_GRAPHICS).map(([k,v])=>int(k,v)));
 assert.deepEqual(patched,expected);assert.deepEqual(applyFishGraphics(patched),patched);
 assert.equal(new TextDecoder().decode(original.subarray(0,8)),'UnityPrf');
});
test('a first launch receives a complete Unity preference file',()=>{
 assert.deepEqual(applyFishGraphics(null),concat(header,int('AmbientOcclusion',0),int('Decorations',0),int('Decals',0),int('ShadowQuality',0)));
});
test('the previous invalid Kkeep header is migrated while preserving unrelated preferences',()=>{
 const legacy=Uint8Array.from([85,110,105,116,121,80,114,102,1,0,0,0,0,0,0,0]);
 const original=concat(legacy,int('SaveSlot',3),int('ShadowQuality',2));
 assert.deepEqual(applyFishGraphics(original),concat(header,int('SaveSlot',3),...Object.entries(FISH_GRAPHICS).map(([k,v])=>int(k,v))));
});
test('unknown or truncated saved files are rejected instead of destroying saves',()=>{
 assert.throws(()=>applyFishGraphics(enc.encode('other saved data')));
 assert.throws(()=>applyFishGraphics(concat(header,Uint8Array.from([4,65]))));
 assert.throws(()=>applyFishGraphics(concat(header,Uint8Array.from([1,65,129]))));
 const future=header.slice();new DataView(future.buffer).setUint32(8,0x20000,true);
 assert.throws(()=>applyFishGraphics(future),/Unsupported Unity preferences version/);
});
test('preset is applied after hydration at the game’s first preference lookup, once per launch',()=>{
 const path='/idbfs/game-hash/PlayerPrefs';const original=concat(header,int('UnrelatedProgress',42),int('Decals',1));
 const files=new Map([[path,original],['/idbfs/other-game/PlayerPrefs',original]]);let applied=0,writes=0;
 const FS={lookupPath(p){return {exists:files.has(p)};},analyzePath(p){return this.lookupPath(p);},readFile(p){this.lookupPath(p);return files.get(p);},mkdirTree(){},writeFile(p,b){this.lookupPath(p);writes++;files.set(p,b);}};
 installFishPreferences(FS,()=>applied++);
 assert.equal(writes,0);FS.lookupPath(path);assert.equal(writes,1);assert.equal(applied,1);
 assert.deepEqual(files.get(path),applyFishGraphics(original));assert.equal(files.get('/idbfs/other-game/PlayerPrefs'),original);
 FS.lookupPath(path);FS.lookupPath('/idbfs/other-game/PlayerPrefs');assert.equal(writes,1);assert.equal(files.get('/idbfs/other-game/PlayerPrefs'),original);
});
test('the framework hook runs before Unity removes the filesystem startup dependency',()=>{
 const source='function hydrated(){Module.removeRunDependency("JS_FileSystem_Mount")}';
 assert.equal(prepareFishFramework(source),'function hydrated(){Module.kkeepPreparePreferences?.(FS);Module.removeRunDependency("JS_FileSystem_Mount")}');
 assert.throws(()=>prepareFishFramework('changed engine'));
});
test('fishing controls match the actual keyboard action map, including Q throw and B bait',()=>{
 const codes=Object.fromEntries(actions.map(a=>[a.id,a.code]));
 assert.equal(codes.throw,'KeyQ');assert.equal(codes.cast,'Mouse2');assert.equal(codes.reel,'Mouse0');assert.equal(codes.bait,'KeyB');assert.equal(codes.hands,'KeyX');assert.equal(codes.crouch,'ControlLeft');
});
class InputEvent{constructor(type,options){this.type=type;Object.assign(this,options);}}
function setup(){const events=[];const canvas={dispatchEvent(e){events.push(e);},getBoundingClientRect(){return{left:10,top:20,width:1000,height:600};}};return{events,input:new TouchInput(canvas,{KeyboardEvent:InputEvent,MouseEvent:InputEvent})};}
test('moving, running, holding throw and aiming remain independent across fingers',()=>{
 const {input,events}=setup();const look=new FingerLook((x,y)=>input.look(x,y));
 input.set('stick',['KeyW']);input.set('run',['ShiftLeft']);input.set('throw',['KeyQ']);look.start(2,700,300);look.move(2,730,290);
 assert.equal(events.at(-1).movementX,30);assert.equal(events.at(-1).movementY,-10);assert.equal(events.at(-1).shiftKey,true);
 input.release('throw');look.end(2);assert(input.keys.has('KeyW'));assert(input.keys.has('ShiftLeft'));
 assert.equal(events.filter(e=>e.type==='keyup').length,1);input.reset();assert.equal(input.keys.size,0);
});
test('long camera drags leave mouse clicks inside the canvas',()=>{
 const {input,events}=setup();for(let n=0;n<200;n++)input.look(60,-50);input.set('rod',['Mouse2']);
 assert.equal(events.at(-1).clientX,510);assert.equal(events.at(-1).clientY,320);assert.equal(events.at(-1).button,2);
});
test('camera ownership transfers without a jump and cancellation resets positions',()=>{
 const deltas=[];const look=new FingerLook((x,y)=>deltas.push([x,y]));look.start(11,10,10);look.start(22,800,200);look.move(22,900,250);look.move(11,15,10);look.end(11);look.move(22,904,252);look.reset();look.move(22,1000,300);
 assert.deepEqual(deltas,[[5,0],[4,2]]);
});
test('a quick throw tap lasts across a frame and reset cancels deferred input',async()=>{
 const {input,events}=setup();input.set('throw',['KeyQ']);input.release('throw',50);assert(input.keys.has('KeyQ'));
 await new Promise(resolve=>setTimeout(resolve,70));assert(!input.keys.has('KeyQ'));assert.equal(events.at(-1).type,'keyup');
 input.set('jump',['Space']);input.release('jump',50);input.reset();const count=events.length;await new Promise(resolve=>setTimeout(resolve,70));assert.equal(events.length,count);assert.equal(input.pending.size,0);
});
