# StockCellDesktop V1.0

A股资金细胞可视化透明桌面版。

## 功能

- Electron 透明无边框桌面窗口
- 可拖动、缩放、置顶、透明度调整、鼠标穿透
- Alt+S 打开设置
- Alt+G 切换鼠标穿透
- Alt+H 隐藏/显示 UI
- 红色 = 主力资金净流入
- 绿色 = 主力资金净流出
- 细胞大小随资金规模变化
- 行业/概念板块真实数据
- 点击板块读取跌幅前十股票
- 板块资金约 1 秒刷新
- 展开股票约 5 秒刷新

## 数据接口

程序沿用现有股票资金项目的 EdgeBridge 兼容接口，默认监听：

`http://127.0.0.1:17890`

兼容 `/api/health`、`/api/watchlist`、`/api/status`、`/api/browser-data`、industry / peer / event request/result/data 接口。

同时使用 Electron Chromium `net.fetch()` 直连东方财富行情作为实时数据通道。

## 本地运行

1. 安装 Node.js 22 LTS。
2. 下载本目录全部文件。
3. 双击 `启动透明桌面版.bat`。
4. 第一次运行会执行 `npm install`，随后启动 Electron。

## 打包 Windows EXE

双击：

`一键本地打包EXE.bat`

成功后在 `dist` 目录得到 portable EXE。
