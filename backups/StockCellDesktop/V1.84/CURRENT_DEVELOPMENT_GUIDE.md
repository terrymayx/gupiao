# StockCellDesktop V1.84 当前开发文档

## 1. 项目定位

StockCellDesktop 是一个透明桌面 A 股快速盯盘工具。当前版本已经从早期单 HTML 资金细胞原型演进为 Electron 桌面应用，但仍坚持轻量化：

- 透明、无边框桌面窗口；
- 不占任务栏；
- 右下角托盘常驻；
- Canvas 2D 为主，不做重型 3D；
- 大盘、板块、自选股和异常提示放在同一个视觉系统里；
- EdgeBridge 作为本机统一行情缓存与浏览器取数桥；
- 实盘模式不伪造数据。

## 2. 当前版本组件

### Electron 主进程：`main.js`

负责透明桌面窗口、Win+D 恢复、智能鼠标穿透、托盘显示/隐藏/退出、本地 EdgeBridge 启动与复用、行情 IPC、腾讯分时兜底、东方财富板块 TOP10 直连 + Edge 队列兜底，以及 V1.84 EXE 同目录便携数据路径。

### 预加载：`preload.js`

使用 `contextBridge` 暴露白名单 API 给页面，并保持 `contextIsolation: true`、`nodeIntegration: false`。

### 页面/可视化：`stock_cell_desktop.html`

负责 Canvas 细胞渲染、大盘细胞、板块资金细胞、自选股紫色细胞、点击板块展开 TOP10、TOP10 单圈布局、自选股详情与分时、盘中异常提示、板块方向切换轨迹、数据新鲜度警告、物理碰撞、模拟模式和统一行情调度器。

### EdgeBridge：`edge_bridge_server.js`

默认地址：`http://127.0.0.1:17890`。

职责：接收 Edge 扩展 browser-data、合并行情/大盘/板块/分时分组数据、维护统一缓存、解析板块资金流、解析目标股票行情、管理 industry/peer/stock/event/fetch 队列、用 `/api/event-wakeup` 唤醒扩展，并提供 `/api/dashboard-snapshot` 给桌面统一读取。

## 3. 数据主链路

```text
Edge 浏览器
  ↓
StockTray Edge Extension V1.1.8
  ↓ POST /api/browser-data
EdgeBridge 127.0.0.1:17890
  ├─ stock quote cache
  ├─ intraday cache
  ├─ market cache
  ├─ sector snapshot
  └─ task queues
  ↓
Electron main.js IPC
  ↓
stock_cell_desktop.html
  ↓
Canvas 2D
```

自选股：`stock-request → shared watchlist → Edge 回传 → stock-result`。

板块 TOP10：优先东方财富直连；失败或空数据时走 `peer-request → Edge 扩展 → peer-result`。

## 4. 当前调度节奏

统一调度器使用上海交易时间：

| 阶段 | 页面/Bridge 推荐刷新 |
|---|---:|
| 09:15–09:30 集合竞价 | 5 秒 |
| 09:30–11:30、13:00–15:00 交易中 | 5 秒 |
| 11:30–13:00 午休 | 30 秒 |
| 收盘后 / 周末 | 120 秒 |

缓存 miss 只额外触发 Edge 立即抓取，不会降低原本实时刷新频率。展开板块 TOP10 当前约每 5 秒更新。

## 5. V1.84 便携数据模式

V1.84 在 EXE 当前目录创建：

```text
data/
├─ UserData/
├─ SessionData/
├─ Cache/
└─ Logs/
```

首次运行从旧 `%APPDATA%\stock-cell-desktop` 只迁移 `Local Storage`、`Preferences`、`stock-cell-window.json`，不迁移旧 Chromium Cache。

缓存限制：disk cache 约 50 MiB，media cache 约 10 MiB。

## 6. 托盘与桌面行为

- `skipTaskbar: true`；
- 任务栏不显示普通应用按钮；
- 托盘左键：显示/隐藏；
- 托盘右键：显示/隐藏、退出；
- 关闭窗口/Alt+F4：隐藏到托盘；
- 只有托盘“退出”真正退出；
- Win+D 后会恢复桌面组件；
- 主动隐藏到托盘时，Win+D 不强制重显。

## 7. 视觉业务规则

### 板块

- 红色：资金净流入；
- 绿色：资金净流出；
- 绝对资金越大，细胞越大、颜色越强；
- 展开板块显示 10 只股票；
- 10 只股票统一围成一圈；
- 板块资金方向切换时保留短暂视觉轨迹；
- 板块突变有短时脉冲提示。

### 自选股

- 使用 6 位 A 股代码；
- 自动取名称、行业、涨跌幅、行情字段；
- 支持真实分时；
- 支持关注级别 normal/focus/alert；
- 异常包含：急拉、急跌、新高、新低、翻红、翻绿、放量。

### 数据新鲜度

仅交易中/集合竞价重点报警：约 25 秒进入警告；约 75 秒或 Edge 断联进入严重状态；市场细胞右下角用小 `!` 提示。

## 8. 稳定性原则

V1.82 后保留：同请求去重、epoch 防旧响应覆盖、last-good 快照、sector node 复用、长帧间隔物理保护。稳定性优化不能靠降低刷新频率实现。

## 9. 模拟模式

快捷键：`Alt+M`。用于收盘后验证动画、板块轮动、TOP10、自选股异动；不污染真实配置和缓存，退出后恢复真实状态。

## 10. 构建与验证

Node 20+。

```bash
npm install
npm run verify
npm run pack:win
```

当前构建：

```text
version: 1.84.0
artifact: StockCellDesktop_V1_84.${ext}
target: portable
asar: true
```

正式 EXE 只打包：`main.js`、`preload.js`、`edge_bridge_server.js`、`stock_cell_desktop.html`、`assets/tray.ico`。

## 11. 后续开发约束

1. 保持“快速盯盘”定位，不扩成大型交易终端。
2. 不降低实时刷新频率换稳定性。
3. 不在真实模式注入假数据。
4. 不增加重型 3D / 大量粒子 / 高成本模糊。
5. 新功能优先判断能否让用户更快发现市场变化。
6. 修改 EdgeBridge 时同步验证 Edge 扩展协议和 17890 兼容性。
7. 不把大缓存重新写回 C 盘 AppData。
8. 发布前运行 `npm run verify` 与 JS 语法检查。
