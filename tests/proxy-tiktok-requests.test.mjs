import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

globalThis.self=globalThis;
await import('../public/engine/scramjet.js');
const sj=globalThis.$scramjet;
sj.setWasm(readFileSync(new URL('../public/engine/scramjet.wasm',import.meta.url)));

async function browser(){
  let handler,metadata,status=206,body='video bytes';const warnings=[];
  const ready={state:'activated',scriptURL:'https://proxy.example/proxy-sw.js?v=8'};
  const prefix=new URL('https://proxy.example/browse/test/');
  const jar=new sj.CookieJar();
  const context={config:sj.defaultConfig,prefix,cookieJar:jar,interface:{codecEncode:encodeURIComponent,codecDecode:decodeURIComponent,getInjectScripts:()=>[]}};
  class Controller{
    frames=[];
    constructor(options){this.transport=options.transport;}
    wait(){return Promise.resolve();}
    createFrame(){
      handler=new sj.ScramjetFetchHandler({context,transport:this.transport,sendSetCookie:async()=>{},fetchBlobUrl:async()=>{},fetchDataUrl:async()=>{}});
      const frame={hooks:{fetch:handler.hooks.fetch,error:sj.Tap.create(),init:sj.Tap.create()},go(){}};
      this.frames.push(frame);return frame;
    }
  }
  const runtime=vm.createContext({window:{addEventListener(){},removeEventListener(){}},navigator:{userAgent:'Test Safari',language:'en-AE',serviceWorker:{controller:ready,register:async()=>({active:ready})}},document:{createElement:()=>({setAttribute(){},addEventListener(){},remove(){}})},$scramjetController:{Controller},$scramjet:sj,Headers,URL,TextEncoder,TextDecoder,Uint8Array,ArrayBuffer,ReadableStream,TransformStream,Blob,Map,Set,Promise,setTimeout,clearTimeout,btoa,atob,fetch:async(_url,init)=>{metadata=JSON.parse(atob(init.headers['X-Kha-Meta']));return new Response(body,{headers:{'X-Kha-Response':btoa(JSON.stringify({status,statusText:'',headers:[['content-type','application/octet-stream']]}))}});}});
  runtime.location=new URL('https://proxy.example/');
  vm.runInContext(readFileSync(new URL('../public/engine/kha-runtime.js',import.meta.url),'utf8'),runtime);
  const handle=await runtime.window.KHAProxy.mount({appendChild(){}},{onNavigate(){},onWarning:s=>warnings.push(s),onError(){}});
  handle.go('https://www.tiktok.com/');
  return {jar,handle,warnings,setResponse(s,b){status=s;body=b;},get metadata(){return metadata;},async request(url,dest='video',mode='no-cors',initial=[]){
    const client=new URL(prefix.href+encodeURIComponent('https://www.tiktok.com/foryou'));
    return handler.handleFetch({rawUrl:new URL(prefix.href+encodeURIComponent(url)),rawClientUrl:client,rawReferrer:client.href,rawDestination:dest,mode,referrer:client.href,method:'GET',body:null,cache:'no-store',clientId:'test',initialHeaders:sj.ScramjetHeaders.fromRawHeaders(initial)});
  }};
}

test('TikTok media keeps signed URLs, Range and domain-scoped cookies without a spurious no-CORS Origin',async()=>{
  const b=await browser();
  try{
    b.jar.setCookies('session=own; Domain=.tiktok.com; Path=/; Secure; HttpOnly; SameSite=Lax',new URL('https://www.tiktok.com/'));
    b.jar.setCookies('other=private; Path=/',new URL('https://other.example/'));
    const url='https://v16-webapp-prime.tiktok.com/video/tos/example/?token=signed%2Bvalue&expires=123';
    const response=await b.request(url,'video','no-cors',[['Range','bytes=0-1023']]);
    const h=new Headers(b.metadata.headers);
    assert.equal(b.metadata.url,url);assert.equal(h.get('range'),'bytes=0-1023');
    assert.equal(h.get('origin'),null);assert.equal(h.get('referer'),'https://www.tiktok.com/');
    assert.equal(h.get('cookie'),'session=own');assert.equal(response.status,206);
    assert.equal(await new Response(response.body).text(),'video bytes');
    await b.request(url,'video','cors');assert.equal(new Headers(b.metadata.headers).get('origin'),'https://www.tiktok.com','Real CORS media retains Origin');
    await b.request('https://tiktok.com.evil.example/video.mp4');
    assert.equal(new Headers(b.metadata.headers).get('cookie'),null,'Never send TikTok cookies to lookalike domains');
  }finally{b.handle.destroy();}
});

test('TikTok empty feed responses are reported without replacement data or automatic retries',async()=>{
  const b=await browser();
  try{
    b.setResponse(200,'');const response=await b.request('https://www.tiktok.com/api/recommend/item_list/?msToken=own','', 'cors');
    assert.equal(response.status,200);assert.equal(await new Response(response.body).text(),'');
    assert.match(b.warnings.at(-1),/empty feed response/i);
    b.setResponse(200,'{"itemList":[]}');const valid=await b.request('https://www.tiktok.com/api/recommend/item_list/?msToken=own','', 'cors');
    assert.equal(await new Response(valid.body).text(),'{"itemList":[]}');
    assert.equal(b.warnings.at(-1),'');
  }finally{b.handle.destroy();}
});
