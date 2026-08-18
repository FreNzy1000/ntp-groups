const port = Number(process.argv[2]);
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function connect(wsUrl){
  const ws=new WebSocket(wsUrl);
  await new Promise((res,rej)=>{ws.onopen=res;ws.onerror=rej});
  let id=0; const pending=new Map();
  ws.onmessage=e=>{const m=JSON.parse(e.data); if(m.id&&pending.has(m.id)){const p=pending.get(m.id); pending.delete(m.id); m.error?p.reject(new Error(m.error.message)):p.resolve(m.result)}};
  const send=(method,params={})=>new Promise((resolve,reject)=>{const n=++id; pending.set(n,{resolve,reject}); ws.send(JSON.stringify({id:n,method,params}))});
  return {ws,send};
}
const targets=await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const target=targets.find(t=>t.type==='page'&&t.url.startsWith('edge://extensions'));
if(!target) throw new Error('edge://extensions target missing');
const c=await connect(target.webSocketDebuggerUrl);
const expression=`(async()=>{
  function roots(){const out=[];const seen=new Set();function walk(root,d=0){if(!root||seen.has(root)||d>8)return;seen.add(root);out.push(root);for(const el of (root.querySelectorAll?root.querySelectorAll('*'):[]))if(el.shadowRoot)walk(el.shadowRoot,d+1)}walk(document);return out}
  let dev=null; for(const r of roots()){dev=r.querySelector?.('#dev-switch');if(dev)break}
  if(!dev) return {ok:false,reason:'dev-switch missing'};
  if(!dev.checked) dev.click();
  await new Promise(r=>setTimeout(r,400));
  let load=null;
  for(const r of roots()){
    for(const el of (r.querySelectorAll?r.querySelectorAll('fluent-button'):[])){
      const text=(el.textContent||'').trim();
      if(/Загрузить распакованное|Load unpacked/i.test(text)){load=el;break}
    }
    if(load)break;
  }
  if(!load) return {ok:false,reason:'load unpacked missing'};
  load.click();
  return {ok:true,devChecked:Boolean(dev.checked),button:(load.textContent||'').trim()};
})()`;
const r=await c.send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});
console.log(JSON.stringify(r.result.value));
c.ws.close();
