// Validated, resumable game files. Three requests share one pool on every device.
const streamSignals=new WeakMap();
export class GameDownloads {
  constructor({repo,revision,cacheKey,packed={},concurrency=3,lookahead=2,onProgress=()=>{},fetcher=globalThis.fetch.bind(globalThis)}) {
    Object.assign(this,{repo,revision,cacheKey,packed,onProgress,fetcher});
    this.completed=new Set();this.bytes=0;this.networkBytes=0;this.cacheBytes=0;this.database=null;this.pending=new Map();this.partial=new Map();this.abort=new AbortController();
    this.limit=Math.max(1,Math.min(3,concurrency));this.active=0;this.waiters=[];this.lastProgress=0;
    this.lookahead=Math.max(1,Math.min(3,lookahead));
  }
  sources(path) {
    const compressed=this.packed[path];
    return [
      ...(compressed&&typeof DecompressionStream!=='undefined'?[{...compressed,encoding:'gzip'}]:[]),
      ...(compressed?.rawUrl?[{url:compressed.rawUrl}]:[]),
      {url:`https://raw.githubusercontent.com/${this.repo}/${this.revision}/${path}`},
      {url:`https://cdn.jsdelivr.net/gh/${this.repo}@${this.revision}/${path}`},
    ];
  }
  progress(path,retrying=false,force=false){
    const now=Date.now();if(!force&&!retrying&&now-this.lastProgress<100)return;this.lastProgress=now;
    this.onProgress({bytes:this.bytes,loadedBytes:this.bytes+[...this.partial.values()].reduce((a,b)=>a+b,0),networkBytes:this.networkBytes,cacheBytes:this.cacheBytes,path,retrying});
  }
  async slot(){if(this.active>=this.limit)await new Promise(resolve=>this.waiters.push(resolve));else this.active++;}
  release(){const next=this.waiters.shift();if(next)next();else this.active--;}
  async db() {
    if(this.database)return this.database;
    this.database=new Promise(resolve=>{
      if(typeof indexedDB==='undefined'){resolve(null);return;}
      let done=false;const finish=value=>{if(done){value?.close();return;}done=true;clearTimeout(timer);resolve(value);};
      const timer=setTimeout(()=>finish(null),2500);
      try{const request=indexedDB.open('kkeep-game-downloads-v2',1);request.onupgradeneeded=()=>request.result.createObjectStore('parts');request.onsuccess=()=>finish(request.result);request.onerror=request.onblocked=()=>finish(null);}catch{finish(null);}
    });return this.database;
  }
  async cache(path,blob) {
    const db=await this.db();if(!db)return;
    return new Promise(resolve=>{
      let done=false;const finish=value=>{if(done)return;done=true;clearTimeout(timer);resolve(value);};const timer=setTimeout(()=>finish(),2500);
      try{const tx=db.transaction('parts',blob?'readwrite':'readonly');const store=tx.objectStore('parts'),key=`${this.cacheKey}:${this.revision}:${path}`;const req=blob?store.put(blob,key):store.get(key);let value;req.onsuccess=()=>{value=req.result;};tx.oncomplete=()=>finish(value);tx.onerror=tx.onabort=()=>finish();}catch{finish();}
    });
  }
  async file(path,size,type='application/octet-stream') {
    if(this.pending.has(path))return this.pending.get(path);
    const task=this.read(path,size,type);this.pending.set(path,task);
    try{return await task;}finally{this.pending.delete(path);}
  }
  async transfer(source,path,size,type){
    const controller=new AbortController();let timer,received=0;
    const renew=()=>{clearTimeout(timer);timer=setTimeout(()=>controller.abort(new Error('The download stalled')),15000);};
    const cancel=()=>controller.abort(this.abort.signal.reason);this.abort.signal.addEventListener('abort',cancel,{once:true});renew();
    try{
      const response=await this.fetcher(source.url,{signal:controller.signal,credentials:'omit',cache:'default'});
      if(!response.ok)throw new Error(`HTTP ${response.status}`);
      if(/text\/html/i.test(response.headers.get('content-type')||''))throw new Error('The download returned a web page');
      let body=response.body;
      if(body){
        body=body.pipeThrough(new TransformStream({transform:(chunk,output)=>{renew();received+=chunk.byteLength;this.networkBytes+=chunk.byteLength;this.partial.set(path,Math.min(size,received/(source.bytes||size)*size));this.progress(path);output.enqueue(chunk);}}));
        if(source.encoding==='gzip')body=body.pipeThrough(new DecompressionStream('gzip'));
      }
      const result=body?await new Response(body).blob():await response.blob();
      if(result.size!==size)throw new Error(`Incomplete download (${result.size} of ${size} bytes)`);
      return result.slice(0,size,type);
    }finally{clearTimeout(timer);this.abort.signal.removeEventListener('abort',cancel);this.partial.delete(path);}
  }
  async read(path,size,type) {
    this.abort.signal.throwIfAborted();let blob=await this.cache(path);
    if(blob instanceof Blob&&blob.size===size){if(!this.completed.has(path))this.cacheBytes+=size;}
    else{
      blob=null;let lastError;const sources=this.sources(path);
      await this.slot();
      try{
        for(let attempt=0;attempt<4;attempt++){
          this.abort.signal.throwIfAborted();
          try{blob=await this.transfer(sources[attempt%sources.length],path,size,type);break;}
          catch(error){lastError=error;this.abort.signal.throwIfAborted();this.progress(path,true,true);}
        }
      }finally{this.release();}
      if(!blob)throw new Error(`Could not download ${path.split('/').pop()}. ${lastError?.message||'Please retry.'}`);
      await this.cache(path,blob);
    }
    if(!this.completed.has(path)){this.completed.add(path);this.bytes+=size;}
    this.progress(path,false,true);return blob;
  }
  async combine(parts,type) {
    // Promise order preserves the original bytes; the shared pool caps network use.
    const blobs=await Promise.all(parts.map(([path,size])=>this.file(path,size,type)));
    return new Blob(blobs,{type});
  }
  stream(parts,type='application/octet-stream',signal) {
    const store=this;let index=0,reader=null,cancelled=false;const ready=new Map();
    const total=parts.reduce((n,part)=>n+part[1],0);
    function ahead(){for(let i=index;i<Math.min(parts.length,index+store.lookahead);i++)if(!ready.has(i)){const [path,size]=parts[i];ready.set(i,store.file(path,size,type).then(blob=>({blob}),error=>({error})));}}
    const stream=new ReadableStream({
      async pull(controller){
        try{
          signal?.throwIfAborted();
          while(!cancelled){
            if(!reader){if(index===parts.length){controller.close();return;}ahead();const result=await ready.get(index);ready.delete(index++);if(result.error)throw result.error;if(cancelled)return;reader=result.blob.stream().getReader();ahead();}
            const value=await reader.read();if(cancelled)return;signal?.throwIfAborted();
            if(value.done){reader.releaseLock();reader=null;continue;}controller.enqueue(value.value);return;
          }
        }catch(error){controller.error(error);}
      },cancel(){cancelled=true;ready.clear();return reader?.cancel();},
    });
    const response=new Response(stream,{headers:{'Content-Type':type,'Content-Length':String(total),'Cache-Control':'no-store'}});
    if(signal)streamSignals.set(response,signal);
    return response;
  }
}

// The streaming DownloadHandler has already consumed the bytes in WASM.
export function installUnityStreaming(module,{chunkSize=65536,yieldBytes=1048576,yieldMs=8,yieldTask=()=>new Promise(resolve=>setTimeout(resolve,0)),now=()=>performance.now()}={}) {
  const original=module.readBodyWithProgress;if(typeof original!=='function')return;
  module.readBodyWithProgress=async function(response,onProgress,streaming){
    if(!streaming||!response.body)return original.call(module,response,onProgress,streaming);
    const reader=response.body.getReader(),signal=streamSignals.get(response),encoding=response.headers.get('Content-Encoding');
    // Fetch decodes HTTP gzip/br itself; that Content-Length describes encoded
    // bytes. Only an identity response has an exact length to validate.
    const total=encoding&&encoding!=='identity'?0:Number(response.headers.get('Content-Length'))||0;
    let loaded=0,sinceYield=0,lastYield=now();
    try{
      for(;;){
        const {done,value}=await reader.read();if(done)break;
        // Safari can return a whole cached Blob part in one read. Bound Unity's
        // temporary WASM allocation, and let its main loop drain queued work.
        // A resolved read() Promise alone only yields to other microtasks.
        for(let offset=0;offset<value.byteLength;offset+=chunkSize){
          signal?.throwIfAborted();
          const chunk=value.subarray(offset,Math.min(offset+chunkSize,value.byteLength));
          loaded+=chunk.byteLength;sinceYield+=chunk.byteLength;
          onProgress({type:'progress',response,total:Math.max(total,loaded),loaded,lengthComputable:true,chunk});
          if(sinceYield>=yieldBytes||now()-lastYield>=yieldMs){await yieldTask();sinceYield=0;lastYield=now();}
        }
      }
      if(total&&loaded!==total)throw new Error(`Incomplete game stream (${loaded} of ${total} bytes)`);
      onProgress({type:'load',response,total:loaded,loaded,lengthComputable:true,chunk:null});response.parsedBody={length:loaded};return response;
    }catch(error){await reader.cancel().catch(()=>{});throw error;}finally{reader.releaseLock();}
  };
}
