# Changelog

All notable public changes to NTP Groups are documented here.

## 0.2.0 — 2026-08-18

### Added
- Added portable JSON **Export / Import** for the complete NTP Groups configuration, including preferences and nested folder structure. Import validates the file before replacing data and keeps one rollback snapshot for **Undo last import**.
- Added folders inside folders with a deliberately bounded maximum depth of two folder levels. At the final level, **Add** opens the site editor directly instead of showing another type choice.
- Added spring-loaded folder navigation while dragging: hovering a valid folder target for about 750 ms opens it without releasing the dragged item. After a spring-open, the pointer must move before another level can open, preventing accidental rapid drill-down.
- Added optional **Persistent Hub** mode. Each normal browser window can keep one pinned NTP Groups Hub; the toolbar action and **Alt+H** return to that Hub without navigating or replacing the current site tab.
- Added a Manifest V3 service worker for Hub lifecycle management while keeping permissions limited to `storage`, `search`, and `favicon`.

### Changed
- Replaced the School starter folder with **Media** for a more universal first-run layout: **Personal**, **Work**, **Social**, and **Media**.
- When a page is the Persistent Hub, opening a saved site or submitting search opens a new active tab so the Hub itself remains unchanged.
- Browser-owned New Tab extension attribution is intentionally not exposed as an NTP Groups setting because an extension cannot control that browser-owned UI.
- Rebuilt the app icon so the rounded group container itself forms the icon silhouette on a transparent outer canvas, with no additional square background.
- NTP Groups now uses the same grouped mark as the New Tab favicon instead of the older scratch-only favicon.

### Verified
- Edge isolated-profile acceptance passes on Microsoft Edge 151.0.4129.86, including schema v2 → v3 migration, nested folder creation, export/import/undo, Persistent Hub behavior, `Alt+H`, and real Windows mouse spring-drag through two folder levels.

## 0.1.13 — 2026-08-18

### Changed
- Open groups now collapse back to the root whenever the NTP becomes hidden, including switching tabs or minimizing the browser window.
- Current-tab site navigation and search clear transient group history before leaving, so returning to NTP starts at the root.

## 0.1.12 — 2026-08-18

### Changed
- Replaced opinionated first-run sites and topic-specific folders with four empty, neutral starter groups: **Personal**, **Work**, **Social**, and **School**.
- Existing saved layouts are preserved; the new starter layout applies only to fresh installs and Reset Layout.

## 0.1.11 — 2026-08-18

### Added
- Added **hub mode**: site shortcuts can open in a new active tab while the NTP Groups page remains open.
- Added a Settings toggle for hub mode. It is enabled by default and can be disabled to restore same-tab navigation.

### Changed
- Store documentation and test instructions now cover hub-mode behavior.

## 0.1.10 — 2026-08-18

### Changed
- Simplified open-group headers to the editable group title only.
- Removed redundant back and header-add controls.
- Refined Escape behavior while renaming groups.
- Refreshed Chrome Web Store screenshots for the simplified group UI.

### Fixed
- Finalized spatial drag-and-drop behavior across the root and open groups.
- Fixed group opening transitions so no oversized intermediate folder icon appears.
