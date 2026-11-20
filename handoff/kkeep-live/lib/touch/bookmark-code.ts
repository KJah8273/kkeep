export const controlsBookmarkEvent='kkeep-controls-bookmark';

export function createControlsBookmark(origin:string){
  const script=new URL('/controls/kkeep-touch.js?v=2',origin).href;
  // Kkeep owns the controller lifecycle; original provider pages use the asset.
  const loader=`void(function(){var e=new Event(${JSON.stringify(controlsBookmarkEvent)},{cancelable:true});if(!window.dispatchEvent(e))return;if(window.__kkeepTouch){window.__kkeepTouch.show();return;}var s=document.createElement('script');s.src=${JSON.stringify(script)};s.onerror=function(){alert('The controls could not load. Open your cloud game in Kkeep and try the bookmark again.');s.remove();};(document.head||document.documentElement).appendChild(s);}())`;
  return 'javascript:'+encodeURIComponent(loader);
}
