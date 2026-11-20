export const MAX_BYTES=1048576;
export const privateKey=key=>/(?:password|passwd|token|credential|cookie|auth|session|account|login|(?:^|[_:.-])secret(?:$|[_:.-]))/i.test(String(key));
export const cacheDatabase=name=>/cache|downloads|workbox|analytics|firebase|kkeep-profile|kkeep-living/i.test(name);
const base64=bytes=>{let s='';for(let i=0;i<bytes.length;i+=16384)s+=String.fromCharCode(...bytes.subarray(i,i+16384));return btoa(s);};
const unbase64=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
export async function encodeValue(v,depth=0){
 if(depth>40)throw Error('Save nesting is too deep.');
 if(v===undefined)return ['undefined'];
 if(v===null||typeof v==='string'||typeof v==='boolean'||typeof v==='number')return ['scalar',v];
 if(v instanceof Date)return ['date',v.getTime()];
 if(v instanceof ArrayBuffer)return ['bytes','ArrayBuffer',base64(new Uint8Array(v))];
 if(ArrayBuffer.isView(v))return ['bytes',v.constructor.name,base64(new Uint8Array(v.buffer,v.byteOffset,v.byteLength))];
 if(v instanceof Blob){if(v.size>MAX_BYTES)throw Error('Save file is too large.');return ['blob',v.type,base64(new Uint8Array(await v.arrayBuffer()))];}
 if(Array.isArray(v))return ['array',await Promise.all(v.map(item=>encodeValue(item,depth+1)))];
 if(v instanceof Map)return ['map',await Promise.all([...v].map(async([k,value])=>[await encodeValue(k,depth+1),await encodeValue(value,depth+1)]))];
 if(v instanceof Set)return ['set',await Promise.all([...v].map(item=>encodeValue(item,depth+1)))];
 if(typeof v==='object')return ['object',await Promise.all(Object.entries(v).filter(([key])=>!privateKey(key)).map(async([key,value])=>[key,await encodeValue(value,depth+1)]))];
 throw Error('Unsupported game save value.');
}
export function decodeValue(v,depth=0){
 if(!Array.isArray(v)||depth>40)throw Error('Invalid game save.');
 const [type,value,extra]=v;
 if(type==='undefined')return undefined;
 if(type==='scalar'){if(value!==null&&!['string','number','boolean'].includes(typeof value))throw Error('Invalid scalar');return value;}
 if(type==='date')return new Date(value);
 if(type==='array')return value.map(x=>decodeValue(x,depth+1));
 if(type==='object'){const result={};for(const [k,x] of value){if(typeof k!=='string'||privateKey(k))continue;Object.defineProperty(result,k,{value:decodeValue(x,depth+1),writable:true,enumerable:true,configurable:true});}return result;}
 if(type==='map')return new Map(value.map(([k,x])=>[decodeValue(k,depth+1),decodeValue(x,depth+1)]));
 if(type==='set')return new Set(value.map(x=>decodeValue(x,depth+1)));
 if(type==='blob')return new Blob([unbase64(extra)],{type:value});
 if(type==='bytes'){
  const data=unbase64(extra),constructors={Uint8Array,Uint8ClampedArray,Int8Array,Uint16Array,Int16Array,Uint32Array,Int32Array,Float32Array,Float64Array,DataView};
  if(value==='ArrayBuffer')return data.buffer;
  if(!constructors[value])throw Error('Unsupported save data type');
  return new constructors[value](data.buffer);
 }
 throw Error('Unknown game save value.');
}
export function memoryStorage(entries=[],changed=()=>{}){
 const map=new Map(entries.filter(e=>Array.isArray(e)&&e.length===2).map(([k,v])=>[String(k),String(v)]));
 const api={getItem:key=>map.get(String(key))??null,setItem(key,value){map.set(String(key),String(value));changed();},removeItem(key){map.delete(String(key));changed();},clear(){map.clear();changed();},key:index=>[...map.keys()][Number(index)]??null};
 return new Proxy(api,{get(target,key){if(key==='length')return map.size;if(key===Symbol.toStringTag)return 'Storage';if(Object.hasOwn(target,key))return target[key];return map.get(key);},set(_target,key,value){map.set(String(key),String(value));changed();return true;},deleteProperty(_target,key){map.delete(String(key));changed();return true;},ownKeys:()=>[...map.keys()],has:(target,key)=>key in target||map.has(key),getOwnPropertyDescriptor:(_t,key)=>map.has(key)?{enumerable:true,configurable:true,writable:true,value:map.get(key)}:undefined});
}
export const storageEntries=storage=>Object.keys(storage).filter(k=>!privateKey(k)).map(k=>[k,storage.getItem(k)]);
const completed=tx=>new Promise((resolve,reject)=>{tx.addEventListener('complete',resolve,{once:true});tx.addEventListener('abort',()=>reject(tx.error||Error('Save transaction aborted.')),{once:true});tx.addEventListener('error',()=>reject(tx.error||Error('Save transaction failed.')),{once:true});});
export async function exportDatabase(db){
 const stores=[];
 for(const name of db.objectStoreNames){
  if(privateKey(name)||/cache|asset|download/i.test(name))continue;
  const tx=db.transaction(name,'readonly'),store=tx.objectStore(name),done=completed(tx);
  const records=await new Promise((resolve,reject)=>{const rows=[],request=store.openCursor();request.onerror=()=>reject(request.error);request.onsuccess=()=>{const cursor=request.result;if(!cursor){resolve(rows);return;}if(rows.length>8192){reject(Error('Save has too many records.'));return;}if(!privateKey(cursor.key))rows.push([cursor.key,cursor.value]);cursor.continue();};});
  const indexes=Array.from(store.indexNames).map(n=>{const i=store.index(n);return {name:i.name,keyPath:i.keyPath,unique:i.unique,multiEntry:i.multiEntry};});
  const meta={name,keyPath:store.keyPath,autoIncrement:store.autoIncrement,indexes};await done;
  stores.push({...meta,records:await Promise.all(records.map(async([k,v])=>[await encodeValue(k),await encodeValue(v)]))});
 }
 return {name:db.name,version:db.version,stores};
}
export async function restoreDatabases(factory,databases=[]){
 for(const data of databases){
  if(cacheDatabase(data.name))continue;
  const db=await new Promise((resolve,reject)=>{const request=factory.open(data.name,data.version);request.onupgradeneeded=()=>{const db=request.result;for(const s of data.stores){if(privateKey(s.name)||/cache|asset|download/i.test(s.name))continue;const store=db.createObjectStore(s.name,{keyPath:s.keyPath,autoIncrement:s.autoIncrement});for(const index of s.indexes)store.createIndex(index.name,index.keyPath,{unique:index.unique,multiEntry:index.multiEntry});}};request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
  try{for(const s of data.stores){if(!db.objectStoreNames.contains(s.name))continue;const tx=db.transaction(s.name,'readwrite'),done=completed(tx),store=tx.objectStore(s.name);for(const [key,value] of s.records){const decoded=decodeValue(value);if(store.keyPath===null)store.put(decoded,decodeValue(key));else store.put(decoded);}await done;}}finally{db.close();}
 }
}
