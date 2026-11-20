import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeAddress} from '../lib/proxy-client.ts';
import {readSearchProvider,saveSearchProvider,searchProviderKey,isSearchProvider} from '../lib/search-providers.ts';

test('each search provider receives the original query without interpreting its punctuation as URL parameters',()=>{
  const query='ألعاب iPad + cars & kp=-2 #clips';
  for(const [provider,host,path] of [['brave','search.brave.com','/search'],['google','www.google.com','/search'],['duckduckgo','duckduckgo.com','/']]){
    const url=new URL(normalizeAddress(query,provider));
    assert.equal(url.hostname,host);assert.equal(url.pathname,path);assert.equal(url.searchParams.get('q'),query);assert.equal(url.hash,'');
    assert.equal(url.searchParams.get('kp'),provider==='duckduckgo'?'1':null);
  }
});

test('typing a complete website opens that exact website for every search choice',()=>{
  const explicit='https://example.org/watch?id=2&q=hello#chapter';
  for(const provider of ['brave','google','duckduckgo']){
    assert.equal(normalizeAddress(explicit,provider),explicit);
    assert.equal(normalizeAddress('kick.com',provider),'https://kick.com/');
    for(const value of ['javascript:alert(1)','https://user:password@example.org/'])assert.throws(()=>normalizeAddress(value,provider));
  }
});

test('a saved provider survives navigation, and only valid choices can override it',()=>{
  const original=globalThis.localStorage,values=new Map();
  try{
    globalThis.localStorage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};
    assert.equal(readSearchProvider(),'brave');saveSearchProvider('google');
    assert.equal(values.get(searchProviderKey),'google');assert.equal(readSearchProvider(),'google');
    assert.equal(readSearchProvider('duckduckgo'),'duckduckgo');assert.equal(readSearchProvider('https://bad.example'),'google');
    assert.equal(isSearchProvider('__proto__'),false);
    values.set(searchProviderKey,'corrupt');assert.equal(readSearchProvider(),'brave');
  }finally{if(original===undefined)delete globalThis.localStorage;else globalThis.localStorage=original;}
});

test('search works when Safari private storage is unavailable',()=>{
  const original=globalThis.localStorage;
  try{
    globalThis.localStorage={getItem(){throw Error('Storage unavailable');},setItem(){throw Error('Storage unavailable');}};
    assert.equal(readSearchProvider(),'brave');assert.equal(readSearchProvider('google'),'google');
    assert.doesNotThrow(()=>saveSearchProvider('duckduckgo'));
  }finally{if(original===undefined)delete globalThis.localStorage;else globalThis.localStorage=original;}
});
