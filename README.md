# NTP Groups

<p align="center"><img src="icons/icon128.png" width="96" height="96" alt="NTP Groups logo"></p>

A minimal Manifest V3 New Tab override that adds folders/groups for favorite sites while keeping the interface compact and browser-native. The current visual tuning targets Brave first.

## Design goals

- Native-feeling Brave layout, not a dashboard theme.
- First run starts with four empty neutral groups — Personal, Work, Social, and School — so the extension demonstrates grouping without assuming which sites the user wants.
- Folder tiles preview the first four favicons.
- Folder opening is an in-place transition, not navigation to a separate dashboard.
- Folder titles are editable inline without opening a separate rename dialog.
- Optional hub mode opens sites in a new active tab while keeping the NTP page open; it is enabled by default and can be disabled in Settings.
- Open groups are transient navigation state: when the NTP becomes hidden, including switching tabs or minimizing the browser window, the group collapses so returning starts from the root.
- Root sites and groups can be reordered with edge drop-zones. Dragging a root item beyond the left or right edge moves it to the first or last position. Dragging above or below the launcher row snaps the item to the nearest logical insertion position based on its horizontal pointer position; on wrapped layouts, upward drops target the top row and downward drops target the bottom row. Inside an open group, free-space dragging snaps to the nearest in-group slot while the pointer remains inside the group panel; crossing the panel boundary moves the site back to the root. A deliberate center-hover moves a root site into an existing group or creates a new group from two root sites.
- The 16px/32px manifest icons use a scratch-only mark for tiny tab/favicon contexts; the 48px/128px assets keep the full four-tile logo for extension management and store presentation.
- No framework, no build step, no remote scripts.
- Narrow permissions only: `storage`, `search`, `favicon`.
- Search uses only the browser's current default search provider through `chrome.search`; there is no hard-coded fallback provider.
- Configuration stays in `chrome.storage.local`.

## Reference boundary

Bonjourr is stored separately under `D:\dev\References\Bonjourr` and is GPL-3.0. This project does not copy Bonjourr source. Bonjourr was used only as a behavioral reference for state separation and transition ideas around link groups/folders.

## Distribution

- **Brave / Chromium development install:** use the unpacked extension from this repository or the verified ZIP from GitHub Releases.
- **Microsoft Edge Add-ons:** submission assets and package are prepared under `store/` and `dist/edge/`; isolated-profile sideload acceptance passed on Microsoft Edge 151.0.4129.86, including the New Tab override, storage/search/tabs APIs, hub mode, and favicon rendering.
- **Chrome Web Store:** not currently published.

## Load unpacked in Brave

1. Open `brave://extensions`.
2. Enable Developer mode.
3. Choose **Load unpacked**.
4. Select `D:\dev\NTP-Groups`.

If another extension currently overrides New Tab, disable it before accepting this one as the active New Tab provider.
