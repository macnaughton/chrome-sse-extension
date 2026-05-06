// SSE Inspector - Content Script
// Intercepts EventSource and fetch-based SSE streams

(function () {
  'use strict';

  // Inject the interceptor into the page context (bypasses CSP for EventSource)
  const script = document.createElement('script');
  script.textContent = `(${interceptorScript.toString()})()`;
  (document.head || document.documentElement).appendChild(script);
  script.remove();

  function interceptorScript() {
    const _EventSource = window.EventSource;
    const _fetch = window.fetch;

    function sendToExtension(payload) {
      window.dispatchEvent(new CustomEvent('__sse_inspector__', { detail: payload }));
    }

    // --- Intercept EventSource ---
    window.EventSource = function (url, config) {
      const es = new _EventSource(url, config);
      const streamId = `es-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

      sendToExtension({ type: 'stream_open', streamId, url: url.toString(), transport: 'EventSource' });

      const origAddListener = es.addEventListener.bind(es);
      const origOnMessage = Object.getOwnPropertyDescriptor(EventSource.prototype, 'onmessage');

      // Intercept addEventListener
      es.addEventListener = function (eventType, handler, ...rest) {
        const wrapped = function (event) {
          sendToExtension({
            type: 'event',
            streamId,
            url: url.toString(),
            eventType,
            data: event.data,
            lastEventId: event.lastEventId,
            timestamp: Date.now(),
          });
          return handler.call(this, event);
        };
        return origAddListener(eventType, wrapped, ...rest);
      };

      es.addEventListener('message', function (event) {
        sendToExtension({
          type: 'event',
          streamId,
          url: url.toString(),
          eventType: 'message',
          data: event.data,
          lastEventId: event.lastEventId,
          timestamp: Date.now(),
        });
      });

      es.addEventListener('error', function () {
        sendToExtension({ type: 'stream_error', streamId, url: url.toString(), timestamp: Date.now() });
      });

      es.addEventListener('open', function () {
        sendToExtension({ type: 'stream_open_confirm', streamId, url: url.toString(), timestamp: Date.now() });
      });

      const origClose = es.close.bind(es);
      es.close = function () {
        sendToExtension({ type: 'stream_close', streamId, url: url.toString(), timestamp: Date.now() });
        return origClose();
      };

      return es;
    };

    // Copy static props
    Object.assign(window.EventSource, _EventSource);
    window.EventSource.prototype = _EventSource.prototype;

    // --- Intercept fetch for text/event-stream ---
    window.fetch = async function (...args) {
      const response = await _fetch(...args);
      const contentType = response.headers.get('content-type') || '';

      if (!contentType.includes('text/event-stream')) {
        return response;
      }

      const url = typeof args[0] === 'string' ? args[0] : (args[0]?.url || 'unknown');
      const streamId = \`fetch-\${Date.now()}-\${Math.random().toString(36).slice(2, 7)}\`;

      sendToExtension({ type: 'stream_open', streamId, url, transport: 'fetch' });

      const original = response.body;
      const [stream1, stream2] = original.tee();

      // Read stream2 for inspection
      (async () => {
        const reader = stream2.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            sendToExtension({ type: 'stream_close', streamId, url, timestamp: Date.now() });
            break;
          }
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\\n');
          buffer = lines.pop();

          let currentEvent = { eventType: 'message', data: '', id: '' };
          for (const line of lines) {
            if (line.startsWith('data:')) {
              currentEvent.data += line.slice(5).trimStart();
            } else if (line.startsWith('event:')) {
              currentEvent.eventType = line.slice(6).trim();
            } else if (line.startsWith('id:')) {
              currentEvent.id = line.slice(3).trim();
            } else if (line === '') {
              if (currentEvent.data) {
                sendToExtension({
                  type: 'event',
                  streamId,
                  url,
                  eventType: currentEvent.eventType,
                  data: currentEvent.data,
                  lastEventId: currentEvent.id,
                  timestamp: Date.now(),
                });
              }
              currentEvent = { eventType: 'message', data: '', id: '' };
            }
          }
        }
      })();

      return new Response(stream1, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    };
  }

  // Listen for custom events from page context
  window.addEventListener('__sse_inspector__', (event) => {
    chrome.runtime.sendMessage(event.detail).catch(() => {});
  });
})();
