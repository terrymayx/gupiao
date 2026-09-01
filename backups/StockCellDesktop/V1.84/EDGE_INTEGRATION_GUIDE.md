# Integration Guide - reuse the current EdgeBridge in another program

## Scenario 1: consume the bridge that StockCellDesktop already started

1. Start StockCellDesktop V1.84 normally.
2. Keep Edge + the existing extension enabled.
3. Other program checks `GET http://127.0.0.1:17890/api/health`.
4. Get token from `GET /api/watchlist`.
5. Read `/api/status` and `/api/live-sectors` or submit a task.

Do not start another bridge on port 17890 when the desktop app already owns it.

## Scenario 2: the other program owns the bridge

1. Use the backed-up EdgeBridge API package.
2. Make sure Node.js 20+ is installed.
3. Start `node standalone_bridge.js`.
4. Keep the existing Edge extension enabled.
5. Check `/api/status` until `edge_extension_connected` becomes true.
6. Use the consumer endpoints.

## Recommended startup check

```text
health -> watchlist/token -> status
```

If `health` fails: no bridge is listening.

If `health` works but `edge_extension_connected=false`: bridge exists, but Edge extension has not recently contacted it.

If a task remains pending: confirm Edge and the extension are active and can reach 127.0.0.1:17890.

## Read sector fund-flow snapshot

```javascript
const base = 'http://127.0.0.1:17890';
const w = await fetch(base + '/api/watchlist').then(r=>r.json());
const sectors = await fetch(base + '/api/live-sectors', {
  headers: {'X-StockTray-Token': w.token},
  cache: 'no-store'
}).then(r=>r.json());

const inflow = sectors.sectors
  .filter(x => x.flow > 0)
  .sort((a,b)=>b.flow-a.flow);

const outflow = sectors.sectors
  .filter(x => x.flow < 0)
  .sort((a,b)=>a.flow-b.flow);
```

`flow` 已经是亿元。

## Fetch a board's constituent ranking

```javascript
const submitted = await fetch(base + '/api/peer-request', {
  method:'POST',
  headers:{
    'Content-Type':'application/json',
    'X-StockTray-Token': w.token
  },
  body:JSON.stringify({
    symbol:'BK0450',
    limit:10,
    direction:'gain'
  })
}).then(r=>r.json());
```

随后轮询 `/api/peer-result?request_id=...` 直到 success/failed。

## Token refresh

Bridge 进程每次启动都会生成新 token，不要写死。遇到 401：重新 `/api/watchlist` 获取 token，再重试一次。

## Port

默认 `17890`。Standalone 模式可使用：

```text
EDGE_BRIDGE_HOST=127.0.0.1
EDGE_BRIDGE_PORT=17890
```

现有扩展默认联系 17890，因此通常不要改端口。

## Local security

保持 `127.0.0.1`，不要暴露到 `0.0.0.0` 或公网。session token 只用于本机进程协调，不是 Internet 级认证。
