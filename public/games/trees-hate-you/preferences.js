// Verified against this pinned game's QualitySettings: High=0, Medium=1, Low=2.
// Unity reads this native preference before activating the render pipeline.
export const FOREST_GRAPHICS = Object.freeze({UnityGraphicsQuality:2});
const encoder=new TextEncoder(),decoder=new TextDecoder();
const VERSION=0x10000,LIMIT=0x100000;
export function applyForestGraphics(bytes){
 let header,records=[];
 if(bytes?.length){
  if(bytes.length<16||decoder.decode(bytes.subarray(0,8))!=='UnityPrf')throw new Error('Unrecognised Unity preferences');
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  if(view.getUint32(8,true)!==VERSION)throw new Error('Unsupported Unity preferences version');
  header=bytes.slice(0,16);let p=16;
  const requireBytes=n=>{if(p+n>bytes.length)throw new Error('Incomplete Unity preferences');};
  while(p<bytes.length){
   const start=p;requireBytes(1);const length=bytes[p++];requireBytes(length+1);
   const key=decoder.decode(bytes.subarray(p,p+length));p+=length;
   const type=bytes[p++];let size;
   if(type===0xfe||type===0xfd)size=4;
   else if(type===0x80){requireBytes(4);size=view.getUint32(p,true);p+=4;}
   else if(type<0x80)size=type;
   else throw new Error('Unsupported Unity preference type');
   requireBytes(size);p+=size;
   if(!Object.hasOwn(FOREST_GRAPHICS,key))records.push(bytes.slice(start,p));
  }
 }else{
  header=new Uint8Array(16);header.set(encoder.encode('UnityPrf'));
  const view=new DataView(header.buffer);view.setUint32(8,VERSION,true);view.setUint32(12,LIMIT,true);
 }
 for(const [key,value] of Object.entries(FOREST_GRAPHICS)){
  const name=encoder.encode(key),record=new Uint8Array(name.length+6);
  record[0]=name.length;record.set(name,1);record[name.length+1]=0xfe;
  new DataView(record.buffer).setInt32(name.length+2,value,true);records.push(record);
 }
 const result=new Uint8Array(16+records.reduce((n,r)=>n+r.length,0));result.set(header);let p=16;
 for(const record of records){result.set(record,p);p+=record.length;}return result;
}

export function installForestPreferences(FS,onApplied=()=>{},onError=console.warn){
 const lookup=FS.lookupPath.bind(FS);let preparing=false,attempted=false;
 FS.lookupPath=function(path,options){
  // Install after IDBFS hydration. Only this game's first native read is changed;
  // later filesystem walks must not change another game's preferences or saves.
  if(!preparing&&!attempted&&typeof path==='string'&&/^\/idbfs\/[^/]+\/PlayerPrefs$/.test(path)){
   preparing=true;attempted=true;
   try{
    const original=FS.analyzePath(path).exists?FS.readFile(path):null;
    const updated=applyForestGraphics(original);
    FS.mkdirTree(path.slice(0,path.lastIndexOf('/')));FS.writeFile(path,updated);onApplied();
   }catch(error){onError(error);}finally{preparing=false;}
  }
  return lookup(path,options);
 };
}
