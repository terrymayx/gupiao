const fs=require('fs');
const path=require('path');
const mainPath=path.join(__dirname,'app','main.js');
const pkgPath=path.join(__dirname,'app','package.json');
let s=fs.readFileSync(mainPath,'utf8');
const anchor="const { createEmbeddedEdgeBridge } = require('./edge_bridge_server');";
if(!s.includes(anchor))throw new Error('main.js patch anchor missing');
if(!s.includes('V1.84 portable data mode')){
const block=`

// V1.84 portable data mode: keep Electron data beside the portable EXE.
const LEGACY_APPDATA_ROOT = app.getPath('appData');
const PORTABLE_EXECUTABLE_DIR = process.env.PORTABLE_EXECUTABLE_DIR || (app.isPackaged ? path.dirname(process.execPath) : __dirname);
const PORTABLE_DATA_ROOT = path.join(PORTABLE_EXECUTABLE_DIR,'data');
const PORTABLE_USER_DATA = path.join(PORTABLE_DATA_ROOT,'UserData');
const PORTABLE_SESSION_DATA = path.join(PORTABLE_DATA_ROOT,'SessionData');
const PORTABLE_CACHE = path.join(PORTABLE_DATA_ROOT,'Cache');
const PORTABLE_LOGS = path.join(PORTABLE_DATA_ROOT,'Logs');
function ensurePortableDir(dir){ fs.mkdirSync(dir,{recursive:true}); return dir; }
function copyPortableIfMissing(src,dst){
  if(!fs.existsSync(src)||fs.existsSync(dst))return false;
  ensurePortableDir(path.dirname(dst));
  fs.cpSync(src,dst,{recursive:true,errorOnExist:false,force:false});
  return true;
}
function migrateLegacyPortableUserData(){
  const legacyRoot=path.join(LEGACY_APPDATA_ROOT,'stock-cell-desktop');
  if(!fs.existsSync(legacyRoot))return;
  const marker=path.join(PORTABLE_DATA_ROOT,'.v184-migration-complete.json');
  if(fs.existsSync(marker))return;
  const copied=[];
  try{
    const entries=[
      ['Local Storage',path.join(legacyRoot,'Local Storage'),path.join(PORTABLE_USER_DATA,'Local Storage')],
      ['Preferences',path.join(legacyRoot,'Preferences'),path.join(PORTABLE_USER_DATA,'Preferences')],
      ['window state',path.join(legacyRoot,'stock-cell-window.json'),path.join(PORTABLE_USER_DATA,'stock-cell-window.json')]
    ];
    for(const [label,src,dst] of entries){if(copyPortableIfMissing(src,dst))copied.push(label);}
    fs.writeFileSync(marker,JSON.stringify({migratedAt:new Date().toISOString(),legacyRoot,copied},null,2));
  }catch(error){try{fs.writeFileSync(path.join(PORTABLE_LOGS,'migration-error.txt'),String(error?.stack||error));}catch{}}
}
function configurePortableDataPaths(){
  [PORTABLE_DATA_ROOT,PORTABLE_USER_DATA,PORTABLE_SESSION_DATA,PORTABLE_CACHE,PORTABLE_LOGS].forEach(ensurePortableDir);
  app.setPath('userData',PORTABLE_USER_DATA);
  app.setPath('sessionData',PORTABLE_SESSION_DATA);
  app.setPath('cache',PORTABLE_CACHE);
  app.setPath('logs',PORTABLE_LOGS);
  app.commandLine.appendSwitch('disk-cache-size','52428800');
  app.commandLine.appendSwitch('media-cache-size','10485760');
  migrateLegacyPortableUserData();
}
configurePortableDataPaths();
`;
s=s.replace(anchor,anchor+block);
fs.writeFileSync(mainPath,s);
}
const p=JSON.parse(fs.readFileSync(pkgPath,'utf8'));
p.version='1.84.0';
p.description='V1.84 portable data mode';
p.build.artifactName='StockCellDesktop_V1_84.${ext}';
fs.writeFileSync(pkgPath,JSON.stringify(p,null,2));
for(const x of ["app.setPath('userData',PORTABLE_USER_DATA)","app.setPath('sessionData',PORTABLE_SESSION_DATA)","disk-cache-size','52428800'","PORTABLE_EXECUTABLE_DIR"]){if(!s.includes(x))throw new Error('missing '+x)}
console.log('V1.84 portable patch PASS');
