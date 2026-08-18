const port=Number(process.argv[2]);
if(!port)process.exit(2);
async function connect(wsUrl){const ws=new WebSocket(wsUrl);await new Promise((res,rej)=>{ws.onopen=res;ws.onerror=()=>rej(new Error('ws'))});let id=0;const p=new Map();ws.onmessage=e=>{const m=JSON.parse(e.data);if(!m.id||!p.has(m.id))return;const h=p.get(m.id);p.delete(m.id);m.error?h.reject(new Error(m.error.message)):h.resolve(m.result)};const send=(method,params={})=>new Promise((resolve,reject)=>{const n=++id;p.set(n,{resolve,reject});ws.send(JSON.stringify({id:n,method,params}))});return{ws,send}}
const targets=await(await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const pages=targets.filter(t=>t.type==='page'&&(t.url.includes('newtab')||t.url.includes('new-tab')));
const results=[];
for(const t of pages){
  try{
    const c=await connect(t.webSocketDebuggerUrl);
    const expr=`(()=>{let manifest=null;let runtimeId=null;let runtimeError=null;try{runtimeId=chrome?.runtime?.id||null;manifest=chrome?.runtime?.getManifest?.()||null}catch(e){runtimeError=String(e?.message||e)}return{href:location.href,title:document.title,ready:document.readyState,runtimeId,runtimeError,manifest:manifest?{name:manifest.name,version:manifest.version,newtab:manifest.chrome_url_overrides?.newtab||null}:null,ui:{settingsButton:Boolean(document.querySelector('#settingsButton')),folderTiles:document.querySelectorAll('.folder-tile').length,siteTiles:document.querySelectorAll('.site-tile').length},body:(document.body?.innerText||'').trim().replace(/\\s+/g,' ').slice(0,500)}})()`;
    const r=await c.send('Runtime.evaluate',{expression:expr,returnByValue:true});
    results.push({target:{id:t.id,title:t.title,url:t.url},dom:r.result.value});
    c.ws.close();
  }catch(error){results.push({target:{id:t.id,title:t.title,url:t.url},error:String(error?.message||error)});}
}
const extensionPage=results.find(item=>item.dom?.manifest?.name==='NTP Groups'&&item.dom?.manifest?.newtab==='newtab.html'&&item.dom?.runtimeId&&item.dom?.ui?.settingsButton);
console.log(JSON.stringify({overrideActive:Boolean(extensionPage),extensionPage:extensionPage||null,pages:results},null,2));
process.exitCode=extensionPage?0:1;