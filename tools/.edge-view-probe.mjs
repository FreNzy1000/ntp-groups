const port=Number(process.argv[2]);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function connect(wsUrl){
  const ws=new WebSocket(wsUrl);
  await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(new Error('ws timeout')),5000);ws.onopen=()=>{clearTimeout(t);resolve()};ws.onerror=()=>{clearTimeout(t);reject(new Error('ws error'))}});
  let id=0;const pending=new Map();
  ws.onmessage=e=>{const m=JSON.parse(e.data);if(!m.id||!pending.has(m.id))return;const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(new Error(m.error.message)):p.resolve(m.result)};
  const send=(method,params={})=>new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});ws.send(JSON.stringify({id:n,method,params}))});
  return{ws,send};
}
async function evalValue(cdp,expression){const r=await cdp.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});return r.result.value}
const deadline=Date.now()+5000;
while(Date.now()<deadline){
  const targets=await(await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  for(const t of targets.filter(x=>x.type==='page')){
    let cdp;
    try{
      cdp=await connect(t.webSocketDebuggerUrl);
      const v=await evalValue(cdp,`(()=>{try{const m=chrome.runtime.getManifest();if(m.name!=='NTP Groups')return null;return{hash:location.hash,title:document.querySelector('.folder-title')?.value||'',body:document.body.innerText.slice(0,200),deepTile:Boolean(document.querySelector('[data-item-id="deep"]'))}}catch{return null}})()`);
      if(v){console.log(JSON.stringify(v));cdp.ws.close();process.exit(0)}
    }catch{}
    try{cdp?.ws?.close()}catch{}
  }
  await sleep(100);
}
console.log(JSON.stringify({error:'NTP target not found'}));process.exit(1);
