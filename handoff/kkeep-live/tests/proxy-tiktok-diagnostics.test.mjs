import test from 'node:test';
import assert from 'node:assert/strict';
import {observeTikTokLogin} from '../worker/tiktok-diagnostics.ts';

const target=new URL('https://www.tiktok.com/passport/web/user/login/?signed=never-log');
async function inspect(body,status=200,url=target,method='POST',report){
  const events=[];
  const response=new Response(body,{status,headers:{'Set-Cookie':'session=never-log'}});
  const stream=observeTikTokLogin(url,method,response,report??(event=>events.push(event)));
  return {body:await new Response(stream).text(),events};
}
test('a provider login error inside HTTP 200 is observed without leaking private fields',async()=>{
  const body=JSON.stringify({message:'error',data:{error_code:7,description:'Maximum attempts: private@example.com',username:'private-user',password:'private-password',token:'private-token'}});
  const result=await inspect(body);
  assert.equal(result.body,body);
  assert.deepEqual(result.events,[{flow:'password',httpStatus:200,providerCode:7}]);
  assert.doesNotMatch(JSON.stringify(result.events),/private|signed|session|never-log/);
});
test('response chunks stream immediately and provider result is emitted once at completion',async()=>{
  const encoder=new TextEncoder(),events=[];let input;
  const source=new ReadableStream({start(controller){input=controller;}});
  const stream=observeTikTokLogin(target,'POST',new Response(source),event=>events.push(event));
  const reader=stream.getReader();
  input.enqueue(encoder.encode('{"error_code":'));
  assert.equal(new TextDecoder().decode((await reader.read()).value),'{"error_code":');
  assert.equal(events.length,0);
  input.enqueue(encoder.encode('0}'));input.close();
  assert.equal(new TextDecoder().decode((await reader.read()).value),'0}');
  assert.equal((await reader.read()).done,true);
  assert.deepEqual(events,[{flow:'password',httpStatus:200,providerCode:0}]);
});
test('unrelated traffic and lookalike domains remain opaque',async()=>{
  for(const [url,method] of [[target,'GET'],[new URL('https://www.tiktok.com/api/recommend/item_list/'),'POST'],[new URL('https://www.tiktok.com.evil.example/passport/web/user/login/'),'POST']]){
    const body='{"error_code":7,"secret":"never-log"}';
    const result=await inspect(body,200,url,method);
    assert.equal(result.body,body);assert.deepEqual(result.events,[]);
  }
});
test('HTML, oversized responses and nonnumeric codes stay intact and are never logged',async()=>{
  for(const body of ['<html>private challenge</html>',JSON.stringify({data:{error_code:'private-data'}}),JSON.stringify({data:{error_code:7},profile:'s'.repeat(17000)})]){
    const result=await inspect(body,429);
    assert.equal(result.body,body);
    assert.deepEqual(result.events,[{flow:'password',httpStatus:429}]);
  }
});
test('diagnostic sink failure cannot break authentication',async()=>{
  const body='{"data":{"error_code":0}}';
  assert.equal((await inspect(body,200,target,'POST',()=>{throw new Error('sink failed');})).body,body);
});
test('cancelling the client response also cancels the upstream without reporting a partial login',{timeout:1000},async()=>{
  let finish;const cancelled=new Promise(resolve=>{finish=resolve;});const events=[];
  const stream=observeTikTokLogin(target,'POST',new Response(new ReadableStream({cancel(){finish();}})),event=>events.push(event));
  await stream.cancel();
  await cancelled;assert.deepEqual(events,[]);
});
