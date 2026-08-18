# Changelog

All notable public changes to NTP Groups are documented here.

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
