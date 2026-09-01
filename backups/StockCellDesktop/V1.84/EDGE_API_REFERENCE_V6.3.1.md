# Current EdgeBridge HTTP API Reference - V6.3.1

Base URL: `http://127.0.0.1:17890`

Protocol: HTTP + JSON UTF-8. CORS permits `GET`, `POST`, `OPTIONS`, `Content-Type`, and `X-StockTray-Token`.

## Authentication

No token:

- `GET /api/health`
- `GET /api/watchlist`
- `GET /api/embedded-debug` (debug endpoint in current implementation)

Normal consumer endpoints use the session token returned by `/api/watchlist`.

Supported token locations:

1. `X-StockTray-Token` request header - recommended.
2. JSON body field `token`.
3. Query parameter `token` - supported but not recommended.

## GET /api/health

```json
{
  "ok": true,
  "provider": "edge_tencent",
  "port": 17890,
  "embedded": true,
  "bridge_owner": "stock_galaxy"
}
```

## GET /api/watchlist

```json
{
  "ok": true,
  "token": "random-session-token",
  "stocks": [
    {"key":"A股:688981","symbol":"sh688981"}
  ]
}
```

## GET /api/status

Token required. Returns runtime state, extension activity, queue counts, cache age, and recent errors.

## GET /api/live-sectors

Token required. Returns the parsed latest sector snapshot extracted from the Edge extension's `/api/browser-data` payload.

Important fields per sector:

- `name`: sector/industry/board name
- `code`: usually `BKxxxx` when present
- `flow`: normalized to 亿元; positive=inflow, negative=outflow
- `pct`: change percent when present
- `source_field`: source money field, often `f62`
- `source_path`: where the parser found the object in browser-data

## POST /api/industry-request

Token required. The current bridge stores the request body as a queued task and adds metadata.

## GET /api/industry-result?request_id=...

Token required. Public status maps internal `queued` / `processing` to `pending`. Result key: `rows`.

## POST /api/peer-request

Token required.

```json
{
  "token":"...",
  "symbol":"BK0450",
  "limit":6,
  "direction":"inflow"
}
```

## GET /api/peer-result?request_id=...

Token required. Result fields include `status`, `symbols`, `stocks`, `source`, `error`, `debug`, `updated_at`.

## POST /api/event-request

Token required. Existing extension task types include `shareholders` and `corporate_actions`.

## GET /api/event-result?request_id=...

Token required. Result key: `rows`.

## Internal extension endpoints

### POST /api/browser-data

The Edge extension posts market/browser payloads. The bridge stores the latest body in memory and recursively extracts sector flow candidates.

### GET /api/industry-requests?limit=N
### GET /api/peer-requests?limit=N
### GET /api/event-requests?limit=N

Claim pending jobs. `limit` is clamped to 1..20. Claimed jobs become `processing`. A processing job can be reclaimed after approximately 45 seconds.

### POST /api/industry-data
### POST /api/peer-data
### POST /api/event-data

Return a queued task result. Required key: `request_id`.

### GET /api/event-wakeup

Compatibility/wakeup endpoint used by the extension.

## Debug endpoint

### GET /api/embedded-debug

Current implementation returns status plus current watchlist and whether any browser-data has been received. It does not return the raw browser-data body.

## HTTP errors

- `400`: invalid JSON or request error
- `401`: token missing/wrong
- `404`: endpoint or request_id not found
- `413`: request body larger than 2 MiB

All JSON responses set no-cache headers.
