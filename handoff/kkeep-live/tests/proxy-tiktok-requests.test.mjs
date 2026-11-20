import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

globalThis.self=globalThis;
await import('../public/engine/scramjet.js');
const sj=globalThis.$scramjet;
sj.setWasm(readFileSync(new URL('../public/engine/scramjet.wasm',import.meta.url)));

async function browser(){
  let handler,metadata,transport,requestBody,calls=0,status=206,body='video bytes',responseHeaders=[['content-type','application/octet-stream']];const warnings=[],navigations=[];
  const ready={state:'activated',scriptURL:'https://proxy.example/proxy-sw.js?v=8'};
  const prefix=new URL('https://proxy.example/browse/test/');
  const jar=new sj.CookieJar();
  const context={config:sj.defaultConfig,prefix,cookieJar:jar,interface:{codecEncode:encodeURIComponent,codecDecode:decodeURIComponent,getInjectScripts:()=>[]}};
  class Controller{
    frames=[];
    constructor(options){this.transport=options.transport;transport=this.transport;}
    wait(){return Promise.resolve();}
    createFrame(){
      handler=new sj.ScramjetFetchHandler({context,transport:this.transport,sendSetCookie:async()=>{},fetchBlobUrl:async()=>{},fetchDataUrl:async()=>{}});
      const frame={hooks:{fetch:handler.hooks.fetch,error:sj.Tap.create(),init:sj.Tap.create()},go(url){navigations.push(url);}};
      this.frames.push(frame);return frame;
    }
  }
  const runtime=vm.createContext({window:{addEventListener(){},removeEventListener(){}},navigator:{userAgent:'Test Safari',language:'en-AE',serviceWorker:{controller:ready,register:async()=>({active:ready})}},document:{createElement:()=>({setAttribute(){},addEventListener(){},remove(){}})},$scramjetController:{Controller},$scramjet:sj,Headers,URL,TextEncoder,TextDecoder,Uint8Array,ArrayBuffer,ReadableStream,TransformStream,Blob,Map,Set,Promise,setTimeout,clearTimeout,btoa,atob,fetch:async(_url,init)=>{calls++;requestBody=init.body;metadata=JSON.parse(atob(init.headers['X-Kha-Meta']));return new Response(body,{headers:{'X-Kha-Response':btoa(JSON.stringify({status,statusText:'',headers:responseHeaders}))}});}});
  runtime.location=new URL('https://proxy.example/');
  vm.runInContext(readFileSync(new URL('../public/engine/kha-runtime.js',import.meta.url),'utf8'),runtime);
  const handle=await runtime.window.KHAProxy.mount({appendChild(){}},{onNavigate(){},onWarning:s=>warnings.push(s),onError(){}});
  handle.go('https://www.tiktok.com/');
  return {jar,handle,warnings,navigations,get calls(){return calls;},get requestBody(){return requestBody;},send:(...args)=>transport.request(...args),setResponse(s,b,headers=[['content-type','application/octet-stream']]){status=s;body=b;responseHeaders=headers;},get metadata(){return metadata;},async request(url,dest='video',mode='no-cors',initial=[]){
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
    await b.request('https://v16-webapp.tiktokcdn-eu.com/video/example/?signature=own','video','no-cors');assert.equal(new Headers(b.metadata.headers).get('origin'),null);
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


test('password POST is sent once and the rate-limit response is returned unchanged',async()=>{
 const b=await browser();try{
  b.setResponse(429,'{"message":"Maximum number of attempts reached. Try again later."}');
  const response=await b.send(new URL('https://www.tiktok.com/passport/web/user/login/'),'POST','password=test-only',[['Cookie','own-session=only'],['Content-Type','application/x-www-form-urlencoded']],undefined);
  assert.equal(b.calls,1);assert.equal(b.requestBody,'password=test-only');assert.equal(b.metadata.method,'POST');
  assert.equal(new Headers(b.metadata.headers).get('cookie'),'own-session=only');assert.equal(response.status,429);
  assert.equal(await new Response(response.body).text(),'{'+'"message":"Maximum number of attempts reached. Try again later."}');
  assert.equal(b.calls,1,'No retry after a rate limit or response read');
 }finally{b.handle.destroy();}
});

test('observed TikTok profile and callback URLs retain percent encoding and query parameters through the transport',async()=>{
 const b=await browser();try{
  for(const url of [
   'https://www.tiktok.com/%40fixture.user/video/123?lang=en',
   'https://www.tiktok.com/search?q=a%2Bb%20c&lang=en',
   'https://www.tiktok.com/login/callback?redirect_url=https%3A%2F%2Fwww.tiktok.com%2F%40fixture.user%3Fx%3Da%252Bb&state=synthetic%2Bstate&code=synthetic%2Fcode',
  ]){
   const before=b.calls;
   b.setResponse(200,'provider response',[['content-type','text/html']]);
   const response=await b.send(new URL(url),'GET',null,[['Sec-Fetch-Dest','iframe']],undefined);
   assert.equal(b.metadata.url,url,'Do not decode, strip or rebuild an account/callback URL');
   assert.equal(await new Response(response.body).text(),'provider response');
   assert.equal(b.calls,before+1,'The transport sends each requested navigation exactly once');
  }
 }finally{b.handle.destroy();}
});
test('reload escapes TikTok error-page URL without changing other destinations',async()=>{
 const b=await browser();try{
  b.handle.go('https://www.tiktok.com/404?from=old');b.handle.reload();assert.equal(b.navigations.at(-1),'https://www.tiktok.com/');
  b.handle.go('https://www.tiktok.com/404/?from=old');b.handle.reload();assert.equal(b.navigations.at(-1),'https://www.tiktok.com/');
  b.handle.go('https://example.org/404');b.handle.reload();assert.equal(b.navigations.at(-1),'https://example.org/404');
  b.handle.go('https://www.tiktok.com/@example/video/123');b.handle.reload();assert.equal(b.navigations.at(-1),'https://www.tiktok.com/@example/video/123');
 }finally{b.handle.destroy();}
});

test('TikTok HTTP 404 remains a provider response and is not replayed by the transport',async()=>{
 const b=await browser();try{
  b.setResponse(404,'Provider unavailable',[['content-type','text/html']]);
  const response=await b.send(new URL('https://www.tiktok.com/foryou'),'GET',null,[['Sec-Fetch-Dest','iframe']],undefined);
  assert.equal(response.status,404);assert.equal(await new Response(response.body).text(),'Provider unavailable');
  assert.equal(b.calls,1);assert.match(b.warnings.at(-1),/TikTok returned HTTP 404/);
 }finally{b.handle.destroy();}
});

test('public compressed assets without Content-Length survive TikTok reload with bounded caching',async()=>{
 const b=await browser();try{
  b.setResponse(200,'public-script',[['content-type','application/javascript'],['cache-control','public, max-age=3600'],['vary','Accept-Encoding']]);
  const url=new URL('https://cdn.example.org/app.js');
  const first=await b.send(url,'GET',null,[],undefined);assert.equal(await new Response(first.body).text(),'public-script');
  await new Promise(resolve=>setImmediate(resolve));
  b.handle.reload();const second=await b.send(url,'GET',null,[],undefined);assert.equal(await new Response(second.body).text(),'public-script');assert.equal(b.calls,1);
  const authenticated=await b.send(url,'GET',null,[['Cookie','session=private']],undefined);await new Response(authenticated.body).text();assert.equal(b.calls,2,'Authenticated requests never consume public cached responses');
 }finally{b.handle.destroy();}
});
test('personalized, cookie-setting and oversized resources are never retained',async()=>{
 for(const headers of [
  [['vary','Cookie']], [['vary','Origin']], [['vary','*']], [['cache-control','private, max-age=3600']],
  [['cache-control','no-store']], [['set-cookie','session=private']], [['content-length',String(3*1024*1024)]],
 ]){
  const b=await browser();try{
   const responseHeaders=new Headers([['content-type','application/javascript'],['cache-control','public, max-age=3600']]);for(const [key,value] of headers)responseHeaders.set(key,value);
   b.setResponse(200,'private-script',Array.from(responseHeaders.entries()));const url=new URL('https://cdn.example.org/varied.js');
   for(let i=0;i<2;i++){const response=await b.send(url,'GET',null,[],undefined);await new Response(response.body).text();await new Promise(resolve=>setImmediate(resolve));}
   assert.equal(b.calls,2,JSON.stringify(headers));
  }finally{b.handle.destroy();}
 }
});
