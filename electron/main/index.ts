import { app, BrowserWindow, dialog, ipcMain, nativeImage, screen, shell } from 'electron'
import { randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import os from 'node:os'
import { IPC } from '@shared/ipc'
import { formatExportStamp, formatLabel, sanitizeFileName } from '@shared/export'
import type {
  ConnectionConfig,
  ConnectionStatus,
  ExportRequest,
  PublishPayload,
  QoS,
  StatusPayload,
  SubscriptionChangedPayload
} from '@shared/types'
import { MqttManager } from './mqtt-manager'
import { buildExportContent } from './exporter'
import { loadConnections, saveConnections } from './store'

const isDev = !!process.env.ELECTRON_RENDERER_URL

let mainWindow: BrowserWindow | null = null
let connections: ConnectionConfig[] = []
/**
 * 标记是否允许窗口直接关闭。
 * 拦截 close 事件后弹确认框，用户点「仍然关闭」时置 true，再次 close 时放行，
 * 让真正的窗口销毁走 Electron 默认流程。
 */
let allowWindowClose = false

/**
 * 解析应用 logo 的磁盘路径。
 *
 * - **开发模式**（electron-vite dev / electron .）：app.getAppPath() 指向项目根目录，
 *   logo/ 就在根目录，所以从 `app.getAppPath()/logo/mqtt-icon.ico` 读。
 * - **生产模式**（electron-builder 打包后）：应用代码在 app.asar 内，但 resources 不进 asar。
 *   electron-builder.yml 通过 extraResources 把 logo/ 复制到 `resources/logo/`，运行时用
 *   `process.resourcesPath/logo/mqtt-icon.ico` 拿。
 *
 * 找不到时不抛错，返回 null 让 BrowserWindow 走 Electron 默认图标（避免启动崩溃）。
 */
function resolveAppIconPath(): string | null {
  const candidates = [
    // 生产模式：electron-builder 把 logo/ 复制到 resources/logo/
    join(process.resourcesPath ?? '', 'logo', 'mqtt-icon.ico'),
    // 开发模式：项目根目录
    join(app.getAppPath(), 'logo', 'mqtt-icon.ico')
  ]
  for (const p of candidates) {
    if (p && require('node:fs').existsSync(p)) return p
  }
  console.warn('[main] 找不到应用图标文件，已用默认图标')
  return null
}

/** 预加载并返回 nativeImage，找不到返回 null */
function loadAppIcon(): Electron.NativeImage | null {
  const p = resolveAppIconPath()
  return p ? nativeImage.createFromPath(p) : null
}

/** 状态中文映射，用于关闭确认弹窗里展示的连接列表 */
const STATUS_LABEL: Record<ConnectionStatus, string> = {
  disconnected: '未连接',
  connecting: '正在连接',
  connected: '已连接',
  reconnecting: '正在重连',
  error: '连接错误'
}

/** 默认内置一个公共 Broker，方便首次打开就能体验 */
function createDefaultConnection(): ConnectionConfig {
  const now = Date.now()
  return {
    id: randomUUID(),
    name: '公共测试 Broker',
    host: 'broker.emqx.io',
    port: 1883,
    protocol: 'mqtt',
    path: '/mqtt',
    clientId: `mqtts_${Math.random().toString(16).slice(2, 10)}`,
    username: '',
    password: '',
    keepalive: 60,
    clean: true,
    reconnectPeriod: 5,
    maxReconnectAttempts: 0,
    connectTimeout: 10,
    rejectUnauthorized: true,
    autoSubscribe: true,
    subscriptions: [{ topic: 'mqtts/#', qos: 0, createdAt: now }],
    remark: 'EMQX 提供的公共 MQTT 服务器，请勿发送敏感数据',
    createdAt: now,
    updatedAt: now
  }
}

function createWindow(): BrowserWindow {
  // 是否走「透明窗口」方案。
  // Windows 11（build ≥ 22000）用系统级亚克力材质 backgroundMaterial: 'acrylic'，
  // 由 DWM 绘制、自带真实桌面模糊（Win11 开始菜单同款）；它与 transparent:true 冲突，
  // 所以 Win11 上不开 transparent。Win10 及以下不支持亚克力，回退到透明窗口（旧行为）。
  const winBuild = Number(os.release().split('.')[2] || 0)
  const useAcrylic = process.platform === 'win32' && winBuild >= 22000
  const isTransparent = !useAcrylic
  // 应用图标：开发模式读 logo/mqtt-icon.ico，生产模式读 resources/logo/mqtt-icon.ico。
  // 设置给 BrowserWindow 后，Windows 任务栏图标、窗口左上角图标、Mac Dock 图标都会跟着显示。
  const appIcon = loadAppIcon()
  let window: BrowserWindow
  try {
    window = new BrowserWindow({
      width: 1440,
      height: 900,
      minWidth: 1080,
      minHeight: 680,
      show: false,
      autoHideMenuBar: true,
      // 隐藏原生标题栏，由渲染端 TitleBar 组件承担装饰与窗口控制。
      // 配合 -webkit-app-region: drag 让自定义工具栏的空白区域继续充当拖动手柄。
      frame: false,
      roundedCorners: true,
      title: 'MQTTS',
      ...(appIcon ? { icon: appIcon } : {}),
      /**
       * 背景透明策略 —— 本轮关键修正，解决「blur 看起来没生效」。
       *
       * 之前用 CSS backdrop-filter 想模糊透进来的桌面，但那是做不到的：
       * Chromium 的 backdrop-filter 只能模糊「网页内部」位于元素后面的内容，
       * 而 Electron 透明窗口后面的桌面壁纸由操作系统 (DWM) 合成，不在 renderer 的合成栈里，
       * 因此 blur 对桌面永远不会生效 —— 这就是用户反复反馈「blur 没设置上去」的根本原因。
       *
       * 正确做法是 Windows 11 系统级亚克力（开始菜单同款）：
       *   backgroundMaterial: 'acrylic' → 由 DWM 真正模糊桌面 + 绘制玻璃底色。
       * 注意：backgroundMaterial 与 transparent:true 冲突，二者不能同时开。
       * Win10 及以下不支持该材质，回退透明窗口（transparent:true）。
       */
      ...(useAcrylic ? { backgroundMaterial: 'acrylic' as const } : { transparent: true }),
      backgroundColor: '#00000000',
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        sandbox: false,
        contextIsolation: true,
        nodeIntegration: false
      }
    })
  } catch (err) {
    // BrowserWindow 创建阶段抛错（多发生于沙盒/显示子系统异常），
    // 不能就此让整个 Electron 进程崩掉，回退到无硬件加速窗口至少先把错误页交给用户。
    console.error('[main] BrowserWindow 创建失败，尝试回退：', err)
    window = new BrowserWindow({
      width: 1024,
      height: 700,
      show: false,
      frame: false,
      roundedCorners: true,
      ...(useAcrylic ? { backgroundMaterial: 'acrylic' as const } : { transparent: true }),
      backgroundColor: '#00000000',
      title: 'MQTTS',
      ...(appIcon ? { icon: appIcon } : {}),
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        sandbox: false,
        contextIsolation: true,
        nodeIntegration: false
      }
    })
  }

  window.on('ready-to-show', () => window.show())

  // ready-to-show 在多数情况下 0.5s 内触发，但如果渲染端因为 JS 报错、CSP 拦截、
  // preload 异常等情况迟迟不进入渲染完成态，窗口会一直不显示。
  // 5 秒兜底：超时后强制把窗口拉出来，避免用户看到一个永远空白的窗口。
  const fallbackShowTimer = setTimeout(() => {
    if (!window.isDestroyed() && !window.isVisible()) {
      console.warn('[main] ready-to-show 未触发，5s 后强制显示窗口')
      window.show()
    }
  }, 5000)
  window.on('show', () => clearTimeout(fallbackShowTimer))
  window.on('closed', () => clearTimeout(fallbackShowTimer))

  // 窗口重新获得焦点时把输入焦点交还给页面。
  // 原生模态框（历史版本曾用 window.confirm）或窗口反复切换，
  // 都可能让 Chromium 丢失输入焦点：表现为鼠标可点、键盘敲不进字。
  window.on('focus', () => {
    if (!window.isDestroyed()) window.webContents.focus()
  })

  /**
   * 最大化状态变更时通知渲染端。
   * frame:false 下没有系统按钮，TitleBar 需要自己同步「最大化 / 还原」图标。
   * 这里直接 send 到当前 window 的 webContents，不走 IPC handler，
   * 因为这是「主→渲」单向事件，不是「渲→主」调用。
   *
   * 透明窗口（transparent:true）在 Windows 上有一个 Chromium 限制：
   * maximize 时不会自动贴工作区，而是覆盖整个屏幕（包括任务栏）。
   * 所以这里主动把窗口 setBounds 到屏幕的 workArea（不含任务栏），
   * 既给用户「最大化」的感觉，又不遮挡任务栏。
   */
  window.on('maximize', () => {
    // 仅「透明窗口」在 Windows 上最大化会盖住任务栏，需要手动限制到工作区；
    // 现在 Windows 用系统亚克力（非透明），最大化行为恢复原生，无需再干预。
    if (isTransparent && !window.isDestroyed() && process.platform === 'win32') {
      const display = screen.getDisplayMatching(window.getBounds())
      // workArea 已经减去任务栏区域
      window.setBounds(display.workArea)
    }
    if (!window.isDestroyed()) window.webContents.send(IPC.WINDOW_MAXIMIZE_CHANGED, true)
  })
  window.on('unmaximize', () => {
    if (!window.isDestroyed()) window.webContents.send(IPC.WINDOW_MAXIMIZE_CHANGED, false)
  })

  window.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  /**
   * 拦截窗口关闭事件：如果当前还有连接处于活跃状态（connecting / connected /
   * reconnecting），弹确认框让用户选择。
   *
   * 注意是 `window.close` 而不是 BrowserWindow 的 `close` —— 只能监听一次，
   * 在 createWindow 范围内声明，确保每次 createWindow 都有独立的拦截器实例，
   * 避免重复注册导致弹多次确认框。
   */
  const onWindowClose = (event: Electron.Event) => {
    if (allowWindowClose) return
    const active = manager.getActiveConnections()
    if (active.length === 0) return
    event.preventDefault()

    const list = active
      .map((c) => `• ${c.name}（${STATUS_LABEL[c.status] ?? c.status}）`)
      .join('\n')
    dialog
      .showMessageBox(window, {
        type: 'warning',
        title: '关闭 MQTTS',
        message: `当前有 ${active.length} 个连接处于活跃状态`,
        detail: `${list}\n\n关闭软件将立即断开这些连接，是否继续？`,
        buttons: ['仍然关闭', '取消'],
        cancelId: 1,
        defaultId: 1,
        noLink: true
      })
      .then(async ({ response }) => {
        if (response !== 0) return
        // 用户确认关闭：先把所有 mqtt 客户端安全断开（发出 DISCONNECT 包），
        // 再走真正的 window.close，让 Electron 默认流程销毁窗口。
        allowWindowClose = true
        try {
          await manager.dispose()
        } catch (err) {
          console.error('[main] 关闭前断开连接失败：', err)
        }
        if (!window.isDestroyed()) window.close()
      })
      .catch((err) => {
        console.error('[main] 关闭确认弹窗失败：', err)
        // 弹框失败兜底：放行关闭，避免用户卡死
        allowWindowClose = true
        if (!window.isDestroyed()) window.close()
      })
  }
  window.on('close', onWindowClose)

  // 调试快捷键：F12 / Ctrl+Shift+I 打开 DevTools，用户在遇到白屏时可以马上看到错误堆栈。
  // 不论 dev 还是 preview 都启用，避免「生产模式出问题没法看 console」的尴尬。
  window.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F12' || (input.control && input.shift && input.key.toLowerCase() === 'i')) {
      if (!window.isDestroyed()) window.webContents.toggleDevTools()
    }
  })

  if (isDev && process.env.ELECTRON_RENDERER_URL) {
    window.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    window.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return window
}

const manager = new MqttManager({
  onStatus: (payload: StatusPayload) => {
    mainWindow?.webContents.send(IPC.STATUS_CHANGED, payload)
  },
  onMessage: (message) => {
    mainWindow?.webContents.send(IPC.MESSAGE, message)
  },
  onSubscriptionChanged: (id, topic, qos, action) => {
    const payload: SubscriptionChangedPayload = { id, topic, qos, action }
    mainWindow?.webContents.send(IPC.SUBSCRIPTION_CHANGED, payload)
  }
})

function persist() {
  saveConnections(connections)
}

function handleIpc() {
  ipcMain.handle(IPC.LIST_CONNECTIONS, () => connections)

  ipcMain.handle(IPC.SAVE_CONNECTION, (_e, config: ConnectionConfig) => {
    const next: ConnectionConfig = { ...config, updatedAt: Date.now() }
    const index = connections.findIndex((item) => item.id === next.id)
    if (index >= 0) {
      connections[index] = { ...connections[index], ...next }
    } else {
      connections = [...connections, { ...next, createdAt: next.createdAt || Date.now() }]
    }
    persist()
    return connections
  })

  ipcMain.handle(IPC.REMOVE_CONNECTION, async (_e, id: string) => {
    if (manager.isConnected(id)) await manager.disconnect(id)
    connections = connections.filter((item) => item.id !== id)
    persist()
    return connections
  })

  ipcMain.handle(IPC.DUPLICATE_CONNECTION, (_e, id: string) => {
    const source = connections.find((item) => item.id === id)
    if (!source) return connections
    const now = Date.now()
    const copy: ConnectionConfig = {
      ...source,
      id: randomUUID(),
      name: `${source.name} 副本`,
      clientId: `${source.clientId}_copy_${Math.random().toString(16).slice(2, 6)}`,
      createdAt: now,
      updatedAt: now
    }
    const index = connections.findIndex((item) => item.id === id)
    connections.splice(index + 1, 0, copy)
    persist()
    return connections
  })

  ipcMain.handle(IPC.CONNECT, async (_e, id: string) => {
    const config = connections.find((item) => item.id === id)
    if (!config) return { ok: false, error: '连接配置不存在' }
    try {
      await manager.connect(config)
      // 自动订阅已保存的主题
      if (config.autoSubscribe && config.subscriptions.length) {
        for (const sub of config.subscriptions) {
          try {
            await manager.subscribe(id, sub.topic, sub.qos)
          } catch (err) {
            console.error('[main] 自动订阅失败:', sub.topic, err)
          }
        }
      }
      return { ok: true }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle(IPC.DISCONNECT, async (_e, id: string) => {
    try {
      await manager.disconnect(id)
      return { ok: true }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle(IPC.SUBSCRIBE, async (_e, id: string, topic: string, qos: QoS) => {
    try {
      await manager.subscribe(id, topic, qos)
      // 订阅成功后写入配置，下次连接可自动恢复
      const config = connections.find((item) => item.id === id)
      if (config && !config.subscriptions.some((s) => s.topic === topic)) {
        config.subscriptions = [
          ...config.subscriptions,
          { topic, qos, createdAt: Date.now() }
        ]
        config.updatedAt = Date.now()
        persist()
      }
      return { ok: true, data: { topic, qos } }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle(IPC.UNSUBSCRIBE, async (_e, id: string, topic: string) => {
    try {
      await manager.unsubscribe(id, topic)
      const config = connections.find((item) => item.id === id)
      if (config) {
        config.subscriptions = config.subscriptions.filter((s) => s.topic !== topic)
        config.updatedAt = Date.now()
        persist()
      }
      return { ok: true }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle(IPC.PUBLISH, async (_e, payload: PublishPayload) => {
    try {
      await manager.publish(
        payload.connectionId,
        payload.topic,
        payload.payload,
        payload.qos,
        payload.retain
      )
      return { ok: true }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle(IPC.EXPORT_MESSAGES, async (_e, req: ExportRequest) => {
    try {
      if (!req) return { ok: false, error: '请求为空' }
      const { content, count } = await buildExportContent(req)
      const win = BrowserWindow.getFocusedWindow() ?? mainWindow
      const stamp = formatExportStamp(Date.now())
      const safeName = sanitizeFileName(req.connectionName || 'messages')
      const defaultPath = join(
        app.getPath('downloads'),
        `${safeName}-消息记录-${stamp}.${req.format}`
      )

      const result = await dialog.showSaveDialog(win!, {
        title: '导出消息记录',
        defaultPath,
        filters: [
          { name: formatLabel(req.format), extensions: [req.format] },
          { name: '所有文件', extensions: ['*'] }
        ],
        properties: ['showOverwriteConfirmation', 'createDirectory']
      })

      if (result.canceled || !result.filePath) {
        return { ok: false, canceled: true }
      }

      // 用户在保存框里改了扩展名，统一纠正为请求中的格式
      let filePath = result.filePath
      const expected = '.' + req.format
      if (!filePath.toLowerCase().endsWith(expected)) {
        filePath = filePath.replace(/\.[^./\\]+$/, '') + expected
      }

      await fs.writeFile(filePath, content)
      return { ok: true, path: filePath, count }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle(IPC.REVEAL_IN_FOLDER, async (_e, targetPath: string) => {
    if (typeof targetPath !== 'string' || !targetPath) return
    shell.showItemInFolder(targetPath)
  })

  // ─────────── 自定义标题栏：窗口控制 ───────────
  // frame: false 下原生的最小化/最大化/关闭按钮不存在了，
  // 渲染端的 TitleBar 通过这些 IPC 调起主进程对应的 BrowserWindow 方法。
  ipcMain.handle(IPC.WINDOW_MINIMIZE, () => {
    mainWindow?.minimize()
  })
  ipcMain.handle(IPC.WINDOW_MAXIMIZE, () => {
    if (!mainWindow) return
    if (mainWindow.isMaximized()) mainWindow.unmaximize()
    else mainWindow.maximize()
  })
  ipcMain.handle(IPC.WINDOW_CLOSE, () => {
    mainWindow?.close()
  })

  // 主进程主动把 maximize / unmaximize 事件推给渲染端，
  // 让 TitleBar 的「最大化 / 还原」图标能跟着切。
  // 注意：必须在 createWindow 里注册，因为每创建一个 window 都要重新监听，
  // 而且要拿到具体窗口实例才能 webContents.send 给当前窗口（不是其它窗口）。
  // 实际触发逻辑见 createWindow 内 on('maximize')/on('unmaximize')。
}

const gotSingleInstanceLock = app.requestSingleInstanceLock()

if (!gotSingleInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

  app.whenReady().then(() => {
    connections = loadConnections()
    if (connections.length === 0) {
      connections = [createDefaultConnection()]
      saveConnections(connections)
    }

    // 同步设置 app 级别图标，主要影响 macOS Dock；Windows 上 BrowserWindow 的 icon 已足够。
    // 注意：app.setIcon() 仅 macOS 上有效，类型声明上 setIcon 不在 App 接口里，这里用类型断言绕开。
    const appIcon = loadAppIcon()
    if (appIcon && process.platform === 'darwin') {
      ;(app as unknown as { setIcon: (icon: Electron.NativeImage) => void }).setIcon(appIcon)
    }

    handleIpc()
    mainWindow = createWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) mainWindow = createWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })

  app.on('before-quit', async (event) => {
    if (mainWindow) {
      event.preventDefault()
      const win = mainWindow
      mainWindow = null
      await manager.dispose()
      win.destroy()
      app.quit()
    }
  })
}
