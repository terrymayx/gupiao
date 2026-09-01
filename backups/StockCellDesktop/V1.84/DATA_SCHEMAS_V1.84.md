# StockCellDesktop V1.84 数据字段说明

## 股票快照 stock

标准结构：

```json
{
  "code": "600000",
  "symbol": "sh600000",
  "name": "浦发银行",
  "industry": "银行",
  "price": 10.20,
  "pct": 1.35,
  "change": 0.14,
  "high": 10.30,
  "low": 10.00,
  "open": 10.05,
  "preClose": 10.06,
  "amount": 123456789,
  "mainNetInflow": 12345678,
  "turnover": 1.23,
  "amplitude": 2.50,
  "sourcePath": "browserData..."
}
```

东方财富字段映射：

| 标准字段 | 东财字段 |
|---|---|
| code | f57 |
| name | f58 |
| industry | f127 |
| price | f43 |
| high | f44 |
| low | f45 |
| open | f46 |
| preClose | f60 |
| amount | f48 |
| mainNetInflow | f137 |
| turnover | f168 |
| change | f169 |
| pct | f170 |
| amplitude | f171 |

Bridge 也兼容常见 JSON 字段名和腾讯 `~` 行情字符串。

## 板块 sector

```json
{
  "name": "半导体",
  "code": "BKxxxx",
  "flow": 35.6200,
  "pct": 2.15,
  "source_field": "f62",
  "source_path": "browserData.sector..."
}
```

规则：`flow` 单位亿元；正数=资金净流入；负数=资金净流出。常见资金字段 `f62`，常见涨跌幅字段 `f3`。Bridge 会递归解析 sector/industry/board/plate/BK 路径，并对同名/同代码候选去重。

## 分时 intraday

标准行：

```json
{
  "time": "09:30",
  "price": 10.21,
  "volume": 12345,
  "amount": 126000.50
}
```

缓存：

```json
{
  "code": "600000",
  "source": "edge_tencent_intraday",
  "trade_date": "20260901",
  "rows": []
}
```

腾讯分时优先按精确嵌套结构解析，失败再走兼容扫描解析。

## browser-data 顶层约定

Edge 扩展每次 POST 可能只回一组数据，因此 Bridge 使用 merge：

```json
{
  "extension": {},
  "quotes": [],
  "intraday": [],
  "sector": {},
  "market": {}
}
```

不要让某次只包含 sector 的 POST 覆盖之前的 quotes/market/intraday。

## dashboard-snapshot

核心结构：

```json
{
  "stocks": {},
  "intraday": {},
  "market": {},
  "sectors": [],
  "sector_updated_at":"...",
  "market_updated_at":"...",
  "browser_data_at":"...",
  "edge_extension_connected":true
}
```

## 任务队列状态

内部：`queued → processing → success / failed`。

对外 `publicTask()` 把 queued / processing 映射成 `pending`。

结果接口统一含：`ok/request_id/status/internal_status/source/error/debug/updated_at`，再加对应结果键 `rows/stocks/stock/data`。

## 数据时间字段

重点字段：`updated_at`、`browser_data_at`、`market_updated_at`、`sector_updated_at`、`age_seconds`、`last_extension_at`。

前端新鲜度逻辑优先使用这些时间判断延迟，而不是因一次请求失败就清空当前画面。
