'use strict';

const STORAGE_KEY = 'braveNtpGroupsConfig';
const HUB_SESSION_KEY = 'ntpGroupsHubTabs';
const NEWTAB_URL = chrome.runtime.getURL('newtab.html');

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function getPersistentHubEnabled() {
  try {
    const stored = await chrome.storage.local.get(STORAGE_KEY);
    return stored?.[STORAGE_KEY]?.preferences?.persistentHub === true;
  } catch {
    return false;
  }
}

async function getHubMap() {
  try {
    const stored = await chrome.storage.session.get(HUB_SESSION_KEY);
    return stored?.[HUB_SESSION_KEY] && typeof stored[HUB_SESSION_KEY] === 'object'
      ? stored[HUB_SESSION_KEY]
      : {};
  } catch {
    return {};
  }
}

async function setHubMap(map) {
  try {
    await chrome.storage.session.set({ [HUB_SESSION_KEY]: map });
  } catch {}
}

async function setHubForWindow(windowId, tabId) {
  const map = await getHubMap();
  map[String(windowId)] = tabId;
  await setHubMap(map);
}

async function clearHubForWindow(windowId, expectedTabId = null) {
  const map = await getHubMap();
  const key = String(windowId);
  if (!(key in map)) return;
  if (expectedTabId !== null && map[key] !== expectedTabId) return;
  delete map[key];
  await setHubMap(map);
}

async function getOwnNtpContexts(windowId = null) {
  try {
    const contexts = await chrome.runtime.getContexts({ contextTypes: ['TAB'] });
    return contexts.filter(context => context.tabId >= 0
      && (windowId === null || context.windowId === windowId)
      && typeof context.documentUrl === 'string'
      && context.documentUrl.startsWith(NEWTAB_URL));
  } catch (error) {
    console.warn('NTP context discovery failed', error);
    return [];
  }
}

async function getTabSafe(tabId) {
  try {
    return await chrome.tabs.get(tabId);
  } catch {
    return null;
  }
}

async function getNtpCandidates(windowId) {
  const contexts = await getOwnNtpContexts(windowId);
  const tabs = [];
  for (const context of contexts) {
    const tab = await getTabSafe(context.tabId);
    if (tab && tab.windowId === windowId) tabs.push(tab);
  }
  return tabs;
}

async function findHubCandidate(windowId, preferredTabId = null) {
  const candidates = await getNtpCandidates(windowId);
  const byId = new Map(candidates.map(tab => [tab.id, tab]));
  const map = await getHubMap();
  const mappedId = map[String(windowId)];

  if (Number.isInteger(mappedId) && byId.has(mappedId)) return byId.get(mappedId);
  if (Number.isInteger(mappedId) && !byId.has(mappedId)) await clearHubForWindow(windowId, mappedId);

  const pinned = candidates
    .filter(tab => tab.pinned)
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  if (pinned.length) return pinned[0];

  if (Number.isInteger(preferredTabId) && byId.has(preferredTabId)) return byId.get(preferredTabId);

  return candidates
    .sort((a, b) => Number(Boolean(b.active)) - Number(Boolean(a.active)) || (a.index ?? 0) - (b.index ?? 0))[0]
    || null;
}

async function pinAsHub(tab, activate = false) {
  if (!tab?.id || !Number.isInteger(tab.windowId)) return null;
  try {
    const updated = await chrome.tabs.update(tab.id, { pinned: true, active: activate || Boolean(tab.active) });
    try { await chrome.tabs.move(tab.id, { index: 0 }); } catch {}
    await setHubForWindow(tab.windowId, tab.id);
    if (activate) {
      try { await chrome.windows.update(tab.windowId, { focused: true }); } catch {}
    }
    return updated || tab;
  } catch (error) {
    console.warn('Unable to pin NTP Hub', error);
    return null;
  }
}

async function ensureHubForWindow(windowId, { preferredTabId = null, activate = false } = {}) {
  if (!Number.isInteger(windowId) || windowId < 0) return null;
  if (!(await getPersistentHubEnabled())) return null;

  try {
    const browserWindow = await chrome.windows.get(windowId);
    if (!browserWindow || browserWindow.type !== 'normal') return null;
  } catch {
    return null;
  }

  const existing = await findHubCandidate(windowId, preferredTabId);
  if (existing) return pinAsHub(existing, activate);

  try {
    const created = await chrome.tabs.create({
      windowId,
      url: 'chrome://newtab/',
      pinned: true,
      active: activate,
      index: 0
    });
    if (created?.id) await setHubForWindow(windowId, created.id);
    if (activate) {
      try { await chrome.windows.update(windowId, { focused: true }); } catch {}
    }
    return created || null;
  } catch (error) {
    console.warn('Unable to create NTP Hub', error);
    return null;
  }
}

async function activateOrdinaryNtp(windowId) {
  const candidates = await getNtpCandidates(windowId);
  const target = candidates.sort((a, b) => Number(Boolean(b.active)) - Number(Boolean(a.active)) || (a.index ?? 0) - (b.index ?? 0))[0];
  if (target?.id) {
    try {
      await chrome.tabs.update(target.id, { active: true });
      await chrome.windows.update(windowId, { focused: true });
      return target;
    } catch {}
  }

  try {
    return await chrome.tabs.create({ windowId, url: 'chrome://newtab/', active: true });
  } catch {
    return null;
  }
}

async function returnToHub(windowId, preferredTabId = null) {
  if (await getPersistentHubEnabled()) {
    return ensureHubForWindow(windowId, { preferredTabId, activate: true });
  }
  return activateOrdinaryNtp(windowId);
}

async function ensureAllNormalWindows() {
  if (!(await getPersistentHubEnabled())) return;
  let windows = [];
  try { windows = await chrome.windows.getAll(); } catch { return; }
  for (const browserWindow of windows) {
    if (browserWindow.type === 'normal') await ensureHubForWindow(browserWindow.id);
  }
}

async function disableKnownHubs() {
  const map = await getHubMap();
  for (const [windowKey, tabId] of Object.entries(map)) {
    const tab = await getTabSafe(tabId);
    if (tab?.id) {
      try { await chrome.tabs.update(tab.id, { pinned: false }); } catch {}
    }
    delete map[windowKey];
  }
  await setHubMap(map);
}

chrome.action.onClicked.addListener(tab => {
  if (Number.isInteger(tab?.windowId)) void returnToHub(tab.windowId, tab.id);
});

chrome.commands.onCommand.addListener((command, tab) => {
  if (command !== 'return-to-hub') return;
  if (Number.isInteger(tab?.windowId)) {
    void returnToHub(tab.windowId, tab.id);
    return;
  }
  void chrome.windows.getLastFocused().then(browserWindow => {
    if (Number.isInteger(browserWindow?.id)) return returnToHub(browserWindow.id);
  }).catch(() => {});
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message !== 'object') return false;

  if (message.type === 'ntp-groups-page-context') {
    void (async () => {
      const tab = sender.tab;
      if (!tab?.id || !Number.isInteger(tab.windowId)) {
        sendResponse({ isHub: false, persistentHubEnabled: await getPersistentHubEnabled() });
        return;
      }
      const enabled = await getPersistentHubEnabled();
      let hub = null;
      if (enabled) hub = await ensureHubForWindow(tab.windowId, { preferredTabId: tab.id, activate: false });
      sendResponse({
        isHub: Boolean(enabled && hub?.id === tab.id),
        persistentHubEnabled: enabled,
        windowId: tab.windowId,
        tabId: tab.id
      });
    })();
    return true;
  }

  if (message.type === 'ntp-groups-persistent-hub-changed') {
    void (async () => {
      const enabled = await getPersistentHubEnabled();
      if (!enabled) {
        await disableKnownHubs();
        sendResponse({ enabled: false, isHub: false });
        return;
      }
      const tab = sender.tab;
      if (tab?.id && Number.isInteger(tab.windowId)) {
        const hub = await ensureHubForWindow(tab.windowId, { preferredTabId: tab.id, activate: false });
        sendResponse({ enabled: true, isHub: hub?.id === tab.id });
        return;
      }
      await ensureAllNormalWindows();
      sendResponse({ enabled: true, isHub: false });
    })();
    return true;
  }

  if (message.type === 'ntp-groups-return-to-hub') {
    void (async () => {
      const tab = sender.tab;
      if (tab?.id && Number.isInteger(tab.windowId)) {
        const hub = await returnToHub(tab.windowId, tab.id);
        sendResponse({ ok: Boolean(hub?.id) });
      } else {
        sendResponse({ ok: false });
      }
    })();
    return true;
  }

  return false;
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local' || !changes[STORAGE_KEY]) return;
  const before = changes[STORAGE_KEY].oldValue?.preferences?.persistentHub === true;
  const after = changes[STORAGE_KEY].newValue?.preferences?.persistentHub === true;
  if (before === after) return;
  // Enabling is initiated by the active NTP page so that page can become the Hub
  // instead of racing with a newly created tab. Startup/new-window paths are handled separately.
  if (!after) void disableKnownHubs();
});

chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
  void clearHubForWindow(removeInfo.windowId, tabId);
});

chrome.tabs.onAttached.addListener((tabId, attachInfo) => {
  void (async () => {
    const map = await getHubMap();
    const oldEntry = Object.entries(map).find(([, mappedTabId]) => mappedTabId === tabId);
    if (!oldEntry) return;
    delete map[oldEntry[0]];
    map[String(attachInfo.newWindowId)] = tabId;
    await setHubMap(map);
  })();
});

chrome.windows.onCreated.addListener(browserWindow => {
  if (browserWindow.type !== 'normal' || !Number.isInteger(browserWindow.id)) return;
  void (async () => {
    await sleep(900);
    await ensureHubForWindow(browserWindow.id);
  })();
});

chrome.windows.onRemoved.addListener(windowId => {
  void clearHubForWindow(windowId);
});

chrome.runtime.onStartup.addListener(() => { void ensureAllNormalWindows(); });
chrome.runtime.onInstalled.addListener(() => { void ensureAllNormalWindows(); });
