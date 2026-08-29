const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('stockCellDesktop',{
  version:'1.0.0',
  getWindowState:()=>ipcRenderer.invoke('cell:get-window-state'),
  setBounds:b=>ipcRenderer.invoke('cell:set-bounds',b),
  setOpacity:v=>ipcRenderer.invoke('cell:set-opacity',v),
  setAlwaysOnTop:v=>ipcRenderer.invoke('cell:set-always-on-top',v),
  setPassThrough:v=>ipcRenderer.invoke('cell:set-pass-through',v),
  resetWindow:()=>ipcRenderer.invoke('cell:reset-window'),
  fetchSectors:p=>ipcRenderer.invoke('cell:fetch-sectors',p),
  fetchDecliners:p=>ipcRenderer.invoke('cell:fetch-decliners',p),
  bridgeStatus:()=>ipcRenderer.invoke('cell:bridge-status'),
  onToggleSettings:fn=>ipcRenderer.on('desktop:toggle-settings',()=>fn()),
  onPassThrough:fn=>ipcRenderer.on('desktop:pass-through',(e,v)=>fn(v)),
  onChromeVisible:fn=>ipcRenderer.on('desktop:chrome-visible',(e,v)=>fn(v))
});
