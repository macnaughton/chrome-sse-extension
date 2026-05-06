(function () {
  'use strict';

  const _EventSource = window.EventSource;
  const _fetch = window.fetch;

  function sendToExtension(payload) {
    window.dispatchEvent(new CustomEvent('__sse_inspector__', { detail: payload }));
  }

  // --- Intercept EventSource ---
  window.EventSource = function (url, config) {
    const es = new _EventSource(url, config);
    const streamId = `es-${crypto.randomUUID()}`;

    sendToExtension({ type: 'stream_open', streamId, url: url.toString(), transport: 'EventSource' });

    const origAddListener = es.addEventListener.bind(es);

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

    origAddListener('error', function () {
      sendToExtension({ type: 'stream_error', streamId, url: url.toString(), timestamp: Date.now() });
    });

    const origClose = es.close.bind(es);
    es.close = function () {
      sendToExtension({ type: 'stream_close', streamId, url: url.toString(), timestamp: Date.now() });
      return origClose();
    };

    return es;
  };

  Object.assign(window.EventSource, _EventSource);
  window.EventSource.prototype = _EventSource.prototype;
  window.EventSource.CONNECTING = 0;
  window.EventSource.OPEN = 1;
  window.EventSource.CLOSED = 2;

  function parseSSELines(lines, streamId, url, sendToExtension) {
    let currentEvent = { eventType: 'message', data: '', id: '' };
    for (const line of lines) {
      if (line.startsWith('data:')) {
        const chunk = line.slice(5).trimStart();
        currentEvent.data = currentEvent.data ? currentEvent.data + '\n' + chunk : chunk;
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

  // --- Intercept fetch for text/event-stream ---
  window.fetch = async function (...args) {
    const response = await _fetch(...args);
    const contentType = response.headers.get('content-type') || '';

    if (!contentType.includes('text/event-stream')) {
      return response;
    }

    const url = typeof args[0] === 'string' ? args[0] : (args[0]?.url || 'unknown');
    const streamId = `fetch-${crypto.randomUUID()}`;

    sendToExtension({ type: 'stream_open', streamId, url, transport: 'fetch' });

    const original = response.body;
    if (!original) return response;

    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const decoder = new TextDecoder();
    let buffer = '';

    (async () => {
      const reader = original.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            const tail = decoder.decode();
            if (tail) buffer += tail;
            if (buffer.trim()) {
              parseSSELines(buffer + '\n', streamId, url, sendToExtension);
            }
            sendToExtension({ type: 'stream_close', streamId, url, timestamp: Date.now() });
            await writer.close();
            break;
          }
          await writer.write(value);
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop();
          parseSSELines(lines, streamId, url, sendToExtension);
        }
      } catch {
        sendToExtension({ type: 'stream_error', streamId, url, timestamp: Date.now() });
        await writer.abort().catch(() => {});
      }
    })();

    return new Response(readable, {
      status: response.status,
      statusText: response.statusText,
      headers: new Headers(response.headers),
    });
  };
})();
