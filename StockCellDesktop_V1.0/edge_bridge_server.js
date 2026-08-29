const http = require('http');
const crypto = require('crypto');

function createEmbeddedEdgeBridge(options = {}) {
  const host = options.host || '127.0.0.1';
  const port = Number(options.port ?? 17890);
  const token = crypto.randomBytes(24).toString('hex');

  let watchlist = Array.isArray(options.watchlist) ? options.watchlist : [];

  const state = {
    listening:false,
    requestCount:0,
    lastRequestAt:0,
    lastExtensionAt:0,
    lastExtensionPath:'',
    lastBrowserDataAt:0,
    lastBrowserData:null,
    sectorSnapshot:[],
    sectorSnapshotAt:0,
    errors:[],
    queues:{
      industry:new Map(),
      peer:new Map(),
      event:new Map()
    }
  };

  const iso = ms => ms ? new Date(ms).toISOString() : null;

  function json(res,status,data){
    const body=Buffer.from(JSON.stringify(data),'utf8');
    res.writeHead(status,{
      'Content-Type':'application/json; charset=utf-8',
      'Content-Length':body.length,
      'Cache-Control':'no-store',
      'Access-Control-Allow-Origin':'*',
      'Access-Control-Allow-Methods':'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers':'Content-Type,X-StockTray-Token'
    });
    res.end(body);
  }

  function extensionLike(req){
    const origin=String(req.headers.origin||'');
    const ua=String(req.headers['user-agent']||'');
    return origin.startsWith('chrome-extension://') ||
           origin.startsWith('edge-extension://') ||
           /Edg\//i.test(ua);
  }

  function bodyJson(req,max=2*1024*1024){
    return new Promise((resolve,reject)=>{
      const chunks=[]; let total=0;
      req.on('data',c=>{
        total+=c.length;
        if(total>max){ reject(Object.assign(new Error('body too large'),{statusCode:413})); req.destroy(); return; }
        chunks.push(c);
      });
      req.on('end',()=>{
        if(!chunks.length)return resolve({});
        try{ resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
        catch{ reject(Object.assign(new Error('invalid json'),{statusCode:400})); }
      });
      req.on('error',reject);
    });
  }

  function suppliedToken(req,url,body){
    return String(
      req.headers['x-stocktray-token'] ||
      body?.token ||
      url.searchParams.get('token') ||
      ''
    );
  }

  function authOk(req,url,body,internal=false){
    const supplied=suppliedToken(req,url,body);
    if(supplied===token)return true;
    if(internal && !supplied && extensionLike(req))return true;
    return false;
  }

  function firstDefined(obj,keys){
    for(const k of keys){
      if(obj && obj[k] != null && obj[k] !== '') return {key:k,value:obj[k]};
    }
    return null;
  }

  function moneyToYi(raw,key=''){
    if(raw==null||raw==='')return null;
    if(typeof raw==='string'){
      let s=raw.trim().replace(/,/g,'');
      if(!s)return null;
      if(s.includes('亿')){ const n=Number(s.replace(/亿元?|亿/g,'')); return Number.isFinite(n)?n:null; }
      if(s.includes('万')){ const n=Number(s.replace(/万元?|万/g,'')); return Number.isFinite(n)?n/10000:null; }
      raw=Number(s.replace(/元/g,''));
    }
    const n=Number(raw);
    if(!Number.isFinite(n))return null;
    if(/^f(62|66|72|78|84)$/i.test(String(key)))return n/100000000;
    return Math.abs(n)>=100000 ? n/100000000 : n;
  }

  function normalizeSector(obj,path=''){
    if(!obj||typeof obj!=='object'||Array.isArray(obj))return null;
    const codeHit=firstDefined(obj,['code','symbol','sector_code','sectorCode','board_code','boardCode','plate_code','plateCode','f12','F12']);
    const nameHit=firstDefined(obj,['name','sector_name','sectorName','industry_name','industryName','board_name','boardName','plate_name','plateName','f14','F14']);
    const flowHit=firstDefined(obj,['net_inflow','netInflow','net_flow','netFlow','main_net_inflow','mainNetInflow','main_net_flow','mainNetFlow','fund_flow','fundFlow','f62','F62']);
    if(!nameHit||!flowHit)return null;
    const code=String(codeHit?.value||'');
    if(!/(sector|industry|board|plate|板块|行业)/i.test(path) && !/^BK\d{4}$/i.test(code))return null;
    const flow=moneyToYi(flowHit.value,flowHit.key);
    if(!Number.isFinite(flow))return null;
    const pctHit=firstDefined(obj,['change_percent','changePercent','pct','pct_change','pctChange','f3','F3']);
    const pct=Number(String(pctHit?.value??0).replace('%',''));
    return {
      code:/^BK\d{4}$/i.test(code)?code.toUpperCase():code,
      name:String(nameHit.value).trim(),
      flow:Number(flow.toFixed(4)),
      pct:Number.isFinite(pct)?pct:0,
      source_path:path
    };
  }

  function extractSectors(root){
    const out=[];
    const seen=new WeakSet();
    const stack=[{v:root,path:'browserData'}];
    let visited=0;
    while(stack.length && visited<12000){
      const cur=stack.pop(),v=cur.v;
      if(!v||typeof v!=='object'||seen.has(v))continue;
      seen.add(v); visited++;
      if(!Array.isArray(v)){
        const s=normalizeSector(v,cur.path);
        if(s)out.push(s);
      }
      if(Array.isArray(v)){
        for(let i=0;i<Math.min(v.length,5000);i++){
          if(v[i]&&typeof v[i]==='object')stack.push({v:v[i],path:`${cur.path}[${i}]`});
        }
      }else{
        for(const [k,child] of Object.entries(v)){
          if(child&&typeof child==='object')stack.push({v:child,path:`${cur.path}.${k}`});
        }
      }
    }
    const map=new Map();
    for(const s of out){
      const key=s.code||s.name;
      const old=map.get(key);
      if(!old||Math.abs(s.flow)>Math.abs(old.flow))map.set(key,s);
    }
    return [...map.values()].sort((a,b)=>Math.abs(b.flow)-Math.abs(a.flow));
  }

  function newId(prefix){return `${prefix}_${Date.now()}_${crypto.randomBytes(5).toString('hex')}`;}

  function createTask(kind,body){
    const id=String(body.request_id||newId(kind));
    const task={
      ...body,
      request_id:id,
      status:'queued',
      created_at:new Date().toISOString(),
      updated_at:new Date().toISOString(),
      claimed_at:null,
      result:null,
      error:null
    };
    state.queues[kind].set(id,task);
    return task;
  }

  function claim(kind,limit){
    const now=Date.now();
    const items=[...state.queues[kind].values()]
      .filter(t=>t.status==='queued'||t.status==='pending'||(t.status==='processing'&&t.claimed_at&&now-t.claimed_at>45000))
      .slice(0,Math.max(1,Math.min(20,Number(limit)||5)));
    for(const t of items){
      t.status='processing';t.claimed_at=now;t.updated_at=new Date().toISOString();
    }
    return items.map(t=>{const x={...t};delete x.result;return x;});
  }

  function resultPayload(task,kind){
    if(!task)return null;
    const status=['queued','processing'].includes(task.status)?'pending':task.status;
    const base={
      ok:true,request_id:task.request_id,status,internal_status:task.status,
      source:task.result?.source??null,error:task.error??task.result?.error??null,
      updated_at:task.updated_at
    };
    if(task.symbol!=null)base.symbol=task.symbol;
    if(task.kind!=null)base.kind=task.kind;
    if(kind==='peer'){
      base.symbols=task.result?.symbols??[];
      base.stocks=task.result?.stocks??[];
    }else{
      base.rows=task.result?.rows??[];
    }
    return base;
  }

  function applyResult(kind,body){
    const id=String(body.request_id||'');
    if(!id)return {status:400,error:'missing request_id'};
    const task=state.queues[kind].get(id);
    if(!task)return {status:404,error:'request_id not found'};
    task.status=(body.status==='failed'||body.error)?'failed':'success';
    task.error=body.error||null;
    task.result={...body};
    task.updated_at=new Date().toISOString();
    return {status:200,task};
  }

  function status(){
    const now=Date.now();
    return {
      ok:true,running:state.listening,provider:'edge_tencent',embedded:true,
      bridge_owner:'stock_cell_desktop',port:server.address()?.port||port,
      edge_extension_connected:!!state.lastExtensionAt && now-state.lastExtensionAt<30000,
      last_extension_at:iso(state.lastExtensionAt),
      last_extension_path:state.lastExtensionPath||null,
      last_browser_data_at:iso(state.lastBrowserDataAt),
      request_count:state.requestCount,
      sector_count:state.sectorSnapshot.length,
      sector_updated_at:iso(state.sectorSnapshotAt),
      errors:state.errors.slice(-20)
    };
  }

  const server=http.createServer(async(req,res)=>{
    const url=new URL(req.url||'/',`http://${host}:${port}`);
    const p=url.pathname;
    state.requestCount++;
    state.lastRequestAt=Date.now();
    if(extensionLike(req)||p==='/api/browser-data'||/\/api\/(industry|peer|event)-(requests|data|wakeup)/.test(p)){
      state.lastExtensionAt=Date.now();state.lastExtensionPath=p;
    }

    if(req.method==='OPTIONS'){
      res.writeHead(204,{
        'Access-Control-Allow-Origin':'*',
        'Access-Control-Allow-Methods':'GET,POST,OPTIONS',
        'Access-Control-Allow-Headers':'Content-Type,X-StockTray-Token'
      });
      return res.end();
    }

    let body={};
    if(req.method==='POST'){
      try{body=await bodyJson(req);}
      catch(e){return json(res,e.statusCode||400,{ok:false,error:e.message});}
    }

    if(req.method==='GET'&&p==='/api/health')
      return json(res,200,{ok:true,provider:'edge_tencent',port:server.address()?.port||port,embedded:true,bridge_owner:'stock_cell_desktop'});

    if(req.method==='GET'&&p==='/api/watchlist')
      return json(res,200,{ok:true,token,stocks:watchlist});

    if(req.method==='GET'&&p==='/api/status'){
      if(!authOk(req,url,body))return json(res,401,{ok:false,error:'unauthorized'});
      return json(res,200,status());
    }

    if(req.method==='POST'&&p==='/api/browser-data'){
      if(!authOk(req,url,body,true))return json(res,401,{ok:false,error:'unauthorized'});
      state.lastBrowserDataAt=Date.now();
      state.lastBrowserData=body;
      const sectors=extractSectors(body);
      if(sectors.length){state.sectorSnapshot=sectors;state.sectorSnapshotAt=Date.now();}
      return json(res,200,{ok:true,accepted:true,sector_count:state.sectorSnapshot.length,received_at:new Date().toISOString()});
    }

    if(req.method==='GET'&&p==='/api/live-sectors'){
      if(!authOk(req,url,body))return json(res,401,{ok:false,error:'unauthorized'});
      return json(res,200,{ok:true,source:'edge_browser_data',updated_at:iso(state.sectorSnapshotAt),sectors:state.sectorSnapshot});
    }

    const publicTaskMap=[
      ['industry','/api/industry-request','/api/industry-result'],
      ['peer','/api/peer-request','/api/peer-result'],
      ['event','/api/event-request','/api/event-result']
    ];
    for(const [kind,requestPath,resultPath] of publicTaskMap){
      if(req.method==='POST'&&p===requestPath){
        if(!authOk(req,url,body))return json(res,401,{ok:false,error:'unauthorized'});
        const task=createTask(kind,body);
        return json(res,200,{ok:true,request_id:task.request_id,status:'queued',symbol:task.symbol,kind:task.kind,created_at:task.created_at});
      }
      if(req.method==='GET'&&p===resultPath){
        if(!authOk(req,url,body))return json(res,401,{ok:false,error:'unauthorized'});
        const task=state.queues[kind].get(String(url.searchParams.get('request_id')||''));
        if(!task)return json(res,404,{ok:false,error:'request_id not found'});
        return json(res,200,resultPayload(task,kind));
      }
    }

    for(const kind of ['industry','peer','event']){
      if(req.method==='GET'&&p===`/api/${kind}-requests`){
        if(!authOk(req,url,body,true))return json(res,401,{ok:false,error:'unauthorized'});
        const requests=claim(kind,url.searchParams.get('limit'));
        return json(res,200,{ok:true,requests,tasks:requests,items:requests});
      }
      if(req.method==='POST'&&p===`/api/${kind}-data`){
        if(!authOk(req,url,body,true))return json(res,401,{ok:false,error:'unauthorized'});
        const r=applyResult(kind,body);
        if(!r.task)return json(res,r.status,{ok:false,error:r.error});
        return json(res,200,{ok:true,request_id:r.task.request_id,status:r.task.status});
      }
    }

    if(req.method==='GET'&&p==='/api/event-wakeup'){
      if(!authOk(req,url,body,true))return json(res,401,{ok:false,error:'unauthorized'});
      const pending=[...state.queues.event.values()].filter(x=>['queued','pending','processing'].includes(x.status)).length;
      return json(res,200,{ok:true,changed:pending>0,pending,requests:[],updated_at:new Date().toISOString()});
    }

    if(req.method==='GET'&&p==='/api/embedded-debug')
      return json(res,200,{...status(),watchlist,has_browser_data:!!state.lastBrowserData});

    return json(res,404,{ok:false,error:'not found',path:p});
  });

  function start(){
    if(state.listening)return Promise.resolve(status());
    return new Promise((resolve,reject)=>{
      const onError=err=>{
        state.errors.push({at:new Date().toISOString(),error:String(err?.message||err)});
        reject(err);
      };
      server.once('error',onError);
      server.listen(port,host,()=>{
        server.removeListener('error',onError);
        state.listening=true;
        resolve(status());
      });
    });
  }

  function stop(){
    return new Promise(resolve=>{
      if(!state.listening)return resolve();
      server.close(()=>{state.listening=false;resolve();});
    });
  }

  return {
    host,port,token,server,state,start,stop,getStatus:status,
    getSectorSnapshot:()=>({updatedAt:state.sectorSnapshotAt,sectors:state.sectorSnapshot.slice()}),
    getLastBrowserData:()=>state.lastBrowserData,
    setWatchlist:stocks=>{watchlist=Array.isArray(stocks)?stocks.slice(0,5000):[];}
  };
}

module.exports={createEmbeddedEdgeBridge};
