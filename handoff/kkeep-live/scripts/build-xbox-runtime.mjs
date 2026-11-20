// Xbox uses the pinned, repaired GeForce V2 engine in its own namespace.
// Run after build-geforce-runtime.mjs. Never rewrite the GeForce originals.
import {readFileSync,writeFileSync,mkdirSync,readdirSync,copyFileSync} from 'node:fs';
const root=new URL('../',import.meta.url),from=new URL('public/gfn/',root),to=new URL('public/xbox/',root);
mkdirSync(new URL('engine/',to),{recursive:true});
const isolate=text=>text.replaceAll('/gfn/','/xbox/').replaceAll('\\/gfn\\/','\\/xbox\\/').replaceAll('__kkeep_gfn_controller_v2','__kkeep_xbox_controller_v2').replaceAll('__kkeepCreateGfnLifecycle','__kkeepCreateXboxLifecycle').replaceAll('GeForce','Xbox');
for(const name of readdirSync(new URL('engine/',from))){
  const source=new URL('engine/'+name,from),destination=new URL('engine/'+name,to);
  if(name.endsWith('.js')){
    let code=isolate(readFileSync(source,'utf8'));
    // GeForce now carries the shared early-window bootstrap fix.
    writeFileSync(destination,code);
  }
  else copyFileSync(source,destination);
}
// GeForce touch input is deliberately not installed in the Xbox engine.
let runtime=isolate(readFileSync(new URL('runtime.js',from),'utf8').replace('\n        if(!disposed)window.KkeepGeForceControls?.register(context.window,context.client.url.href);',''));
const replace=(from,to)=>{if(runtime.split(from).length!==2)throw Error('Xbox runtime input changed: '+from);runtime=runtime.replace(from,to);};
replace("'X-Kha-Profile':'geforce'","'X-Kha-Profile':'xbox'");
replace("worker:'/xbox/proxy-sw.js',revision:3","worker:'/xbox/proxy-sw.js',revision:5");
replace('let disposed=false;let observer;', 'let disposed=false;let signInActive=false;let mediaCleanup;let signInCleanup;let observer;');
replace('const failures=new Map();', `const signInWindow=window.KkeepXboxSignInWindow.create({
        prefix:frame.context.prefix.href,encode:frame.context.interface.codecEncode,decode:frame.context.interface.codecDecode,current:()=>loadedUrl,
        onChange(active){signInActive=active;callbacks.onSignInWindow?.(active);},
        onReturn(){loadedUrl='https://www.xbox.com/en-us/play';callbacks.onNavigate(loadedUrl);startLoading();frame.go(loadedUrl);},
        onError:message=>callbacks.onError(message)
      });
      const originalInject=frame.fetchHandler.context.interface.getInjectScripts;
      frame.fetchHandler.context.interface.getInjectScripts=(meta,handler,htmlContext,script)=>{
        const scripts=originalInject(meta,handler,htmlContext,script);
        if(window.KkeepXboxSignIn.isSignIn(meta.origin.href))scripts.unshift(script('/xbox/signin-status.js?v=1&document=1'));
        return scripts;
      };
      const signInStatus=event=>{
        if(disposed||event.origin!==location.origin)return;
        const fromWindow=signInWindow.owns(event.source);
        if(!fromWindow&&event.source!==element.contentWindow)return;
        if(!window.KkeepXboxSignIn.isSignIn(loadedUrl))return;
        const report=window.KkeepXboxSignInStatus.normalize(event.data);if(!report)return;
        report.surface=fromWindow?'window':'frame';
        callbacks.onSignInStatus?.(report);
        fetch('/api/xbox-status',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-Kkeep-Xbox-Status':'1'},body:JSON.stringify(report),cache:'no-store'}).catch(()=>{});
        if(report.kind==='ready'){if(!fromWindow){clearTimeout(timer);clearTimeout(blankTimer);callbacks.onLoaded();}return;}
        if(signInActive&&!fromWindow)return;
        clearTimeout(timer);clearTimeout(blankTimer);
        callbacks.onError(report.kind==='blank'?'Microsoft sign-in has not appeared. Tap Sign-in window to continue through Kkeep.':'Microsoft sign-in stopped while opening. Tap Sign-in window to try it in its own Kkeep proxy window.');
      };
      window.addEventListener('message',signInStatus);
      const failures=new Map();`);
replace('const doc=context.window.document;', 'const doc=context.window.document;mediaCleanup?.();mediaCleanup=window.KkeepXboxMedia.install(doc);signInCleanup?.();signInCleanup=window.KkeepXboxSignIn.watch(doc,loadedUrl,()=>{if(disposed)return;clearTimeout(timer);clearTimeout(blankTimer);callbacks.onLoaded();});');
// Redirects complete before document injection. Track the final Microsoft
// document here so the window fallback remains usable even if bootstrap fails.
replace('plugin.tap(frame.hooks.fetch.response,(context,props)=>{', `plugin.tap(frame.hooks.fetch.response,(context,props)=>{
        if(!disposed&&!context.parsed.isIframe&&['document','iframe'].includes(context.parsed.destination)&&props.response.status>=200&&props.response.status<300&&window.KkeepXboxSignIn.isSignIn(context.parsed.url.href)){
          loadedUrl=context.parsed.url.href;callbacks.onNavigate(loadedUrl);startLoading();
        }`);
// Microsoft's form is mounted after its document load event, BRS config and
// three deferred bundles. Do not declare that async bootstrap broken at 7s.
replace('},7000);};','},window.KkeepXboxSignIn.isSignIn(loadedUrl)?45000:7000);};');
replace('blankTimer=setTimeout(()=>{if(disposed)return;', 'blankTimer=setTimeout(()=>{if(disposed||signInActive)return;');
replace("if(!disposed)callbacks.onError('This page is taking longer than expected.","if(!disposed&&!signInActive)callbacks.onError('This page is taking longer than expected.");
replace('back(){frame.back();}', 'openSignIn(){return signInWindow.open();},back(){frame.back();}');
replace('destroy(){disposed=true;', "destroy(){disposed=true;window.removeEventListener('message',signInStatus);signInWindow.destroy();");
replace('observer?.disconnect();element.src=', 'observer?.disconnect();mediaCleanup?.();signInCleanup?.();element.src=');
writeFileSync(new URL('runtime.js',to),'/* Generated by scripts/build-xbox-runtime.mjs. Xbox only. */\n'+runtime);
writeFileSync(new URL('proxy-sw.js',to),isolate(readFileSync(new URL('proxy-sw.js',from),'utf8')).replace('Reopen Xbox NOW.','Reopen Xbox Cloud Gaming.'));
copyFileSync(new URL('lib/xbox/media-compat.js',root),new URL('media-compat.js',to));
copyFileSync(new URL('lib/xbox/signin-compat.js',root),new URL('signin-compat.js',to));
for(const file of ['signin-window.js','signin-status.js'])copyFileSync(new URL('lib/xbox/'+file,root),new URL(file,to));
writeFileSync(new URL('style.css',to),readFileSync(new URL('style.css',from),'utf8')+'\n'+readFileSync(new URL('lib/xbox/style-extra.css',root),'utf8'));
console.log('Built isolated Xbox Scramjet V2 engine');
