// SSE Inspector - Content Script (isolated world)
// Bridges CustomEvents from the MAIN world injected.js to the extension background

(function () {
  'use strict';

  window.addEventListener('__sse_inspector__', (event) => {
    chrome.runtime.sendMessage(event.detail).catch(() => {});
  });
})();
