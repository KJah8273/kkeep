/* AGPL-3.0-only. Keep Xbox video inline on iPad without changing input,
 * autoplay policy, audio, codecs, authentication, or WebRTC connections. */
window.KkeepXboxMedia={install(doc){
  const inline=video=>{if(video?.tagName!=='VIDEO')return;video.playsInline=true;video.setAttribute('playsinline','');video.setAttribute('webkit-playsinline','');};
  const scan=node=>{inline(node);node.querySelectorAll?.('video').forEach(inline);};
  const onMedia=event=>inline(event.target);
  doc.addEventListener('loadstart',onMedia,true);
  doc.addEventListener('loadedmetadata',onMedia,true);
  const observer=new MutationObserver(records=>{for(const record of records)for(const node of record.addedNodes)scan(node);});
  observer.observe(doc,{childList:true,subtree:true});scan(doc);
  return()=>{observer.disconnect();doc.removeEventListener('loadstart',onMedia,true);doc.removeEventListener('loadedmetadata',onMedia,true);};
}};
