import * as idb from 'fake-indexeddb';
import {installGamepadCompatibility,installIsolatedWorkerCompatibility} from './gamepad-compat.mjs';
import {runtimeAssetUrl} from './runtime-asset-url.mjs';
import {memoryStorage,storageEntries,exportDatabase,restoreDatabases,cacheDatabase,MAX_BYTES} from './save-codec.mjs';

const host=location.origin,frameParent=parent;
document.querySelector('[role=status]').textContent='Connecting game saves…';
let port,started=false,reporting=false,dirty=false,last='',databases=new Map(),timer;
const factory=new idb.IDBFactory();
// Each opaque game frame gets its own storage. It never receives Profile cookies.
for(const [name,value] of Object.entries(idb)){if(name.startsWith('IDB'))Object.defineProperty(window,name,{value,configurable:true});}
Object.defineProperty(window,'indexedDB',{value:factory,configurable:true});
const notify=()=>{dirty=true;if(!timer)timer=setTimeout(()=>{timer=null;void report();},200);};
const local=memoryStorage([],notify),session=memoryStorage();
Object.defineProperty(window,'localStorage',{value:local,configurable:true});
Object.defineProperty(window,'sessionStorage',{value:session,configurable:true});
let cookies='';try{Object.defineProperty(Document.prototype,'cookie',{get:()=>cookies,set:v=>{cookies=String(v);},configurable:true});}catch{}
const originalOpen=factory.open.bind(factory);
factory.open=function(name,version){
 const request=originalOpen(String(name),version);
 if(cacheDatabase(String(name)))request.addEventListener('upgradeneeded',()=>request.transaction.abort());
 request.addEventListener('success',()=>{
  const db=request.result;if(cacheDatabase(db.name))return;
  databases.set(db.name,db);const transaction=db.transaction.bind(db);
  db.transaction=function(...args){const tx=transaction(...args);if(tx.mode==='readwrite')tx.addEventListener('complete',notify,{once:true});return tx;};
 });return request;
};
async function report(){
 if(!started||!port||!dirty||reporting)return;reporting=true;
 window.dispatchEvent(new Event('kkeep-before-save'));
 dirty=false;
 try{
  const data=[];
  for(const [name,previous] of databases){
   let db=previous;try{data.push(await exportDatabase(db));}catch{
    db=await new Promise((resolve,reject)=>{const request=originalOpen(name);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
    try{data.push(await exportDatabase(db));}finally{db.close();}
   }
  }
  const save={version:1,local:storageEntries(local),databases:data},json=JSON.stringify(save);
  if(json.length>MAX_BYTES)throw Error('Progress is too large for online backup.');
  if(json!==last){last=json;port.postMessage({type:'save',save});}
 }catch(error){port.postMessage({type:'error',message:error.message});}
 finally{reporting=false;if(dirty)notify();}
}
function routeAssets(config){
 const map=value=>runtimeAssetUrl(value,document.baseURI,host,config);
 const fetchOriginal=window.fetch.bind(window);
 window.fetch=(input,options)=>{
  if(input instanceof Request){const url=map(input);return fetchOriginal(url===input.url?input:new Request(url,input),options);}
  return fetchOriginal(map(input),options);
 };
 const open=XMLHttpRequest.prototype.open;
 XMLHttpRequest.prototype.open=function(method,url,...args){return open.call(this,method,map(String(url)),...args);};
 for(const [prototype,property] of [[HTMLImageElement.prototype,'src'],[HTMLScriptElement.prototype,'src'],[HTMLLinkElement.prototype,'href']]){
  const descriptor=Object.getOwnPropertyDescriptor(prototype,property);if(!descriptor?.set)continue;
  Object.defineProperty(prototype,property,{...descriptor,set(value){if(this instanceof HTMLImageElement)this.crossOrigin='anonymous';descriptor.set.call(this,map(String(value)));}});
 }
}
function watchStartup(mode){
 if(!mode)return;
 let observer;
 const ready=()=>{
  observer?.disconnect();
  window.removeEventListener('kkeep-engine-ready',ready);
  port.postMessage({type:'engine-ready'});
 };
 window.addEventListener('kkeep-engine-ready',ready,{once:true});
 window.addEventListener('kkeep-engine-failed',event=>{
  event.preventDefault();
  port.postMessage({type:'error',fatal:true,message:event.detail});
 });
 if(mode==='moto'){
  // The engine itself hides #loader once the menu textures are ready.
  observer=new MutationObserver(()=>{
   if(document.getElementById('loader')?.style.display==='none'&&document.querySelector('#content canvas'))ready();
  });
  observer.observe(document,{subtree:true,childList:true,attributes:true,attributeFilter:['style']});
 }
}
async function boot(config){
 try{
  installGamepadCompatibility(navigator);
  installIsolatedWorkerCompatibility(navigator);
  await restoreDatabases(factory,config.save?.databases);
  for(const [key,value] of config.save?.local||[])local.setItem(key,value);
  // Include restored databases even if the game has not opened them again yet.
  for(const d of config.save?.databases||[]){if(!cacheDatabase(d.name))await new Promise((resolve,reject)=>{const request=factory.open(d.name,d.version);request.onsuccess=()=>resolve();request.onerror=()=>reject(request.error);});}
  routeAssets(config);last=JSON.stringify(config.save||{version:1,local:[],databases:[]});dirty=false;
  document.open();
  watchStartup(config.startup);
  document.write(config.html);
  document.close();
  started=true;
  port.onmessage=event=>{if(event.data?.type==='flush'){dirty=true;void report().finally(()=>port.postMessage({type:'flushed'}));}else if(event.data?.type==='setting')window.dispatchEvent(new MessageEvent('message',{data:{channel:'kkeep-arcade-player',type:event.data.setting,value:event.data.value},origin:host,source:frameParent}));};
  window.addEventListener('pagehide',()=>{dirty=true;void report();});document.addEventListener('visibilitychange',()=>{if(document.hidden){dirty=true;void report();}});
  port.postMessage({type:'started'});notify();
 }catch(error){port.postMessage({type:'error',fatal:true,message:'Could not restore this game: '+error.message});}
}
window.addEventListener('message',function connect(event){
 if(event.source!==frameParent||event.origin!==host||event.data?.channel!=='kkeep-game-init'||!event.ports[0]||port)return;
 port=event.ports[0];port.onmessage=e=>{if(e.data?.type==='start')void boot(e.data);};port.start();port.postMessage({type:'connected'});
});
function announce(){if(!port)frameParent.postMessage({channel:'kkeep-game-ready'},host);}
announce();const handshake=setInterval(()=>{if(port)clearInterval(handshake);else announce();},250);
