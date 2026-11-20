import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

// The notification effect in Snapchat web 3237bb7a. The proxy intentionally
// has no serviceWorker API; the original effect throws before chat can render.
const effect='(function(){function n(){}return navigator.serviceWorker.addEventListener("message",n),()=>navigator.serviceWorker.removeEventListener("message",n)})()';
async function connection(body,{chunkSize=31,status=200,type='application/javascript; charset= utf-8'}={}){
  let transport;
  const worker={state:'activated',scriptURL:'https://kkeep.test/proxy-sw.js?v=8'};
  class Controller{
    frames=[];
    constructor(options){transport=options.transport;}
    wait(){return Promise.resolve();}
    createFrame(){const frame={hooks:{fetch:{},error:{},init:{}},go(){}};this.frames.push(frame);return frame;}
  }
  const context=vm.createContext({window:{addEventListener(){},removeEventListener(){}},navigator:{userAgent:'Test Safari',serviceWorker:{controller:worker}},location:new URL('https://kkeep.test/'),document:{createElement:()=>({setAttribute(){},addEventListener(){},remove(){}})},$scramjetController:{Controller},$scramjet:{Plugin:class{tap(){}}},URL,Headers,TextEncoder,TextDecoder,ReadableStream,TransformStream,Uint8Array,ArrayBuffer,Blob,Map,Set,Promise,setTimeout,clearTimeout,btoa,atob,fetch:async()=>{
    const bytes=new TextEncoder().encode(body);let offset=0;
    const stream=new ReadableStream({pull(controller){if(offset===bytes.length){controller.close();return;}controller.enqueue(bytes.slice(offset,offset+chunkSize));offset=Math.min(offset+chunkSize,bytes.length);}});
    const headers=[['content-type',type],['content-length',String(bytes.length)],['etag','original']];
    return new Response(stream,{headers:{'X-Kha-Response':btoa(JSON.stringify({status,statusText:'OK',headers}))}});
  }});
  vm.runInContext(readFileSync(new URL('../public/engine/kha-runtime.js',import.meta.url),'utf8'),context);
  const handle=await context.window.KHAProxy.mount({appendChild(){}},{onNavigate(){},onError(){}});
  return {handle,request:({url='https://cf-st.sc-cdn.net/dw/main.js',referer='https://www.snapchat.com/web'}={})=>transport.request(new URL(url),'GET',null,[['Referer',referer]])};
}

test('Snapchat notification effect no longer throws when the proxy omits service workers',async()=>{
  assert.throws(()=>vm.runInNewContext(effect,{navigator:{}}),/addEventListener/);
  const c=await connection(effect,{chunkSize:1});
  try{
    const response=await c.request(),patched=await new Response(response.body).text();
    const cleanup=vm.runInNewContext(patched,{navigator:{}});
    assert.equal(typeof cleanup,'function');assert.doesNotThrow(cleanup);
    const calls=[];
    const worker={addEventListener(type,listener){calls.push(['add',type,listener,this]);},removeEventListener(type,listener){calls.push(['remove',type,listener,this]);}};
    vm.runInNewContext(patched,{navigator:{serviceWorker:worker}})();
    assert.equal(calls.length,2);assert.equal(calls[0][2],calls[1][2]);assert.equal(calls[0][3],worker);
    assert.equal(new Headers(response.headers).get('content-length'),null);
    assert.equal(new Headers(response.headers).get('etag'),null);
  }finally{c.handle.destroy();}
});

test('Snapchat streamed patch preserves Unicode and crosses response chunk boundaries',async()=>{
  const source='/*'+'😀مرحبا'.repeat(400)+'*/'+effect+'/*'+'😀'.repeat(700)+'*/';
  const expected=source.replace('serviceWorker.addEventListener','serviceWorker?.addEventListener').replace('serviceWorker.removeEventListener','serviceWorker?.removeEventListener');
  for(const chunkSize of [17,1023,2049]){
    const c=await connection(source,{chunkSize});
    try{const response=await c.request();assert.equal(await new Response(response.body).text(),expected);}finally{c.handle.destroy();}
  }
});

test('Snapchat patch does not change unrelated scripts, responses, or lookalike hosts',async()=>{
  for(const options of [{url:'https://cf-st.sc-cdn.net.evil.example/dw/main.js'},{url:'https://cf-st.sc-cdn.net/other/main.js'},{referer:'https://snapchat.com.evil.example/'},{referer:'https://www.youtube.com/'}]){
    const c=await connection(effect);
    try{const response=await c.request(options);assert.equal(await new Response(response.body).text(),effect);}finally{c.handle.destroy();}
  }
  for(const options of [{status:403},{type:'application/json'},{type:'application/javascript; charset=iso-8859-1'}]){
    const c=await connection(effect,options);
    try{const response=await c.request();assert.equal(await new Response(response.body).text(),effect);}finally{c.handle.destroy();}
  }
});

if(process.env.KKEEP_SNAP_SCRIPT)test('current public Snapchat bundle receives only the two notification guards',async()=>{
  const source=readFileSync(process.env.KKEEP_SNAP_SCRIPT,'utf8');
  const c=await connection(source,{chunkSize:65536});
  try{
    const response=await c.request(),patched=await new Response(response.body).text();
    assert.equal(patched.length,source.length+2);
    assert.equal(patched.replace('navigator.serviceWorker?.addEventListener("message",n),()=>navigator.serviceWorker?.removeEventListener("message",n)','navigator.serviceWorker.addEventListener("message",n),()=>navigator.serviceWorker.removeEventListener("message",n)'),source);
    new vm.Script(patched);
  }finally{c.handle.destroy();}
});
