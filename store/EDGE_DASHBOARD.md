# NTP Groups — Microsoft Edge Add-ons submission

## Package

`D:\dev\NTP-Groups\dist\edge\NTP-Groups-0.2.0-edge.zip`

The package must be byte-identical to the Chromium 0.2.0 package and contains no `update_url` field.

## Current Partner Center submission defaults

### Packages

Upload: `D:\dev\NTP-Groups\dist\edge\NTP-Groups-0.2.0-edge.zip`

### Availability

- Visibility: **Public**.
- Markets: **All markets** (default), unless a later legal/localization reason requires narrowing distribution.

### Properties

- Category: **Productivity**.
- Website: optional; leave blank for the first submission unless a dedicated product landing page is added.
- Support contact: `https://github.com/FreNzy1000/ntp-groups/issues`.
- Mature content: **No**.

### Privacy

- Single Purpose: use the text in the **Single purpose** section below.
- Permission justification: use the `storage`, `search`, and `favicon` explanations below.
- Remote code: **No, I am not using remote code**.
- Personal information / privacy requirement: answer conservatively that the extension **accesses/handles user-provided URLs and search text**, even though saved layout data is local and nothing is transmitted to the developer. Use the published privacy policy URL.
- Data usage categories: select only categories that actually correspond to the form's current labels for saved URLs/browsing activity and search text; do not claim that the extension handles no user information.
- Privacy policy: `https://frenzy1000.github.io/ntp-groups/store/privacy/`.

### Store listing

- Primary listing language for the first submission: **English**.
- Search terms: `new tab`, `shortcuts`, `folders`, `favorites`, `launcher`, `productivity`.
- Use the logo, four screenshots, and promotional tiles listed in **Assets** below.

## Category

Productivity

## Short description

Grouped favorites and folders for a clean New Tab page.

## Description

NTP Groups replaces the New Tab page with a compact launcher built around grouped shortcuts. Keep frequently used sites at the top level, place related sites into folders, create one additional folder level, rename folders inline, and move shortcuts or folders between valid containers with drag-and-drop. Spring-loaded folder navigation lets a drag continue into a folder after a deliberate hover.

Configuration can be exported/imported as a local JSON backup with one-step import undo. The optional Persistent Hub keeps one pinned NTP Groups tab per normal browser window; the toolbar action or Alt+H returns to that Hub without replacing the current site tab. Search is handed to the browser's configured default search provider through the browser search API.

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

Edge-specific sideload acceptance for **NTP Groups 0.2.0 passed** on Microsoft Edge 151.0.4129.86 using an isolated temporary profile and the real **Load unpacked** flow.

Verified:

- Manifest V3 package loads as `UNPACKED` and `ENABLED` with no manifest/runtime errors.
- A real Edge New Tab action renders the NTP Groups extension context. Edge exposes the outer CDP target as `edge://newtab/`, while the rendered DOM reports the extension URL `chrome-extension://klabdepdolneccohgddjjacheopijapj/newtab.html`.
- `chrome.storage.local` read/write/remove round-trip passes.
- `chrome.search.query` is available.
- `chrome.tabs.create` and tab removal pass without adding the `tabs` permission.
- The Chromium `_favicon` endpoint used by NTP Groups responds successfully in Edge (`HTTP 200`).
- NTP Groups UI renders with the fresh-install layout of four empty neutral folders (Personal, Work, Social, Media) and Settings.
- Schema v2 data migrates to v3 without dropping root or folder items.
- A folder can contain one additional folder level; the final level adds sites directly.
- JSON export, validated import, and one-step import undo pass.
- Persistent Hub pins the selected NTP, leaves launched sites/searches in separate tabs, and returns through the toolbar/background command path; the registered shortcut is `Alt+H`.
- Synthetic and real Windows mouse spring-drag pass through two folder levels, including the movement guard after the first spring-open.
- Opening a folder, switching to a newly active tab, and returning collapses the transient folder state back to Root.
- The package contains no `update_url` field.

The Edge and Chromium 0.2.0 ZIPs must be rebuilt byte-identically and verified before publication.
