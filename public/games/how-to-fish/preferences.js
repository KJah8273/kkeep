// These are the exact PlayerPrefs keys in the pinned HowToFishPort build.
export const FISH_GRAPHICS = Object.freeze({AmbientOcclusion:0,Decorations:0,Decals:0,ShadowQuality:0});
const encoder=new TextEncoder(),decoder=new TextDecoder();
// Verified in this build's native reader/writer: format version 0x10000,
// followed by the preference size limit (1 MiB), both little-endian uint32.
const PREFS_VERSION=0x10000,PREFS_LIMIT=0x100000;
function newHeader(){const header=new Uint8Array(16);header.set(encoder.encode('UnityPrf'));const view=new DataView(header.buffer);view.setUint32(8,PREFS_VERSION,true);view.setUint32(12,PREFS_LIMIT,true);return header;}

// Keep unknown preferences byte-for-byte, including saves, key bindings, floats
// and long strings. Never replace an unrecognised or truncated preference file.
export function applyFishGraphics(bytes) {
 let header,records=[];
 if(bytes?.length){
  if(bytes.length<16||decoder.decode(bytes.subarray(0,8))!=='UnityPrf')throw new Error('Unrecognised Unity preferences');
  header=bytes.slice(0,16);const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let p=16;
  const version=view.getUint32(8,true),limit=view.getUint32(12,true);
  // Repair the header produced by Kkeep's previous preset without dropping
  // any other settings. Native Unity rejects that old version=1/limit=0 pair.
  if(version===1&&limit===0)header=newHeader();
  else if(version!==PREFS_VERSION)throw new Error('Unsupported Unity preferences version');
  const requireBytes=n=>{if(p+n>bytes.length)throw new Error('Incomplete Unity preferences');};
  while(p<bytes.length){
   const start=p;requireBytes(1);const length=bytes[p++];requireBytes(length+1);
   const key=decoder.decode(bytes.subarray(p,p+length));p+=length;const type=bytes[p++];let size;
   if(type===0xfe||type===0xfd)size=4;
   else if(type===0x80){requireBytes(4);size=view.getUint32(p,true);p+=4;}
   else if(type<0x80)size=type;
   else throw new Error('Unsupported Unity preference type');
   requireBytes(size);p+=size;
   if(!Object.hasOwn(FISH_GRAPHICS,key))records.push(bytes.slice(start,p));
  }
 }else{
  header=newHeader();
 }
 for(const [key,value] of Object.entries(FISH_GRAPHICS)){
  const name=encoder.encode(key),record=new Uint8Array(name.length+6);record[0]=name.length;record.set(name,1);record[name.length+1]=0xfe;
  new DataView(record.buffer).setInt32(name.length+2,value,true);records.push(record);
 }
 const result=new Uint8Array(16+records.reduce((n,r)=>n+r.length,0));result.set(header);let p=16;
 for(const record of records){result.set(record,p);p+=record.length;}return result;
}

export function installFishPreferences(FS,onApplied=()=>{},onError=console.warn) {
 const lookup=FS.lookupPath.bind(FS);let preparing=false,attempted=false;
 FS.lookupPath=function(path,options){
  // Unity selects its own URL-based persistent directory. Intercept its first
  // access after IndexedDB hydration, before native PlayerPrefs reads the file.
  if(!preparing&&!attempted&&typeof path==='string'&&/^\/idbfs\/[^/]+\/PlayerPrefs$/.test(path)){
   // Later persistence walks may inspect other games in the shared IDBFS mount.
   // Only the first native preference access belongs to this game's startup.
   preparing=true;attempted=true;
   try{
    const exists=!!FS.analyzePath(path).exists;
    const original=exists?FS.readFile(path):null;
    const updated=applyFishGraphics(original);
    FS.mkdirTree(path.slice(0,path.lastIndexOf('/')));FS.writeFile(path,updated);
    onApplied();
   }catch(error){onError(error);}finally{preparing=false;}
  }
  return lookup(path,options);
 };
}

export function prepareFishFramework(source) {
 const marker='Module.removeRunDependency("JS_FileSystem_Mount")';
 if(source.split(marker).length!==2)throw new Error('The fishing engine changed. Reload to get the matching game files.');
 return source.replace(marker,'Module.kkeepPreparePreferences?.(FS);'+marker);
}
