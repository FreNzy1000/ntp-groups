# NTP Groups — Chrome Web Store Dashboard fields

## Store listing

**Category:** Productivity

**Language:** Use Russian for the first public listing while the extension UI remains Russian. Add an English localized listing after UI localization.

**Summary (RU):**
Организуйте любимые сайты в группы на новой вкладке, сохраняя текущую поисковую систему браузера.

**Summary (EN):**
Organize favorite sites into clean groups on your New Tab page while keeping your browser's default search provider.

## Privacy practices

### Single purpose
Replace the New Tab page with a local grouped-shortcut launcher that lets users organize, reorder, and open favorite sites while preserving the browser's configured default search provider.

### Permission: storage
Required to save user-created site shortcuts, group names, shortcut ordering, layout state, and extension preferences in `chrome.storage.local` so the New Tab layout persists between browser sessions.

### Permission: search
Required to submit text typed into the New Tab search field through `chrome.search.query`, which uses the browser's current default search provider. The extension does not replace or choose the user's search provider.

### Permission: favicon
Required to display favicons for the website URLs that the user saves and to show favicon previews inside groups. The extension uses the browser's built-in favicon mechanism and does not use an external favicon service.

### Host permissions
None.

### Remote code
None. All extension logic is packaged locally.

### User data disclosure
NTP Groups handles user-provided shortcut names and URLs, group names, ordering/layout state, preferences, and search text. Saved shortcut/layout data stays in local extension storage and is not transmitted to the developer. Search text is passed to the browser search API and then processed by the user's configured search provider.

### Data sale / advertising
No.

### Analytics / telemetry
No.

### Authentication / account data
No.

### Privacy policy
Host `PRIVACY_POLICY.md` at a stable public HTTPS URL before submission and paste that URL into the Privacy Policy field.

## Test instructions

1. Install the extension.
2. Open a new tab.
3. Confirm that NTP Groups replaces the New Tab page.
4. Open a group such as Research.
5. Add a site, choose its location, and save it.
6. Rename a group by clicking its title and editing it inline.
7. Drag a shortcut outside an open group and confirm it returns to the root.
8. Drag one root site onto the center of another, hold briefly until the grouping highlight appears, then drop to create a new group.
9. Click outside an open group and confirm the group closes.
10. Use the search field and confirm results open through the browser's configured default search provider.
11. Open settings and reset the layout if needed.

No credentials or test account are required.

## Graphic assets

Prepared:
- Store icon: `icons/icon128.png` — 128×128.
- Screenshot 1: `store/screenshots/01-overview-1280x800.png` — 1280×800.
- Screenshot 2: `store/screenshots/02-research-group-1280x800.png` — 1280×800.
- Screenshot 3: `store/screenshots/03-dev-group-1280x800.png` — 1280×800.
- Small promo tile: `store/promo/small-tile-440x280.png` — 440×280.
- Marquee promo tile: `store/promo/marquee-1400x560.png` — 1400×560.
- Promo artwork is text-free and brand-first so it remains readable when reduced.

Raw/diagnostic screenshots are preserved under `store/screenshots/raw/` and are not intended for upload.

Optional, not required for the first submission:
- YouTube feature video.

## Final pre-submit checks

**Current extension version:** `0.1.10`

- Publish `store/privacy/index.html` at a stable public HTTPS URL and paste that URL into the Privacy Policy field.
- Enable the Chrome Web Store built-in Support hub for user support, or provide a dedicated Support URL later if desired.
- Ensure the Store listing screenshots show the current NTP Groups branding and current UI.
- Re-test on Chrome after packaging.
- Verify the ZIP has `manifest.json` at its root.
- Verify the submitted ZIP version matches `manifest.json`.
- Complete all Privacy practices certifications accurately.
