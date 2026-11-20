(function () {
  'use strict';
  // Restrict to the old top-level home address. Cloudflare may reuse this shell.
  if (window.top === window.self &&
      window.location.hostname === 'kkeep.testerqrr1.chatgpt.site' &&
      window.location.pathname === '/') {
    window.location.replace('https://kkeep.fun/' + window.location.search + window.location.hash);
  }
})();
