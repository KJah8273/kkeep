import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/index.js';

test('failure reports log only fixed categories and bounded source coordinates',async()=>{
  const logged=[],original=console.error;
  console.error=(...args)=>logged.push(args);
  try{
    const data={phase:'after-load',kind:'engine worker',name:'TypeError',source:'WebClient.js',line:432,column:99,gpu:'webgl',message:'private-message',url:'https://private.example/?ticket=secret'};
    const response=await worker.fetch(new Request('https://runtime.example/_kkeep/failure',{method:'POST',body:JSON.stringify(data)}));
    assert.equal(response.status,204);
    assert.equal(logged.length,1);
    assert.equal(logged[0][0],'[Kkeep Roblox failure]');
    assert.deepEqual(JSON.parse(logged[0][1]),{phase:'after-load',kind:'engine worker',name:'TypeError',source:'WebClient.js',line:432,column:99,gpu:'webgl'});
    assert.equal(JSON.stringify(logged).includes('private'),false);
    const rejectedFields={phase:'startup',kind:'private-kind',name:'private-name',source:'https://private.example/WebClient.js',line:1e9,column:'private-column',gpu:'private-gpu'};
    assert.equal((await worker.fetch(new Request('https://runtime.example/_kkeep/failure',{method:'POST',body:JSON.stringify(rejectedFields)}))).status,204);
    assert.deepEqual(JSON.parse(logged[1][1]),{phase:'startup',kind:'unavailable',name:'',source:'',line:0,column:0,gpu:''});
  }finally{console.error=original;}
});

test('failure endpoint refuses methods, malformed or oversized reports without logging',async()=>{
  const logged=[],original=console.error;console.error=(...args)=>logged.push(args);
  try{
    const request=body=>new Request('https://runtime.example/_kkeep/failure',{method:'POST',body});
    assert.equal((await worker.fetch(new Request('https://runtime.example/_kkeep/failure'))).status,405);
    for(const body of ['',null,'{','null','[]','{"phase":"private"}'])assert.equal((await worker.fetch(request(body))).status,400);
    assert.equal((await worker.fetch(request('x'.repeat(513)))).status,413);
    assert.deepEqual(logged,[]);
  }finally{console.error=original;}
});
