const port = Number(process.argv[2]);
if (!Number.isFinite(port)) {
  console.error(JSON.stringify({ passed: false, blocker: 'PORT_REQUIRED' }, null, 2));
  process.exit(2);
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const STORAGE_KEY = 'braveNtpGroupsConfig';
const ROLLBACK_KEY = 'ntpGroupsImportRollback';

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

async function findNtpTarget() {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    for (const candidate of targets.filter(item => item.type === 'page')) {
      let cdp;
      try {
        cdp = await connectCdp(candidate.webSocketDebuggerUrl);
        const identity = await evaluate(cdp, `(()=>{try{const m=chrome?.runtime?.getManifest?.();return{href:location.href,id:chrome?.runtime?.id||null,name:m?.name||null,newtab:m?.chrome_url_overrides?.newtab||null}}catch(e){return null}})()`);
        if (identity?.name === 'NTP Groups' && identity?.newtab === 'newtab.html' && identity?.id) return { target: candidate, cdp };
      } catch {}
      try { cdp?.ws?.close(); } catch {}
    }
    await sleep(200);
  }
  throw new Error('NTP Groups feature-test target not found.');
}

async function waitFor(cdp, expression, timeoutMs = 4000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      if (await evaluate(cdp, expression)) return true;
    } catch {}
    await sleep(60);
  }
  try { return Boolean(await evaluate(cdp, expression)); } catch { return false; }
}

async function reloadAndWait(cdp) {
  await evaluate(cdp, `location.reload(); true`);
  await sleep(250);
  const ok = await waitFor(cdp, `document.readyState === 'complete' && Boolean(document.querySelector('#launcherView'))`, 5000);
  if (!ok) throw new Error('NTP did not become ready after reload.');
  await sleep(180);
}

try {
  const { cdp } = await findNtpTarget();
  await cdp.send('Runtime.enable');

  const results = {
    manifest: null,
    migration: null,
    nested: null,
    exportImport: null,
    hub: null,
    spring: null,
  };

  results.manifest = await evaluate(cdp, `(async()=>{
    const m=chrome.runtime.getManifest();
    const commands=await chrome.commands.getAll();
    const command=commands.find(entry=>entry.name==='return-to-hub');
    return {
      version:m.version,
      permissions:m.permissions||[],
      hasBackground:Boolean(m.background?.service_worker),
      hasAction:Boolean(m.action),
      commandManifest:m.commands?.['return-to-hub']?.suggested_key||null,
      commandActual:command?.shortcut||'',
      persistentDefault:document.querySelector('#persistentHub')?.checked===false,
      dataControls:Boolean(document.querySelector('#exportConfig')&&document.querySelector('#importConfig')&&document.querySelector('#undoImport')),
    };
  })()`);

  await evaluate(cdp, `(async()=>{
    await chrome.storage.local.set({['${STORAGE_KEY}']:{
      version:2,
      preferences:{settingsButtonAlwaysVisible:true,openSitesInNewTab:false},
      root:[
        {kind:'site',id:'legacy-root',title:'Legacy Root',url:'https://example.com/'},
        {kind:'folder',id:'legacy-folder',title:'Legacy Folder',items:[
          {kind:'site',id:'legacy-child',title:'Legacy Child',url:'https://example.org/'}
        ]}
      ]
    }});
    return true;
  })()`);
  await reloadAndWait(cdp);
  results.migration = await evaluate(cdp, `(async()=>{
    const stored=(await chrome.storage.local.get('${STORAGE_KEY}'))['${STORAGE_KEY}'];
    return {
      version:stored?.version,
      rootSite:stored?.root?.some(item=>item.id==='legacy-root')===true,
      folderSite:stored?.root?.find(item=>item.id==='legacy-folder')?.items?.some(item=>item.id==='legacy-child')===true,
      openSitesInNewTab:stored?.preferences?.openSitesInNewTab,
      renderedRootSites:document.querySelectorAll('.site-tile').length,
      renderedRootFolders:document.querySelectorAll('.folder-tile').length,
    };
  })()`);

  await evaluate(cdp, `(async()=>{
    await chrome.storage.local.set({['${STORAGE_KEY}']:{
      version:3,
      preferences:{settingsButtonAlwaysVisible:true,openSitesInNewTab:false,persistentHub:false},
      root:[{kind:'folder',id:'parent',title:'Parent',items:[]}]
    }});
    return true;
  })()`);
  await reloadAndWait(cdp);
  results.nested = await evaluate(cdp, `(async()=>{
    const wait=async(pred,ms=2500)=>{const end=Date.now()+ms;while(Date.now()<end){if(pred())return true;await new Promise(r=>setTimeout(r,40));}return Boolean(pred())};
    document.querySelector('[data-item-id="parent"]')?.click();
    const parentOpen=await wait(()=>location.hash.includes('parent')&&Boolean(document.querySelector('.folder-panel')));
    const add=document.querySelector('.folder-grid .add-tile');
    add?.click();
    const parentAllowsFolder=document.querySelector('#kindRow')?.hidden===false;
    const editorKind=document.querySelector('#editorKind');
    editorKind.value='folder';
    editorKind.dispatchEvent(new Event('change',{bubbles:true}));
    document.querySelector('#editorTitle').value='Child';
    document.querySelector('#editorForm').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));
    const childCreated=await wait(async()=>{
      const stored=(await chrome.storage.local.get('${STORAGE_KEY}'))['${STORAGE_KEY}'];
      return stored?.root?.find(item=>item.id==='parent')?.items?.some(item=>item.kind==='folder'&&item.title==='Child');
    });
    const stored=(await chrome.storage.local.get('${STORAGE_KEY}'))['${STORAGE_KEY}'];
    const child=stored.root.find(item=>item.id==='parent').items.find(item=>item.kind==='folder'&&item.title==='Child');
    const childTile=document.querySelector('[data-item-id="'+child.id+'"]');
    childTile?.click();
    const childOpen=await wait(()=>location.hash.includes(encodeURIComponent(child.id))&&document.querySelector('.folder-title')?.value==='Child');
    const crumbs=[...document.querySelectorAll('.folder-breadcrumb-button')].map(node=>node.textContent.trim());
    document.querySelector('.folder-grid .add-tile')?.click();
    const lastLevelDirectSite=document.querySelector('#kindRow')?.hidden===true && document.querySelector('#modalTitle')?.textContent==='Добавить сайт';
    document.querySelector('#modalClose')?.click();
    return {parentOpen,parentAllowsFolder,childCreated,childOpen,crumbs,lastLevelDirectSite,childId:child.id};
  })()`);

  results.exportImport = await evaluate(cdp, `(async()=>{
    const wait=async(pred,ms=3000)=>{const end=Date.now()+ms;while(Date.now()<end){if(await pred())return true;await new Promise(r=>setTimeout(r,40));}return Boolean(await pred())};
    let captured=null;
    const originalAnchorClick=HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click=function(){captured={href:this.href,download:this.download};};
    document.querySelector('#exportConfig')?.click();
    await new Promise(r=>setTimeout(r,50));
    let exported=null;
    if(captured?.href){
      exported=JSON.parse(await (await fetch(captured.href)).text());
    }
    HTMLAnchorElement.prototype.click=originalAnchorClick;

    const before=(await chrome.storage.local.get('${STORAGE_KEY}'))['${STORAGE_KEY}'];
    const importPayload={
      format:'ntp-groups-backup',formatVersion:1,config:{
        version:3,
        preferences:{settingsButtonAlwaysVisible:false,openSitesInNewTab:true,persistentHub:false},
        root:[{kind:'folder',id:'import-parent',title:'Imported',items:[
          {kind:'folder',id:'import-child',title:'Nested',items:[
            {kind:'site',id:'import-site',title:'Imported Site',url:'https://example.net/'}
          ]}
        ]}]
      }
    };
    const oldConfirm=window.confirm;
    const oldAlert=window.alert;
    window.confirm=()=>true;
    window.alert=()=>{};
    let importTriggered=false;
    try{
      const transfer=new DataTransfer();
      transfer.items.add(new File([JSON.stringify(importPayload)],'NTP-Groups-test.json',{type:'application/json'}));
      const input=document.querySelector('#importConfigFile');
      input.files=transfer.files;
      input.dispatchEvent(new Event('change',{bubbles:true}));
      importTriggered=true;
    }catch(error){
      return {exportedOk:Boolean(exported?.format==='ntp-groups-backup'&&exported?.config?.version===3),importTriggered:false,error:String(error?.message||error)};
    }
    const imported=await wait(async()=>{
      const stored=(await chrome.storage.local.get('${STORAGE_KEY}'))['${STORAGE_KEY}'];
      return stored?.root?.[0]?.id==='import-parent' && stored?.root?.[0]?.items?.[0]?.id==='import-child';
    });
    const rollbackPresent=Boolean((await chrome.storage.local.get('${ROLLBACK_KEY}'))['${ROLLBACK_KEY}']?.config);
    const undoVisible=document.querySelector('#undoImport')?.hidden===false;
    document.querySelector('#undoImport')?.click();
    const undone=await wait(async()=>{
      const stored=(await chrome.storage.local.get('${STORAGE_KEY}'))['${STORAGE_KEY}'];
      return JSON.stringify(stored?.root)===JSON.stringify(before?.root);
    });
    const rollbackGone=!((await chrome.storage.local.get('${ROLLBACK_KEY}'))['${ROLLBACK_KEY}']);
    window.confirm=oldConfirm;
    window.alert=oldAlert;
    return {
      exportedOk:Boolean(exported?.format==='ntp-groups-backup'&&exported?.formatVersion===1&&exported?.config?.version===3),
      exportNested:Boolean(exported?.config?.root?.[0]?.items?.some?.(item=>item.kind==='folder')),
      importTriggered,imported,rollbackPresent,undoVisible,undone,rollbackGone
    };
  })()`);

  await evaluate(cdp, `(async()=>{
    const current=(await chrome.storage.local.get('${STORAGE_KEY}'))['${STORAGE_KEY}'];
    current.preferences={...(current.preferences||{}),openSitesInNewTab:false,persistentHub:false};
    current.root.unshift({kind:'site',id:'hub-site',title:'Hub Site',url:'https://example.com/'});
    await chrome.storage.local.set({['${STORAGE_KEY}']:current});
    return true;
  })()`);
  await reloadAndWait(cdp);
  results.hub = await evaluate(cdp, `(async()=>{
    const wait=async(pred,ms=3500)=>{const end=Date.now()+ms;while(Date.now()<end){if(await pred())return true;await new Promise(r=>setTimeout(r,50));}return Boolean(await pred())};
    const current=await chrome.tabs.getCurrent();
    if(current?.id) await chrome.tabs.update(current.id,{active:true});
    const visible=await wait(()=>document.visibilityState==='visible');
    const toggle=document.querySelector('#persistentHub');
    toggle.checked=true;
    toggle.dispatchEvent(new Event('change',{bubbles:true}));
    const becamePinned=await wait(async()=>Boolean((await chrome.tabs.getCurrent())?.pinned));
    const command=(await chrome.commands.getAll()).find(entry=>entry.name==='return-to-hub');
    const stored=(await chrome.storage.local.get('${STORAGE_KEY}'))['${STORAGE_KEY}'];
    const persistentSaved=stored?.preferences?.persistentHub===true;
    return {visible,becamePinned,persistentSaved,shortcut:command?.shortcut||'',tabId:current?.id||null};
  })()`);
  await reloadAndWait(cdp);
  const hubSiteProbe = await evaluate(cdp, `(async()=>{
    const wait=async(pred,ms=3500)=>{const end=Date.now()+ms;while(Date.now()<end){if(await pred())return true;await new Promise(r=>setTimeout(r,50));}return Boolean(await pred())};
    const hub=await chrome.tabs.getCurrent();
    if(hub?.id) await chrome.tabs.update(hub.id,{active:true});
    await wait(()=>document.visibilityState==='visible');
    const beforeTabs=await chrome.tabs.query({currentWindow:true});
    document.querySelector('[data-item-id="hub-site"]')?.click();
    const opened=await wait(async()=>{
      const active=(await chrome.tabs.query({active:true,currentWindow:true}))[0];
      return Boolean(active?.id&&active.id!==hub?.id);
    });
    const active=(await chrome.tabs.query({active:true,currentWindow:true}))[0];
    const newActiveId=active?.id||null;
    const hubStillPinned=Boolean((await chrome.tabs.get(hub.id))?.pinned);
    const hubStillNtp=location.href.includes('/newtab.html');
    if(newActiveId&&newActiveId!==hub.id) await chrome.tabs.remove(newActiveId);
    await chrome.tabs.update(hub.id,{active:true});
    const returned=await wait(()=>document.visibilityState==='visible'&&!location.hash&&!history.state?.folderId);
    const afterTabs=await chrome.tabs.query({currentWindow:true});

    const extra=await chrome.tabs.create({url:'chrome://newtab/',active:true,pinned:false});
    await new Promise(r=>setTimeout(r,300));
    const returnResponse=await chrome.runtime.sendMessage({type:'ntp-groups-return-to-hub'});
    const returnedViaMessage=await wait(async()=>{
      const activeTab=(await chrome.tabs.query({active:true,currentWindow:true}))[0];
      return activeTab?.id===hub.id;
    });
    if(extra?.id) { try{await chrome.tabs.remove(extra.id);}catch{} }

    const toggle=document.querySelector('#persistentHub');
    toggle.checked=false;
    toggle.dispatchEvent(new Event('change',{bubbles:true}));
    const becameUnpinned=await wait(async()=>!(await chrome.tabs.get(hub.id))?.pinned);
    return {opened,hubStillPinned,hubStillNtp,returned,beforeCount:beforeTabs.length,afterCount:afterTabs.length,returnResponseOk:returnResponse?.ok===true,returnedViaMessage,becameUnpinned};
  })()`);
  results.hub = { ...results.hub, ...hubSiteProbe };

  await evaluate(cdp, `(async()=>{
    await chrome.storage.local.set({['${STORAGE_KEY}']:{
      version:3,
      preferences:{settingsButtonAlwaysVisible:true,openSitesInNewTab:false,persistentHub:false},
      root:[
        {kind:'site',id:'drag-site',title:'Drag Site',url:'https://example.com/'},
        {kind:'folder',id:'ai',title:'AI',items:[
          {kind:'folder',id:'deep',title:'Deep',items:[]}
        ]}
      ]
    }});
    return true;
  })()`);
  await reloadAndWait(cdp);
  results.spring = await evaluate(cdp, `(async()=>{
    const wait=async(pred,ms=3000)=>{const end=Date.now()+ms;while(Date.now()<end){if(await pred())return true;await new Promise(r=>setTimeout(r,40));}return Boolean(await pred())};
    const site=document.querySelector('[data-item-id="drag-site"]');
    const ai=document.querySelector('[data-item-id="ai"]');
    if(!site||!ai) return {error:'drag fixtures missing'};
    const aiRect=ai.getBoundingClientRect();
    const x=aiRect.left+aiRect.width/2;
    const y=aiRect.top+aiRect.height/2;
    const dt=new DataTransfer();
    site.dispatchEvent(new DragEvent('dragstart',{bubbles:true,cancelable:true,dataTransfer:dt,clientX:x,clientY:y}));
    ai.dispatchEvent(new DragEvent('dragover',{bubbles:true,cancelable:true,dataTransfer:dt,clientX:x,clientY:y}));
    const springOpened=await wait(()=>location.hash.includes('folder=ai')&&document.querySelector('.folder-title')?.value==='AI',1800);
    const deep=document.querySelector('[data-item-id="deep"]');
    if(!deep) return {springOpened,error:'deep folder missing after spring'};
    deep.dispatchEvent(new DragEvent('dragover',{bubbles:true,cancelable:true,dataTransfer:dt,clientX:x,clientY:y}));
    await new Promise(r=>setTimeout(r,900));
    const stationaryBlocked=!location.hash.includes('folder=deep');
    const deepRect=deep.getBoundingClientRect();
    let movedX=deepRect.left+deepRect.width/2;
    let movedY=deepRect.top+deepRect.height/2;
    if(Math.hypot(movedX-x,movedY-y)<14) movedX=Math.min(deepRect.right-3,movedX+16);
    deep.dispatchEvent(new DragEvent('dragover',{bubbles:true,cancelable:true,dataTransfer:dt,clientX:movedX,clientY:movedY}));
    const deeperOpened=await wait(()=>location.hash.includes('folder=deep')&&document.querySelector('.folder-title')?.value==='Deep',1800);
    const grid=document.querySelector('.folder-grid');
    grid?.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:dt,clientX:movedX,clientY:movedY}));
    const movedIntoDeep=await wait(async()=>{
      const stored=(await chrome.storage.local.get('${STORAGE_KEY}'))['${STORAGE_KEY}'];
      const aiStored=stored?.root?.find(item=>item.id==='ai');
      const deepStored=aiStored?.items?.find(item=>item.id==='deep');
      return deepStored?.items?.some(item=>item.id==='drag-site')===true;
    });
    return {springOpened,stationaryBlocked,deeperOpened,movedIntoDeep,hash:location.hash};
  })()`);

  // Leave a deterministic fresh fixture for the subsequent native Windows mouse-drag gate.
  await evaluate(cdp, `(async()=>{
    await chrome.storage.local.set({['${STORAGE_KEY}']:{
      version:3,
      preferences:{settingsButtonAlwaysVisible:true,openSitesInNewTab:false,persistentHub:false},
      root:[
        {kind:'site',id:'drag-site',title:'Drag Site',url:'https://example.com/'},
        {kind:'folder',id:'ai',title:'AI',items:[{kind:'folder',id:'deep',title:'Deep',items:[]}]}
      ]
    }});
    history.replaceState(null,'',location.pathname);
    location.reload();
    return true;
  })()`);
  await sleep(350);
  await waitFor(cdp, `document.readyState==='complete'&&Boolean(document.querySelector('[data-item-id="drag-site"]'))&&Boolean(document.querySelector('[data-item-id="ai"]'))`,5000);
  await evaluate(cdp, `(async()=>{const tab=await chrome.tabs.getCurrent();if(tab?.id)await chrome.tabs.update(tab.id,{active:true});if(Number.isInteger(tab?.windowId))await chrome.windows.update(tab.windowId,{focused:true});return true})()`);
  await waitFor(cdp, `document.visibilityState==='visible'`,3000);

  cdp.ws.close();

  const checks = {
    version: results.manifest?.version === '0.2.0',
    permissionsUnchanged: Array.isArray(results.manifest?.permissions)
      && !results.manifest.permissions.includes('tabs')
      && JSON.stringify([...results.manifest.permissions].sort()) === JSON.stringify(['favicon','search','storage']),
    backgroundActionCommand: results.manifest?.hasBackground === true
      && results.manifest?.hasAction === true
      && results.manifest?.commandManifest === 'Alt+H'
      && results.manifest?.commandActual === 'Alt+H',
    controlsPresent: results.manifest?.persistentDefault === true && results.manifest?.dataControls === true,
    schemaMigration: results.migration?.version === 3
      && results.migration?.rootSite === true
      && results.migration?.folderSite === true
      && results.migration?.openSitesInNewTab === false,
    nestedCreation: results.nested?.parentOpen === true
      && results.nested?.parentAllowsFolder === true
      && results.nested?.childCreated === true
      && results.nested?.childOpen === true
      && results.nested?.lastLevelDirectSite === true
      && results.nested?.crumbs?.includes('Root')
      && results.nested?.crumbs?.includes('Parent'),
    exportImportUndo: results.exportImport?.exportedOk === true
      && results.exportImport?.exportNested === true
      && results.exportImport?.importTriggered === true
      && results.exportImport?.imported === true
      && results.exportImport?.rollbackPresent === true
      && results.exportImport?.undoVisible === true
      && results.exportImport?.undone === true
      && results.exportImport?.rollbackGone === true,
    persistentHub: results.hub?.visible === true
      && results.hub?.becamePinned === true
      && results.hub?.persistentSaved === true
      && results.hub?.shortcut === 'Alt+H'
      && results.hub?.opened === true
      && results.hub?.hubStillPinned === true
      && results.hub?.hubStillNtp === true
      && results.hub?.returned === true
      && results.hub?.returnResponseOk === true
      && results.hub?.returnedViaMessage === true
      && results.hub?.becameUnpinned === true,
    springOpen: results.spring?.springOpened === true
      && results.spring?.stationaryBlocked === true
      && results.spring?.deeperOpened === true
      && results.spring?.movedIntoDeep === true,
  };

  const failed = Object.entries(checks).filter(([, ok]) => !ok).map(([name]) => name);
  console.log(JSON.stringify({ passed: failed.length === 0, checks, failed, results }, null, 2));
  process.exitCode = failed.length === 0 ? 0 : 1;
} catch (error) {
  console.error(JSON.stringify({
    passed: false,
    blocker: 'EDGE_020_FEATURE_ACCEPTANCE_ERROR',
    message: error?.stack || String(error),
  }, null, 2));
  process.exitCode = 1;
}
