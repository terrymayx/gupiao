# StockCellDesktop V1.84 开发备份

备份日期：2026-09-01  
当前桌面版本：**V1.84**  
EdgeBridge 协议：**V6.3.1**  
Edge 扩展：**StockTray V1.1.8**

这是当前已经基本成型的 A 股“资金细胞”桌面盯盘版本的开发备份。此目录只保留继续开发真正需要的内容：当前开发文档、接口说明、接口数据结构、EdgeBridge 接入资料和当前 Edge 扩展包；不放历史版本 README、BAT 启动器和旧扩展包。

## 当前产品定位

这是一个**轻量桌面快速盯盘雷达**，不是完整行情终端。核心目标是让用户在 1～3 秒内发现：

- 大盘状态变化；
- 板块资金流入/流出；
- 板块 TOP10 领涨/领跌个股；
- 自选股实时变化与盘中异动；
- 数据是否延迟或 Edge 是否断联。

真实模式坚持“不造假数据”：数据缺失时显示空值/最后有效值，不用模拟值补齐。模拟模式只用于收盘后的 UI/交互测试，并有明确“模拟”标识。

## 备份内容

```text
backups/StockCellDesktop/V1.84/
├─ README.md
├─ BUILD_INFO.json
├─ API_ENDPOINTS.json
├─ CURRENT_DEVELOPMENT_GUIDE.md
├─ API_COMPLETE_REFERENCE_V1.84.md
├─ DATA_SCHEMAS_V1.84.md
├─ EDGE_API_REFERENCE_V6.3.1.md
├─ EDGE_INTEGRATION_GUIDE.md
├─ V1.84_PORTABLE_DATA.md
├─ EdgeBridge_Current_API_Package_v6_3_1.zip
└─ StockTray_Edge_Extension_V1_1_8.zip
```

## 构建基线

```bash
npm install
npm run verify
npm run pack:win
```

Windows 目标是 Electron portable 单 EXE：

```text
StockCellDesktop_V1_84.exe
```

运行后在 EXE 同目录自动创建：

```text
data/
├─ UserData/
├─ SessionData/
├─ Cache/
└─ Logs/
```

接口默认地址：`http://127.0.0.1:17890`。
