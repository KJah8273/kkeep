import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {boundedStorage} from '../public/hgola-startup.js';
import {installHgolaIdbfsGuard} from '../lib/hgola-idbfs-compat.js';
for(const [build,digest] of [['1fd2dc15-ff98-4202-a685-06411ff6f10e','f99100462330bfa47bc0e7fbc155d332bcfd5383b7787e8f04da7a0b6752e08c'],['f485b572-cb8f-44f2-b7c3-26cca39c5dea','d3162cd8a0392b7024313f9b25a7bffaa95621c708701e16df0bd1f54ecc40e6'],['2b6f1ee8-4d7e-4e17-9a9c-4a5c390d703b','1c76f775911476e994cb2d2e5d0462ee7abb50a896726c828f08eb721a7f8a49'],['0d9f7b29-108b-4756-a4e2-870b21d94a0e','3142bab2c4a066ba7ac0da21086885c7315685cfaded8489e2a8f07aac5e7965']]){
const folder=new URL('../public/games/hgola/'+build+'/',import.meta.url);
const original=readFileSync(new URL('framework.js',folder),'utf8');
if(createHash('sha256').update(original).digest('hex')!==digest)throw Error('Original Unity framework changed; review compatibility patch');
let source=original;
const start=source.indexOf('var IDBFS='),end=source.indexOf(';var FS=',start);
if(start<0||end<0)throw Error('Unity storage implementation changed');
let part=source.slice(start,end);
// Arrow functions do not bind `this` to the failing IndexedDB request. The
// original callback(this.error) reports undefined and proceeds with no file set.
part=part.replaceAll('callback(this.error)','callback(e.target?.error||new Error("IndexedDB operation failed"))').replaceAll('done(this.error)','done(e.target?.error||new Error("IndexedDB transaction failed"))');
part=part.replace('reconcile:(src,dst,callback)=>{','reconcile:(src,dst,callback)=>{if(!src?.entries||!dst?.entries)return callback(new Error("Saved file listing is unavailable"));');
part=part.replace('db=req.result;IDBFS.dbs[name]=db;','db=req.result;IDBFS.dbs[name]=db;db.onversionchange=()=>{db.close();delete IDBFS.dbs[name]};');
part=part.replace('callback(null,event.target.result)','event.target.result?callback(null,event.target.result):callback(new Error("Saved file is unavailable"))');
part=part.replace('transaction.onerror=e=>{done(e.target?.error||new Error("IndexedDB transaction failed"));e.preventDefault()};','transaction.onerror=e=>{done(e.target?.error||new Error("IndexedDB transaction failed"));e.preventDefault();try{transaction.abort()}catch{}};transaction.onabort=()=>done(transaction.error||new Error("Save transaction was interrupted"));');
if(part.includes('this.error'))throw Error('Unhandled IndexedDB error path');
source=source.slice(0,start)+part+`;(${installHgolaIdbfsGuard.toString()})(IDBFS,Module);(${boundedStorage.toString()})(IDBFS,Module)`+source.slice(end);
source=source.replace('FS.mkdir("/idbfs");Module.__unityIdbfsMount=', 'FS.mkdir("/idbfs");if(Module.kkeepTemporarySession)return;Module.__unityIdbfsMount=');
source=source.replace('function _JS_FileSystem_Sync(){', 'function _JS_FileSystem_Sync(){if(Module.kkeepTemporarySession)return;');
writeFileSync(new URL('framework-save3.js',folder),source);
console.log('Patched Hgola IndexedDB error handling; original SHA256 '+createHash('sha256').update(original).digest('hex'));

}
