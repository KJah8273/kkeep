import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync('public/games/touch-performance.js','utf8');
function run(navigator,ratio){const document={documentElement:{dataset:{}},addEventListener(){}};const window={devicePixelRatio:ratio,addEventListener(){}};vm.runInNewContext(source,{navigator,document,window,devicePixelRatio:ratio});return {window,document};}
test('iPad desktop user agent gets the touch GPU cap without changing device identity',()=>{const navigator={maxTouchPoints:5,userAgent:'Mozilla/5.0 Macintosh Safari'};const result=run(navigator,2);assert.equal(result.window.devicePixelRatio,1);assert.equal(result.document.documentElement.dataset.renderScale,'1');assert.equal(navigator.userAgent,'Mozilla/5.0 Macintosh Safari');});
test('desktop caps retina density but keeps 1x rendering intact',()=>{assert.equal(run({maxTouchPoints:0,userAgent:'Desktop'},2).window.devicePixelRatio,1.5);assert.equal(run({maxTouchPoints:0,userAgent:'Desktop'},1).window.devicePixelRatio,1);});
function monitor(){
 const listeners={},nodes=[];
 const createElement=tag=>({tagName:tag.toUpperCase(),style:{},children:[],setAttribute(){},appendChild(n){this.children.push(n);},addEventListener(){},remove(){nodes.splice(nodes.indexOf(this),1);}});
 const document={documentElement:{dataset:{}},addEventListener(){},createElement,body:{appendChild(n){nodes.push(n);}}};
 const window=new EventTarget();
 const add=window.addEventListener.bind(window);
 window.addEventListener=(name,fn,...options)=>{listeners[name]=fn;add(name,fn,...options);};
 vm.runInNewContext(source,{navigator:{maxTouchPoints:5,userAgent:'Macintosh'},devicePixelRatio:2,document,window,Event,CustomEvent});
 return {window,listeners,nodes};
}
test('optional SDK or fullscreen failure does not cover a playable game',()=>{
 const m=monitor();
 for(const src of ['https://cdn/game/js/fullscreen.js','https://sdk.poki.com/v2/poki-sdk.js','https://analytics.example.com/tracker.js'])m.listeners.error({target:{tagName:'SCRIPT',src}});
 m.listeners.unhandledrejection({reason:new Error('optional analytics unavailable')});
 assert.equal(m.nodes.length,0);
});
test('failed core runtime download shows an actionable error',()=>{
 const m=monitor();m.listeners.error({target:{tagName:'SCRIPT',src:'https://cdn/game/c2runtime.js'}});
 assert.equal(m.nodes.length,1);assert.match(m.nodes[0].children[0].textContent,/engine could not download/);
 assert.deepEqual(m.nodes[0].children.slice(1).map(n=>n.textContent),['Retry','Close']);
});
test('successful engine startup clears a recoverable failure',()=>{
 const m=monitor();m.window.KkeepGameLoader.fail('Network failed');assert.equal(m.nodes.length,1);
 m.window.KkeepGameLoader.ready();assert.equal(m.nodes.length,0);
 m.listeners.error({filename:'https://cdn/game/c2runtime.js',message:'Late non-startup error'});assert.equal(m.nodes.length,0);
});
test('the parent player can take over an engine failure without a duplicate overlay',()=>{
 const m=monitor();let message;
 m.window.addEventListener('kkeep-engine-failed',event=>{message=event.detail;event.preventDefault();});
 m.window.KkeepGameLoader.fail('Graphics context lost');
 assert.equal(message,'Graphics context lost');assert.equal(m.nodes.length,0);
});
