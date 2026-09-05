/**
 * 主进程 / 渲染进程共享的类型定义
 */

export type MqttProtocol = 'mqtt' | 'mqtts' | 'ws' | 'wss'
export type QoS = 0 | 1 | 2

/** 一条 MQTT 订阅 */
export interface Subscription {
  topic: string
  qos: QoS
  /** 创建时间，用于列表排序 */
  createdAt: number
}

/** 连接配置（可持久化） */
export interface ConnectionConfig {
  id: string
  name: string
  host: string
  port: number
  protocol: MqttProtocol
  /** ws / wss 协议下的路径 */
  path: string
  clientId: string
  username: string
  password: string
  keepalive: number
  clean: boolean
  /** 自动重连间隔，0 表示不重连 */
  reconnectPeriod: number
  /** 自动重连次数上限，0 表示不设上限，一直重连直到成功或手动停止 */
  maxReconnectAttempts: number
  connectTimeout: number
  /** 是否开启 SSL/TLS 校验（mqtts / wss 时生效） */
  rejectUnauthorized: boolean
  /** 是否自动订阅已保存的主题 */
  autoSubscribe: boolean
  subscriptions: Subscription[]
  /** 连接备注 */
  remark: string
  createdAt: number
  updatedAt: number
}

export type ConnectionStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'error'

/** 主进程推送给渲染进程的状态变更 */
export interface StatusPayload {
  id: string
  status: ConnectionStatus
  /** 当前状态的简要描述，例如「正在尝试重连…」 */
  message?: string
  /**
   * 当前已发起的重连尝试次数（含首次失败后的第一次重连）。
   * 仅 reconnecting 状态有意义；连接成功后会清零。
   */
  attempt?: number
  /**
   * 首次连接失败时的错误描述，进入 reconnecting 后会持续携带，
   * 便于用户诊断 broker 为什么连不上。状态变成 connected 时清空。
   */
  lastError?: string
}

export type MessageDirection = 'in' | 'out'

/** 一条收发消息记录 */
export interface MqttMessage {
  id: string
  connectionId: string
  topic: string
  payload: string
  qos: QoS
  retain: boolean
  direction: MessageDirection
  timestamp: number
}

/** 发布消息参数 */
export interface PublishPayload {
  connectionId: string
  topic: string
  payload: string
  qos: QoS
  retain: boolean
}

/** 订阅变更通知 */
export interface SubscriptionChangedPayload {
  id: string
  topic: string
  qos: QoS
  action: 'subscribe' | 'unsubscribe'
}

/** 导出文件格式 */
export type ExportFormat = 'xlsx' | 'json' | 'txt'

/** 导出方向范围：全部 / 仅接收 / 仅发送 */
export type ExportDirection = 'all' | 'in' | 'out'

/** 导出请求：由渲染进程把「当前连接的全量消息 + 用户选项」交给主进程 */
export interface ExportRequest {
  connectionId: string
  connectionName: string
  format: ExportFormat
  /** 方向范围 */
  direction: ExportDirection
  /** 选中的主题；空数组表示全部主题 */
  topics: string[]
  /** 起始时间戳（含），0 表示不限 */
  from: number
  /** 结束时间戳（含），0 表示不限 */
  to: number
  /** 按主题分组：xlsx 每个主题一个工作表；json 按主题分组；txt 按主题分段 */
  groupByTopic: boolean
  /** 按方向拆分：仅在 direction === 'all' 时生效，把接收与发送拆成独立分块 */
  splitDirection: boolean
  /** 当前连接的全量消息，筛选在主进程用共享逻辑完成 */
  messages: MqttMessage[]
}

/** 导出结果 */
export interface ExportResult {
  ok: boolean
  /** 用户取消了保存对话框 */
  canceled?: boolean
  /** 最终写入的文件路径 */
  path?: string
  /** 实际导出的消息条数 */
  count?: number
  error?: string
}

/** IPC 调用统一返回结构 */
export interface IpcResult<T = undefined> {
  ok: boolean
  data?: T
  error?: string
}

/** 渲染进程暴露的 window.api */
export interface MqttsApi {
  /** 读取全部连接配置 */
  listConnections: () => Promise<ConnectionConfig[]>
  /** 新增或更新连接配置 */
  saveConnection: (config: ConnectionConfig) => Promise<ConnectionConfig[]>
  /** 删除连接配置 */
  removeConnection: (id: string) => Promise<ConnectionConfig[]>
  /** 复制一个连接配置 */
  duplicateConnection: (id: string) => Promise<ConnectionConfig[]>

  connect: (id: string) => Promise<IpcResult>
  disconnect: (id: string) => Promise<IpcResult>

  subscribe: (
    id: string,
    topic: string,
    qos: QoS
  ) => Promise<IpcResult<{ topic: string; qos: QoS }>>
  unsubscribe: (id: string, topic: string) => Promise<IpcResult>

  publish: (payload: PublishPayload) => Promise<IpcResult>

  /** 弹出系统保存对话框，把消息导出为指定格式的文件 */
  exportMessages: (req: ExportRequest) => Promise<ExportResult>
  /** 在文件管理器中定位到指定文件 */
  revealInFolder: (path: string) => Promise<void>

  /**
   * 窗口控制（自定义标题栏专用）。
   * 主进程 BrowserWindow 配的是 frame: false，原生工具栏被隐藏了，
   * 这些接口让渲染端的 TitleBar 组件能调起最小化 / 最大化切换 / 关闭。
   */
  minimizeWindow: () => Promise<void>
  /** 切换最大化状态：已最大化则还原，未最大化则最大化 */
  toggleMaximizeWindow: () => Promise<void>
  closeWindow: () => Promise<void>

  /** 主进程事件监听，返回取消监听函数 */
  onStatusChanged: (cb: (p: StatusPayload) => void) => () => void
  onMessage: (cb: (m: MqttMessage) => void) => () => void
  onSubscriptionChanged: (cb: (p: SubscriptionChangedPayload) => void) => () => void
  onError: (cb: (p: StatusPayload) => void) => () => void
  /**
   * 监听主进程窗口最大化状态变化。
   * 渲染端用这个回调同步 TitleBar 上「最大化 / 还原」按钮的图标。
   */
  onMaximizeChanged: (cb: (maximized: boolean) => void) => () => void
}

declare global {
  interface Window {
    api: MqttsApi
  }
}
