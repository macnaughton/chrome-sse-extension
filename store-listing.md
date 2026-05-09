# Chrome Web Store Listing — SSE Inspector

## Name
SSE Inspector

## Summary (132 chars max)
Real-time Server-Sent Event debugger. Capture, inspect, and filter SSE streams from EventSource and fetch in Chrome DevTools.

## Category
Developer Tools

## Detailed Description

SSE Inspector adds a dedicated panel to Chrome DevTools for capturing and debugging Server-Sent Event streams — no proxy, no config, just open DevTools.

**FEATURES**
• Captures both native EventSource connections and fetch()-based SSE streams
• Real-time event display with automatic JSON pretty-printing
• Filter events by stream URL, event type, or data content
• Event frequency analysis — see which streams are most active
• Export captured events as JSON for offline analysis
• Optional persistence — events survive page refreshes
• Up to 500 events stored per tab

**PERFECT FOR**
• Debugging AI/LLM applications using streaming responses (OpenAI, Anthropic, etc.)
• Inspecting server-sent notifications and live data feeds
• Monitoring real-time event pipelines during development

**HOW IT WORKS**
SSE Inspector injects a lightweight script at page load that transparently wraps the browser's native EventSource and fetch APIs. When a fetch response has a text/event-stream content type, events are captured and forwarded to the DevTools panel. All data stays on your device — nothing is sent anywhere.

**PRIVACY**
SSE Inspector collects no data. All captured events are stored locally in your browser and cleared when you close the tab or browser. Full privacy policy: https://github.com/macnaughton/chrome-sse-extension/blob/main/privacy-policy.html

**PERMISSIONS**
• All websites (<all_urls>): Required because SSE streams can originate from any domain you're debugging. The extension only reads event-stream data and does not modify page content.
• Storage: Saves your persistence preference and optionally buffers events across page refreshes.
• Scripting / Tabs: Connects the DevTools panel to the inspected page.

**SOURCE CODE**
https://github.com/macnaughton/chrome-sse-extension

---

## Store Assets Checklist

### Required (upload in Developer Dashboard)
- [ ] Icon 128x128 — `images/icon-128.png` (already in repo)
- [ ] At least 1 screenshot (1280x800 or 640x400 PNG)
  - Suggested: DevTools panel open on a page with active SSE streams
  - Suggested: JSON pretty-print view of a streaming AI response
  - Suggested: Filtered event list showing event type breakdown
- [ ] Privacy policy URL — host `privacy-policy.html` (e.g. GitHub Pages or any public URL)

### Optional but Recommended
- [ ] Promotional tile 440x280 PNG (shown in store search results)
- [ ] Marquee image 1400x560 PNG (shown if featured)

