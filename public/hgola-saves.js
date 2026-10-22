/* Save files only: never reads cookies, browsing history, or the Unity asset cache. */
const DATABASE='/idbfs',STORE='FILE_DATA',LIMIT=524288;
export function validateSave(v){
 if(!v||v.format!=='kkeep-hgola-save'||v.version!==1||!Array.isArray(v.entries)||v.entries.length>256)throw Error('Invalid game backup');
 const paths=new Set();let files=0;
 for(const e of v.entries){
  if(!e||typeof e.path!=='string'||!e.path.startsWith('/idbfs/')||e.path.length>512||e.path.split('/').some(p=>p==='..'||p==='.')||/[\x00-\x1f\\]/.test(e.path)||paths.has(e.path)||!Number.isInteger(e.mode)||!Number.isFinite(e.time)||e.time<0)throw Error('Invalid save file');
  paths.add(e.path);const type=e.mode&61440;
  if(type===32768){if(typeof e.data!=='string'||e.data.length>LIMIT||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(e.data))throw Error('Invalid save data');files++;}
  else if(type!==16384||e.data!==undefined)throw Error('Unsupported save entry');
 }
 if(!files||JSON.stringify(v).length>LIMIT)throw Error('Empty or oversized game backup');
 return v;
}
function open(create=false){return new Promise((resolve,reject)=>{
 let request;try{request=indexedDB.open(DATABASE,create?21:undefined);}catch(e){reject(e);return;}
 let missing=false,expired=false;const timeout=setTimeout(()=>{expired=true;reject(Error('Save storage timed out'));},12000);
 request.onupgradeneeded=()=>{if(!create){missing=true;request.transaction.abort();return;}const db=request.result;if(!db.objectStoreNames.contains(STORE)){const store=db.createObjectStore(STORE);store.createIndex('timestamp','timestamp',{unique:false});}};
 request.onerror=()=>{clearTimeout(timeout);missing?resolve(null):reject(request.error);};
 request.onblocked=()=>{clearTimeout(timeout);reject(Error('Close other game windows before restoring'));};
 request.onsuccess=()=>{clearTimeout(timeout);if(expired){request.result.close();return;}resolve(request.result);};
});}
const encode=bytes=>{let s='';for(let i=0;i<bytes.length;i+=8192)s+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(s);};
export async function readLocal(){
 const db=await open();if(!db)return null;
 try{return await new Promise((resolve,reject)=>{
  if(!db.objectStoreNames.contains(STORE)){resolve(null);return;}
  const tx=db.transaction(STORE,'readonly'),entries=[];const req=tx.objectStore(STORE).openCursor();
  req.onsuccess=()=>{const cursor=req.result;if(!cursor)return;const e=cursor.value,path=String(cursor.key);if(path.startsWith('/idbfs/')){const entry={path,mode:e.mode,time:new Date(e.timestamp).getTime()};if((e.mode&61440)===32768)entry.data=encode(new Uint8Array(e.contents));entries.push(entry);}cursor.continue();};
  tx.oncomplete=()=>{entries.sort((a,b)=>a.path.localeCompare(b.path));if(!entries.some(e=>(e.mode&61440)===32768)){resolve(null);return;}try{resolve(validateSave({format:'kkeep-hgola-save',version:1,entries}));}catch(e){reject(e);}};
  tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('Save read interrupted'));
 });}finally{db.close();}
}
export async function restoreEmpty(save){
 validateSave(save);const db=await open(true);
 try{return await new Promise((resolve,reject)=>{
  const tx=db.transaction(STORE,'readwrite'),store=tx.objectStore(STORE);let restored=false;
  const req=store.getAll();req.onsuccess=()=>{if(req.result.some(e=>(e.mode&61440)===32768))return;
   for(const e of save.entries){const entry={mode:e.mode,timestamp:new Date(e.time)};if(e.data!==undefined)entry.contents=Uint8Array.from(atob(e.data),c=>c.charCodeAt(0));store.put(entry,e.path);}restored=true;
  };
  tx.oncomplete=()=>resolve(restored);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('Restore interrupted'));
 });}finally{db.close();}
}
export async function getBackup(){
 const r=await fetch('/api/hgola-save',{headers:{'X-Kkeep-Hgola':'1'},credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(8000)});
 if(!r.ok)throw Error('Online backup is unavailable');const data=await r.json();if(data.save)validateSave(data.save);return data;
}
export async function prepareBackup(report=()=>{}){
 let revision=0,last='',enabled=false,stopped=false,busy=false,timer;
 // Start the network request while the game assets load, not after them.
 const remote=getBackup().catch(()=>null);
 try{
  const local=await readLocal();
  const connect=async()=>{const cloud=await remote;
   if(cloud){
    let bound;try{bound=localStorage.getItem('kkeep-hgola-owner');}catch{}
    if(cloud.scope&&bound&&bound!==cloud.scope&&local&&cloud.save&&JSON.stringify(local)!==JSON.stringify(cloud.save)){report('account-conflict');return;}
    if(cloud.scope)try{localStorage.setItem('kkeep-hgola-owner',cloud.scope);}catch{}
    revision=cloud.revision;if(!local&&cloud.save)await restoreEmpty(cloud.save);last=JSON.stringify(cloud.save);enabled=true;report(cloud.save?'backup-ready':'local-ready');}
   else report('local-only');
  };
  // Existing players can start immediately from their local progress. Only an
  // empty installation waits for recovery, before Unity opens its filesystem.
  if(local)void connect().catch(()=>report('local-only'));else await connect();
 }catch{report('storage-unavailable');}
 async function save(){
  if(!enabled||stopped||busy)return;busy=true;
  try{
   const snapshot=await readLocal();if(!snapshot)return;const json=JSON.stringify(snapshot);if(json===last)return;
   const r=await fetch('/api/hgola-save',{method:'POST',headers:{'Content-Type':'application/json','X-Kkeep-Hgola':'1'},credentials:'same-origin',cache:'no-store',body:JSON.stringify({save:snapshot,revision}),signal:AbortSignal.timeout(10000)});
   if(r.status===409){enabled=false;report('newer-save');return;}if(!r.ok)throw Error('Backup failed');const result=await r.json();revision=result.revision;last=json;report('backed-up');
  }catch{report('local-only');}finally{busy=false;}
 }
 const hidden=()=>{if(document.visibilityState==='hidden')void save();};
 return {start(){void save();timer=setInterval(()=>{if(document.visibilityState!=='hidden')void save();},20000);document.addEventListener('visibilitychange',hidden);},save,stop(){stopped=true;clearInterval(timer);document.removeEventListener('visibilitychange',hidden);}};
}
export function downloadBackup(save){
 validateSave(save);const url=URL.createObjectURL(new Blob([JSON.stringify(save)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='kkeep-hgola-save.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
