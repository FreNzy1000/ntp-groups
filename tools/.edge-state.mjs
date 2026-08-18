const port = Number(process.argv[2]);
if (!port) process.exit(2);

async function connect(wsUrl){
  const ws=new WebSocket(wsUrl);
  await new Promise((res,rej)=>{ws.onopen=res;ws.onerror=()=>rej(new Error('websocket error'))});
  let id=0; const pending=new Map();
  ws.onmessage=e=>{const m=JSON.parse(e.data);if(!m.id||!pending.has(m.id))return;const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(new Error(m.error.message)):p.resolve(m.result)};
  const send=(method,params={})=>new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});ws.send(JSON.stringify({id:n,method,params}))});
  return {ws,send};
}

const targets=await(await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const target=targets.find(t=>t.type==='page'&&t.url.startsWith('edge://extensions'));
if(!target) throw new Error('edge://extensions target missing');
const c=await connect(target.webSocketDebuggerUrl);
const expression=`(async()=>{
  const all=await chrome.developerPrivate.getExtensionsInfo();
  return {
    items:all.filter(x=>x.name==='NTP Groups').map(x=>({
      id:x.id,
      name:x.name,
      location:x.location,
      state:x.state,
      errors:(x.runtimeErrors||[]).map(e=>e.message),
      manifestErrors:(x.manifestErrors||[]).map(e=>e.message),
      disableReasons:x.disableReasons||null
    }))
  };
})()`;
const r=await c.send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});
console.log(JSON.stringify(r.result.value,null,2));
c.ws.close();