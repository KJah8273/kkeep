/* AGPL-3.0-only. Startup diagnostics only: no form values, URLs or account data. */
(()=>{
  'use strict';
  const kinds=['ready','blank','frame-navigation','controller','rewriter','syntax','resource','script'];
  const scripts=['page','main','vendors','ui','engine','other'];
  function normalize(value){
    if(!value||value.type!=='kkeep-xbox-signin'||!kinds.includes(value.kind)||!scripts.includes(value.script))return null;
    const result={type:'kkeep-xbox-signin',revision:5,kind:value.kind,script:value.script};
    for(const key of ['line','column'])if(Number.isInteger(value[key])&&value[key]>=0&&value[key]<=10000000)result[key]=value[key];
    for(const key of ['bodyHidden','rootEmpty'])if(typeof value[key]==='boolean')result[key]=value[key];
    return result;
  }
  const identify=value=>{
    const s=String(value||'');
    if(/login-fluent[^/]*\.js/.test(s))return 'main';
    if(/fluent-chunk_vendors[^/]*\.js/.test(s))return 'vendors';
    if(/fluent-chunk_fluentui[^/]*\.js/.test(s))return 'ui';
    if(/(?:scramjet|controller\.(?:inject|api))\.js/.test(s))return 'engine';
    if(/oauth20_authorize\.srf/.test(s))return 'page';
    return 'other';
  };
  function classify(message){
    if(/permission to navigate|Blocked a frame|Unsafe attempt to initiate navigation/i.test(message))return 'frame-navigation';
    if(/reading ['"]controller['"]/.test(message))return 'controller';
    if(/\$scramjet\$\w+ is not defined/.test(message))return 'rewriter';
    if(/Unexpected (token|identifier|end)/.test(message))return 'syntax';
    return 'script';
  }
  function watch(win){
    const doc=win.document,add=win.addEventListener.bind(win),remove=win.removeEventListener.bind(win);
    const later=win.setTimeout.bind(win),cancel=win.clearTimeout.bind(win),query=doc.querySelectorAll.bind(doc);
    const host=win.parent!==win?win.parent:win.opener;
    if(!host)return ()=>{};
    const send=host.postMessage.bind(host),origin=win.location.origin,started=Date.now();
    let stopped=false,timer,reported=false;
    const emit=info=>{const value=normalize({type:'kkeep-xbox-signin',...info});if(value)send(value,origin);};
    const error=event=>{
      if(stopped||reported)return;
      const resource=event.target?.tagName==='SCRIPT';
      const source=identify(resource?event.target.src:event.filename);
      // Ignore unrelated browser-extension failures and foreign embeds.
      if(source==='other')return;
      reported=true;
      emit({kind:resource?'resource':classify(String(event.message||'')),script:source,line:event.lineno,column:event.colno});
    };
    const stop=()=>{stopped=true;cancel(timer);remove('error',error,true);remove('pagehide',stop);};
    const check=()=>{
      if(stopped)return;
      const visible=Array.from(query('input:not([type="hidden"]),button[type="submit"],[role="button"]')).some(node=>!node.hidden&&node.getClientRects().length>0);
      if(visible){emit({kind:'ready',script:'page'});stop();return;}
      if(Date.now()-started>=20000){
        const body=doc.body,root=query('#root')[0];
        emit({kind:'blank',script:'page',bodyHidden:!!body&&win.getComputedStyle(body).display==='none',rootEmpty:!root||root.childElementCount===0});
        stop();return;
      }
      timer=later(check,500);
    };
    add('error',error,true);add('pagehide',stop);timer=later(check,500);
    return stop;
  }
  window.KkeepXboxSignInStatus={normalize,watch};
  // The engine inserts this before its own bootstrap on Microsoft documents.
  // The launcher loads the same file without this flag for message validation.
  try{if(new URL(document.currentScript.src).searchParams.get('document')==='1')watch(window);}catch{}
})();
