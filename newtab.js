(() => {
  'use strict';

  const STORAGE_KEY = 'braveNtpGroupsConfig';
  const SCHEMA_VERSION = 2;

  const DEFAULT_CONFIG = {
    version: SCHEMA_VERSION,
    preferences: {
      settingsButtonAlwaysVisible: true
    },
    root: [
      { kind: 'site', id: 'youtube', title: 'YouTube', url: 'https://www.youtube.com/' },
      { kind: 'site', id: 'gmail', title: 'Gmail', url: 'https://mail.google.com/' },
      { kind: 'site', id: 'wikipedia', title: 'Wikipedia', url: 'https://www.wikipedia.org/' },
      {
        kind: 'folder', id: 'work', title: 'Work', items: [
          { kind: 'site', id: 'google-drive', title: 'Google Drive', url: 'https://drive.google.com/' },
          { kind: 'site', id: 'google-docs', title: 'Google Docs', url: 'https://docs.google.com/' },
          { kind: 'site', id: 'slack', title: 'Slack', url: 'https://app.slack.com/' },
          { kind: 'site', id: 'notion', title: 'Notion', url: 'https://www.notion.so/' }
        ]
      },
      {
        kind: 'folder', id: 'ai-dev', title: 'Dev', items: [
          { kind: 'site', id: 'github', title: 'GitHub', url: 'https://github.com/' },
          { kind: 'site', id: 'mdn', title: 'MDN', url: 'https://developer.mozilla.org/' },
          { kind: 'site', id: 'stack-overflow', title: 'Stack Overflow', url: 'https://stackoverflow.com/' },
          { kind: 'site', id: 'docker-hub', title: 'Docker Hub', url: 'https://hub.docker.com/' },
          { kind: 'site', id: 'hugging-face', title: 'Hugging Face', url: 'https://huggingface.co/' }
        ]
      },
      {
        kind: 'folder', id: 'study', title: 'Study', items: [
          { kind: 'site', id: 'notebooklm', title: 'NotebookLM', url: 'https://notebooklm.google.com/' },
          { kind: 'site', id: 'khan-academy', title: 'Khan Academy', url: 'https://www.khanacademy.org/' },
          { kind: 'site', id: 'coursera', title: 'Coursera', url: 'https://www.coursera.org/' },
          { kind: 'site', id: 'google-translate', title: 'Google Translate', url: 'https://translate.google.com/' }
        ]
      },
      {
        kind: 'folder', id: 'research', title: 'Research', items: [
          { kind: 'site', id: 'google-scholar', title: 'Google Scholar', url: 'https://scholar.google.com/' },
          { kind: 'site', id: 'arxiv', title: 'arXiv', url: 'https://arxiv.org/' },
          { kind: 'site', id: 'pubmed', title: 'PubMed', url: 'https://pubmed.ncbi.nlm.nih.gov/' },
          { kind: 'site', id: 'openalex', title: 'OpenAlex', url: 'https://openalex.org/' }
        ]
      }
    ]
  };

  const launcherView = document.getElementById('launcherView');
  const searchForm = document.getElementById('searchForm');
  const searchInput = document.getElementById('searchInput');
  const contextMenu = document.getElementById('contextMenu');
  const modalBackdrop = document.getElementById('modalBackdrop');
  const modalTitle = document.getElementById('modalTitle');
  const modalClose = document.getElementById('modalClose');
  const editorForm = document.getElementById('editorForm');
  const editorKind = document.getElementById('editorKind');
  const kindSelect = document.getElementById('kindSelect');
  const kindButton = document.getElementById('kindButton');
  const kindValue = document.getElementById('kindValue');
  const kindMenu = document.getElementById('kindMenu');
  const editorTitle = document.getElementById('editorTitle');
  const editorUrl = document.getElementById('editorUrl');
  const locationSelect = document.getElementById('locationSelect');
  const locationButton = document.getElementById('locationButton');
  const locationValue = document.getElementById('locationValue');
  const locationMenu = document.getElementById('locationMenu');
  const kindRow = document.getElementById('kindRow');
  const urlRow = document.getElementById('urlRow');
  const locationRow = document.getElementById('locationRow');
  const editorCancel = document.getElementById('editorCancel');
  const settingsButton = document.getElementById('settingsButton');
  const settingsPopover = document.getElementById('settingsPopover');
  const settingsButtonAlwaysVisible = document.getElementById('settingsButtonAlwaysVisible');
  const resetLayout = document.getElementById('resetLayout');

  let config = structuredClone(DEFAULT_CONFIG);
  let activeFolderId = null;
  let editorState = null;
  let dragState = null;
  let groupHoverTimer = null;
  let selectedLocationId = '';

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  async function storageGet() {
    try {
      if (globalThis.chrome?.storage?.local) {
        const result = await chrome.storage.local.get(STORAGE_KEY);
        return result[STORAGE_KEY] || null;
      }
    } catch (error) {
      console.warn('chrome.storage.local read failed', error);
    }
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    } catch {
      return null;
    }
  }

  async function storageSet(value) {
    try {
      if (globalThis.chrome?.storage?.local) {
        await chrome.storage.local.set({ [STORAGE_KEY]: value });
        return;
      }
    } catch (error) {
      console.warn('chrome.storage.local write failed', error);
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  }

  function normalizeConfig(raw) {
    const normalized = raw && raw.version === SCHEMA_VERSION && Array.isArray(raw.root)
      ? clone(raw)
      : clone(DEFAULT_CONFIG);
    normalized.preferences = {
      ...DEFAULT_CONFIG.preferences,
      ...(normalized.preferences || {})
    };
    return normalized;
  }

  function getFolder(folderId) {
    return config.root.find(item => item.kind === 'folder' && item.id === folderId) || null;
  }

  function getContainer(folderId) {
    if (!folderId) return config.root;
    const folder = getFolder(folderId);
    return folder ? folder.items : null;
  }

  function locateItem(itemId) {
    const rootIndex = config.root.findIndex(item => item.id === itemId);
    if (rootIndex >= 0) return { item: config.root[rootIndex], folderId: null, index: rootIndex, container: config.root };
    for (const folder of config.root.filter(item => item.kind === 'folder')) {
      const index = folder.items.findIndex(item => item.id === itemId);
      if (index >= 0) return { item: folder.items[index], folderId: folder.id, index, container: folder.items };
    }
    return null;
  }

  function uniqueId(prefix) {
    const suffix = Math.random().toString(36).slice(2, 8);
    return `${prefix}-${Date.now().toString(36)}-${suffix}`;
  }

  function normalizeUrl(value) {
    const trimmed = value.trim();
    if (!trimmed) return '';
    try {
      return new URL(trimmed).href;
    } catch {
      try {
        return new URL(`https://${trimmed}`).href;
      } catch {
        return '';
      }
    }
  }

  function faviconUrl(url, size = 64) {
    if (globalThis.chrome?.runtime?.getURL) {
      return chrome.runtime.getURL(`/_favicon/?pageUrl=${encodeURIComponent(url)}&size=${size}`);
    }
    return '';
  }

  function makeSvgIcon(pathData, className = '') {
    const namespace = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(namespace, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    if (className) svg.setAttribute('class', className);
    const path = document.createElementNS(namespace, 'path');
    path.setAttribute('d', pathData);
    svg.append(path);
    return svg;
  }

  function transition(mutator) {
    if (document.startViewTransition && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      document.startViewTransition(() => {
        mutator();
        renderView();
      });
    } else {
      mutator();
      renderView();
    }
  }

  function openSite(site, newTab = false) {
    if (!site?.url) return;
    if (newTab) {
      window.open(site.url, '_blank', 'noopener');
    } else {
      location.href = site.url;
    }
  }

  function createFavicon(url, title, className = '') {
    const wrap = document.createElement('span');
    wrap.className = className;

    const fallback = document.createElement('span');
    fallback.className = className === 'folder-mini' ? 'mini-fallback' : 'site-fallback';
    fallback.textContent = (title || '?').trim().charAt(0).toUpperCase();

    const src = faviconUrl(url, className === 'folder-mini' ? 32 : 64);
    if (src) {
      const img = document.createElement('img');
      img.src = src;
      img.alt = '';
      img.decoding = 'async';
      img.addEventListener('error', () => { img.hidden = true; });
      wrap.append(img, fallback);
    } else {
      wrap.append(fallback);
    }
    return wrap;
  }

  function makeSiteTile(site, folderId) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'tile site-tile';
    button.draggable = true;
    button.dataset.itemId = site.id;
    button.dataset.folderId = folderId || '';
    button.title = site.title;

    const icon = document.createElement('span');
    icon.className = 'tile-icon';
    const favicon = createFavicon(site.url, site.title, 'site-favicon');
    icon.append(favicon);

    const label = document.createElement('span');
    label.className = 'tile-label';
    label.textContent = site.title;

    button.append(icon, label);
    button.addEventListener('click', event => {
      if (dragState) return;
      openSite(site, event.ctrlKey || event.metaKey || event.button === 1);
    });
    button.addEventListener('auxclick', event => {
      if (event.button === 1) {
        event.preventDefault();
        openSite(site, true);
      }
    });
    button.addEventListener('contextmenu', event => showContextMenu(event, site.id));
    attachDragHandlers(button, site.id, folderId);
    return button;
  }

  function makeFolderTile(folder) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'tile folder-tile';
    button.draggable = true;
    button.dataset.itemId = folder.id;
    button.dataset.folderId = '';
    button.title = folder.title;

    const icon = document.createElement('span');
    icon.className = 'tile-icon';
    const preview = document.createElement('span');
    preview.className = 'folder-preview';
    const previewItems = folder.items.slice(0, 4);
    for (let i = 0; i < 4; i++) {
      const item = previewItems[i];
      const mini = item ? createFavicon(item.url, item.title, 'folder-mini') : document.createElement('span');
      if (!item) mini.className = 'folder-mini';
      preview.append(mini);
    }
    icon.append(preview);

    const label = document.createElement('span');
    label.className = 'tile-label';
    label.textContent = folder.title;

    button.append(icon, label);
    button.addEventListener('click', () => {
      if (dragState) return;
      openFolder(folder.id, true);
    });
    button.addEventListener('contextmenu', event => showContextMenu(event, folder.id));
    attachDragHandlers(button, folder.id, null);
    return button;
  }

  function makeAddTile(folderId = null) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'tile add-tile';
    button.title = folderId ? 'Добавить сайт' : 'Добавить сайт или группу';
    const icon = document.createElement('span');
    icon.className = 'tile-icon';
    const plus = makeSvgIcon('M12 5v14M5 12h14', 'add-icon');
    icon.append(plus);
    const label = document.createElement('span');
    label.className = 'tile-label';
    label.textContent = 'Добавить…';
    button.append(icon, label);
    button.addEventListener('click', () => openEditor({ mode: 'add', folderId }));
    return button;
  }

  function renderRoot() {
    const strip = document.createElement('div');
    strip.className = 'tile-strip';
    strip.dataset.containerId = '';
    for (const item of config.root) {
      strip.append(item.kind === 'folder' ? makeFolderTile(item) : makeSiteTile(item, null));
    }
    strip.append(makeAddTile(null));
    attachContainerDropHandlers(strip, null);
    launcherView.replaceChildren(strip);
  }

  function renderFolder(folder) {
    const panel = document.createElement('section');
    panel.className = 'folder-panel';
    panel.dataset.containerId = folder.id;

    const header = document.createElement('header');
    header.className = 'folder-header';

    const title = document.createElement('input');
    title.type = 'text';
    title.className = 'folder-title';
    title.value = folder.title;
    title.maxLength = 28;
    title.setAttribute('aria-label', 'Название группы');
    title.addEventListener('keydown', event => {
      if (event.key === 'Enter') {
        event.preventDefault();
        title.blur();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        title.value = folder.title;
        title.blur();
      }
    });
    title.addEventListener('blur', async () => {
      const nextTitle = title.value.trim();
      if (!nextTitle) {
        title.value = folder.title;
        return;
      }
      if (nextTitle === folder.title) return;
      folder.title = nextTitle;
      title.value = nextTitle;
      await storageSet(config);
    });

    header.append(title);

    const grid = document.createElement('div');
    grid.className = 'folder-grid';
    grid.dataset.containerId = folder.id;
    for (const site of folder.items) grid.append(makeSiteTile(site, folder.id));
    grid.append(makeAddTile(folder.id));
    attachContainerDropHandlers(grid, folder.id);

    panel.append(header, grid);
    launcherView.replaceChildren(panel);
  }

  function renderView() {
    const folder = activeFolderId ? getFolder(activeFolderId) : null;
    if (activeFolderId && !folder) activeFolderId = null;
    if (folder) renderFolder(folder); else renderRoot();
  }

  function openFolder(folderId, pushHistory = true) {
    const folder = getFolder(folderId);
    if (!folder) return;
    transition(() => {
      activeFolderId = folderId;
      if (pushHistory) history.pushState({ folderId }, '', `#folder=${encodeURIComponent(folderId)}`);
    });
  }

  function closeFolder() {
    if (!activeFolderId) return;
    if (history.state?.folderId) {
      history.back();
    } else {
      transition(() => { activeFolderId = null; history.replaceState(null, '', location.pathname); });
    }
  }

  function clearGroupHover() {
    if (groupHoverTimer) {
      clearTimeout(groupHoverTimer);
      groupHoverTimer = null;
    }
    if (dragState) {
      dragState.groupCandidateId = null;
      dragState.groupCandidateAction = null;
      dragState.groupTargetId = null;
      dragState.groupTargetAction = null;
    }
    document.querySelectorAll('.group-create-target,.drop-target').forEach(node => node.classList.remove('group-create-target', 'drop-target'));
  }

  function clearRootOutsideDrop() {
    const strip = launcherView.querySelector('.tile-strip');
    strip?.classList.remove('root-edge-start', 'root-edge-end');
    strip?.querySelectorAll('.root-snap-before,.root-snap-after').forEach(node => node.classList.remove('root-snap-before', 'root-snap-after'));
    if (dragState) {
      dragState.rootEdgeDrop = null;
      dragState.rootVerticalDrop = null;
    }
  }

  function getRootVerticalPlacement(strip, clientX, towardTop) {
    const tiles = [...strip.querySelectorAll('.tile[data-item-id]')]
      .filter(tile => tile.dataset.itemId && tile.dataset.itemId !== dragState?.itemId)
      .map(tile => ({ tile, id: tile.dataset.itemId, rect: tile.getBoundingClientRect() }));
    if (!tiles.length) return null;

    const rowTop = towardTop
      ? Math.min(...tiles.map(entry => entry.rect.top))
      : Math.max(...tiles.map(entry => entry.rect.top));
    const row = tiles
      .filter(entry => Math.abs(entry.rect.top - rowTop) < 4)
      .sort((a, b) => a.rect.left - b.rect.left);
    if (!row.length) return null;

    let best = row[0];
    let bestDistance = Math.abs(clientX - (best.rect.left + best.rect.width / 2));
    for (const entry of row.slice(1)) {
      const distance = Math.abs(clientX - (entry.rect.left + entry.rect.width / 2));
      if (distance < bestDistance) {
        best = entry;
        bestDistance = distance;
      }
    }

    const before = clientX < best.rect.left + best.rect.width / 2;
    return { targetId: best.id, before, tile: best.tile };
  }

  function clearFolderSpatialDrop() {
    const grid = launcherView.querySelector('.folder-grid');
    grid?.querySelectorAll('.folder-snap-before,.folder-snap-after').forEach(node => node.classList.remove('folder-snap-before', 'folder-snap-after'));
    if (dragState) dragState.folderSpatialDrop = null;
  }

  function getFolderSpatialPlacement(grid, clientX, clientY) {
    const tiles = [...grid.querySelectorAll('.tile[data-item-id]')]
      .filter(tile => tile.dataset.itemId && tile.dataset.itemId !== dragState?.itemId)
      .map(tile => ({ tile, id: tile.dataset.itemId, rect: tile.getBoundingClientRect() }));
    if (!tiles.length) return null;

    const rows = [];
    for (const entry of tiles.sort((a, b) => a.rect.top - b.rect.top || a.rect.left - b.rect.left)) {
      let row = rows.find(candidate => Math.abs(candidate.top - entry.rect.top) < 4);
      if (!row) {
        row = { top: entry.rect.top, entries: [] };
        rows.push(row);
      }
      row.entries.push(entry);
    }

    let bestRow = rows[0];
    let bestRowDistance = Infinity;
    for (const row of rows) {
      const top = Math.min(...row.entries.map(entry => entry.rect.top));
      const bottom = Math.max(...row.entries.map(entry => entry.rect.bottom));
      const distance = clientY < top ? top - clientY : clientY > bottom ? clientY - bottom : 0;
      if (distance < bestRowDistance) {
        bestRow = row;
        bestRowDistance = distance;
      }
    }

    const entries = bestRow.entries.sort((a, b) => a.rect.left - b.rect.left);
    let best = entries[0];
    let bestDistance = Math.abs(clientX - (best.rect.left + best.rect.width / 2));
    for (const entry of entries.slice(1)) {
      const distance = Math.abs(clientX - (entry.rect.left + entry.rect.width / 2));
      if (distance < bestDistance) {
        best = entry;
        bestDistance = distance;
      }
    }

    return {
      targetId: best.id,
      before: clientX < best.rect.left + best.rect.width / 2,
      tile: best.tile
    };
  }

  function moveRootItemToEdge(itemId, toStart) {
    const source = locateItem(itemId);
    if (!source || source.folderId !== null) return false;
    const [item] = source.container.splice(source.index, 1);
    if (!item) return false;
    if (toStart) source.container.unshift(item); else source.container.push(item);
    return true;
  }

  function armGroupHover(element, targetId, action) {
    if (!dragState) return;
    const sameCandidate = dragState.groupCandidateId === targetId && dragState.groupCandidateAction === action;
    const sameTarget = dragState.groupTargetId === targetId && dragState.groupTargetAction === action;
    if (sameCandidate || sameTarget) return;
    clearGroupHover();
    if (!dragState) return;
    dragState.groupCandidateId = targetId;
    dragState.groupCandidateAction = action;
    groupHoverTimer = setTimeout(() => {
      if (!dragState || dragState.groupCandidateId !== targetId || dragState.groupCandidateAction !== action) return;
      dragState.groupTargetId = targetId;
      dragState.groupTargetAction = action;
      groupHoverTimer = null;
      element.classList.add(action === 'create' ? 'group-create-target' : 'drop-target');
    }, 280);
  }

  function createGroupFromSites(sourceId, targetId) {
    const source = locateItem(sourceId);
    const target = locateItem(targetId);
    if (!source || !target) return false;
    if (source.folderId || target.folderId) return false;
    if (source.item.kind !== 'site' || target.item.kind !== 'site' || sourceId === targetId) return false;

    const sourceItem = source.item;
    const targetItem = target.item;
    source.container.splice(source.index, 1);

    const refreshedTarget = locateItem(targetId);
    if (!refreshedTarget || refreshedTarget.folderId || refreshedTarget.item.kind !== 'site') return false;
    const insertIndex = refreshedTarget.index;
    refreshedTarget.container.splice(insertIndex, 1);
    refreshedTarget.container.splice(insertIndex, 0, {
      kind: 'folder',
      id: uniqueId('folder'),
      title: 'Группа',
      items: [targetItem, sourceItem]
    });
    return true;
  }

  function attachDragHandlers(element, itemId, folderId) {
    element.addEventListener('dragstart', event => {
      clearGroupHover();
      dragState = {
        itemId,
        folderId: folderId || null,
        groupCandidateId: null,
        groupCandidateAction: null,
        groupTargetId: null,
        groupTargetAction: null,
        rootEdgeDrop: null,
        rootVerticalDrop: null,
        folderSpatialDrop: null
      };
      element.classList.add('dragging');
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', itemId);
    });
    element.addEventListener('dragend', () => {
      element.classList.remove('dragging');
      clearGroupHover();
      clearRootOutsideDrop();
      clearFolderSpatialDrop();
      document.querySelectorAll('.drop-before,.drop-after,.drop-target').forEach(node => node.classList.remove('drop-before', 'drop-after', 'drop-target'));
      setTimeout(() => { dragState = null; }, 0);
    });
    element.addEventListener('dragover', event => {
      if (!dragState || dragState.itemId === itemId) return;
      const source = locateItem(dragState.itemId);
      const target = locateItem(itemId);
      if (!source || !target) return;

      const sameContainer = source.folderId === target.folderId;
      clearRootOutsideDrop();
      clearFolderSpatialDrop();
      const rect = element.getBoundingClientRect();
      const position = (event.clientX - rect.left) / Math.max(rect.width, 1);
      const inCenterZone = position >= 0.28 && position <= 0.72;
      const canCreateGroup = sameContainer
        && source.folderId === null
        && source.item.kind === 'site'
        && target.item.kind === 'site';
      const canEnterFolder = sameContainer
        && source.folderId === null
        && source.item.kind === 'site'
        && target.item.kind === 'folder';

      if (inCenterZone && (canCreateGroup || canEnterFolder)) {
        event.preventDefault();
        element.classList.remove('drop-before', 'drop-after');
        armGroupHover(element, itemId, canCreateGroup ? 'create' : 'enter');
        return;
      }

      if (!sameContainer) return;
      event.preventDefault();
      if (dragState.groupCandidateId === itemId || dragState.groupTargetId === itemId) clearGroupHover();
      const before = position < 0.5;
      element.classList.toggle('drop-before', before);
      element.classList.toggle('drop-after', !before);
    });
    element.addEventListener('dragleave', event => {
      if (event.relatedTarget instanceof Node && element.contains(event.relatedTarget)) return;
      element.classList.remove('drop-before', 'drop-after');
      if (dragState?.groupCandidateId === itemId || dragState?.groupTargetId === itemId) clearGroupHover();
    });
    element.addEventListener('drop', async event => {
      if (!dragState || dragState.itemId === itemId) return;
      const source = locateItem(dragState.itemId);
      const target = locateItem(itemId);
      if (!source || !target) return;

      const sourceId = dragState.itemId;
      const armedAction = dragState.groupTargetId === itemId ? dragState.groupTargetAction : null;
      const sameContainer = source.folderId === target.folderId;
      const createGroup = armedAction === 'create'
        && sameContainer
        && source.folderId === null
        && source.item.kind === 'site'
        && target.item.kind === 'site';
      const enterFolder = armedAction === 'enter'
        && sameContainer
        && source.folderId === null
        && source.item.kind === 'site'
        && target.item.kind === 'folder';

      if (!createGroup && !enterFolder && !sameContainer) return;
      event.preventDefault();
      event.stopPropagation();

      if (createGroup) {
        createGroupFromSites(sourceId, itemId);
      } else if (enterFolder) {
        moveItem(sourceId, target.item.id, null);
      } else {
        const rect = element.getBoundingClientRect();
        const before = event.clientX < rect.left + rect.width / 2;
        reorderItem(sourceId, itemId, before);
      }
      clearGroupHover();
      clearRootOutsideDrop();
      dragState = null;
      await persistAndRender();
    });
  }

  function attachContainerDropHandlers(container, folderId) {
    container.addEventListener('dragover', event => {
      if (!dragState) return;
      const source = locateItem(dragState.itemId);
      if (!source || source.item.kind !== 'site') return;
      if ((source.folderId || null) === (folderId || null)) return;
      event.preventDefault();
    });
    container.addEventListener('drop', async event => {
      if (!dragState) return;
      if (event.target.closest('.tile')) return;
      const source = locateItem(dragState.itemId);
      if (!source || source.item.kind !== 'site') return;
      if ((source.folderId || null) === (folderId || null)) return;
      event.preventDefault();
      moveItem(dragState.itemId, folderId || null, null);
      dragState = null;
      await persistAndRender();
    });
  }

  function reorderItem(sourceId, targetId, before) {
    const source = locateItem(sourceId);
    const target = locateItem(targetId);
    if (!source || !target || source.folderId !== target.folderId) return;
    source.container.splice(source.index, 1);
    let targetIndex = source.container.findIndex(item => item.id === targetId);
    if (!before) targetIndex += 1;
    source.container.splice(targetIndex, 0, source.item);
  }

  function moveItem(itemId, targetFolderId, beforeId = null) {
    const source = locateItem(itemId);
    if (!source || source.item.kind !== 'site') return false;
    const targetContainer = getContainer(targetFolderId);
    if (!targetContainer) return false;
    source.container.splice(source.index, 1);
    if (beforeId) {
      const index = targetContainer.findIndex(item => item.id === beforeId);
      targetContainer.splice(index < 0 ? targetContainer.length : index, 0, source.item);
    } else {
      targetContainer.push(source.item);
    }
    return true;
  }

  async function persistAndRender() {
    await storageSet(config);
    renderView();
  }

  function showContextMenu(event, itemId) {
    event.preventDefault();
    event.stopPropagation();
    const found = locateItem(itemId);
    if (!found) return;
    contextMenu.replaceChildren();

    if (found.item.kind === 'site') {
      addContextAction('Открыть в новой вкладке', () => openSite(found.item, true));
      addContextAction('Изменить…', () => openEditor({ mode: 'edit', itemId }));
    } else {
      addContextAction('Открыть группу', () => openFolder(found.item.id, true));
      addContextAction('Переименовать…', () => openEditor({ mode: 'edit', itemId }));
    }
    addContextAction('Удалить', async () => {
      const latest = locateItem(itemId);
      if (!latest) return;
      if (latest.item.kind === 'folder' && latest.item.items.length > 0) {
        const accepted = confirm(`Удалить группу «${latest.item.title}» и ${latest.item.items.length} сайтов внутри?`);
        if (!accepted) return;
      }
      latest.container.splice(latest.index, 1);
      if (activeFolderId === itemId) activeFolderId = null;
      hideContextMenu();
      await persistAndRender();
    }, true);

    contextMenu.style.left = `${Math.min(event.clientX, innerWidth - 210)}px`;
    contextMenu.style.top = `${Math.min(event.clientY, innerHeight - contextMenu.offsetHeight - 10)}px`;
    contextMenu.hidden = false;
    requestAnimationFrame(() => {
      const rect = contextMenu.getBoundingClientRect();
      if (rect.bottom > innerHeight - 8) contextMenu.style.top = `${innerHeight - rect.height - 8}px`;
    });
  }

  function addContextAction(label, action, danger = false) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    if (danger) button.classList.add('danger');
    button.addEventListener('click', event => {
      event.stopPropagation();
      hideContextMenu();
      action();
    });
    contextMenu.append(button);
  }

  function hideContextMenu() {
    contextMenu.hidden = true;
    contextMenu.replaceChildren();
  }

  const KIND_OPTIONS = [
    { value: 'site', label: 'Сайт' },
    { value: 'folder', label: 'Группа' }
  ];

  function setKindValue(value) {
    const selected = KIND_OPTIONS.find(option => option.value === value) || KIND_OPTIONS[0];
    editorKind.value = selected.value;
    kindValue.textContent = selected.label;
    for (const option of kindMenu.querySelectorAll('.location-option')) {
      option.setAttribute('aria-selected', String(option.dataset.value === selected.value));
    }
    updateEditorVisibility();
  }

  function closeKindMenu() {
    kindMenu.hidden = true;
    kindSelect.classList.remove('open');
    kindButton.setAttribute('aria-expanded', 'false');
  }

  function openKindMenu() {
    closeLocationMenu();
    kindMenu.hidden = false;
    kindSelect.classList.add('open');
    kindButton.setAttribute('aria-expanded', 'true');
    const selected = kindMenu.querySelector('[aria-selected="true"]') || kindMenu.querySelector('.location-option');
    queueMicrotask(() => selected?.focus({ preventScroll: true }));
  }

  function populateKindSelect() {
    kindMenu.replaceChildren();
    for (const entry of KIND_OPTIONS) {
      const option = document.createElement('button');
      option.type = 'button';
      option.className = 'location-option';
      option.dataset.value = entry.value;
      option.setAttribute('role', 'option');
      option.textContent = entry.label;
      option.addEventListener('click', () => {
        setKindValue(entry.value);
        closeKindMenu();
        kindButton.focus({ preventScroll: true });
      });
      option.addEventListener('keydown', event => {
        const items = [...kindMenu.querySelectorAll('.location-option')];
        const index = items.indexOf(option);
        if (event.key === 'ArrowDown') {
          event.preventDefault();
          items[(index + 1) % items.length]?.focus({ preventScroll: true });
        } else if (event.key === 'ArrowUp') {
          event.preventDefault();
          items[(index - 1 + items.length) % items.length]?.focus({ preventScroll: true });
        } else if (event.key === 'Escape') {
          event.preventDefault();
          closeKindMenu();
          kindButton.focus({ preventScroll: true });
        }
      });
      kindMenu.append(option);
    }
    setKindValue(editorKind.value || 'site');
    closeKindMenu();
  }

  function setLocationValue(folderId) {
    selectedLocationId = folderId || '';
    const selectedFolder = selectedLocationId ? getFolder(selectedLocationId) : null;
    locationValue.textContent = selectedFolder ? selectedFolder.title : 'Корень';
    for (const option of locationMenu.querySelectorAll('.location-option')) {
      option.setAttribute('aria-selected', String(option.dataset.value === selectedLocationId));
    }
  }

  function closeLocationMenu() {
    locationMenu.hidden = true;
    locationSelect.classList.remove('open');
    locationButton.setAttribute('aria-expanded', 'false');
  }

  function openLocationMenu() {
    closeKindMenu();
    locationMenu.hidden = false;
    locationSelect.classList.add('open');
    locationButton.setAttribute('aria-expanded', 'true');
    const selected = locationMenu.querySelector('[aria-selected="true"]') || locationMenu.querySelector('.location-option');
    queueMicrotask(() => selected?.focus({ preventScroll: true }));
  }

  function populateLocationSelect(selectedFolderId) {
    locationMenu.replaceChildren();
    const options = [
      { value: '', label: 'Корень' },
      ...config.root.filter(item => item.kind === 'folder').map(folder => ({ value: folder.id, label: folder.title }))
    ];
    for (const entry of options) {
      const option = document.createElement('button');
      option.type = 'button';
      option.className = 'location-option';
      option.dataset.value = entry.value;
      option.setAttribute('role', 'option');
      option.textContent = entry.label;
      option.addEventListener('click', () => {
        setLocationValue(entry.value);
        closeLocationMenu();
        locationButton.focus({ preventScroll: true });
      });
      option.addEventListener('keydown', event => {
        const items = [...locationMenu.querySelectorAll('.location-option')];
        const index = items.indexOf(option);
        if (event.key === 'ArrowDown') {
          event.preventDefault();
          items[(index + 1) % items.length]?.focus({ preventScroll: true });
        } else if (event.key === 'ArrowUp') {
          event.preventDefault();
          items[(index - 1 + items.length) % items.length]?.focus({ preventScroll: true });
        } else if (event.key === 'Escape') {
          event.preventDefault();
          closeLocationMenu();
          locationButton.focus({ preventScroll: true });
        }
      });
      locationMenu.append(option);
    }
    setLocationValue(selectedFolderId || '');
    closeLocationMenu();
  }

  function openEditor(options) {
    editorState = options;
    const editFound = options.itemId ? locateItem(options.itemId) : null;
    const isEdit = options.mode === 'edit' && editFound;
    const editingFolder = isEdit && editFound.item.kind === 'folder';
    const forceSite = options.forceSite || Boolean(options.folderId);

    modalTitle.textContent = isEdit ? (editingFolder ? 'Изменить группу' : 'Изменить сайт') : (forceSite ? 'Добавить сайт' : 'Добавить');
    kindRow.hidden = isEdit || forceSite;
    setKindValue(editingFolder ? 'folder' : 'site');
    editorTitle.value = isEdit ? editFound.item.title : '';
    editorUrl.value = isEdit && editFound.item.kind === 'site' ? editFound.item.url : '';
    populateLocationSelect(isEdit ? editFound.folderId : options.folderId || null);

    updateEditorVisibility();
    modalBackdrop.hidden = false;
    queueMicrotask(() => editorTitle.focus());
  }

  function updateEditorVisibility() {
    const isFolder = editorKind.value === 'folder';
    urlRow.hidden = isFolder;
    locationRow.hidden = isFolder;
    editorUrl.required = !isFolder;
    if (isFolder) closeLocationMenu();
  }

  function closeEditor() {
    closeKindMenu();
    closeLocationMenu();
    modalBackdrop.hidden = true;
    editorState = null;
    editorForm.reset();
  }

  kindButton.addEventListener('click', event => {
    event.stopPropagation();
    if (kindMenu.hidden) openKindMenu(); else closeKindMenu();
  });
  kindButton.addEventListener('keydown', event => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (kindMenu.hidden) openKindMenu();
    }
  });

  locationButton.addEventListener('click', event => {
    event.stopPropagation();
    if (locationMenu.hidden) openLocationMenu(); else closeLocationMenu();
  });
  locationButton.addEventListener('keydown', event => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (locationMenu.hidden) openLocationMenu();
    }
  });

  editorKind.addEventListener('change', updateEditorVisibility);
  modalClose.addEventListener('click', closeEditor);
  editorCancel.addEventListener('click', closeEditor);
  modalBackdrop.addEventListener('mousedown', event => { if (event.target === modalBackdrop) closeEditor(); });

  editorForm.addEventListener('submit', async event => {
    event.preventDefault();
    if (!editorState) return;
    const title = editorTitle.value.trim();
    if (!title) return;
    const kind = editorKind.value;
    const url = kind === 'site' ? normalizeUrl(editorUrl.value) : '';
    if (kind === 'site' && !url) {
      editorUrl.setCustomValidity('Введите корректный URL');
      editorUrl.reportValidity();
      editorUrl.setCustomValidity('');
      return;
    }

    if (editorState.mode === 'edit' && editorState.itemId) {
      const found = locateItem(editorState.itemId);
      if (!found) return;
      found.item.title = title;
      if (found.item.kind === 'site') {
        found.item.url = url;
        const targetFolderId = selectedLocationId || null;
        if ((found.folderId || null) !== targetFolderId) moveItem(found.item.id, targetFolderId, null);
      }
    } else if (kind === 'folder') {
      config.root.push({ kind: 'folder', id: uniqueId('folder'), title, items: [] });
    } else {
      const targetFolderId = editorState.folderId || selectedLocationId || null;
      const container = getContainer(targetFolderId);
      if (!container) return;
      container.push({ kind: 'site', id: uniqueId('site'), title, url });
    }

    closeEditor();
    await persistAndRender();
  });

  searchForm.addEventListener('submit', async event => {
    event.preventDefault();
    const text = searchInput.value.trim();
    if (!text) return;
    if (!globalThis.chrome?.search?.query) {
      searchInput.setCustomValidity('Поиск через текущий провайдер недоступен в этом браузере.');
      searchInput.reportValidity();
      searchInput.setCustomValidity('');
      return;
    }
    try {
      await chrome.search.query({ text, disposition: 'CURRENT_TAB' });
    } catch (error) {
      console.warn('Default-provider search failed', error);
      searchInput.setCustomValidity('Не удалось выполнить поиск через текущий провайдер.');
      searchInput.reportValidity();
      searchInput.setCustomValidity('');
    }
  });

  function applyPreferences() {
    const alwaysVisible = config.preferences?.settingsButtonAlwaysVisible !== false;
    document.body.classList.toggle('settings-on-hover', !alwaysVisible);
    settingsButtonAlwaysVisible.checked = alwaysVisible;
  }

  function setSettingsPopover(open) {
    settingsPopover.hidden = !open;
    settingsButton.setAttribute('aria-expanded', String(open));
  }

  settingsButton.addEventListener('click', event => {
    event.stopPropagation();
    setSettingsPopover(settingsPopover.hidden);
  });

  settingsButtonAlwaysVisible.addEventListener('change', async () => {
    config.preferences.settingsButtonAlwaysVisible = settingsButtonAlwaysVisible.checked;
    applyPreferences();
    await storageSet(config);
  });

  resetLayout.addEventListener('click', async () => {
    if (!confirm('Вернуть исходную структуру NTP Groups?')) return;
    config = clone(DEFAULT_CONFIG);
    activeFolderId = null;
    history.replaceState(null, '', location.pathname);
    setSettingsPopover(false);
    applyPreferences();
    await persistAndRender();
  });

  document.addEventListener('dragover', event => {
    if (!dragState) return;

    if (!activeFolderId) {
      const source = locateItem(dragState.itemId);
      const strip = launcherView.querySelector('.tile-strip');
      if (!source || source.folderId !== null || !strip) return;
      if (event.target instanceof Element && event.target.closest('.modal,.settings-popover,.context-menu')) {
        clearRootOutsideDrop();
        return;
      }

      const rect = strip.getBoundingClientRect();
      const edgeThreshold = 14;
      const verticalThreshold = 10;
      const edge = event.clientX < rect.left - edgeThreshold
        ? 'start'
        : event.clientX > rect.right + edgeThreshold
          ? 'end'
          : null;

      if (edge) {
        clearRootOutsideDrop();
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        dragState.rootEdgeDrop = edge;
        strip.classList.toggle('root-edge-start', edge === 'start');
        strip.classList.toggle('root-edge-end', edge === 'end');
        clearGroupHover();
        return;
      }

      const verticalDirection = event.clientY < rect.top - verticalThreshold
        ? 'up'
        : event.clientY > rect.bottom + verticalThreshold
          ? 'down'
          : null;
      if (!verticalDirection) {
        clearRootOutsideDrop();
        return;
      }

      const placement = getRootVerticalPlacement(strip, event.clientX, verticalDirection === 'up');
      if (!placement) {
        clearRootOutsideDrop();
        return;
      }

      clearRootOutsideDrop();
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      dragState.rootVerticalDrop = { targetId: placement.targetId, before: placement.before };
      placement.tile.classList.add(placement.before ? 'root-snap-before' : 'root-snap-after');
      clearGroupHover();
      return;
    }

    const source = locateItem(dragState.itemId);
    const panel = launcherView.querySelector('.folder-panel');
    const grid = launcherView.querySelector('.folder-grid');
    if (!source || source.item.kind !== 'site' || source.folderId !== activeFolderId || !panel || !grid) return;

    const panelRect = panel.getBoundingClientRect();
    const outsidePanel = event.clientX < panelRect.left
      || event.clientX > panelRect.right
      || event.clientY < panelRect.top
      || event.clientY > panelRect.bottom;
    panel.classList.toggle('drag-out-ready', outsidePanel);

    if (outsidePanel) {
      clearFolderSpatialDrop();
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      return;
    }

    panel.classList.remove('drag-out-ready');
    if (event.target instanceof Element && event.target.closest('.tile')) {
      clearFolderSpatialDrop();
      return;
    }

    const placement = getFolderSpatialPlacement(grid, event.clientX, event.clientY);
    if (!placement) {
      clearFolderSpatialDrop();
      return;
    }

    clearFolderSpatialDrop();
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    dragState.folderSpatialDrop = { targetId: placement.targetId, before: placement.before };
    placement.tile.classList.add(placement.before ? 'folder-snap-before' : 'folder-snap-after');
  });

  document.addEventListener('drop', async event => {
    if (!dragState) return;

    if (!activeFolderId) {
      const source = locateItem(dragState.itemId);
      const edge = dragState.rootEdgeDrop;
      const vertical = dragState.rootVerticalDrop;
      if (!source || source.folderId !== null || (!edge && !vertical)) return;
      event.preventDefault();
      event.stopPropagation();
      const itemId = dragState.itemId;
      if (edge) {
        moveRootItemToEdge(itemId, edge === 'start');
      } else {
        reorderItem(itemId, vertical.targetId, vertical.before);
      }
      clearGroupHover();
      clearRootOutsideDrop();
      dragState = null;
      await persistAndRender();
      return;
    }

    const source = locateItem(dragState.itemId);
    const panel = launcherView.querySelector('.folder-panel');
    if (!source || source.item.kind !== 'site' || source.folderId !== activeFolderId || !panel) return;

    const panelRect = panel.getBoundingClientRect();
    const outsidePanel = event.clientX < panelRect.left
      || event.clientX > panelRect.right
      || event.clientY < panelRect.top
      || event.clientY > panelRect.bottom;
    const spatial = dragState.folderSpatialDrop;
    panel.classList.remove('drag-out-ready');

    if (!outsidePanel && !spatial) return;
    event.preventDefault();
    event.stopPropagation();
    const itemId = dragState.itemId;
    clearGroupHover();

    if (outsidePanel) {
      moveItem(itemId, null, null);
    } else {
      reorderItem(itemId, spatial.targetId, spatial.before);
    }

    clearFolderSpatialDrop();
    dragState = null;
    await persistAndRender();
  });

  document.addEventListener('click', event => {
    if (!kindMenu.hidden && !event.target.closest('#kindSelect')) closeKindMenu();
    if (!locationMenu.hidden && !event.target.closest('#locationSelect')) closeLocationMenu();
    if (!contextMenu.hidden && !event.target.closest('#contextMenu')) hideContextMenu();
    if (!settingsPopover.hidden && !event.target.closest('#settingsPopover') && !event.target.closest('#settingsButton')) setSettingsPopover(false);

    if (activeFolderId
      && !dragState
      && modalBackdrop.hidden
      && contextMenu.hidden
      && settingsPopover.hidden
      && !event.target.closest('.folder-panel')) {
      closeFolder();
    }
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      if (!kindMenu.hidden) return closeKindMenu();
      if (!locationMenu.hidden) return closeLocationMenu();
      if (!modalBackdrop.hidden) return closeEditor();
      if (!contextMenu.hidden) return hideContextMenu();
      if (!settingsPopover.hidden) { setSettingsPopover(false); return; }
      if (activeFolderId) return closeFolder();
    }
    if (event.key === '/' && document.activeElement !== searchInput && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      searchInput.focus();
    }
  });

  window.addEventListener('popstate', event => {
    const nextFolder = event.state?.folderId || null;
    transition(() => { activeFolderId = nextFolder && getFolder(nextFolder) ? nextFolder : null; });
  });

  async function init() {
    config = normalizeConfig(await storageGet());
    populateKindSelect();
    applyPreferences();
    const hashMatch = location.hash.match(/^#folder=([^&]+)/);
    if (hashMatch) {
      const folderId = decodeURIComponent(hashMatch[1]);
      if (getFolder(folderId)) {
        activeFolderId = folderId;
        history.replaceState({ folderId }, '', location.hash);
      }
    }
    renderView();
  }

  init();
})();

