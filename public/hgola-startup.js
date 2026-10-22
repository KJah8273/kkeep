/* A stuck storage request must never leave Unity's run dependency pending forever. */
export function boundedStorage(IDBFS,Module,schedule=setTimeout,cancel=clearTimeout){
 const original=IDBFS.getDB;
 IDBFS.getDB=(name,callback)=>{
  let settled=false;
  const timer=schedule(()=>finish(Error('Saved progress storage timed out')),12000);
  function finish(error,db){if(settled)return;settled=true;cancel(timer);callback(error,db);}
  try{original(name,finish);}catch(e){finish(e);}
 };
 const sync=IDBFS.syncfs;
 IDBFS.syncfs=(mount,populate,callback)=>{
  let settled=false;
  const timer=schedule(()=>finish(Error('Saved progress synchronization timed out')),20000);
  function finish(error){if(settled)return;settled=true;cancel(timer);if(error&&populate){mount.kkeepStorageReady=false;Module.onPersistentStorageError?.(error);}callback(error);}
  try{sync(mount,populate,finish);}catch(e){finish(e);}
 };
}
