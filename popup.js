// SSE Inspector - Popup Script

let allEvents = [];
let streams = {};
let paused = false;
let filterType = 'all';
let filterStream = null;
let searchQuery = '';
let autoScroll = true;

const eventsList = document.getElementById('eventsList');
const streamsBar = document.getElementById('streamsBar');
const searchInput = document.getElementById('search');
const pauseBtn = document.getElementById('pauseBtn');
const clearBtn = document.getElementById('clearBtn');
const statusDot = document.getElementById('statusDot');
const statEvents = document.getElementById('statEvents');
const statStreams = document.getElementById('statStreams');
const scrollBottomBtn = document.getElementById('scrollBottomBtn');

// --- Utilities ---

function formatTime(ts) {
  const d = new Date(ts);
  return d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }) +
    '.' + String(d.getMilliseconds()).padStart(3, '0');
}

function shortUrl(url) {
  try {
    const u = new URL(url);
    return u.pathname + (u.search ? u.search.slice(0, 20) + '…' : '');
  } catch {
    return url.slice(0, 30) + (url.length > 30 ? '…' : '');
  }
}

function tryParseJson(str) {
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}

function syntaxHighlight(obj) {
  const json = JSON.stringify(obj, null, 2);
  return json.replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g, (match) => {
    if (/^"/.test(match)) {
      if (/:$/.test(match)) {
        return `<span class="json-key">${match}</span>`;
      } else {
        return `<span class="json-string">${match}</span>`;
      }
    } else if (/true|false/.test(match)) {
      return `<span class="json-bool">${match}</span>`;
    } else if (/null/.test(match)) {
      return `<span class="json-null">${match}</span>`;
    } else {
      return `<span class="json-number">${match}</span>`;
    }
  });
}

function getPreview(data) {
  const parsed = tryParseJson(data);
  if (parsed && typeof parsed === 'object') {
    const keys = Object.keys(parsed).slice(0, 3).join(', ');
    return `{ ${keys}${Object.keys(parsed).length > 3 ? ', …' : ''} }`;
  }
  return data.slice(0, 60) + (data.length > 60 ? '…' : '');
}

// --- Render ---

function renderStreams() {
  const entries = Object.entries(streams);
  if (entries.length === 0) {
    streamsBar.innerHTML = '<span class="no-streams">No streams detected yet</span>';
    return;
  }

  streamsBar.innerHTML = '';

  // "All" chip
  const allChip = document.createElement('div');
  allChip.className = 'stream-chip' + (filterStream === null ? ' active' : '');
  allChip.innerHTML = `<span class="dot"></span> all`;
  allChip.onclick = () => { filterStream = null; renderStreams(); renderEvents(); };
  streamsBar.appendChild(allChip);

  entries.forEach(([id, info]) => {
    const chip = document.createElement('div');
    chip.className = 'stream-chip' + (filterStream === id ? ' active' : '');
    const dotClass = info.status === 'error' ? 'error' : info.status === 'closed' ? 'closed' : '';
    const transport = info.transport === 'fetch' ? '[fetch]' : '[es]';
    chip.innerHTML = `<span class="dot ${dotClass}"></span> ${transport} ${shortUrl(info.url)} <span style="color:var(--text3)">${info.eventCount || 0}</span>`;
    chip.title = info.url;
    chip.onclick = () => { filterStream = filterStream === id ? null : id; renderStreams(); renderEvents(); };
    streamsBar.appendChild(chip);
  });
}

function matchesFilter(event) {
  if (filterStream && event.streamId !== filterStream) return false;
  if (filterType === 'message' && event.eventType !== 'message') return false;
  if (filterType === 'custom' && event.eventType === 'message') return false;
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    const inData = event.data?.toLowerCase().includes(q);
    const inUrl = event.url?.toLowerCase().includes(q);
    const inType = event.eventType?.toLowerCase().includes(q);
    if (!inData && !inUrl && !inType) return false;
  }
  return true;
}

function renderEvents() {
  const filtered = allEvents.filter(matchesFilter);

  statEvents.textContent = allEvents.length;
  statStreams.textContent = Object.keys(streams).length;

  if (filtered.length === 0) {
    eventsList.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📡</div>
        <div class="empty-text">${allEvents.length === 0
          ? 'Listening for SSE streams...<br/>Navigate to a page that uses Server-Sent Events'
          : 'No events match your filter'
        }</div>
      </div>
    `;
    return;
  }

  // Keep track of expanded items
  const expanded = new Set();
  document.querySelectorAll('.event-item.expanded').forEach(el => expanded.add(el.dataset.id));

  eventsList.innerHTML = '';

  filtered.forEach((event) => {
    const parsed = tryParseJson(event.data);
    const isExpanded = expanded.has(event.id);

    const item = document.createElement('div');
    item.className = 'event-item' + (isExpanded ? ' expanded' : '');
    item.dataset.id = event.id;

    const badgeClass = event.eventType === 'message' ? 'message' : '';
    const preview = getPreview(event.data || '');
    const formattedBody = parsed
      ? `<div class="event-raw">${syntaxHighlight(parsed)}</div>`
      : `<div class="event-raw">${escapeHtml(event.data || '')}</div>`;

    item.innerHTML = `
      <div class="event-header">
        <span class="event-type-badge ${badgeClass}">${escapeHtml(event.eventType)}</span>
        <span class="event-url">${escapeHtml(shortUrl(event.url || ''))}</span>
        <span class="event-preview">${escapeHtml(preview)}</span>
        <span class="event-time">${formatTime(event.timestamp)}</span>
        <span class="chevron">▶</span>
      </div>
      <div class="event-body">
        ${formattedBody}
        <div class="event-meta">
          <div class="meta-item">stream: <span>${escapeHtml(event.streamId || '')}</span></div>
          ${event.lastEventId ? `<div class="meta-item">id: <span>${escapeHtml(event.lastEventId)}</span></div>` : ''}
          <button class="copy-btn" data-copy="${escapeAttr(event.data || '')}">Copy raw</button>
        </div>
      </div>
    `;

    item.querySelector('.event-header').addEventListener('click', () => {
      item.classList.toggle('expanded');
    });

    item.querySelector('.copy-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      navigator.clipboard.writeText(event.data || '').then(() => {
        const btn = e.target;
        btn.textContent = 'Copied!';
        setTimeout(() => { btn.textContent = 'Copy raw'; }, 1200);
      });
    });

    eventsList.appendChild(item);
  });

  if (autoScroll) {
    eventsList.scrollTop = eventsList.scrollHeight;
  }
}

function escapeHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function escapeAttr(str) {
  return String(str).replace(/"/g, '&quot;');
}

// --- Data fetching ---

async function getCurrentTabId() {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      resolve(tabs[0]?.id);
    });
  });
}

let tabId = null;

async function loadData() {
  if (!tabId) return;
  chrome.runtime.sendMessage({ type: 'get_data', tabId }, (response) => {
    if (!response) return;
    allEvents = response.events || [];
    streams = response.streams || {};
    paused = response.paused || false;

    statusDot.className = 'status-dot' + (paused ? ' paused' : '');
    pauseBtn.textContent = paused ? 'Resume' : 'Pause';

    renderStreams();
    renderEvents();
  });
}

// --- Controls ---

pauseBtn.addEventListener('click', async () => {
  if (!tabId) return;
  chrome.runtime.sendMessage({ type: 'toggle_pause', tabId }, (res) => {
    paused = res.paused;
    statusDot.className = 'status-dot' + (paused ? ' paused' : '');
    pauseBtn.textContent = paused ? 'Resume' : 'Pause';
  });
});

clearBtn.addEventListener('click', async () => {
  if (!tabId) return;
  chrome.runtime.sendMessage({ type: 'clear_data', tabId }, () => {
    allEvents = [];
    streams = {};
    filterStream = null;
    renderStreams();
    renderEvents();
  });
});

searchInput.addEventListener('input', () => {
  searchQuery = searchInput.value.trim();
  renderEvents();
});

document.querySelectorAll('.filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    filterType = btn.dataset.filter;
    renderEvents();
  });
});

scrollBottomBtn.addEventListener('click', () => {
  autoScroll = true;
  eventsList.scrollTop = eventsList.scrollHeight;
});

eventsList.addEventListener('scroll', () => {
  const atBottom = eventsList.scrollHeight - eventsList.scrollTop - eventsList.clientHeight < 40;
  autoScroll = atBottom;
});

// --- Live updates ---

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'update' && message.tabId === tabId) {
    loadData();
  }
});

// --- Init ---

(async () => {
  tabId = await getCurrentTabId();
  await loadData();
  setInterval(loadData, 1500); // fallback poll
})();
