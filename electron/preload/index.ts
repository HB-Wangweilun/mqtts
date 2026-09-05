import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '@shared/ipc'
import type {
  ConnectionConfig,
  ExportRequest,
  ExportResult,
  MqttMessage,
  MqttsApi,
  PublishPayload,
  QoS,
  StatusPayload,
  SubscriptionChangedPayload
} from '@shared/types'

const api: MqttsApi = {
  listConnections: (): Promise<ConnectionConfig[]> => ipcRenderer.invoke(IPC.LIST_CONNECTIONS),
  saveConnection: (config: ConnectionConfig): Promise<ConnectionConfig[]> =>
    ipcRenderer.invoke(IPC.SAVE_CONNECTION, config),
  removeConnection: (id: string): Promise<ConnectionConfig[]> =>
    ipcRenderer.invoke(IPC.REMOVE_CONNECTION, id),
  duplicateConnection: (id: string): Promise<ConnectionConfig[]> =>
    ipcRenderer.invoke(IPC.DUPLICATE_CONNECTION, id),

  connect: (id: string) => ipcRenderer.invoke(IPC.CONNECT, id),
  disconnect: (id: string) => ipcRenderer.invoke(IPC.DISCONNECT, id),

  subscribe: (id: string, topic: string, qos: QoS) =>
    ipcRenderer.invoke(IPC.SUBSCRIBE, id, topic, qos),
  unsubscribe: (id: string, topic: string) => ipcRenderer.invoke(IPC.UNSUBSCRIBE, id, topic),

  publish: (payload: PublishPayload) => ipcRenderer.invoke(IPC.PUBLISH, payload),

  exportMessages: (req: ExportRequest) =>
    ipcRenderer.invoke(IPC.EXPORT_MESSAGES, req) as Promise<ExportResult>,
  revealInFolder: (path: string) => ipcRenderer.invoke(IPC.REVEAL_IN_FOLDER, path),

  // 自定义标题栏：窗口控制
  minimizeWindow: () => ipcRenderer.invoke(IPC.WINDOW_MINIMIZE),
  toggleMaximizeWindow: () => ipcRenderer.invoke(IPC.WINDOW_MAXIMIZE),
  closeWindow: () => ipcRenderer.invoke(IPC.WINDOW_CLOSE),

  onStatusChanged: (cb: (p: StatusPayload) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: StatusPayload) => cb(payload)
    ipcRenderer.on(IPC.STATUS_CHANGED, listener)
    return () => ipcRenderer.removeListener(IPC.STATUS_CHANGED, listener)
  },
  onMessage: (cb: (m: MqttMessage) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, message: MqttMessage) => cb(message)
    ipcRenderer.on(IPC.MESSAGE, listener)
    return () => ipcRenderer.removeListener(IPC.MESSAGE, listener)
  },
  onSubscriptionChanged: (cb: (p: SubscriptionChangedPayload) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: SubscriptionChangedPayload) =>
      cb(payload)
    ipcRenderer.on(IPC.SUBSCRIPTION_CHANGED, listener)
    return () => ipcRenderer.removeListener(IPC.SUBSCRIPTION_CHANGED, listener)
  },
  onError: (cb: (p: StatusPayload) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: StatusPayload) => cb(payload)
    ipcRenderer.on(IPC.ERROR, listener)
    return () => ipcRenderer.removeListener(IPC.ERROR, listener)
  },
  onMaximizeChanged: (cb: (maximized: boolean) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, maximized: boolean) => cb(maximized)
    ipcRenderer.on(IPC.WINDOW_MAXIMIZE_CHANGED, listener)
    return () => ipcRenderer.removeListener(IPC.WINDOW_MAXIMIZE_CHANGED, listener)
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error('[preload] 挂载 API 失败:', error)
  }
} else {
  // @ts-ignore 兜底：未开启上下文隔离时直接挂载
  window.api = api
}
