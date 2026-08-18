(() => {
  'use strict';

  const STORAGE_KEY = 'braveNtpGroupsConfig';
  const IMPORT_ROLLBACK_KEY = 'ntpGroupsImportRollback';
  const SCHEMA_VERSION = 3;
  const MAX_FOLDER_DEPTH = 2;
  const SPRING_OPEN_MS = 750;
  const SPRING_REARM_DISTANCE = 12;

  const DEFAULT_CONFIG = {
    version: SCHEMA_VERSION,
    preferences: {
      settingsButtonAlwaysVisible: true,
      openSitesInNewTab: true,
      persistentHub: false
    },
    root: [
      { kind: 'folder', id: 'personal', title: 'Personal', items: [] },
      { kind: 'folder', id: 'work', title: 'Work', items: [] },
      { kind: 'folder', id: 'social', title: 'Social', items: [] },
      { kind: 'folder', id: 'media', title: 'Media', items: [] }
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
  const openSitesInNewTab = document.getElementById('openSitesInNewTab');
  const persistentHub = document.getElementById('persistentHub');
  const hubShortcut = document.getElementById('hubShortcut');
  const editHubShortcut = document.getElementById('editHubShortcut');
  const exportConfigButton = document.getElementById('exportConfig');
  const importConfigButton = document.getElementById('importConfig');
  const importConfigFile = document.getElementById('importConfigFile');
  const undoImport = document.getElementById('undoImport');
  const resetLayout = document.getElementById('resetLayout');

  let config = structuredClone(DEFAULT_CONFIG);
  let activeFolderId = null;
  let editorState = null;
  let dragState = null;
  let groupHoverTimer = null;
  let springHoverTimer = null;
  let selectedLocationId = '';
  let isHubPage = false;

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  async function storageGetKey(key) {
    try {
      if (globalThis.chrome?.storage?.local) {
        const result = await chrome.storage.local.get(key);
        return result[key] ?? null;
      }
    } catch (error) {
      console.warn('chrome.storage.local read failed', error);
    }
    try {
      return JSON.parse(localStorage.getItem(key) || 'null');
    } catch {
      return null;
    }
  }

  async function storageSetKey(key, value) {
    try {
      if (globalThis.chrome?.storage?.local) {
        await chrome.storage.local.set({ [key]: value });
        return;
      }
    } catch (error) {
      console.warn('chrome.storage.local write failed', error);
    }
    localStorage.setItem(key, JSON.stringify(value));
  }

  async function storageRemoveKey(key) {
    try {
      if (globalThis.chrome?.storage?.local) {
        await chrome.storage.local.remove(key);
        return;
      }
    } catch (error) {
      console.warn('chrome.storage.local remove failed', error);
    }
    localStorage.removeItem(key);
  }

  const storageGet = () => storageGetKey(STORAGE_KEY);
  const storageSet = value => storageSetKey(STORAGE_KEY, value);

  function sanitizeStoredItems(items, containerDepth = 0) {
    if (!Array.isArray(items)) return [];
    const result = [];
    for (const item of items) {
      if (!item || typeof item !== 'object' || typeof item.id !== 'string' || typeof item.title !== 'string') continue;
      if (item.kind === 'site' && typeof item.url === 'string') {
        result.push({ kind: 'site', id: item.id, title: item.title, url: item.url });
      } else if (item.kind === 'folder' && containerDepth < MAX_FOLDER_DEPTH) {
        result.push({
          kind: 'folder',
          id: item.id,
          title: item.title,
          items: sanitizeStoredItems(item.items, containerDepth + 1)
        });
      }
    }
    return result;
  }

  function normalizeConfig(raw) {
    const compatible = raw
      && (raw.version === 2 || raw.version === SCHEMA_VERSION)
      && Array.isArray(raw.root);
    if (!compatible) return clone(DEFAULT_CONFIG);
    return {
      version: SCHEMA_VERSION,
      preferences: {
        ...DEFAULT_CONFIG.preferences,
        ...(raw.preferences || {})
      },
      root: sanitizeStoredItems(raw.root, 0)
    };
  }

  function locateItemIn(items, itemId, parentFolderId = null, ancestors = []) {
    for (let index = 0; index < items.length; index++) {
      const item = items[index];
      if (item.id === itemId) {
        return {
          item,
          folderId: parentFolderId,
          parentFolderId,
          index,
          container: items,
          ancestors: [...ancestors],
          containerDepth: ancestors.length
        };
      }
      if (item.kind === 'folder') {
        const nested = locateItemIn(item.items || [], itemId, item.id, [...ancestors, item]);
        if (nested) return nested;
      }
    }
    return null;
  }

  function locateItem(itemId) {
    return locateItemIn(config.root, itemId, null, []);
  }

  function getFolder(folderId) {
    const found = locateItem(folderId);
    return found?.item?.kind === 'folder' ? found.item : null;
  }

  function getContainer(folderId) {
    if (!folderId) return config.root;
    const folder = getFolder(folderId);
    return folder ? folder.items : null;
  }

  function getFolderPath(folderId) {
    const found = locateItem(folderId);
    if (!found || found.item.kind !== 'folder') return [];
    return [...found.ancestors, found.item];
  }

  function getParentFolderId(folderId) {
    const found = locateItem(folderId);
    return found?.item?.kind === 'folder' ? found.parentFolderId : null;
  }

  function getFolderLevel(folderId) {
    const path = getFolderPath(folderId);
    return path.length;
  }

  function getFolderSubtreeHeight(folder) {
    if (!folder || folder.kind !== 'folder') return 0;
    const childFolders = (folder.items || []).filter(item => item.kind === 'folder');
    if (!childFolders.length) return 1;
    return 1 + Math.max(...childFolders.map(getFolderSubtreeHeight));
  }

  function canCreateFolderIn(folderId) {
    return !folderId || getFolderLevel(folderId) < MAX_FOLDER_DEPTH;
  }

  function canMoveItemToFolder(itemId, targetFolderId) {
    const source = locateItem(itemId);
    if (!source) return false;
    if (!targetFolderId) return true;
    const target = locateItem(targetFolderId);
    if (!target || target.item.kind !== 'folder') return false;
    if (source.item.kind === 'site') return true;
    if (source.item.id === targetFolderId) return false;
    if (target.ancestors.some(folder => folder.id === source.item.id)) return false;
    const targetLevel = getFolderLevel(targetFolderId);
    return targetLevel + getFolderSubtreeHeight(source.item) <= MAX_FOLDER_DEPTH;
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

  function resetToRoot({ render = true } = {}) {
    const hadFolderState = Boolean(activeFolderId || history.state?.folderId || location.hash.startsWith('#folder='));
    if (!hadFolderState) return false;
    activeFolderId = null;
    history.replaceState(null, '', location.pathname);
    if (render) renderView();
    return true;
  }

  function openSite(site, newTab = false) {
    if (!site?.url) return;
    if (newTab || isHubPage) {
      if (globalThis.chrome?.tabs?.create) {
        chrome.tabs.create({ url: site.url, active: true });
      } else {
        window.open(site.url, '_blank', 'noopener');
      }
      return;
    }
    resetToRoot({ render: false });
    location.href = site.url;
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
      const openInNewTab = isHubPage || event.ctrlKey || event.metaKey || config.preferences?.openSitesInNewTab !== false;
      openSite(site, openInNewTab);
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

  function makeFolderPreviewMini(item) {
    if (item?.kind === 'site') return createFavicon(item.url, item.title, 'folder-mini');
    const mini = document.createElement('span');
    mini.className = item?.kind === 'folder' ? 'folder-mini folder-mini-folder' : 'folder-mini';
    return mini;
  }

  function makeFolderTile(folder, parentFolderId = null) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'tile folder-tile';
    button.draggable = true;
    button.dataset.itemId = folder.id;
    button.dataset.folderId = parentFolderId || '';
    button.title = folder.title;

    const icon = document.createElement('span');
    icon.className = 'tile-icon';
    const preview = document.createElement('span');
    preview.className = 'folder-preview';
    const previewItems = folder.items.slice(0, 4);
    for (let i = 0; i < 4; i++) preview.append(makeFolderPreviewMini(previewItems[i]));
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
    attachDragHandlers(button, folder.id, parentFolderId);
    return button;
  }

  function makeAddTile(folderId = null) {
    const canAddFolder = canCreateFolderIn(folderId);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'tile add-tile';
    button.title = canAddFolder ? 'Добавить сайт или папку' : 'Добавить сайт';
    const icon = document.createElement('span');
    icon.className = 'tile-icon';
    const plus = makeSvgIcon('M12 5v14M5 12h14', 'add-icon');
    icon.append(plus);
    const label = document.createElement('span');
    label.className = 'tile-label';
    label.textContent = 'Добавить…';
    button.append(icon, label);
    button.addEventListener('click', () => openEditor({ mode: 'add', folderId, forceSite: !canAddFolder }));
    return button;
  }

  function renderRoot() {
    const strip = document.createElement('div');
    strip.className = 'tile-strip';
    strip.dataset.containerId = '';
    for (const item of config.root) {
      strip.append(item.kind === 'folder' ? makeFolderTile(item, null) : makeSiteTile(item, null));
    }
    strip.append(makeAddTile(null));
    attachContainerDropHandlers(strip, null);
    launcherView.replaceChildren(strip);
  }

  function makeBreadcrumbButton(label, targetFolderId) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'folder-breadcrumb-button';
    button.textContent = label;
    button.addEventListener('click', () => {
      if (dragState) return;
      if (targetFolderId) openFolder(targetFolderId, true);
      else transition(() => {
        activeFolderId = null;
        history.pushState(null, '', location.pathname);
      });
    });
    attachBreadcrumbDropHandlers(button, targetFolderId);
    return button;
  }

  function renderFolder(folder) {
    const panel = document.createElement('section');
    panel.className = 'folder-panel';
    panel.dataset.containerId = folder.id;

    const header = document.createElement('header');
    header.className = 'folder-header';
    const path = getFolderPath(folder.id);
    const breadcrumb = document.createElement('nav');
    breadcrumb.className = 'folder-breadcrumb';
    breadcrumb.setAttribute('aria-label', 'Путь к папке');
    breadcrumb.append(makeBreadcrumbButton('Root', null));
    for (const ancestor of path.slice(0, -1)) {
      const separator = document.createElement('span');
      separator.className = 'folder-breadcrumb-separator';
      separator.textContent = '/';
      breadcrumb.append(separator, makeBreadcrumbButton(ancestor.title, ancestor.id));
    }
    const currentSeparator = document.createElement('span');
    currentSeparator.className = 'folder-breadcrumb-separator';
    currentSeparator.textContent = '/';
    breadcrumb.append(currentSeparator);

    const title = document.createElement('input');
    title.type = 'text';
    title.className = 'folder-title';
    title.value = folder.title;
    title.maxLength = 28;
    title.setAttribute('aria-label', 'Название папки');
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

    header.append(breadcrumb, title);

    const grid = document.createElement('div');
    grid.className = 'folder-grid';
    grid.dataset.containerId = folder.id;
    for (const item of folder.items) {
      grid.append(item.kind === 'folder' ? makeFolderTile(item, folder.id) : makeSiteTile(item, folder.id));
    }
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
      dragState.groupTargetId = null;
    }
    document.querySelectorAll('.group-create-target').forEach(node => node.classList.remove('group-create-target'));
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

  function clearSpringHover() {
    if (springHoverTimer) {
      clearTimeout(springHoverTimer);
      springHoverTimer = null;
    }
    if (dragState) dragState.springCandidateId = null;
    document.querySelectorAll('.spring-target').forEach(node => node.classList.remove('spring-target'));
  }

  function springRearmed(clientX, clientY) {
    if (!dragState?.springLocked) return true;
    const distance = Math.hypot(clientX - dragState.springLockX, clientY - dragState.springLockY);
    if (distance < SPRING_REARM_DISTANCE) return false;
    dragState.springLocked = false;
    return true;
  }

  function openFolderDuringDrag(folderId, clientX, clientY) {
    if (!dragState) return;
    const folder = getFolder(folderId);
    if (!folder) return;
    clearGroupHover();
    clearSpringHover();
    clearRootOutsideDrop();
    clearFolderSpatialDrop();
    dragState.springLocked = true;
    dragState.springLockX = clientX;
    dragState.springLockY = clientY;
    activeFolderId = folderId;
    history.pushState({ folderId }, '', `#folder=${encodeURIComponent(folderId)}`);
    renderView();
  }

  function armSpringOpen(element, targetId, clientX, clientY) {
    if (!dragState) return;
    dragState.lastX = clientX;
    dragState.lastY = clientY;
    if (!springRearmed(clientX, clientY)) return;
    if (dragState.springCandidateId === targetId) return;
    clearSpringHover();
    if (!dragState) return;
    dragState.springCandidateId = targetId;
    element.classList.add('spring-target');
    springHoverTimer = setTimeout(() => {
      if (!dragState || dragState.springCandidateId !== targetId) return;
      springHoverTimer = null;
      openFolderDuringDrag(targetId, dragState.lastX, dragState.lastY);
    }, SPRING_OPEN_MS);
  }

  function armGroupHover(element, targetId) {
    if (!dragState) return;
    if (dragState.groupCandidateId === targetId || dragState.groupTargetId === targetId) return;
    clearGroupHover();
    if (!dragState) return;
    dragState.groupCandidateId = targetId;
    groupHoverTimer = setTimeout(() => {
      if (!dragState || dragState.groupCandidateId !== targetId) return;
      dragState.groupTargetId = targetId;
      groupHoverTimer = null;
      element.classList.add('group-create-target');
    }, 280);
  }

  function createGroupFromSites(sourceId, targetId) {
    const source = locateItem(sourceId);
    const target = locateItem(targetId);
    if (!source || !target || source.folderId !== target.folderId) return false;
    if (!canCreateFolderIn(source.folderId)) return false;
    if (source.item.kind !== 'site' || target.item.kind !== 'site' || sourceId === targetId) return false;

    const sourceItem = source.item;
    const targetItem = target.item;
    const parentFolderId = source.folderId;
    source.container.splice(source.index, 1);

    const refreshedTarget = locateItem(targetId);
    if (!refreshedTarget || refreshedTarget.folderId !== parentFolderId || refreshedTarget.item.kind !== 'site') return false;
    const insertIndex = refreshedTarget.index;
    refreshedTarget.container.splice(insertIndex, 1);
    refreshedTarget.container.splice(insertIndex, 0, {
      kind: 'folder',
      id: uniqueId('folder'),
      title: 'Папка',
      items: [targetItem, sourceItem]
    });
    return true;
  }

  function attachDragHandlers(element, itemId, folderId) {
    element.addEventListener('dragstart', event => {
      clearGroupHover();
      clearSpringHover();
      dragState = {
        itemId,
        folderId: folderId || null,
        sourceElement: element,
        groupCandidateId: null,
        groupTargetId: null,
        enterTargetId: null,
        springCandidateId: null,
        springLocked: false,
        springLockX: 0,
        springLockY: 0,
        lastX: event.clientX,
        lastY: event.clientY,
        rootEdgeDrop: null,
        rootVerticalDrop: null,
        folderSpatialDrop: null
      };
      element.classList.add('dragging');
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', itemId);
    });
    element.addEventListener('dragend', () => {
      dragState?.sourceElement?.classList.remove('dragging');
      clearGroupHover();
      clearSpringHover();
      clearRootOutsideDrop();
      clearFolderSpatialDrop();
      document.querySelectorAll('.drop-before,.drop-after,.drop-target,.drag-target').forEach(node => node.classList.remove('drop-before', 'drop-after', 'drop-target', 'drag-target'));
      setTimeout(() => { dragState = null; }, 0);
    });
    element.addEventListener('dragover', event => {
      if (!dragState || dragState.itemId === itemId) return;
      dragState.lastX = event.clientX;
      dragState.lastY = event.clientY;
      const source = locateItem(dragState.itemId);
      const target = locateItem(itemId);
      if (!source || !target) return;

      clearRootOutsideDrop();
      clearFolderSpatialDrop();
      dragState.enterTargetId = null;
      const sameContainer = source.folderId === target.folderId;
      const rect = element.getBoundingClientRect();
      const position = (event.clientX - rect.left) / Math.max(rect.width, 1);
      const inCenterZone = position >= 0.28 && position <= 0.72;
      const canCreateGroup = sameContainer
        && source.item.kind === 'site'
        && target.item.kind === 'site'
        && canCreateFolderIn(source.folderId);
      const canEnterFolder = target.item.kind === 'folder'
        && canMoveItemToFolder(source.item.id, target.item.id);

      if (inCenterZone && canEnterFolder) {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        element.classList.remove('drop-before', 'drop-after');
        element.classList.add('drop-target');
        dragState.enterTargetId = itemId;
        if (dragState.groupCandidateId === itemId || dragState.groupTargetId === itemId) clearGroupHover();
        armSpringOpen(element, itemId, event.clientX, event.clientY);
        return;
      }

      if (inCenterZone && canCreateGroup) {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        clearSpringHover();
        element.classList.remove('drop-before', 'drop-after');
        armGroupHover(element, itemId);
        return;
      }

      clearSpringHover();
      if (dragState.groupCandidateId === itemId || dragState.groupTargetId === itemId) clearGroupHover();
      if (!canMoveItemToFolder(source.item.id, target.folderId)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      const before = position < 0.5;
      element.classList.toggle('drop-before', before);
      element.classList.toggle('drop-after', !before);
    });
    element.addEventListener('dragleave', event => {
      if (event.relatedTarget instanceof Node && element.contains(event.relatedTarget)) return;
      element.classList.remove('drop-before', 'drop-after', 'drop-target', 'spring-target');
      if (dragState?.enterTargetId === itemId) dragState.enterTargetId = null;
      if (dragState?.groupCandidateId === itemId || dragState?.groupTargetId === itemId) clearGroupHover();
      if (dragState?.springCandidateId === itemId) clearSpringHover();
    });
    element.addEventListener('drop', async event => {
      if (!dragState || dragState.itemId === itemId) return;
      const sourceId = dragState.itemId;
      const source = locateItem(sourceId);
      const target = locateItem(itemId);
      if (!source || !target) return;

      const createGroup = dragState.groupTargetId === itemId
        && source.folderId === target.folderId
        && source.item.kind === 'site'
        && target.item.kind === 'site'
        && canCreateFolderIn(source.folderId);
      const enterFolder = dragState.enterTargetId === itemId
        && target.item.kind === 'folder'
        && canMoveItemToFolder(sourceId, target.item.id);
      const canPlaceBeside = canMoveItemToFolder(sourceId, target.folderId);
      if (!createGroup && !enterFolder && !canPlaceBeside) return;

      event.preventDefault();
      event.stopPropagation();
      if (createGroup) {
        createGroupFromSites(sourceId, itemId);
      } else if (enterFolder) {
        moveItem(sourceId, target.item.id, null);
      } else {
        const rect = element.getBoundingClientRect();
        moveItemRelative(sourceId, itemId, event.clientX < rect.left + rect.width / 2);
      }
      clearGroupHover();
      clearSpringHover();
      clearRootOutsideDrop();
      dragState = null;
      await persistAndRender();
    });
  }

  function attachContainerDropHandlers(container, folderId) {
    container.addEventListener('dragover', event => {
      if (!dragState) return;
      const source = locateItem(dragState.itemId);
      if (!source) return;
      if ((source.folderId || null) === (folderId || null)) return;
      if (!canMoveItemToFolder(source.item.id, folderId || null)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
    });
    container.addEventListener('drop', async event => {
      if (!dragState) return;
      if (event.target.closest('.tile,.folder-breadcrumb-button')) return;
      const source = locateItem(dragState.itemId);
      if (!source) return;
      if ((source.folderId || null) === (folderId || null)) return;
      if (!canMoveItemToFolder(source.item.id, folderId || null)) return;
      event.preventDefault();
      event.stopPropagation();
      moveItem(dragState.itemId, folderId || null, null);
      clearGroupHover();
      clearSpringHover();
      dragState = null;
      await persistAndRender();
    });
  }

  function attachBreadcrumbDropHandlers(button, targetFolderId) {
    button.addEventListener('dragover', event => {
      if (!dragState || !canMoveItemToFolder(dragState.itemId, targetFolderId)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      button.classList.add('drag-target');
    });
    button.addEventListener('dragleave', () => button.classList.remove('drag-target'));
    button.addEventListener('drop', async event => {
      if (!dragState || !canMoveItemToFolder(dragState.itemId, targetFolderId)) return;
      event.preventDefault();
      event.stopPropagation();
      const itemId = dragState.itemId;
      button.classList.remove('drag-target');
      moveItem(itemId, targetFolderId, null);
      clearGroupHover();
      clearSpringHover();
      dragState = null;
      await persistAndRender();
    });
  }

  function reorderItem(sourceId, targetId, before) {
    const source = locateItem(sourceId);
    const target = locateItem(targetId);
    if (!source || !target || source.folderId !== target.folderId) return false;
    source.container.splice(source.index, 1);
    let targetIndex = source.container.findIndex(item => item.id === targetId);
    if (targetIndex < 0) return false;
    if (!before) targetIndex += 1;
    source.container.splice(targetIndex, 0, source.item);
    return true;
  }

  function moveItemRelative(sourceId, targetId, before) {
    const source = locateItem(sourceId);
    const target = locateItem(targetId);
    if (!source || !target) return false;
    if (source.folderId === target.folderId) return reorderItem(sourceId, targetId, before);
    if (!canMoveItemToFolder(sourceId, target.folderId)) return false;
    const item = source.item;
    source.container.splice(source.index, 1);
    const refreshedTarget = locateItem(targetId);
    if (!refreshedTarget) return false;
    let index = refreshedTarget.index + (before ? 0 : 1);
    refreshedTarget.container.splice(index, 0, item);
    return true;
  }

  function moveItem(itemId, targetFolderId, beforeId = null) {
    const source = locateItem(itemId);
    if (!source || !canMoveItemToFolder(itemId, targetFolderId)) return false;
    const targetContainer = getContainer(targetFolderId);
    if (!targetContainer) return false;
    const item = source.item;
    source.container.splice(source.index, 1);
    if (beforeId) {
      const index = targetContainer.findIndex(entry => entry.id === beforeId);
      targetContainer.splice(index < 0 ? targetContainer.length : index, 0, item);
    } else {
      targetContainer.push(item);
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
      addContextAction('Открыть папку', () => openFolder(found.item.id, true));
      addContextAction('Переименовать…', () => openEditor({ mode: 'edit', itemId }));
    }
    addContextAction('Удалить', async () => {
      const latest = locateItem(itemId);
      if (!latest) return;
      if (latest.item.kind === 'folder' && latest.item.items.length > 0) {
        const stats = countTree(latest.item.items);
        const accepted = confirm(`Удалить папку «${latest.item.title}»? Внутри: сайтов ${stats.sites}, папок ${stats.folders}.`);
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
    { value: 'folder', label: 'Папка' }
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

  function getFolderLocationOptions(items = config.root, prefix = []) {
    const options = [];
    for (const item of items) {
      if (item.kind !== 'folder') continue;
      const path = [...prefix, item.title];
      options.push({ value: item.id, label: path.join(' / ') });
      options.push(...getFolderLocationOptions(item.items || [], path));
    }
    return options;
  }

  function populateLocationSelect(selectedFolderId) {
    locationMenu.replaceChildren();
    const options = [
      { value: '', label: 'Корень' },
      ...getFolderLocationOptions()
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
    const forceSite = options.forceSite === true || (!isEdit && Boolean(options.folderId) && !canCreateFolderIn(options.folderId));

    modalTitle.textContent = isEdit ? (editingFolder ? 'Изменить папку' : 'Изменить сайт') : (forceSite ? 'Добавить сайт' : 'Добавить');
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
      const targetFolderId = editorState.folderId || null;
      if (!canCreateFolderIn(targetFolderId)) return;
      const container = getContainer(targetFolderId);
      if (!container) return;
      container.push({ kind: 'folder', id: uniqueId('folder'), title, items: [] });
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
      if (!isHubPage) resetToRoot({ render: false });
      await chrome.search.query({ text, disposition: isHubPage ? 'NEW_TAB' : 'CURRENT_TAB' });
    } catch (error) {
      console.warn('Default-provider search failed', error);
      searchInput.setCustomValidity('Не удалось выполнить поиск через текущий провайдер.');
      searchInput.reportValidity();
      searchInput.setCustomValidity('');
    }
  });

  function countTree(items, containerDepth = 0) {
    const stats = { sites: 0, folders: 0, maxDepth: 0 };
    for (const item of Array.isArray(items) ? items : []) {
      if (item.kind === 'site') {
        stats.sites += 1;
        continue;
      }
      if (item.kind !== 'folder') continue;
      stats.folders += 1;
      stats.maxDepth = Math.max(stats.maxDepth, containerDepth + 1);
      const childStats = countTree(item.items, containerDepth + 1);
      stats.sites += childStats.sites;
      stats.folders += childStats.folders;
      stats.maxDepth = Math.max(stats.maxDepth, childStats.maxDepth);
    }
    return stats;
  }

  function validateImportConfig(candidate) {
    if (!candidate || typeof candidate !== 'object' || !Array.isArray(candidate.root)) {
      throw new Error('В файле нет структуры NTP Groups.');
    }
    const seenIds = new Set();
    const validateItems = (items, containerDepth) => {
      if (!Array.isArray(items)) throw new Error('Некорректный список элементов.');
      return items.map(item => {
        if (!item || typeof item !== 'object') throw new Error('Некорректный элемент структуры.');
        if (typeof item.id !== 'string' || !item.id.trim() || seenIds.has(item.id)) throw new Error('Некорректный или повторяющийся ID.');
        seenIds.add(item.id);
        if (typeof item.title !== 'string' || !item.title.trim()) throw new Error('У элемента отсутствует название.');
        if (item.kind === 'site') {
          if (typeof item.url !== 'string') throw new Error(`У сайта «${item.title}» отсутствует URL.`);
          try { new URL(item.url); } catch { throw new Error(`Некорректный URL у сайта «${item.title}».`); }
          return { kind: 'site', id: item.id, title: item.title, url: item.url };
        }
        if (item.kind === 'folder') {
          if (containerDepth >= MAX_FOLDER_DEPTH) throw new Error(`Папка «${item.title}» находится глубже допустимого уровня.`);
          return { kind: 'folder', id: item.id, title: item.title, items: validateItems(item.items, containerDepth + 1) };
        }
        throw new Error(`Неизвестный тип элемента «${item.title}».`);
      });
    };

    const normalized = {
      version: SCHEMA_VERSION,
      preferences: {
        ...DEFAULT_CONFIG.preferences,
        ...(candidate.preferences && typeof candidate.preferences === 'object' ? candidate.preferences : {})
      },
      root: validateItems(candidate.root, 0)
    };
    return { config: normalized, stats: countTree(normalized.root) };
  }

  function parseImportPayload(text) {
    let payload;
    try { payload = JSON.parse(text); } catch { throw new Error('Файл не является корректным JSON.'); }
    const candidate = payload?.format === 'ntp-groups-backup' ? payload.config : payload;
    return validateImportConfig(candidate);
  }

  async function refreshUndoImportAvailability() {
    const rollback = await storageGetKey(IMPORT_ROLLBACK_KEY);
    undoImport.hidden = !rollback?.config;
  }

  function exportConfiguration() {
    const payload = {
      format: 'ntp-groups-backup',
      formatVersion: 1,
      exportedAt: new Date().toISOString(),
      extensionVersion: globalThis.chrome?.runtime?.getManifest?.().version || null,
      config: clone(config)
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    const date = new Date().toISOString().slice(0, 10);
    anchor.href = url;
    anchor.download = `NTP-Groups-backup-${date}.json`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function importConfigurationFile(file) {
    if (!file) return;
    let imported;
    try {
      imported = parseImportPayload(await file.text());
    } catch (error) {
      alert(error?.message || 'Не удалось прочитать конфигурацию.');
      return;
    }
    const accepted = confirm([
      'Импортировать конфигурацию NTP Groups?',
      '',
      `Сайтов: ${imported.stats.sites}`,
      `Папок: ${imported.stats.folders}`,
      `Глубина папок: ${imported.stats.maxDepth}`,
      '',
      'Текущая конфигурация будет сохранена для одного шага отмены.'
    ].join('\n'));
    if (!accepted) return;

    await storageSetKey(IMPORT_ROLLBACK_KEY, { savedAt: new Date().toISOString(), config: clone(config) });
    config = imported.config;
    activeFolderId = null;
    history.replaceState(null, '', location.pathname);
    applyPreferences();
    await storageSet(config);
    renderView();
    await refreshUndoImportAvailability();
    await refreshPageContext();
  }

  async function undoLastImport() {
    const rollback = await storageGetKey(IMPORT_ROLLBACK_KEY);
    if (!rollback?.config) return;
    const restored = validateImportConfig(rollback.config).config;
    config = restored;
    activeFolderId = null;
    history.replaceState(null, '', location.pathname);
    applyPreferences();
    await storageSet(config);
    await storageRemoveKey(IMPORT_ROLLBACK_KEY);
    renderView();
    await refreshUndoImportAvailability();
    await refreshPageContext();
  }

  async function refreshPageContext() {
    if (!globalThis.chrome?.runtime?.sendMessage) {
      isHubPage = false;
      return;
    }
    try {
      const response = await chrome.runtime.sendMessage({ type: 'ntp-groups-page-context' });
      isHubPage = response?.isHub === true;
      if (typeof response?.persistentHubEnabled === 'boolean') {
        config.preferences.persistentHub = response.persistentHubEnabled;
        persistentHub.checked = response.persistentHubEnabled;
      }
      document.body.classList.toggle('hub-page', isHubPage);
    } catch {
      isHubPage = false;
      document.body.classList.remove('hub-page');
    }
  }

  async function refreshShortcutStatus() {
    if (!globalThis.chrome?.commands?.getAll) return;
    try {
      const commands = await chrome.commands.getAll();
      const command = commands.find(entry => entry.name === 'return-to-hub');
      hubShortcut.textContent = command?.shortcut || 'Не назначен';
    } catch {
      hubShortcut.textContent = 'Не назначен';
    }
  }

  function applyPreferences() {
    const alwaysVisible = config.preferences?.settingsButtonAlwaysVisible !== false;
    document.body.classList.toggle('settings-on-hover', !alwaysVisible);
    settingsButtonAlwaysVisible.checked = alwaysVisible;
    openSitesInNewTab.checked = config.preferences?.openSitesInNewTab !== false;
    persistentHub.checked = config.preferences?.persistentHub === true;
  }

  function setSettingsPopover(open) {
    settingsPopover.hidden = !open;
    settingsButton.setAttribute('aria-expanded', String(open));
  }

  settingsButton.addEventListener('click', event => {
    event.stopPropagation();
    const opening = settingsPopover.hidden;
    setSettingsPopover(opening);
    if (opening) {
      void refreshShortcutStatus();
      void refreshUndoImportAvailability();
    }
  });

  settingsButtonAlwaysVisible.addEventListener('change', async () => {
    config.preferences.settingsButtonAlwaysVisible = settingsButtonAlwaysVisible.checked;
    applyPreferences();
    await storageSet(config);
  });

  openSitesInNewTab.addEventListener('change', async () => {
    config.preferences.openSitesInNewTab = openSitesInNewTab.checked;
    await storageSet(config);
  });

  persistentHub.addEventListener('change', async () => {
    config.preferences.persistentHub = persistentHub.checked;
    await storageSet(config);
    try {
      const response = await chrome.runtime.sendMessage({ type: 'ntp-groups-persistent-hub-changed' });
      isHubPage = response?.isHub === true;
      document.body.classList.toggle('hub-page', isHubPage);
    } catch (error) {
      console.warn('Persistent Hub update failed', error);
      await refreshPageContext();
    }
  });

  exportConfigButton.addEventListener('click', exportConfiguration);
  importConfigButton.addEventListener('click', () => importConfigFile.click());
  importConfigFile.addEventListener('change', async () => {
    const file = importConfigFile.files?.[0] || null;
    importConfigFile.value = '';
    await importConfigurationFile(file);
  });
  undoImport.addEventListener('click', async () => {
    if (!confirm('Вернуть конфигурацию, которая была до последнего импорта?')) return;
    await undoLastImport();
  });
  editHubShortcut.addEventListener('click', async () => {
    try {
      await chrome.tabs.create({ url: 'chrome://extensions/shortcuts', active: true });
    } catch (error) {
      console.warn('Shortcut settings page could not be opened', error);
      alert('Откройте страницу управления сочетаниями клавиш расширений в настройках браузера.');
    }
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
    if (!source || !panel || !grid) return;

    // When a spring-open has moved the view but the dragged item still belongs
    // to the parent container, tile/grid handlers inside the new folder own the drop.
    if (source.folderId !== activeFolderId) {
      panel.classList.remove('drag-out-ready');
      clearFolderSpatialDrop();
      return;
    }

    const panelRect = panel.getBoundingClientRect();
    const outsidePanel = event.clientX < panelRect.left
      || event.clientX > panelRect.right
      || event.clientY < panelRect.top
      || event.clientY > panelRect.bottom;
    const parentFolderId = getParentFolderId(activeFolderId);
    const canMoveUp = canMoveItemToFolder(source.item.id, parentFolderId);
    panel.classList.toggle('drag-out-ready', outsidePanel && canMoveUp);

    if (outsidePanel && canMoveUp) {
      clearFolderSpatialDrop();
      clearSpringHover();
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      return;
    }

    panel.classList.remove('drag-out-ready');
    if (event.target instanceof Element && event.target.closest('.tile,.folder-breadcrumb-button')) {
      clearFolderSpatialDrop();
      return;
    }

    const placement = getFolderSpatialPlacement(grid, event.clientX, event.clientY);
    if (!placement) {
      clearFolderSpatialDrop();
      return;
    }

    clearFolderSpatialDrop();
    clearSpringHover();
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
    if (!source || source.folderId !== activeFolderId || !panel) return;

    const panelRect = panel.getBoundingClientRect();
    const outsidePanel = event.clientX < panelRect.left
      || event.clientX > panelRect.right
      || event.clientY < panelRect.top
      || event.clientY > panelRect.bottom;
    const spatial = dragState.folderSpatialDrop;
    const parentFolderId = getParentFolderId(activeFolderId);
    const canMoveUp = outsidePanel && canMoveItemToFolder(source.item.id, parentFolderId);
    panel.classList.remove('drag-out-ready');

    if (!canMoveUp && !spatial) return;
    event.preventDefault();
    event.stopPropagation();
    const itemId = dragState.itemId;
    clearGroupHover();
    clearSpringHover();

    if (canMoveUp) {
      moveItem(itemId, parentFolderId, null);
    } else {
      reorderItem(itemId, spatial.targetId, spatial.before);
    }

    clearFolderSpatialDrop();
    dragState = null;
    await persistAndRender();
  });

  document.addEventListener('dragend', () => {
    if (!dragState) return;
    dragState.sourceElement?.classList.remove('dragging');
    clearGroupHover();
    clearSpringHover();
    clearRootOutsideDrop();
    clearFolderSpatialDrop();
    document.querySelectorAll('.drop-before,.drop-after,.drop-target,.drag-target,.spring-target').forEach(node => {
      node.classList.remove('drop-before', 'drop-after', 'drop-target', 'drag-target', 'spring-target');
    });
    setTimeout(() => { dragState = null; }, 0);
  }, true);

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

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') resetToRoot();
  });

  window.addEventListener('pagehide', () => {
    resetToRoot({ render: false });
  });

  async function init() {
    const stored = await storageGet();
    config = normalizeConfig(stored);
    if (stored && stored.version !== SCHEMA_VERSION && Array.isArray(stored.root)) {
      await storageSet(config);
    }
    populateKindSelect();
    applyPreferences();
    await refreshPageContext();
    await Promise.all([refreshShortcutStatus(), refreshUndoImportAvailability()]);
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

