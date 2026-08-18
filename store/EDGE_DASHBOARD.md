# NTP Groups — Microsoft Edge Add-ons submission

## Package

`D:\dev\NTP-Groups\dist\edge\NTP-Groups-0.1.11-edge.zip`

The package is byte-identical to the verified Chromium 0.1.11 release and contains no `update_url` field.

## Category

Productivity

## Short description

Grouped favorites and folders for a clean New Tab page.

## Description

NTP Groups replaces the New Tab page with a compact launcher built around grouped shortcuts. Keep frequently used sites at the top level, place related sites into groups, rename groups inline, and move shortcuts between the root and groups with drag-and-drop.

Hub mode can open sites in a new active tab while keeping NTP Groups open as a persistent launcher. The mode is enabled by default and can be disabled in Settings. Search is handed to the browser's configured default search provider through the browser search API.

Shortcut titles, URLs, layout, group structure, and preferences are stored locally in extension storage. NTP Groups has no ads, analytics, trackers, remote scripts, or developer-operated backend.

## Single purpose

Replace the New Tab page with a local grouped-shortcut launcher that lets users organize, reorder, and open favorite sites while preserving the browser's configured default search provider.

## Permissions

### storage
Required to save user-created shortcuts, group names, ordering, layout state, and preferences locally.

### search
Required to submit New Tab search text through the browser's default search provider.

### favicon
Required to display favicons for user-saved website URLs and previews inside groups.

## Remote code

None. All extension logic is packaged locally.

## Data use

The extension handles user-provided shortcut names and URLs, group names, ordering/layout state, preferences, and search text. Saved shortcut/layout data remains in local extension storage and is not transmitted to the developer. Search text is passed to the browser search API and then processed by the user's configured search provider.

## Privacy policy

https://frenzy1000.github.io/ntp-groups/store/privacy/

## Assets

- Logo: `icons/icon128.png`
- Screenshot 1: `store/screenshots/01-overview-1280x800.png`
- Screenshot 2: `store/screenshots/02-research-group-1280x800.png`
- Screenshot 3: `store/screenshots/03-dev-group-1280x800.png`
- Screenshot 4: `store/screenshots/04-settings-hub-mode-1280x800.png`
- Small promotional tile: `store/promo/small-tile-440x280.png`
- Large promotional tile: `store/promo/marquee-1400x560.png`

## Reviewer notes

No account, login, paid service, or test credentials are required. Open a new tab to see NTP Groups. Test adding/editing shortcuts, inline group rename, root/group drag-and-drop, outside-click group closing, hub mode, and search through the browser's configured default provider.

## Compatibility / validation status

Confirmed from Microsoft Edge extension documentation:

- Manifest V3 is supported.
- `chrome.search`, `chrome.storage`, and `chrome.tabs` are supported on Windows.
- The package contains no `update_url` field.

The Chromium release has been tested in Brave. Microsoft Edge is not currently installed on this development PC, so Edge-specific sideload acceptance remains pending and must be completed before final submission.

**Acceptance gate:** verify the `favicon` permission / `_favicon` URL behavior in Microsoft Edge before submitting. Microsoft's supported-API table documents `search`, `storage`, and `tabs`, but does not explicitly document the Chrome `favicon` permission endpoint used by NTP Groups. If favicon previews fail, do not submit the current package until an Edge-safe favicon path is implemented and re-tested.
