// SSE Inspector - Background Service Worker

const MAX_EVENTS = 500;
const tabEvents = {}; // tabId -> { streams: {}, events: [] }

function getTabData(tabId) {
  if (!tabEvents[tabId]) {
    tabEvents[tabId] = { streams: {}, events: [], paused: false };
  }
  return tabEvents[tabId];
}

chrome.runtime.onMessage.addListener((message, sender) => {
  const tabId = sender.tab?.id;
  if (!tabId) return;

  const data = getTabData(tabId);
  if (data.paused) return;

  if (message.type === 'stream_open') {
    data.streams[message.streamId] = {
      url: message.url,
      transport: message.transport,
      openedAt: Date.now(),
      eventCount: 0,
    };
  } else if (message.type === 'event') {
    if (data.streams[message.streamId]) {
      data.streams[message.streamId].eventCount++;
    }
    data.events.push({ ...message, id: `${Date.now()}-${Math.random()}` });
    if (data.events.length > MAX_EVENTS) {
      data.events.shift();
    }
  } else if (message.type === 'stream_close' || message.type === 'stream_error') {
    if (data.streams[message.streamId]) {
      data.streams[message.streamId].closedAt = Date.now();
      data.streams[message.streamId].status = message.type === 'stream_error' ? 'error' : 'closed';
    }
  }

  // Notify popup if open
  chrome.runtime.sendMessage({ type: 'update', tabId }).catch(() => {});
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'get_data') {
    const data = getTabData(message.tabId);
    sendResponse({ streams: data.streams, events: data.events, paused: data.paused });
    return true;
  }
  if (message.type === 'clear_data') {
    if (tabEvents[message.tabId]) {
      tabEvents[message.tabId] = { streams: {}, events: [], paused: false };
    }
    sendResponse({ ok: true });
    return true;
  }
  if (message.type === 'toggle_pause') {
    const data = getTabData(message.tabId);
    data.paused = !data.paused;
    sendResponse({ paused: data.paused });
    return true;
  }
});

// Clean up when tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
  delete tabEvents[tabId];
});
