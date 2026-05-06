// SSE Inspector - Popup Script

let allEvents = [];
let streams = {};
let paused = false;
let filterType = 'all';
let filterStream = null;
let searchQuery = '';
let autoScroll = true;
let persistEnabled = false;
let freqVisible = true; // default, updated async on load

const eventsList = document.getElementById('eventsList');
const streamsBar = document.getElementById('streamsBar');
const searchInput = document.getElementById('search');
const pauseBtn = document.getElementById('pauseBtn');
const clearBtn = document.getElementById('clearBtn');
const statusDot = document.getElementById('statusDot');
const statEvents = document.getElementById('statEvents');
const statStreams = document.getElementById('statStreams');
const scrollBottomBtn = document.getElementById('scrollBottomBtn');
const exportBtn = document.getElementById('exportBtn');
const persistToggle = document.getElementById('persistToggle');
const frequencyBar = document.getElementById('frequencyBar');
const freqBtn = document.getElementById('freqBtn');

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
  const json = JSON.stringify(obj, null, 2)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
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
    const latency = info.lastEventAt && !info.status ? ` · ${formatLatency(info.lastEventAt)}` : '';
    chip.innerHTML = `<span class="dot ${dotClass}"></span> ${transport} ${shortUrl(info.url)} <span style="color:var(--text3)">${info.eventCount || 0}${latency}</span>`;
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
    const eqIdx = searchQuery.indexOf('=');
    if (eqIdx > 0) {
      const path = searchQuery.slice(0, eqIdx).trim();
      const value = searchQuery.slice(eqIdx + 1).trim();
      const parsed = tryParseJson(event.data);
      if (!parsed || String(getNestedValue(parsed, path)) !== value) return false;
    } else {
      const q = searchQuery.toLowerCase();
      const inData = event.data?.toLowerCase().includes(q);
      const inUrl = event.url?.toLowerCase().includes(q);
      const inType = event.eventType?.toLowerCase().includes(q);
      if (!inData && !inUrl && !inType) return false;
    }
  }
  return true;
}

function renderFrequency(filtered) {
  if (!frequencyBar) return;
  const counts = {};
  filtered.forEach(e => {
    const parsed = tryParseJson(e.data);
    const key = (parsed?.type) || e.eventType || 'unknown';
    counts[key] = (counts[key] || 0) + 1;
  });
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  if (entries.length <= 1 || !freqVisible) { frequencyBar.classList.add('hidden'); return; }
  frequencyBar.classList.remove('hidden');
  frequencyBar.innerHTML = '';
  const total = filtered.length;
  entries.forEach(([type, count]) => {
    const seg = document.createElement('div');
    seg.className = 'freq-segment';
    seg.style.flex = count;
    seg.style.background = typeColor(type);
    seg.title = `${type}: ${count} (${Math.round(count / total * 100)}%)`;
    const pct = count / total;
    seg.textContent = pct > 0.1 ? `${type} ${count}` : pct > 0.04 ? `${count}` : '';
    frequencyBar.appendChild(seg);
  });
}

function renderEvents() {
  const filtered = allEvents.filter(matchesFilter);
  renderFrequency(filtered);

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

  // Keep track of expanded items and their scroll positions
  const expanded = new Set();
  const rawScrollPositions = {};
  document.querySelectorAll('.event-item.expanded').forEach(el => {
    expanded.add(el.dataset.id);
    const raw = el.querySelector('.event-raw');
    if (raw) rawScrollPositions[el.dataset.id] = raw.scrollTop;
  });

  const prevScrollTop = eventsList.scrollTop;
  eventsList.innerHTML = '';

  filtered.forEach((event) => {
    const parsed = tryParseJson(event.data);
    const isExpanded = expanded.has(event.id);

    const item = document.createElement('div');
    item.className = 'event-item' + (isExpanded ? ' expanded' : '');
    item.dataset.id = event.id;

    const badgeClass = event.eventType === 'message' ? 'message' : '';
    const preview = getPreview(event.data || '');

    item.innerHTML = `
      <div class="event-header">
        <span class="event-type-badge ${badgeClass}">${escapeHtml(event.eventType)}</span>
        <span class="event-url">${escapeHtml(shortUrl(event.url || ''))}</span>
        <span class="event-preview">${escapeHtml(preview)}</span>
        <span class="event-time">${formatTime(event.timestamp)}</span>
        <span class="chevron">▶</span>
      </div>
      <div class="event-body">
        <div class="event-raw"></div>
        <div class="event-meta">
          <div class="meta-item">stream: <span>${escapeHtml(event.streamId || '')}</span></div>
          ${event.lastEventId ? `<div class="meta-item">id: <span>${escapeHtml(event.lastEventId)}</span></div>` : ''}
          <button class="copy-btn" data-copy="${escapeAttr(event.data || '')}">Copy raw</button>
        </div>
      </div>
    `;

    const rawEl = item.querySelector('.event-raw');
    if (parsed) {
      renderJsonTree(parsed, rawEl);
    } else {
      rawEl.textContent = event.data || '';
    }

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

    if (rawScrollPositions[event.id]) {
      const raw = item.querySelector('.event-raw');
      if (raw) raw.scrollTop = rawScrollPositions[event.id];
    }
  });

  if (autoScroll) {
    eventsList.scrollTop = eventsList.scrollHeight;
  } else {
    eventsList.scrollTop = prevScrollTop;
  }
}

function escapeHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function escapeAttr(str) {
  return String(str).replace(/"/g, '&quot;');
}

function renderJsonTree(obj, container, depth = 0) {
  if (depth > 12) {
    const truncated = document.createElement('div');
    truncated.className = 'json-row json-punct';
    truncated.style.paddingLeft = `${depth * 14}px`;
    truncated.textContent = '…';
    container.appendChild(truncated);
    return;
  }
  const isArr = Array.isArray(obj);
  const entries = isArr ? obj.map((v, i) => [String(i), v]) : Object.entries(obj);
  entries.forEach(([key, value]) => {
    const row = document.createElement('div');
    row.className = 'json-row';
    row.style.paddingLeft = `${depth * 14}px`;

    const keyEl = document.createElement('span');
    keyEl.className = 'json-key';
    keyEl.textContent = isArr ? key : `"${key}"`;
    row.appendChild(keyEl);

    const colon = document.createElement('span');
    colon.className = 'json-punct';
    colon.textContent = ': ';
    row.appendChild(colon);

    if (value !== null && typeof value === 'object') {
      const open = Array.isArray(value) ? '[' : '{';
      const close = Array.isArray(value) ? ']' : '}';
      const bracket = document.createElement('span');
      bracket.className = 'json-punct';
      bracket.textContent = open;
      row.appendChild(bracket);
      container.appendChild(row);
      renderJsonTree(value, container, depth + 1);
      const closeRow = document.createElement('div');
      closeRow.className = 'json-row json-punct';
      closeRow.style.paddingLeft = `${depth * 14}px`;
      closeRow.textContent = close;
      container.appendChild(closeRow);
    } else {
      const valEl = document.createElement('span');
      if (value === null) { valEl.className = 'json-null'; valEl.textContent = 'null'; }
      else if (typeof value === 'boolean') { valEl.className = 'json-bool'; valEl.textContent = String(value); }
      else if (typeof value === 'number') { valEl.className = 'json-number'; valEl.textContent = String(value); }
      else { valEl.className = 'json-string'; valEl.textContent = JSON.stringify(value); }
      row.appendChild(valEl);

      const copyBtn = document.createElement('button');
      copyBtn.className = 'field-copy-btn';
      copyBtn.textContent = 'copy';
      copyBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(value === null ? 'null' : String(value));
        copyBtn.textContent = '✓';
        setTimeout(() => { copyBtn.textContent = 'copy'; }, 1000);
      });
      row.appendChild(copyBtn);
      container.appendChild(row);
    }
  });
}

function typeColor(type) {
  let hash = 0;
  for (let i = 0; i < type.length; i++) hash = (hash * 31 + type.charCodeAt(i)) & 0xffffffff;
  return `hsl(${Math.abs(hash) % 360}, 60%, 42%)`;
}

function formatLatency(lastEventAt) {
  if (!lastEventAt) return '';
  const ms = Date.now() - lastEventAt;
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m`;
}

function getNestedValue(obj, path) {
  return path.split('.').reduce((cur, key) => cur?.[key], obj);
}

// --- Data fetching ---

async function getCurrentTabId() {
  if (chrome.devtools?.inspectedWindow) {
    return chrome.devtools.inspectedWindow.tabId;
  }
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
    persistEnabled = response.persistEnabled ?? false;
    persistToggle.checked = persistEnabled;

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

exportBtn.addEventListener('click', () => {
  const filtered = allEvents.filter(matchesFilter);
  const ndjson = filtered.map(e => JSON.stringify(e)).join('\n');
  navigator.clipboard.writeText(ndjson).then(() => {
    exportBtn.textContent = 'Copied!';
    setTimeout(() => { exportBtn.textContent = 'Export'; }, 1500);
  });
});

persistToggle.addEventListener('change', () => {
  persistEnabled = persistToggle.checked;
  chrome.runtime.sendMessage({ type: 'set_persist', enabled: persistEnabled });
});

freqBtn.classList.toggle('active', freqVisible);
freqBtn.addEventListener('click', () => {
  freqVisible = !freqVisible;
  chrome.storage.local.set({ freqVisible });
  freqBtn.classList.toggle('active', freqVisible);
  renderEvents();
});

eventsList.addEventListener('scroll', () => {
  const atBottom = eventsList.scrollHeight - eventsList.scrollTop - eventsList.clientHeight < 40;
  autoScroll = atBottom;
});

// --- Live updates ---

let updateDebounceTimer = null;
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'update' && message.tabId === tabId) {
    clearTimeout(updateDebounceTimer);
    updateDebounceTimer = setTimeout(loadData, 80);
  }
});

// --- Init ---

(async () => {
  tabId = await getCurrentTabId();
  await loadData();
  setInterval(loadData, 1500); // fallback poll
  chrome.storage.local.get('freqVisible', (r) => {
    freqVisible = r.freqVisible ?? true;
    freqBtn.classList.toggle('active', freqVisible);
    renderEvents();
  });
})();

