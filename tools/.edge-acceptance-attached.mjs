const port = Number(process.argv[2]);
if (!Number.isFinite(port)) {
  console.error(JSON.stringify({ passed: false, blocker: 'PORT_REQUIRED' }, null, 2));
  process.exit(2);
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function connectCdp(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('CDP websocket timeout')), 10000);
    ws.onopen = () => { clearTimeout(timer); resolve(); };
    ws.onerror = () => { clearTimeout(timer); reject(new Error('CDP websocket error')); };
  });
  let nextId = 0;
  const pending = new Map();
  ws.onmessage = event => {
    const message = JSON.parse(event.data);
    if (!message.id || !pending.has(message.id)) return;
    const handlers = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) handlers.reject(new Error(message.error.message));
    else handlers.resolve(message.result);
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
  return { ws, send };
}

async function evaluate(cdp, expression) {
  const result = await cdp.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text || 'Runtime evaluation failed');
  }
  return result.result.value;
}

try {
  let target;
  let cdp;
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline && !target) {
    const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    for (const candidate of targets.filter(item => item.type === 'page')) {
      let candidateCdp;
      try {
        candidateCdp = await connectCdp(candidate.webSocketDebuggerUrl);
        const identity = await evaluate(candidateCdp, `(()=>{try{const m=chrome?.runtime?.getManifest?.();return{href:location.href,id:chrome?.runtime?.id||null,name:m?.name||null,newtab:m?.chrome_url_overrides?.newtab||null}}catch(e){return null}})()`);
        if (identity?.name === 'NTP Groups' && identity?.newtab === 'newtab.html' && identity?.id) {
          target = candidate;
          cdp = candidateCdp;
          candidateCdp = null;
          break;
        }
      } catch {}
      try { candidateCdp?.ws?.close(); } catch {}
    }
    if (!target) await sleep(250);
  }
  if (!target || !cdp) throw new Error('NTP Groups extension New Tab DOM target not found.');

  await cdp.send('Runtime.enable');
  const probe = await evaluate(cdp, `(async () => {
    const manifest = chrome.runtime.getManifest();
    const api = {
      storage: Boolean(chrome.storage?.local),
      search: typeof chrome.search?.query === 'function',
      tabsCreate: typeof chrome.tabs?.create === 'function',
    };

    const probeKey = '__ntpGroupsEdgeAcceptanceProbe';
    await chrome.storage.local.set({ [probeKey]: { ok: true, at: Date.now() } });
    const stored = await chrome.storage.local.get(probeKey);
    await chrome.storage.local.remove(probeKey);

    let favicon = { ok: false, status: null, contentType: null, error: null, url: null };
    try {
      const faviconUrl = chrome.runtime.getURL('_favicon/?pageUrl=' + encodeURIComponent('https://www.youtube.com/') + '&size=32');
      const response = await fetch(faviconUrl);
      favicon = {
        ok: response.ok,
        status: response.status,
        contentType: response.headers.get('content-type'),
        error: null,
        url: faviconUrl,
      };
    } catch (error) {
      favicon.error = String(error?.message || error);
    }

    let tabProbe = { created: false, removed: false, error: null };
    try {
      const created = await chrome.tabs.create({ url: 'about:blank', active: false });
      tabProbe.created = Boolean(created?.id);
      if (created?.id) {
        await chrome.tabs.remove(created.id);
        tabProbe.removed = true;
      }
    } catch (error) {
      tabProbe.error = String(error?.message || error);
    }

    let hideCollapseProbe = { visibleBefore: false, opened: false, becameHidden: false, returnedRoot: false, error: null };
    try {
      const waitUntil = async (predicate, timeoutMs = 2000) => {
        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
          if (predicate()) return true;
          await new Promise(resolve => setTimeout(resolve, 40));
        }
        return Boolean(predicate());
      };

      const currentTab = await chrome.tabs.getCurrent();
      if (currentTab?.id) await chrome.tabs.update(currentTab.id, { active: true });
      if (Number.isInteger(currentTab?.windowId)) await chrome.windows.update(currentTab.windowId, { focused: true });
      hideCollapseProbe.visibleBefore = await waitUntil(() => document.visibilityState === 'visible');

      const folderTile = document.querySelector('.folder-tile');
      folderTile?.click();
      hideCollapseProbe.opened = await waitUntil(() => Boolean(document.querySelector('.folder-panel')) && location.hash.startsWith('#folder='));

      const created = await chrome.tabs.create({ url: 'about:blank', active: true });
      hideCollapseProbe.becameHidden = await waitUntil(() => document.visibilityState === 'hidden');
      if (created?.id) await chrome.tabs.remove(created.id);

      hideCollapseProbe.returnedRoot = await waitUntil(() => document.visibilityState === 'visible'
        && !document.querySelector('.folder-panel')
        && Boolean(document.querySelector('.folder-tile'))
        && !location.hash
        && !history.state?.folderId);
    } catch (error) {
      hideCollapseProbe.error = String(error?.message || error);
    }

    const ui = {
      rootSites: document.querySelectorAll('.site-tile').length,
      rootFolders: document.querySelectorAll('.folder-tile').length,
      settingsButton: Boolean(document.querySelector('#settingsButton')),
      hubToggle: Boolean(document.querySelector('#openSitesInNewTab')),
      hubToggleChecked: document.querySelector('#openSitesInNewTab')?.checked === true,
    };

    return {
      manifest: {
        name: manifest.name,
        version: manifest.version,
        manifestVersion: manifest.manifest_version,
        permissions: manifest.permissions || [],
        newtab: manifest.chrome_url_overrides?.newtab || null,
        hasUpdateUrl: Boolean(manifest.update_url),
      },
      api,
      storageRoundTrip: stored?.[probeKey]?.ok === true,
      favicon,
      tabProbe,
      hideCollapseProbe,
      ui,
      href: location.href,
      title: document.title,
    };
  })()`);
  cdp.ws.close();

  const checks = {
    name: probe.manifest.name === 'NTP Groups',
    version: probe.manifest.version === '0.2.0',
    manifestV3: probe.manifest.manifestVersion === 3,
    newtabOverride: probe.manifest.newtab === 'newtab.html',
    noUpdateUrl: probe.manifest.hasUpdateUrl === false,
    storageApi: probe.api.storage === true,
    searchApi: probe.api.search === true,
    tabsApi: probe.api.tabsCreate === true,
    storageRoundTrip: probe.storageRoundTrip === true,
    tabCreateRemove: probe.tabProbe.created === true && probe.tabProbe.removed === true,
    hideCollapsesGroup: probe.hideCollapseProbe.visibleBefore === true
      && probe.hideCollapseProbe.opened === true
      && probe.hideCollapseProbe.becameHidden === true
      && probe.hideCollapseProbe.returnedRoot === true,
    faviconEndpoint: probe.favicon.ok === true,
    uiRendered: probe.ui.settingsButton === true && probe.ui.hubToggle === true && (probe.ui.rootSites + probe.ui.rootFolders) > 0,
    hubModeDefault: probe.ui.hubToggleChecked === true,
  };
  const failed = Object.entries(checks).filter(([, ok]) => !ok).map(([name]) => name);
  const report = { passed: failed.length === 0, checks, failed, probe };
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.passed ? 0 : 1;
} catch (error) {
  console.error(JSON.stringify({
    passed: false,
    blocker: 'EDGE_ACCEPTANCE_ERROR',
    message: error?.stack || String(error),
  }, null, 2));
  process.exitCode = 1;
}
