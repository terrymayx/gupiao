# StockCellDesktop V1.84 / EdgeBridge 完整接口清单

Base URL：`http://127.0.0.1:17890`

协议：HTTP + JSON UTF-8。

## Token

无需 token：

- `GET /api/health`
- `GET /api/watchlist`
- `GET /api/embedded-debug`

其余普通消费接口使用 `/api/watchlist` 返回的 session token。推荐请求头：

```http
X-StockTray-Token: <token>
```

也兼容 body.token / query.token。

## 公共状态接口

### GET `/api/health`
判断 bridge 是否启动。主要返回 `ok/provider/port/embedded/bridge_owner/features`。

### GET `/api/watchlist`
获取 token、共享 watchlist、watchlist version、wakeup generation、changed/force_refresh/reason。

### GET `/api/status`
Token 必需。返回 Edge 扩展连接、browser-data 时间、各队列数量、watchlist 状态、cache_age、最近错误等。

## 桌面统一快照

### GET `/api/dashboard-snapshot?codes=600000,000001`
Token 必需。

一次返回：

- `stocks`
- `intraday`
- `market`
- `sectors`
- `sector_updated_at`
- `market_updated_at`
- `browser_data_at`
- `edge_extension_connected`
- cache miss 状态
- `recommended_poll_seconds`

调度：竞价/交易 5 秒，午休 30 秒，收盘 120 秒。cache miss 只触发 Edge 立即抓取，不改成 1 秒轮询。

## 自选股接口

### POST `/api/stock-request`
请求：`{"code":"600000"}`。把股票加入共享 watchlist 并创建 stock task。

### GET `/api/stock-result?request_id=...`
状态：`pending | success | failed`，结果键：`stock`。

### GET `/api/stock-snapshot?code=600000`
直接读取当前 browser-data 中的股票快照，不创建任务。

### GET `/api/stock-intraday?code=600000`
返回缓存的腾讯分时，核心结构：

```json
{
  "ok": true,
  "code": "600000",
  "source": "edge_tencent_intraday",
  "trade_date": "20260901",
  "rows": [
    {"time":"09:30","price":10.01,"volume":1234,"amount":567890}
  ],
  "updated_at": "...",
  "age_seconds": 2.1
}
```

## 板块资金接口

### GET `/api/live-sectors`
返回最新板块资金快照：

```json
{
  "name": "半导体",
  "code": "BKxxxx",
  "flow": 35.62,
  "pct": 2.15,
  "source_field": "f62",
  "source_path": "browserData..."
}
```

`flow` 已归一化为亿元：正数=流入，负数=流出。

### POST `/api/industry-request`
创建行业/板块任务。

### GET `/api/industry-result?request_id=...`
结果键：`rows`。

## 板块成分股 / TOP10

### POST `/api/peer-request`

```json
{
  "symbol": "BK0450",
  "limit": 10,
  "direction": "gain",
  "sort_field": "change_pct"
}
```

桌面当前使用 `gain` / `decline`。

### GET `/api/peer-result?request_id=...`
结果键：`stocks`。桌面整理为 `code/name/changePct/netInflow`。

## 事件接口

### POST `/api/event-request`
### GET `/api/event-result?request_id=...`

结果键：`rows`。当前扩展任务类型可包含 shareholders / corporate_actions 等。

## Eastmoney fetch 接口

### POST `/api/custom-stock-request`
只提交 6 位代码，Bridge 内部生成 `https://push2.eastmoney.com/api/qt/stock/get`。

当前字段：

```text
f57,f58,f127,f43,f44,f45,f46,f60,f48,f137,f168,f169,f170,f171
```

### POST `/api/fetch-request`
通用 Edge fetch 任务，安全限制：仅 `https://push2.eastmoney.com`、仅 GET。

### GET `/api/fetch-result?request_id=...`
结果键：`data`。

## Edge 扩展内部接口

### POST `/api/browser-data`
扩展回传 `extension/quotes/intraday/sector/market`。Bridge 按分组 merge，不能让后到的一组覆盖整个快照。

### GET 任务领取

- `/api/industry-requests?limit=N`
- `/api/peer-requests?limit=N`
- `/api/event-requests?limit=N`
- `/api/fetch-requests?limit=N`

### POST 任务结果

- `/api/industry-data`
- `/api/peer-data`
- `/api/event-data`
- `/api/fetch-data`

### GET `/api/event-wakeup?since=<generation>`
扩展实时唤醒协议。返回 `woken/generation/pending/watchlist_changed/periodic_refresh_due/refresh_interval_seconds/trading_phase` 等。无事件时服务端短等约 450ms，避免 tight loop 占 CPU。

## 调试接口

### GET `/api/stock-debug?code=600000`
Token 必需。查看股票解析、watchlist/wake、Edge 连接、pending stock requests、browser-data 年龄。

### GET `/api/embedded-debug`
无需 token，本机调试。返回 status + watchlist + `has_browser_data`，不直接暴露完整 raw browser-data。

## HTTP 错误

- `400`：参数或 JSON 错误
- `401`：token 缺失/错误
- `404`：接口或 request_id 不存在
- `413`：POST body 大于 2 MiB

## 其它程序推荐接入流程

```text
GET /api/health
  ↓
GET /api/watchlist 取 token
  ↓
GET /api/status
  ↓
GET /api/dashboard-snapshot 或 /api/live-sectors
```

Token 每次 bridge 进程启动都会变化，不要写死。401 时重新 `/api/watchlist` 获取 token 后重试一次。
