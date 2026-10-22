import test from 'node:test';
import assert from 'node:assert/strict';
import {epicRuntimeFailures,isEpicErrorReport,reportEpicRuntimeFailures} from '../worker/geforce-diagnostics.ts';
import {relay,encodeMetadata} from '../worker/proxy.ts';
const encoder=new TextEncoder();
const envelope=(event,length=false)=>{const payload=JSON.stringify(event);return encoder.encode('{}\n'+JSON.stringify({type:'event',...(length?{length:encoder.encode(payload).length}:{})})+'\n'+payload+'\n').buffer;};
const event={
 user:{email:'private@example.org'},request:{url:'https://www.epicgames.com/id/authorize?state=private-state',cookies:'private-cookie',data:'private-password'},breadcrumbs:[{message:'private-note'}],
 exception:{values:[{type:'TypeError',value:"Cannot read properties of undefined (reading 'serviceWorker')",stacktrace:{frames:[{filename:'https://static-assets-prod.unrealengine.com/account-portal/static/assets/index-tOldc5zJ.js?code=private-code',lineno:59,colno:102,function:'private-function',vars:{password:'private-password'}}]}}]},
};
test('Epic script diagnostics retain only fixed classifications and numeric script positions',()=>{
 const result=epicRuntimeFailures(envelope(event));
 assert.deepEqual(result,[{type:'TypeError',kind:'missing-property',property:'serviceWorker',frames:[{script:'epic-account-bundle',line:59,column:102}]}]);
 assert.doesNotMatch(JSON.stringify(result),/private|password|cookie|state|code=|@|https:/);
});
test('byte lengths respect UTF-8 and non-event items are skipped',()=>{
 const unicode={...event,message:'ألعاب 🎮'};
 assert.deepEqual(epicRuntimeFailures(envelope(unicode,true)),epicRuntimeFailures(envelope(unicode)));
 const prefix='{}\n{"type":"attachment","length":3}\nabc\n';
 const tail=new TextDecoder().decode(envelope(event)).slice(3);
 assert.equal(epicRuntimeFailures(encoder.encode(prefix+tail).buffer).length,1);
});
test('React error codes are retained without their URL or encoded private arguments',()=>{
 const input={exception:{values:[{type:'Error',value:'Minified React error #185; visit https://react.dev/errors/185?args[]=private-password&state=private-state'}]}};
 assert.deepEqual(epicRuntimeFailures(envelope(input)),[{type:'Error',kind:'react-185',frames:[]}]);
});
test('untrusted freeform strings and malformed envelopes never leak into output',()=>{
 for(const type of ['private-token','TypeError']) {
  const data={exception:{values:[{type,value:'private-password',stacktrace:{frames:[{filename:'https://private.example/private.js?secret=yes',lineno:-1,colno:Infinity},{filename:null,lineno:'private-id',colno:'secret'}]}}]}};
  assert.doesNotMatch(JSON.stringify(epicRuntimeFailures(envelope(data))),/private|secret|password|https:/);
 }
 const unknown={exception:{values:[{type:'TypeError',value:"Cannot read properties of undefined (reading 'privatePassword')"}]}};
 assert.equal(epicRuntimeFailures(envelope(unknown))[0].property,undefined);
 for(const body of [null,new ArrayBuffer(128*1024+1),encoder.encode('not json').buffer,encoder.encode('{}\n{"type":"event","length":999}\n{}').buffer])assert.deepEqual(epicRuntimeFailures(body),[]);
});
test('about:blank follow-up errors distinguish rewriter faults without retaining OAuth URLs',()=>{
 const source='https://kkeep.example/gfn/browse/private-session/private-frame/'+encodeURIComponent('https://static-assets-prod.unrealengine.com/account-portal/static/assets/index-tOldc5zJ.js?code=private-code');
 const result=epicRuntimeFailures(envelope({exception:{values:[{type:'ReferenceError',value:'typeof$scramjet$wrappostmessage is not defined',stacktrace:{frames:[{filename:source,lineno:7,colno:88}]}}]}}));
 assert.equal(result[0].kind,'rewriter-keyword-join');assert.equal(result[0].frames[0].script,'epic-account-bundle');
 assert.doesNotMatch(JSON.stringify(result),/private|code=/);
});
test('reports are restricted to GeForce, the observed Epic project and Epic account pages',()=>{
 const destination=new URL('https://sentry.io/api/1333512/envelope/');const headers=new Headers({referer:'https://www.epicgames.com/id/authorize?state=private-state'});
 assert.equal(isEpicErrorReport('geforce',destination,headers,'POST'),true);
 assert.equal(isEpicErrorReport('geforce',destination,new Headers({referer:'https://www.epicgames.com/'}),'POST'),true,'Origin-only referrers are used in Epic telemetry');
 for(const profile of [null,'snapchat','youtube'])assert.equal(isEpicErrorReport(profile,destination,headers,'POST'),false);
 for(const url of ['https://sentry.io/api/another/envelope/','https://sentry.io.evil.example/api/1333512/envelope/'])assert.equal(isEpicErrorReport('geforce',new URL(url),headers,'POST'),false);
 assert.equal(isEpicErrorReport('geforce',destination,new Headers({referer:'https://www.epicgames.com.evil.example/id/login'}),'POST'),false);
 assert.equal(isEpicErrorReport('geforce',destination,headers,'GET'),false);
});
test('relay sends the original error report once and never forwards the profile header',async()=>{
 const nativeFetch=globalThis.fetch,nativeWarn=console.warn;const warnings=[];let sent=0;
 const body=envelope(event,true),original=new Uint8Array(body.slice(0));
 try {
  console.warn=(...args)=>warnings.push(args);
  globalThis.fetch=async(input,init)=>{
   if(new URL(String(input)).hostname==='family.cloudflare-dns.com')return Response.json({Status:0,Answer:[{type:1,data:'8.8.8.8'}]});
   sent++;assert.deepEqual(new Uint8Array(init.body),original);assert.equal(init.headers.has('x-kha-profile'),false);return new Response('{}');
  };
  const req=new Request('https://kkeep.example/api/relay',{method:'POST',headers:{origin:'https://kkeep.example','x-kha-relay':'1','x-kha-profile':'geforce','x-kha-meta':encodeMetadata({url:'https://sentry.io/api/1333512/envelope/',method:'POST',headers:[['Referer','https://www.epicgames.com/id/login?state=private-state']]})},body});
  assert.equal((await relay(req)).status,200);assert.equal(sent,1);assert.equal(warnings.length,1);
  reportEpicRuntimeFailures(body);assert.equal(warnings.length,1,'Repeated identical failures do not flood logs');
  assert.doesNotMatch(JSON.stringify(warnings),/private|password|cookie|state|https:/);
 } finally {globalThis.fetch=nativeFetch;console.warn=nativeWarn;}
});
