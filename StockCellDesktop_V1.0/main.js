const { app, BrowserWindow, ipcMain, globalShortcut, screen, net } = require('electron');
const fs = require('fs');
const path = require('path');
const { createEmbeddedEdgeBridge } = require('./edge_bridge_server');

let win=null;
let bridge=null;
let bridgeStartError=null;
let clickThrough=false;
let chromeVisible=true;
let alwaysOnTop=true;
let opacity=1;

function stateFile(){ return path.join(app.getPath('userData'),'stock-cell-window.json'); }

function primaryWorkArea(){ return screen.getPrimaryDisplay().workArea; }

function clampBounds(b){
  const a=primaryWorkArea();
  const width=Math.max(520,Math.min(a.width,Number(b.width)||760));
  const height=Math.max(480,Math.min(a.height,Number(b.height)||700));
  const x=Math.max(a.x,Math.min(a.x+a.width-width,Number(b.x)??a.x+a.width-width-30));
  const y=Math.max(a.y,Math.min(a.y+a.height-height,Number(b.y)??a.y+40));
  return {x,y,width,height};
}

function loadState(){
  try{return JSON.parse(fs.readFileSync(stateFile(),'utf8'));}catch{return null;}
}
function saveState(){
  if(!win||win.isDestroyed())return;
  try{
    fs.writeFileSync(stateFile(),JSON.stringify({
      bounds:win.getBounds(),opacity,alwaysOnTop
    },null,2));
  }catch{}
}
function windowState(){
  if(!win||win.isDestroyed())return null;
  return {bounds:win.getBounds(),opacity,alwaysOnTop,clickThrough,chromeVisible};
}
function setPassThrough(enabled){
  clickThrough=!!enabled;
  if(win&&!win.isDestroyed()){
    win.setIgnoreMouseEvents(clickThrough,{forward:true});
    win.webContents.send('desktop:pass-through',clickThrough);
  }
}
function toggleChrome(){
  chromeVisible=!chromeVisible;
  if(win&&!win.isDestroyed())win.webContents.send('desktop:chrome-visible',chromeVisible);
}
async function getJson(rawUrl,attempts=4){
  let last=null;
  for(let i=0;i<attempts;i++){
    try{
      const u=new URL(rawUrl);
      u.searchParams.set('_ts',String(Date.now()+i));
      const c=new AbortController();
      const timer=setTimeout(()=>c.abort(),4500);
      let res;
      try{
        res=await net.fetch(u.toString(),{
          headers:{Accept:'application/json,text/plain,*/*','Cache-Control':'no-cache',Pragma:'no-cache'},
          signal:c.signal
        });
      }finally{clearTimeout(timer);}
      if(!res.ok)throw new Error(`HTTP ${res.status}`);
      return JSON.parse(await res.text());
    }catch(e){
      last=e;
      if(i<attempts-1)await new Promise(r=>setTimeout(r,160+i*220));
    }
  }
  throw last||new Error('request failed');
}

function sectorFs(mode){
  return mode==='concept' ? 'm:90+t:3' : 'm:90+t:2';
}
async function fetchSectorFlows(mode='industry'){
  const fsExpr=sectorFs(mode);
  const url='https://push2.eastmoney.com/api/qt/clist/get'
    +'?pn=1&pz=100&po=1&np=1&fltt=2&invt=2&fid=f62'
    +'&fs='+encodeURIComponent(fsExpr)
    +'&fields=f12,f14,f3,f62';
  const json=await getJson(url,4);
  const diff=Array.isArray(json?.data?.diff)?json.data.diff:[];
  const rows=diff.map(r=>({
    code:String(r?.f12||''),
    name:String(r?.f14||'').trim(),
    pct:Number(r?.f3)||0,
    flow:(Number(r?.f62)||0)/100000000
  })).filter(x=>x.name&&/^BK\d{4}$/i.test(x.code));
  return {ok:rows.length>0,source:'eastmoney_direct',mode,rows,updatedAt:Date.now()};
}

async function fetchSectorDecliners(symbol,limit=10){
  const code=String(symbol||'').trim().toUpperCase();
  if(!/^BK\d{4}$/.test(code))return {ok:false,error:'板块代码格式错误',rows:[]};
  const url='https://push2.eastmoney.com/api/qt/clist/get'
    +'?pn=1&pz=50&po=0&np=1&fltt=2&invt=2&fid=f3'
    +'&fs=b:'+encodeURIComponent(code)
    +'&fields=f12,f14,f3,f62';
  const json=await getJson(url,4);
  const diff=Array.isArray(json?.data?.diff)?json.data.diff:[];
  const rows=diff
    .map(r=>({
      code:String(r?.f12||''),
      name:String(r?.f14||'').trim(),
      changePct:Number(r?.f3)||0,
      netInflow:(Number(r?.f62)||0)/100000000
    }))
    .filter(x=>x.name)
    .sort((a,b)=>a.changePct-b.changePct)
    .slice(0,Math.max(1,Math.min(20,Number(limit)||10)));
  return {ok:rows.length>0,source:'eastmoney_direct',symbol:code,rows,updatedAt:Date.now()};
}

function createWindow(){
  const saved=loadState();
  const a=primaryWorkArea();
  const fallback={width:760,height:700,x:a.x+a.width-790,y:a.y+55};
  const bounds=clampBounds(saved?.bounds||fallback);
  opacity=Math.max(.25,Math.min(1,Number(saved?.opacity)||1));
  alwaysOnTop=saved?.alwaysOnTop!==false;

  win=new BrowserWindow({
    ...bounds,
    transparent:true,
    frame:false,
    backgroundColor:'#00000000',
    alwaysOnTop,
    resizable:true,
    minWidth:520,
    minHeight:480,
    show:false,
    skipTaskbar:false,
    hasShadow:false,
    webPreferences:{
      preload:path.join(__dirname,'preload.js'),
      contextIsolation:true,
      nodeIntegration:false
    }
  });
  win.setOpacity(opacity);
  win.loadFile('stock_cell_desktop.html');
  win.once('ready-to-show',()=>win.show());
  win.on('move',saveState);
  win.on('resize',saveState);
  win.on('closed',()=>{win=null;});
}

function registerIPC(){
  ipcMain.handle('cell:get-window-state',()=>windowState());
  ipcMain.handle('cell:set-bounds',(e,b)=>{
    if(!win||win.isDestroyed())return null;
    win.setBounds(clampBounds(b),true);saveState();return windowState();
  });
  ipcMain.handle('cell:set-opacity',(e,v)=>{
    opacity=Math.max(.25,Math.min(1,Number(v)||1));
    if(win&&!win.isDestroyed())win.setOpacity(opacity);
    saveState();return windowState();
  });
  ipcMain.handle('cell:set-always-on-top',(e,v)=>{
    alwaysOnTop=!!v;if(win&&!win.isDestroyed())win.setAlwaysOnTop(alwaysOnTop,alwaysOnTop?'screen-saver':'normal');
    saveState();return windowState();
  });
  ipcMain.handle('cell:set-pass-through',(e,v)=>{setPassThrough(v);return windowState();});
  ipcMain.handle('cell:reset-window',()=>{
    if(!win||win.isDestroyed())return null;
    const a=primaryWorkArea();
    win.setBounds(clampBounds({width:760,height:700,x:a.x+a.width-790,y:a.y+55}),true);
    opacity=1;alwaysOnTop=true;win.setOpacity(1);win.setAlwaysOnTop(true,'screen-saver');setPassThrough(false);saveState();
    return windowState();
  });

  ipcMain.handle('cell:fetch-sectors',async(e,payload)=>{
    try{return await fetchSectorFlows(payload?.mode||'industry');}
    catch(error){
      const snap=bridge?.getSectorSnapshot?.();
      if(snap?.sectors?.length){
        return {ok:true,source:'edge_browser_data',mode:payload?.mode||'industry',rows:snap.sectors,updatedAt:snap.updatedAt||Date.now(),fallback:true};
      }
      return {ok:false,error:String(error?.message||error),rows:[]};
    }
  });
  ipcMain.handle('cell:fetch-decliners',async(e,payload)=>{
    try{return await fetchSectorDecliners(payload?.symbol,payload?.limit||10);}
    catch(error){return {ok:false,error:String(error?.message||error),rows:[]};}
  });

  ipcMain.handle('cell:bridge-status',()=>{
    if(!bridge)return {ok:false,error:bridgeStartError||'bridge unavailable'};
    return {ok:true,...bridge.getStatus()};
  });
}

app.whenReady().then(async()=>{
  registerIPC();
  bridge=createEmbeddedEdgeBridge({host:'127.0.0.1',port:17890});
  try{await bridge.start();}
  catch(error){
    bridgeStartError=String(error?.message||error);
    // 如果 17890 已被另一个兼容 Bridge 占用，不影响本程序直接行情接口运行。
    console.warn('[EdgeBridge]',bridgeStartError);
  }
  createWindow();

  globalShortcut.register('Alt+S',()=>{
    if(!win||win.isDestroyed())return;
    setPassThrough(false);win.show();win.focus();
    win.webContents.send('desktop:toggle-settings');
  });
  globalShortcut.register('Alt+G',()=>setPassThrough(!clickThrough));
  globalShortcut.register('Alt+H',()=>toggleChrome());
});

app.on('will-quit',()=>{
  globalShortcut.unregisterAll();
  bridge?.stop?.().catch(()=>{});
});
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit();});
