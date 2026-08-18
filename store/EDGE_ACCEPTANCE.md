# NTP Groups — Microsoft Edge acceptance gate

Run this checklist before the first Microsoft Edge Add-ons submission.

**Current result:** PASS on Microsoft Edge 151.0.4129.86 in an isolated temporary profile. The real New Tab action rendered NTP Groups, storage/search/tabs runtime checks passed, hub mode rendered correctly, and the `_favicon` endpoint returned HTTP 200. Edge masks the outer CDP target as `edge://newtab/`; acceptance therefore verifies the rendered DOM/runtime context rather than relying on the outer target URL alone.

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
5. Reorder root sites and groups horizontally and spatially above/below the row.
6. Drag a root site to the deliberate center-hover zone of another root site and create a group.
7. Drag a root site into an existing group.
8. Inside a group, reorder items using both direct-tile and free-space drops.
9. Drag a site beyond the physical group-panel boundary and verify it moves to the root.
10. Verify the outside-click behavior closes an open group.
11. With **Открывать сайты в новой вкладке** enabled, click a site and verify a new active tab opens while the NTP Groups tab remains.
12. Disable that setting and verify a normal click navigates the current tab instead.
13. Use the search field and verify results use Edge's configured default search provider.
14. Verify the settings-button visibility preference and reset-layout action.
15. Open DevTools for the New Tab page and confirm there are no console errors, page errors, or failed local extension resources during the above flows.

## Package checks

- Package: `D:\dev\NTP-Groups\dist\edge\NTP-Groups-0.1.11-edge.zip`
- `manifest.json` must be at the ZIP root.
- Manifest version: 3.
- Extension version: 0.1.11.
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

For `0.1.11`, the automated isolated-profile Edge gate passes the package/API/New Tab checks. Manual interaction checks remain useful as a final visual smoke test, but no Edge-specific compatibility blocker is currently known.

If a future Edge-specific issue appears, fix it in source, bump the extension version, rebuild the Edge package, and repeat this checklist before submission.
