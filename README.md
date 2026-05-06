# SSE Inspector

A Chrome DevTools extension for capturing and inspecting Server-Sent Event streams. Built for debugging agentic chat apps and other SSE-heavy workflows.

![SSE Inspector panel showing captured events](https://placeholder)

## Features

- **Intercepts both transports** — `fetch`-based SSE (`text/event-stream`) and native `EventSource`
- **DevTools panel** — persistent tab in Chrome DevTools, stays open as you navigate
- **Live stream chips** — one chip per connection showing transport, event count, and live latency while the stream is open
- **Event type frequency bar** — proportional bar showing distribution of event types across filtered events
- **JSON path filter** — filter by nested field value: `type=content_block_delta` or `delta.type=text_delta`
- **Per-field copy** — hover any JSON field in an expanded event to copy its value
- **Export** — copies filtered events as NDJSON to clipboard
- **Persist across reloads** — optional; survives page reloads within a browser session
- **Pause / Clear** — stop capturing without losing existing events, or wipe and start fresh

## Installation

This extension is not published to the Chrome Web Store. Load it manually:

1. Clone or download this repo
2. Open `chrome://extensions`
3. Enable **Developer mode** (top-right toggle)
4. Click **Load unpacked** and select this directory
5. The extension icon appears in the toolbar; the **SSE Inspector** tab appears in DevTools

## Usage

Open DevTools on any page making SSE requests. The **SSE Inspector** tab captures streams automatically.

**Reload order matters:** always refresh the extension first (`chrome://extensions` → ↺), then reload the page. The interceptor patches `window.fetch` at `document_start` — if the page loads before the extension, connections made during that window are missed.

### Filtering

| Input | Behavior |
|---|---|
| `content_block_delta` | Text search across event data, type, and URL |
| `type=content_block_delta` | Match events where `data.type === "content_block_delta"` |
| `delta.type=text_delta` | Match events where `data.delta.type === "text_delta"` |

Use the **ALL / MSG / EVT** buttons to filter by SSE event type (all, `message`-type only, or named custom events only).

### Frequency bar

Shows a proportional colored bar of event type distribution across currently-filtered events. Keys off the `type` field inside the JSON payload when all events share the same SSE event type (common with APIs that multiplex over a single `message` stream). Toggle with the **FREQ** button. Hidden when only one distinct type is present.

### Persist

When enabled, events are stored in `chrome.storage.session` and restored after page reloads. Cleared when the browser closes. Useful for comparing event sequences across reloads without losing prior captures.

## Architecture

```
page context (MAIN world)
  injected.js
    patches window.fetch + window.EventSource
    dispatches CustomEvents on window

isolated world
  content.js
    listens for CustomEvents
    forwards to background via chrome.runtime.sendMessage

background service worker
  background.js
    stores up to 500 events per tab in memory
    optionally persists to chrome.storage.session
    notifies open panels via chrome.runtime.sendMessage

DevTools panel / popup
  popup.html + popup.js
    polls background every 1.5s (fallback)
    updates immediately on push notification
```

The `"world": "MAIN"` content script declaration bypasses page CSP entirely — no inline script injection, no `script.src` tricks.

## Known limitations

- **`onmessage` property not intercepted** — EventSource connections that set `es.onmessage = fn` instead of `es.addEventListener('message', fn)` won't have their events captured. Fetch-based SSE (the common case for modern APIs) is unaffected.
- **Events before DevTools opens** — events captured before the panel is opened are stored in the background and loaded on first open, but the 1.5s poll means there's a short delay before they appear.
- **Service worker restarts** — Chrome can kill the background service worker at any time. With persist disabled, events accumulated before a restart are lost. With persist enabled they survive.
- **500 event cap per tab** — older events are dropped when the cap is reached. Increase `MAX_EVENTS` in `background.js` if needed.

## Development

No build step. Edit files directly and reload via `chrome://extensions` → ↺.

For TypeScript + hot-reload, [WXT](https://wxt.dev) and [Plasmo](https://plasmo.com) are the standard frameworks if this grows beyond a personal tool.
