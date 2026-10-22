import test from 'node:test';
import assert from 'node:assert/strict';
import {profileMedia} from '../worker/profile-media.ts';
const cookie='__Host-kkeep-profile='+'a'.repeat(64);
const db={prepare(sql){const s={bind(){return s;},async all(){return {results:sql.startsWith('SELECT a.id')?[{id:'owner-a',name:'A'}]:[]};},async run(){return {meta:{changes:1}};}};return s;}};
const path='https://kkeep.test/api/profile-media?id=upload:12345678-1234-1234-1234-123456789012';
test('wallpaper files require authenticated ownership, safe format, and limits',async()=>{
 assert.equal((await profileMedia(new Request(path,{headers:{'X-Kkeep-Profile':'1'}}),{DB:db})).status,401);
 const headers={'X-Kkeep-Profile':'1',Cookie:cookie,'Content-Type':'image/svg+xml','Content-Length':'5'};
 assert.equal((await profileMedia(new Request(path,{method:'PUT',headers,body:'<svg>'}),{DB:db,GAME_ASSETS:{}})).status,413);
});
test('wallpaper storage keys are account-scoped and mismatched binary signatures fail',async()=>{
 let key;const bucket={get:async k=>{key=k;return {body:new Blob(['x']).stream(),customMetadata:{type:'image/png'}};},put:async(_key,stream)=>{await new Response(stream).arrayBuffer();}};
 const response=await profileMedia(new Request(path,{headers:{'X-Kkeep-Profile':'1',Cookie:cookie}}),{DB:db,GAME_ASSETS:bucket});assert.equal(response.status,200);assert.match(key,/^profile-media\/owner-a\/upload:/);assert.match(response.headers.get('cache-control'),/private/);
 const bad=await profileMedia(new Request(path,{method:'PUT',headers:{'X-Kkeep-Profile':'1',Cookie:cookie,'Content-Type':'image/png','Content-Length':'5','X-Kkeep-Media':'{"width":640,"height":480}'},body:'hello'}),{DB:db,GAME_ASSETS:bucket});assert.equal(bad.status,503);
});
