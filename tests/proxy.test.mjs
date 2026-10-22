import test from 'node:test';
import assert from 'node:assert/strict';
import {parseTarget,isPublicIp,sanitizeHeaders,relay,socketRelay,encodeMetadata,decodeMetadata} from '../worker/proxy.ts';
import {normalizeAddress} from '../lib/proxy-client.ts';
const nativeFetch=globalThis.fetch;
function request(url='https://example.com/',method='GET',body,headers=[]){return new Request('https://kha.example/api/relay',{method:'POST',headers:{'Origin':'https://kha.example','X-Kha-Relay':'1','X-Kha-Meta':encodeMetadata({url,method,headers}),Cookie:'hosting-cookie=secret','oai-authenticated-user-email':'private@example.org'},body});}
function fixture(handler,ip='93.184.215.14'){globalThis.fetch=async(input,init)=>{const url=new URL(String(input));if(url.hostname==='family.cloudflare-dns.com')return Response.json({Status:0,Answer:url.searchParams.get('type')==='A'?[{type:1,data:ip}]:[]});return handler(url,init);};}
test('addresses normalize searches and web URLs; active schemes are rejected',()=>{
 assert.equal(normalizeAddress('youtube.com'),'https://youtube.com/');
 assert.equal(normalizeAddress('minecraft mods'),'https://www.bing.com/search?q=minecraft%20mods');
 assert.equal(normalizeAddress(' GeForce now '),'https://www.bing.com/search?q=GeForce%20now');
 assert.equal(new URL(normalizeAddress('ألعاب & videos')).searchParams.get('q'),'ألعاب & videos');
 assert.equal(normalizeAddress('https://duckduckgo.com/?q=hello'),'https://duckduckgo.com/?q=hello','Explicit URLs must remain unchanged');
 for(const s of ['javascript:alert(1)','file:///etc/passwd','data:text/html,x','https://u:p@example.com/'])assert.throws(()=>normalizeAddress(s));
});
test('private destinations and non-web ports are rejected',()=>{
 for(const s of ['http://localhost/','http://127.0.0.1/','http://2130706433/','http://0x7f000001/','https://[::1]/','http://printer.local/','http://10.0.0.1/','http://example.com:22/','https://kha.example/','http://metadata.google.internal/','ftp://example.com/'])assert.throws(()=>parseTarget(s,'https://kha.example'));
 assert.equal(parseTarget('https://www.wikipedia.org/','https://kha.example').hostname,'www.wikipedia.org');
});
test('DNS addresses are limited to the public internet',()=>{
 for(const ip of ['127.0.0.1','10.0.0.1','100.64.1.1','169.254.169.254','172.16.0.1','192.168.2.1','192.0.2.1','198.18.0.1','203.0.113.1','224.0.0.1','::1','fc00::1','2001:db8::1','2001:0db8::1','::ffff:127.0.0.1'])assert.equal(isPublicIp(ip),false,ip);
 for(const ip of ['1.1.1.1','8.8.8.8','2606:4700:4700::1111','2001:4860:4860::8888'])assert.equal(isPublicIp(ip),true,ip);
});
test('header metadata is lossless and hosting headers cannot be forwarded',()=>{
 const input={headers:[['Set-Cookie','name=one'],['Set-Cookie','id=two']],text:'خالد'};assert.deepEqual(decodeMetadata(encodeMetadata(input)),input);
 const h=sanitizeHeaders([['Host','evil'],['oai-authenticated-user-email','private'],['CF-Connecting-IP','10.0.0.1'],['X-Forwarded-For','10.0.0.1'],['Cookie','upstream=yes'],['Authorization','upstream-token'],['Accept','text/html']]);
 for(const key of ['host','oai-authenticated-user-email','cf-connecting-ip','x-forwarded-for'])assert.equal(h.has(key),false);
 assert.equal(h.get('cookie'),'upstream=yes');assert.throws(()=>sanitizeHeaders([['X-Header','hello\r\nInjected: yes']]));
});
test('relay streams the remote response and preserves status and duplicate cookies',async()=>{
 try{fixture((url,init)=>{
  assert.equal(url.href,'https://example.com/');assert.equal(init.redirect,'manual');assert.equal(init.headers.get('cookie'),null);assert.equal(init.headers.has('oai-authenticated-user-email'),false);
  return new Response('<h1>Proxy test</h1>',{status:201,headers:[['content-type','text/html'],['set-cookie','a=1; Path=/'],['set-cookie','b=2; Path=/']]});
 });
 const result=await relay(request());assert.equal(result.status,200);const metadata=decodeMetadata(result.headers.get('x-kha-response'));assert.equal(metadata.status,201);assert.equal(metadata.headers.filter(([k])=>k==='set-cookie').length,2);assert.equal(result.headers.has('set-cookie'),false);assert.equal(await result.text(),'<h1>Proxy test</h1>');
 }finally{globalThis.fetch=nativeFetch;}
});
test('POST payload and explicitly supplied remote cookies are relayed',async()=>{
 try{fixture(async(url,init)=>{assert.equal(init.method,'POST');assert.equal(new TextDecoder().decode(init.body),'message=hello');assert.equal(init.headers.get('cookie'),'remote=ok');return new Response('sent');});
 const result=await relay(request('https://example.com/send','POST','message=hello',[['Cookie','remote=ok']]));assert.equal(await result.text(),'sent');
 }finally{globalThis.fetch=nativeFetch;}
});

test('GeForce diagnostics report only provider and status, never OAuth data or credentials',async()=>{
 const originalWarn=console.warn;const logs=[];console.warn=(...items)=>logs.push(items);
 try{
  fixture((_url,init)=>{assert.equal(init.headers.has('x-kha-profile'),false);return new Response('upstream refused',{status:403});});
  const req=request('https://www.epicgames.com/id/api/login?code=private-code&state=private-state','POST','password=private-password',[['Cookie','session=private-cookie']]);
  req.headers.set('X-Kha-Profile','geforce');
  const result=await relay(req);assert.equal(decodeMetadata(result.headers.get('x-kha-response')).status,403);
  assert.equal(logs.length,1);assert.equal(logs[0][0],'GeForce upstream response');
  assert.deepEqual(JSON.parse(logs[0][1]),{host:'www.epicgames.com',status:403,method:'POST'});
  assert.doesNotMatch(JSON.stringify(logs),/private-|password|session=|state=|code=/);
  const regular=request('https://www.epicgames.com/id/login');await relay(regular);assert.equal(logs.length,1,'Main-app requests retain their existing behavior');
 }finally{globalThis.fetch=nativeFetch;console.warn=originalWarn;}
});
test('upstream redirects are returned for rewriting and never followed on the server',async()=>{
 try{let calls=0;fixture((url,init)=>{calls++;assert.equal(init.redirect,'manual');return new Response(null,{status:302,headers:{location:'http://127.0.0.1/secret'}});});const result=await relay(request('https://example.com/redirect'));const meta=decodeMetadata(result.headers.get('x-kha-response'));assert.equal(meta.status,302);assert.equal(calls,1);assert.throws(()=>parseTarget(meta.headers.find(([k])=>k==='location')[1],'https://kha.example'));}finally{globalThis.fetch=nativeFetch;}
});
test('a public-looking hostname resolving to a private address is blocked',async()=>{
 try{fixture(()=>{throw new Error('Upstream must not be contacted');},'10.0.0.1');const result=await relay(request('https://private-answer.example/'));assert.equal(result.status,502);assert.match((await result.json()).error,/public website/);}finally{globalThis.fetch=nativeFetch;}
});
test('cross-origin and malformed relay requests are rejected before fetching',async()=>{
 const req=request();req.headers.set('Origin','https://unrelated.example');assert.equal((await relay(req)).status,403);
 assert.equal((await relay(new Request('https://kha.example/api/relay'))).status,405);
 assert.equal(socketRelay(new Request('https://kha.example/api/socket')).status,426);
 assert.equal(socketRelay(new Request('https://kha.example/api/socket',{headers:{upgrade:'websocket',origin:'https://unrelated.example'}})).status,403);
});
test('oversized uploads are rejected before upstream writes',async()=>{
 try{fixture(()=>{throw new Error('No upstream write should occur');});const req=request('https://example.com/upload','POST','data');req.headers.set('Content-Length',String(9*1024*1024));const result=await relay(req);assert.match((await result.json()).error,/8 MB/);}finally{globalThis.fetch=nativeFetch;}
});

test('family filter blocks classified domains before any upstream request',async()=>{
 try{fixture(()=>{throw new Error('Blocked destination must never be fetched');},'0.0.0.0');const result=await relay(request('https://filtered-content.example/'));assert.equal(result.status,403);assert.match((await result.json()).error,/adult-content and malware filter/);}finally{globalThis.fetch=nativeFetch;}
});
test('safety DNS outages fail closed without fetching the destination',async()=>{
 try{globalThis.fetch=async input=>{assert.equal(new URL(String(input)).hostname,'family.cloudflare-dns.com');throw new Error('DNS unavailable');};const result=await relay(request('https://lookup-outage.example/'));assert.equal(result.status,502);}finally{globalThis.fetch=nativeFetch;}
});

test('video ranges stream immediately and remain readable past the header deadline',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});
 let upstreamSignal,source;
 try{
  fixture((_url,init)=>{upstreamSignal=init.signal;assert.equal(init.headers.get('range'),'bytes=0-');return new Response(new ReadableStream({start(c){source=c;c.enqueue(new Uint8Array([1,2]));}}),{status:206,headers:{'content-type':'video/mp4','content-range':'bytes 0-3/4','accept-ranges':'bytes','content-length':'4'}});});
  const result=await relay(request('https://video-range.example/clip.mp4','GET',undefined,[['Range','bytes=0-']]));
  const meta=decodeMetadata(result.headers.get('x-kha-response'));
  assert.equal(meta.status,206);assert.equal(new Headers(meta.headers).get('content-range'),'bytes 0-3/4');
  const reader=result.body.getReader();assert.deepEqual([...((await reader.read()).value)],[1,2]);
  t.mock.timers.tick(31000);assert.equal(upstreamSignal.aborted,false);
  source.enqueue(new Uint8Array([3,4]));source.close();
  assert.deepEqual([...((await reader.read()).value)],[3,4]);assert.equal((await reader.read()).done,true);
 }finally{globalThis.fetch=nativeFetch;t.mock.timers.reset();}
});

test('slow upstream headers still time out and client cancellation remains connected',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});
 try{
  let started;const waiting=new Promise(resolve=>started=resolve);
  fixture((_url,init)=>new Promise((_resolve,reject)=>{init.signal.addEventListener('abort',()=>reject(init.signal.reason));started();}));
  const response=relay(request('https://slow-headers.example/'));await waiting;
  t.mock.timers.tick(30001);assert.equal((await response).status,504);
  let upstreamSignal;fixture((_url,init)=>{upstreamSignal=init.signal;return new Response('ok');});
  const cancel=new AbortController();const req=new Request(request('https://cancel-stream.example/'),{signal:cancel.signal});
  await relay(req);cancel.abort();assert.equal(upstreamSignal.aborted,true);
 }finally{globalThis.fetch=nativeFetch;t.mock.timers.reset();}
});

test('movie exceptions bypass only adult classification and retain malware blocking',async()=>{
 const {dnsEndpoint}=await import('../worker/proxy.ts');
 assert.match(dnsEndpoint('cinehd.app'),/security/);assert.match(dnsEndpoint('www.cinejoy.to'),/security/);assert.match(dnsEndpoint('cinehd.app.evil.example'),/family/);assert.match(dnsEndpoint('other.example'),/family/);
 try{globalThis.fetch=async input=>{assert.equal(new URL(String(input)).hostname,'security.cloudflare-dns.com');return Response.json({Status:0,Answer:[{type:1,data:'0.0.0.0'}]});};const r=await relay(request('https://cinehd.app/'));assert.equal(r.status,403);}finally{globalThis.fetch=nativeFetch;}
});
