const port = Number(process.argv[2]);
const mode = process.argv[3] || 'verify';
if (!Number.isFinite(port)) process.exit(2);

const STORAGE_KEY = 'braveNtpGroupsConfig';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('CDP timeout')), 8000);
    ws.onopen = () => { clearTimeout(timer); resolve(); };
    ws.onerror = () => { clearTimeout(timer); reject(new Error('CDP websocket error')); };
  });
  let id = 0;
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
    const next = ++id;
    pending.set(next, { resolve, reject });
    ws.send(JSON.stringify({ id: next, method, params }));
  });
  return { ws, send };
}

async function evaluate(cdp, expression) {
  const result = await cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || 'evaluate failed');
  return result.result.value;
}

async function findNtp() {
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    for (const target of targets.filter(item => item.type === 'page')) {
      let cdp;
      try {
        cdp = await connect(target.webSocketDebuggerUrl);
        const info = await evaluate(cdp, `(()=>{try{const m=chrome.runtime.getManifest();return {name:m.name,href:location.href}}catch{return null}})()`);
        if (info?.name === 'NTP Groups' && info.href?.includes('/newtab.html')) return cdp;
      } catch {}
      try { cdp?.ws.close(); } catch {}
    }
    await sleep(150);
  }
  throw new Error('NTP Groups page not found');
}

const cdp = await findNtp();
try {
  if (mode === 'prepare') {
    const result = await evaluate(cdp, `(async()=>{
      const stored=(await chrome.storage.local.get('${STORAGE_KEY}'))['${STORAGE_KEY}']||{version:3,preferences:{},root:[]};
      stored.version=3;
      stored.preferences={...(stored.preferences||{}),persistentHub:true};
      await chrome.storage.local.set({['${STORAGE_KEY}']:stored});
      const current=await chrome.tabs.getCurrent();
      if(current?.id) await chrome.tabs.update(current.id,{pinned:true,active:true});
      await chrome.runtime.sendMessage({type:'ntp-groups-page-context'});
      const ordinary=await chrome.tabs.create({windowId:current.windowId,url:'about:blank',active:true,pinned:false});
      await chrome.windows.update(current.windowId,{focused:true});
      return {hubId:current.id,ordinaryId:ordinary.id,windowId:current.windowId};
    })()`);
    console.log(JSON.stringify(result));
  } else if (mode === 'verify') {
    const result = await evaluate(cdp, `(async()=>{
      const current=await chrome.tabs.getCurrent();
      const active=(await chrome.tabs.query({active:true,windowId:current.windowId}))[0];
      const contexts=await chrome.runtime.getContexts({contextTypes:['TAB']});
      const ownIds=new Set(contexts.filter(ctx=>ctx.documentUrl?.includes('/newtab.html')).map(ctx=>ctx.tabId));
      return {activeId:active?.id||null,pinned:Boolean(active?.pinned),isNtp:ownIds.has(active?.id),windowId:current.windowId};
    })()`);
    console.log(JSON.stringify(result));
    if (!(result.pinned && result.isNtp)) process.exitCode = 1;
  } else if (mode === 'cleanup') {
    const result = await evaluate(cdp, `(async()=>{
      const stored=(await chrome.storage.local.get('${STORAGE_KEY}'))['${STORAGE_KEY}'];
      if(stored){stored.preferences={...(stored.preferences||{}),persistentHub:false};await chrome.storage.local.set({['${STORAGE_KEY}']:stored});}
      const current=await chrome.tabs.getCurrent();
      if(current?.id&&current.pinned)await chrome.tabs.update(current.id,{pinned:false});
      return true;
    })()`);
    console.log(JSON.stringify({ok:Boolean(result)}));
  }
} finally {
  cdp.ws.close();
}
