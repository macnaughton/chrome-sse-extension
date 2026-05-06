// SSE Inspector - Background Service Worker

const MAX_EVENTS = 500;
const tabEvents = {};
let persistEnabled = false;

chrome.storage.local.get('persistEnabled', (r) => {
  persistEnabled = r.persistEnabled ?? false;
});

function getTabData(tabId) {
  if (!tabEvents[tabId]) {
    tabEvents[tabId] = { streams: {}, events: [], paused: false };
  }
  return tabEvents[tabId];
}

const persistTimers = {};

function maybePersist(tabId) {
  if (!persistEnabled) return;
  clearTimeout(persistTimers[tabId]);
  persistTimers[tabId] = setTimeout(() => {
    const data = tabEvents[tabId];
    if (!data) return;
    chrome.storage.session.set({
      [`tab_${tabId}`]: { streams: data.streams, events: data.events, paused: data.paused }
    }).catch(() => {});
  }, 500);
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'update') return;

  if (message.type === 'get_data') {
    const inMem = tabEvents[message.tabId];
    const hasInMem = inMem && inMem.events.length > 0;
    if (persistEnabled && !hasInMem) {
      chrome.storage.session.get(`tab_${message.tabId}`, (r) => {
        const saved = r[`tab_${message.tabId}`];
        if (saved && saved.events.length > 0) {
          tabEvents[message.tabId] = saved;
        }
        const data = getTabData(message.tabId);
        sendResponse({ streams: data.streams, events: data.events, paused: data.paused, persistEnabled });
      });
      return true;
    }
    const data = getTabData(message.tabId);
    sendResponse({ streams: data.streams, events: data.events, paused: data.paused, persistEnabled });
    return true;
  }

  if (message.type === 'clear_data') {
    tabEvents[message.tabId] = { streams: {}, events: [], paused: false };
    chrome.storage.session.remove(`tab_${message.tabId}`);
    sendResponse({ ok: true });
    return true;
  }

  if (message.type === 'toggle_pause') {
    const data = getTabData(message.tabId);
    data.paused = !data.paused;
    sendResponse({ paused: data.paused });
    return true;
  }

  if (message.type === 'set_persist') {
    persistEnabled = message.enabled;
    chrome.storage.local.set({ persistEnabled });
    sendResponse({ ok: true });
    return true;
  }

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
      lastEventAt: null,
    };
  } else if (message.type === 'event') {
    if (data.streams[message.streamId]) {
      data.streams[message.streamId].eventCount++;
      data.streams[message.streamId].lastEventAt = message.timestamp;
    }
    data.events.push({ ...message, id: `${Date.now()}-${Math.random()}` });
    if (data.events.length > MAX_EVENTS) {
      data.events.splice(0, data.events.length - MAX_EVENTS);
    }
    maybePersist(tabId);
  } else if (message.type === 'stream_close' || message.type === 'stream_error') {
    if (data.streams[message.streamId]) {
      data.streams[message.streamId].closedAt = Date.now();
      data.streams[message.streamId].status = message.type === 'stream_error' ? 'error' : 'closed';
    }
    maybePersist(tabId);
  }

  chrome.runtime.sendMessage({ type: 'update', tabId }).catch(() => {});
});

chrome.tabs.onRemoved.addListener((tabId) => {
  delete tabEvents[tabId];
  chrome.storage.session.remove(`tab_${tabId}`);
});
