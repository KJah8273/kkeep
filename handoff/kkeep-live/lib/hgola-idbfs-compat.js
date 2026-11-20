// Protect existing progress when Safari temporarily rejects an IndexedDB read.
export function installHgolaIdbfsGuard(IDBFS,Module,schedule=setTimeout){
 const sync=IDBFS.syncfs;
 IDBFS.syncfs=(mount,populate,callback)=>{
  if(!populate&&!mount.kkeepStorageReady){callback(new Error('Saved progress has not been read; refusing to overwrite it'));return;}
  let attempts=0;
  const run=()=>{
   let completed=false;
   const done=error=>{
    if(completed)return;completed=true;
    if(error&&attempts++<2){
     const db=IDBFS.dbs[mount.mountpoint];try{db?.close();}catch{}
     delete IDBFS.dbs[mount.mountpoint];schedule(run,150*attempts);return;
    }
    if(populate){
     mount.kkeepStorageReady=!error;
     if(error)Module.onPersistentStorageError?.(error);
    }
    callback(error);
   };
   try{sync(mount,populate,done);}catch(error){done(error);}
  };
  run();
 };
}
