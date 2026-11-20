import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

// Correct native Storage contracts in the pinned Scramjet 2.0.67-alpha.2
// module. Keep its existing host@key format: no migration, clearing, or access
// to real account data. Gaming engines are separately pinned and unchanged.
const file=new URL('../public/engine/scramjet.js',import.meta.url);
const bundle=readFileSync(file,'utf8');
const start=bundle.indexOf('5724(e,t,r){');
const end=bundle.indexOf('},7530(e,t,r){',start)+1;
if(start<0||end<=start)throw new Error('Pinned Scramjet storage module not found');
let module=bundle.slice(start,end);
const marker='/* Kkeep Storage contracts v1 */';
if(!module.includes(marker)) {
  if(createHash('sha256').update(module).digest('hex')!=='ff721fc66c5d898f7857d9ae63c73c4f14769b059fdb7246b30492e5b02d8646')throw new Error('Scramjet storage changed; review this patch before updating');
  module=module.replace('for(let r in(0,i.BR)(t))','for(let r of(0,i.BR)(t))')
    .replaceAll('.startsWith(e.url.host)','.startsWith(e.url.host+"@")')
    .replace('return t.getItem(n[r])','return n[Number(r)>>>0]?.substring(e.url.host.length+1)??null')
    .replace('return t.getItem(e.url.host+"@"+r)}},set:','return t.getItem(e.url.host+"@"+r)??void 0}},set:')
    .replace('has:(t,r)=>null!==t.getItem(e.url.host+"@"+r),','has:(t,r)=>"symbol"==typeof r?r in t:r in Object.prototype||["getItem","setItem","removeItem","clear","key","length"].includes(r)||null!==t.getItem(e.url.host+"@"+r),deleteProperty:(t,r)=>"symbol"==typeof r?Reflect.deleteProperty(t,r):(t.removeItem(e.url.host+"@"+r),!0),')
    .replace('5724(e,t,r){','5724(e,t,r){'+marker);
  writeFileSync(file,bundle.slice(0,start)+module+bundle.slice(end));
}
