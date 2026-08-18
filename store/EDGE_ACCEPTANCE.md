# NTP Groups — Microsoft Edge acceptance gate

Run this checklist before the first Microsoft Edge Add-ons submission.

**Current result:** PASS for NTP Groups 0.2.1 on Microsoft Edge 151.0.4129.86 in an isolated temporary profile. The real New Tab action rendered NTP Groups; storage/search/tab-operation checks, schema migration, nested folders, export/import/undo, Persistent Hub, the default `Alt+H` shortcut, pinned-position preservation, favicon rendering, hide-to-Root, and real Windows mouse spring-drag all passed. Edge masks the outer CDP target as `edge://newtab/`; acceptance therefore verifies the rendered DOM/runtime context rather than relying on the outer target URL alone.

Re-run with `powershell.exe -NoProfile -ExecutionPolicy Bypass -File tools\edge-acceptance.ps1` after any Edge-specific or New Tab-related change.

## Preconditions

- Install the current stable Microsoft Edge build from Microsoft.
- Keep the canonical source at `D:\dev\NTP-Groups`.
- Use a clean Edge profile for the first compatibility pass when practical.
- Do not alter the production package merely to make a test pass; record any required compatibility change and rebuild the package deliberately.

## Sideload

1. Open `edge://extensions`.
2. Enable Developer mode.
3. Choose **Load unpacked**.
4. Select `D:\dev\NTP-Groups`.
5. Confirm that NTP Groups becomes the active New Tab override without manifest or permission errors.

## Required functional checks

1. Open a new tab and verify the NTP Groups root view renders correctly.
2. Verify site favicons and folder favicon previews render. This is a hard gate because NTP Groups currently uses the Chromium `_favicon` endpoint with the `favicon` permission.
3. Open and close several groups; verify the transition has no full-screen shared-element flash.
4. Rename a group inline. `Enter` must save; `Esc` must cancel the edit without closing the group on the same keypress.
5. Reorder root sites and folders horizontally and spatially above/below the row.
6. Drag a root site to the deliberate center-hover zone of another root site and create a folder.
7. Drag sites and folders into valid parent folders; invalid moves must not create depth greater than two folder levels or cycles.
8. Create a folder inside a root folder. On the second folder level, verify **Добавить…** opens the site editor directly.
9. Hold a real drag over a valid folder target for about 750 ms. Verify it spring-opens without releasing the drag, then move the pointer and spring-open the second level. A stationary pointer must not cascade through both levels.
10. Inside a folder, reorder items using both direct-tile and free-space drops.
11. Drag an item beyond the physical folder-panel boundary and verify it moves to the parent container; from a first-level folder this means Root.
12. Verify outside-click closes an open folder and hidden/minimized NTP returns to Root.
13. With **Открывать сайты в новой вкладке** enabled, click a site and verify a new active tab opens while the NTP Groups tab remains. Disable it and confirm an ordinary non-Hub NTP can navigate in the current tab.
14. Export the configuration, import a valid nested JSON backup, and verify **Отменить последний импорт** restores the previous layout.
15. Enable **Постоянный Hub**. Verify the current NTP becomes pinned, a site/search opened from Hub uses a new active tab, and toolbar action / the assigned Return to Hub shortcut returns to the existing Hub without replacing the current site tab. Manually move Hub to another pinned position first and verify returning to Hub does not move it back.
16. Use the search field and verify results use Edge's configured default search provider.
17. Verify the settings-button visibility preference and reset-layout action.
18. Open DevTools for the New Tab page and confirm there are no console errors, page errors, or failed local extension resources during the above flows.

## Package checks

- Package: `D:\dev\NTP-Groups\dist\edge\NTP-Groups-0.2.1-edge.zip`
- `manifest.json` must be at the ZIP root.
- Manifest version: 3.
- Extension version: 0.2.1.
- No `update_url` field.
- No remote code.
- No host permissions.
- Requested permissions remain limited to `storage`, `search`, and `favicon` unless an Edge-specific compatibility change is explicitly justified and reviewed.

## Store asset checks

- `icons/icon128.png`
- `store/screenshots/01-overview-1280x800.png`
- `store/screenshots/02-research-group-1280x800.png`
- `store/screenshots/03-dev-group-1280x800.png`
- `store/screenshots/04-settings-hub-mode-1280x800.png`
- `store/promo/small-tile-440x280.png`
- `store/promo/marquee-1400x560.png`
- Privacy policy: `https://frenzy1000.github.io/ntp-groups/store/privacy/`

## Pass condition

For `0.2.1`, the automated isolated-profile Edge gate passes the package/API/New Tab checks plus schema v2 → v3 migration, two-level folders, direct-site final-level creation, JSON export/import/undo, Persistent Hub, the actual default `Alt+H` shortcut, preservation of a manually chosen pinned Hub position, and spring-loaded drag. The spring-drag gate uses a real Windows mouse-down and keeps the button held while Edge opens `AI` and then `Deep`, proving the native drag survives the DOM transition. Fresh install renders 0 preset sites and 4 neutral folders (Personal, Work, Social, Media). Manual visual smoke remains useful, but no Edge-specific compatibility blocker is currently known.

If a future Edge-specific issue appears, fix it in source, bump the extension version, rebuild the Edge package, and repeat this checklist before submission.
