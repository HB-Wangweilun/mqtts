# MQTTS

> 现代化的跨平台 MQTT 桌面客户端，基于 Electron + React 19 + TypeScript 构建。

MQTTS（**MQTT S**uite）是一款面向开发者的 MQTT 客户端工具。它在保留桌面应用原生体验的同时，提供了完整的连接管理、主题订阅、消息收发、数据导出等能力，并针对 Windows 11 适配了系统级亚克力磨砂玻璃视觉，与 Windows 11 开始菜单的视觉语言保持一致。

## 主要特性

- **多协议支持** — `mqtt://` / `mqtts://` / `ws://` / `wss://` 全覆盖，SSL/TLS 可关闭证书校验
- **多连接管理** — 同时维护多个 Broker 连接，独立运行，独立重连，互不干扰
- **完整的 MQTT 5 / 3.1.1 特性** — QoS 0 / 1 / 2、Retain、Clean Session、Keep Alive、ClientId
- **智能重连** — 自动重连开关 + 重连次数上限 + 实时显示当前重试次数与首次失败原因
- **主题订阅** — 支持通配符（`+`、`#`）、QoS 单独配置、自动订阅已保存主题
- **消息收发** — 支持任意 Payload（文本 / JSON 自动格式化高亮），Retain 标志位可选
- **多格式导出** — `.xlsx` / `.json` / `.txt` 三种格式，按主题分组、按方向拆分、时间区间筛选
- **原生视觉** — 自定义标题栏、窗口圆角、Windows 11 系统级亚克力背景
- **本地化数据** — 所有连接配置保存到本机，不上传任何服务端，隐私零风险

## 视觉

| 场景 | 描述 |
| ---- | ---- |
| 窗口背景 | Windows 11 下使用系统级 `backgroundMaterial: 'acrylic'`，由 DWM 绘制桌面模糊 |
| 标题栏 | 自定义无边框标题栏，logo 与品牌名居左，最大化 / 最小化 / 关闭按钮居右 |
| 玻璃面板 | 三层玻璃质感（外层 shell / 内容 panel / 内嵌 card），白色覆盖从浅到深渐变 |
| 字体 | 阿里巴巴普惠体（AlibabaSans），跨平台一致的中文显示体验 |

## 系统要求

| 项目 | 要求 |
| ---- | ---- |
| 操作系统 | Windows 10/11（推荐 Win11 以获得完整亚克力效果）、macOS 10.15+、Linux（Ubuntu 20.04+） |
| Node.js | >= 22.0.0（开发环境） |
| 内存 | >= 4 GB |
| 磁盘 | >= 500 MB（含安装包） |

## 快速开始

### 安装已发布的安装包

前往 [Releases](../../releases) 页面下载对应平台的安装包：

- **Windows**：`MQTTS-1.0.0-x64-Setup.exe`（NSIS 安装包，带安装向导、可选安装路径、桌面快捷方式）
- **Windows 便携版**：`MQTTS-1.0.0-x64-Portable.exe`（单文件双击即用）
- **macOS**：`MQTTS-1.0.0-x64.dmg` 或 `MQTTS-1.0.0-x64.zip`
- **Linux**：`MQTTS-1.0.0-x64.AppImage` 或 `.deb`

### 从源码运行

```bash
# 1. 克隆仓库
git clone <repository-url> mqtts
cd mqtts

# 2. 安装依赖
npm install

# 3. 启动开发服务器（含 HMR）
npm run dev

# 4. 类型检查
npm run typecheck
```

## 技术栈

### 运行时

| 库 | 版本 | 用途 |
| --- | --- | --- |
| [Electron](https://www.electronjs.org/) | 44.2.0 | 跨平台桌面运行时 |
| [React](https://react.dev/) | 19.2.8 | UI 框架 |
| [TypeScript](https://www.typescriptlang.org/) | 5.9.3 | 类型安全 |
| [Zustand](https://zustand-demo.pmnd.rs/) | 5.0.15 | 轻量级状态管理 |
| [Radix UI](https://www.radix-ui.com/) | 1.x | 无样式可访问组件原语 |
| [Tailwind CSS](https://tailwindcss.com/) | 3.4.17 | 原子化样式 |
| [mqtt.js](https://github.com/mqttjs/MQTT.js) | 5.15.2 | MQTT 客户端 |
| [exceljs](https://github.com/exceljs/exceljs) | 4.4.0 | `.xlsx` 导出 |
| [lucide-react](https://lucide.dev/) | 1.41.0 | 图标库 |
| [Motion](https://motion.dev/) | 13.2.0 | 动效 |
| [Sonner](https://sonner.emilkowal.ski/) | 2.0.8 | 通知 Toast |

### 开发与构建

| 工具 | 版本 | 用途 |
| --- | --- | --- |
| [electron-vite](https://electron-vite.org/) | 5.0.0 | 集成 Vite 的 Electron 构建工具 |
| [Vite](https://vitejs.dev/) | 7.3.6 | 渲染端构建 |
| [electron-builder](https://www.electron.build/) | 26.15.3 | 安装包打包 |

## 项目结构

```text
mqtts/
├── electron/                      # Electron 主进程
│   ├── main/
│   │   ├── index.ts               # 应用入口、窗口管理、IPC 处理
│   │   ├── mqtt-manager.ts        # MQTT 连接管理器（基于 mqtt.js）
│   │   ├── exporter.ts            # 消息导出（xlsx/json/txt）
│   │   └── store.ts               # 连接配置本地持久化
│   └── preload/
│       └── index.ts               # contextBridge 安全桥接，暴露 window.api
├── src/
│   └── renderer/
│       └── src/
│           ├── components/
│           │   ├── connections/   # 连接侧栏、连接表单对话框
│           │   ├── workbench/     # 连接信息条、订阅、消息列表、详情、发布、导出
│           │   ├── layout/        # 自定义标题栏
│           │   └── ui/            # Radix UI 二次封装的通用组件
│           ├── store/             # Zustand 状态（连接、消息、UI）
│           ├── assets/            # 字体、Logo、内嵌图标
│           ├── App.tsx            # 应用根组件
│           ├── main.tsx           # React 入口
│           └── index.css          # 全局样式（玻璃面板、tailwind）
├── shared/                        # 主进程与渲染进程共享代码
│   ├── types.ts                   # 公共 TypeScript 类型
│   ├── ipc.ts                     # IPC 频道常量
│   └── export.ts                  # 导出文件名 / 时间戳等共享工具
├── logo/                          # 应用图标资源（PNG / ICO / SVG）
├── electron.vite.config.ts        # electron-vite 构建配置
├── electron-builder.yml           # electron-builder 打包配置
├── tailwind.config.cjs            # Tailwind 主题与字体配置
└── package.json                   # 项目元数据与脚本
```

## 主要功能

### 连接管理

每个连接支持以下配置：

| 配置项 | 说明 |
| ------ | ---- |
| 名称 / 备注 | 便于在多连接中识别 |
| 协议 | `mqtt://` / `mqtts://` / `ws://` / `wss://` 四选一 |
| 主机 / 端口 | Broker 地址 |
| 客户端 ID | 留空则自动生成 `mqtts_<uuid>` |
| 用户名 / 密码 | 可选 |
| Keep Alive | 心跳间隔（秒） |
| Clean Session | 是否启用 Clean Session |
| 连接超时 | 握手超时时间（秒） |
| 自动重连 | 失败后是否自动重连、重连间隔、重连次数上限（0 表示不设上限） |
| 证书校验 | mqtts / wss 下是否校验服务端证书 |
| 主题订阅 | 保存的主题列表，连接成功后自动订阅 |

### 主题订阅

- 单条订阅支持自定义 QoS（0 / 1 / 2）
- 支持 MQTT 通配符订阅（`+` 单层、`#` 多层）
- 已保存的订阅会在连接成功后自动恢复
- 取消订阅实时生效

### 消息收发

- **接收**：自动捕获所有订阅主题的消息，按时间倒序展示
- **发送**：支持任意文本 Payload，可选 QoS 与 Retain 标志
- **详情面板**：点击任意消息查看完整 Payload；JSON 自动格式化与高亮
- **方向标识**：清晰的「发送 ↑」与「接收 ↓」图标 + 颜色区分

### 数据导出

支持把当前连接的全部消息导出为：

| 格式 | 用途 |
| ---- | ---- |
| `.xlsx` | 每个主题一个工作表，便于在 Excel 中分析 |
| `.json` | 保留完整结构（QoS、Retain、方向、时间戳） |
| `.txt` | 纯文本可读，便于日志留存 |

高级选项：
- 按主题分组
- 按方向拆分（接收 / 发送分别落区）
- 时间区间筛选
- 主题白名单筛选

## 开发指南

### 常用脚本

```bash
npm run dev               # 启动开发服务器（含 Electron 热重载）
npm run start             # 以生产模式预览已构建产物
npm run build             # 仅构建（不打安装包）
npm run build:win         # 构建并打包 Windows 安装包（NSIS + Portable）
npm run build:mac         # 构建并打包 macOS DMG
npm run build:linux       # 构建并打包 Linux AppImage / deb
npm run typecheck         # 运行全部 TypeScript 类型检查
```

### 主进程 / 渲染进程通信

应用通过 `preload/index.ts` 暴露的 `window.api` 与主进程通信：

```typescript
// 渲染进程
const connections = await window.api.listConnections()
await window.api.connect(connections[0].id)
await window.api.subscribe(id, 'home/sensor/+', 1)
await window.api.publish({ connectionId: id, topic: 'home/cmd', payload: 'on', qos: 1, retain: false })

// 监听主进程事件
const off = window.api.onMessage((msg) => {
  console.log('received:', msg.topic, msg.payload)
})
```

所有 IPC 频道常量集中在 [`shared/ipc.ts`](./shared/ipc.ts)。

### 平台特性

| 平台 | 特性 |
| ---- | ---- |
| Windows 11（build ≥ 22000） | 系统级亚克力材质 `backgroundMaterial: 'acrylic'` + 系统圆角 |
| Windows 10 | 回退到 `transparent: true` + CSS 毛玻璃 |
| macOS | `transparent: true` + 自定义标题栏；可扩展为 `vibrancy` |
| Linux | `transparent: true`（依赖桌面环境支持） |

## 打包与发布

`npm run build:win` 会同时产出两个互不覆盖的产物：

| 文件 | 说明 |
| ---- | ---- |
| `dist/MQTTS-1.0.0-x64-Setup.exe` | NSIS 安装包（推荐分发） |
| `dist/MQTTS-1.0.0-x64-Portable.exe` | 便携版（双击即用） |

图标资源位于 [`logo/`](./logo)，包含 16 ~ 1024 px 全套 PNG + `.ico` + `.svg`。

## 路线图

- [ ] MQTT 5 完整支持（Properties、Reason Code、User Properties）
- [ ] 主题树视图（按 `/` 层级折叠当前所有订阅与消息）
- [ ] 消息过滤与搜索（按主题、Payload 内容、时间）
- [ ] 脚本化消息流（WebHook / 定时发布）
- [ ] 多语言（英文 / 简中 / 繁中）
- [ ] 插件系统

## 许可证

本项目基于 [MIT License](./LICENSE) 开源。

## 致谢

- [mqtt.js](https://github.com/mqttjs/MQTT.js) — MQTT 协议客户端实现
- [Radix UI](https://www.radix-ui.com/) — 无样式可访问组件
- [Tailwind CSS](https://tailwindcss.com/) — 原子化样式框架
- [electron-vite](https://electron-vite.org/) — 优秀的 Electron + Vite 集成
- [阿里巴巴普惠体](https://fonts.alibabagroup.com/) — 全套开源中文字体