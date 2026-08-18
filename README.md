# NTP Groups

<p align="center"><img src="icons/icon128.png" width="96" height="96" alt="NTP Groups logo"></p>

A compact Manifest V3 New Tab replacement for organizing favorite sites into folders while keeping the browser's own default search provider. The visual tuning targets Chromium browsers, with Brave as the primary reference.

## Design goals

- Native-feeling Chromium UI rather than a separate dashboard aesthetic.
- Fresh installs start with four empty neutral folders: **Personal**, **Work**, **Social**, and **Media**. Existing saved layouts are preserved during upgrades.
- Folders open in place and preview their first four child items.
- Folder titles are editable inline.
- Folders can contain one additional folder level. The maximum is intentionally bounded at **two folder levels** so navigation stays predictable and the final level can add sites directly without another Site/Folder choice.
- Drag-and-drop supports root reordering, folder reordering, moving sites and folders between valid containers, spatial free-space drops, and deliberate site-to-site folder creation where depth allows it.
- While dragging, hovering a valid folder for about **750 ms** spring-opens it without releasing the dragged item. After a spring-open, pointer movement is required before another level can spring-open, which prevents accidental rapid drill-down.
- Open-folder navigation is transient. When the NTP becomes hidden, including switching tabs or minimizing the browser window, it collapses back to Root.
- **Export / Import** moves the complete configuration between Chromium browsers as JSON. Imports are validated first and keep one rollback snapshot for **Undo last import**.
- **Persistent Hub** is optional. When enabled, each normal browser window can keep one pinned NTP Groups Hub. The extension toolbar button and the assigned shortcut (default **Alt+H**) activate that Hub instead of navigating the current site tab. The Hub's position inside the pinned strip is user-owned and is never forced back to a fixed slot.
- Sites and searches launched from a Persistent Hub always open in a new active tab so the Hub itself stays unchanged.
- The ordinary `Ctrl+T` and browser `+` behavior is intentionally left native. NTP Groups does not create-and-destroy temporary tabs to simulate a single New Tab singleton.
- The app icon has a transparent outer canvas. Large sizes (48/128) use the full 2×2 group mark; compact sizes (16/32) use only the blue active cell with enlarged scratches for legibility.
- No framework, build system, remote scripts, analytics, ads, trackers, or developer-operated backend.
- Permissions remain limited to `storage`, `search`, and `favicon`; there are no host permissions and no `tabs` permission.
- Search uses only `chrome.search.query`, so the browser's configured default search provider remains authoritative.
- Saved layout/preferences stay in `chrome.storage.local`. Temporary Hub tab mapping uses `chrome.storage.session`.

## Reference boundary

Bonjourr is stored separately under `D:\dev\References\Bonjourr` and is GPL-3.0. NTP Groups does not copy Bonjourr source. It was used only as a behavioral reference for state separation and transition ideas around grouped shortcuts.

## Distribution

Requires Chromium **116+** because Persistent Hub context discovery uses `chrome.runtime.getContexts()`.

- **Brave / Chrome / Chromium development install:** use the unpacked extension from this repository or the verified ZIP from GitHub Releases.
- **Microsoft Edge Add-ons:** submission assets and the Edge package live under `store/` and `dist/edge/`. Isolated-profile acceptance is automated with `tools\edge-acceptance.ps1`.
- **Chrome Web Store:** not currently published.

## Load unpacked

1. Open the browser's extensions page (`brave://extensions`, `chrome://extensions`, or `edge://extensions`).
2. Enable Developer mode.
3. Choose **Load unpacked**.
4. Select `D:\dev\NTP-Groups`.

If another extension currently owns the New Tab override, disable it before accepting NTP Groups as the active New Tab provider.
