import test from 'node:test';
import assert from 'node:assert/strict';
import {checkConnection} from '../lib/connection.ts';
test('anonymous connection check uses relay without owner credentials',async()=>{
 const oldWindow=globalThis.window, oldNavigator=Object.getOwnPropertyDescriptor(globalThis,'navigator'),oldFetch=globalThis.fetch;
 globalThis.window={isSecureContext:true};Object.defineProperty(globalThis,'navigator',{configurable:true,value:{onLine:true,serviceWorker:{}}});
 let count=0;globalThis.fetch=async(path,init)=>{count++;assert.equal(init.headers?.Authorization,undefined);if(path==='/api/health')return Response.json({relay:true});assert.equal(path,'/api/relay');assert.equal(JSON.parse(atob(init.headers['X-Kha-Meta'])).method,'HEAD');return new Response(null,{headers:{'X-Kha-Response':btoa(JSON.stringify({status:200}))}});};
 try{assert.deepEqual(await checkConnection(),{browser:'Supported',server:'Reachable',relay:'Test website reached'});assert.equal(count,2);globalThis.fetch=async()=>{throw new TypeError('Network unavailable');};assert.equal((await checkConnection()).server,'Network unavailable');}finally{globalThis.fetch=oldFetch;globalThis.window=oldWindow;if(oldNavigator)Object.defineProperty(globalThis,'navigator',oldNavigator);}
});
