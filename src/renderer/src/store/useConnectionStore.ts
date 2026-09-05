import { create } from 'zustand'
import type { ConnectionConfig, ConnectionStatus, QoS } from '@shared/types'
import { toast } from 'sonner'
import { randomClientId, randomId } from '@/lib/utils'

const MAX_MESSAGES_PER_CONNECTION = 5000

/** 新建连接的默认值。名称留空，由 placeholder 提示，避免用户误以为是预填文本 */
export function createEmptyConnection(): ConnectionConfig {
  const now = Date.now()
  return {
    id: randomId(),
    name: '',
    host: 'broker.emqx.io',
    port: 1883,
    protocol: 'mqtt',
    path: '/mqtt',
    clientId: randomClientId(),
    username: '',
    password: '',
    keepalive: 60,
    clean: true,
    reconnectPeriod: 5,
    maxReconnectAttempts: 0,
    connectTimeout: 10,
    rejectUnauthorized: true,
    autoSubscribe: true,
    subscriptions: [],
    remark: '',
    createdAt: now,
    updatedAt: now
  }
}

interface ConnectionState {
  connections: ConnectionConfig[]
  statuses: Record<string, ConnectionStatus>
  statusMessages: Record<string, string>
  /** 重连尝试次数（仅 reconnecting 时有意义，连接成功后会清零） */
  attempts: Record<string, number>
  /** 首次连接失败时的错误描述（粘性，连接成功或主动断开后清空） */
  lastErrors: Record<string, string>
  activeId: string | null
  loading: boolean

  bootstrap: () => Promise<void>
  setActive: (id: string | null) => void
  save: (config: ConnectionConfig) => Promise<void>
  remove: (id: string) => Promise<void>
  duplicate: (id: string) => Promise<void>

  connect: (id: string) => Promise<void>
  disconnect: (id: string) => Promise<void>

  subscribe: (id: string, topic: string, qos: QoS) => Promise<boolean>
  unsubscribe: (id: string, topic: string) => Promise<void>

  setStatus: (id: string, status: ConnectionStatus, message?: string) => void
  /** 主进程推送状态变更的统一入口，处理 attempt / lastError 等附加字段 */
  applyStatus: (payload: {
    id: string
    status: ConnectionStatus
    message?: string
    attempt?: number
    lastError?: string
  }) => void
  applyServerConnections: (list: ConnectionConfig[]) => void
  addSubscriptionToState: (id: string, topic: string, qos: QoS) => void
  removeSubscriptionFromState: (id: string, topic: string) => void
}

export const useConnectionStore = create<ConnectionState>()((set, get) => ({
  connections: [],
  statuses: {},
  statusMessages: {},
  attempts: {},
  lastErrors: {},
  activeId: null,
  loading: true,

  bootstrap: async () => {
    try {
      const list = await window.api.listConnections()
      set((state) => {
        const statuses = { ...state.statuses }
        list.forEach((item) => {
          if (!statuses[item.id]) statuses[item.id] = 'disconnected'
        })
        return {
          connections: list,
          statuses,
          activeId: state.activeId ?? list[0]?.id ?? null,
          loading: false
        }
      })
    } catch (err) {
      // IPC 调用失败时（preload 未挂载、主进程没注册 handler、userData 损坏等）
      // 不能一直挂在 loading 上，否则看上去就是「白屏」。
      console.error('[store] bootstrap 读取连接失败:', err)
      set({ loading: false, connections: [], activeId: null })
    }
  },

  setActive: (id) => set({ activeId: id }),

  save: async (config) => {
    const list = await window.api.saveConnection(config)
    set((state) => ({
      connections: list,
      statuses: { ...state.statuses, [config.id]: state.statuses[config.id] ?? 'disconnected' },
      activeId: state.activeId ?? config.id
    }))
  },

  remove: async (id) => {
    await window.api.removeConnection(id)
    set((state) => {
      const connections = state.connections.filter((item) => item.id !== id)
      const { [id]: _s, ...statuses } = state.statuses
      const { [id]: _m, ...statusMessages } = state.statusMessages
      const { [id]: _a, ...attempts } = state.attempts
      const { [id]: _e, ...lastErrors } = state.lastErrors
      return {
        connections,
        statuses,
        statusMessages,
        attempts,
        lastErrors,
        activeId: state.activeId === id ? (connections[0]?.id ?? null) : state.activeId
      }
    })
  },

  duplicate: async (id) => {
    const list = await window.api.duplicateConnection(id)
    set({ connections: list })
    toast.success('已复制连接')
  },

  connect: async (id) => {
    get().setStatus(id, 'connecting')
    const result = await window.api.connect(id)
    if (!result.ok) {
      // 主进程在连接失败时已经给出终态（开启自动重连时为 reconnecting，否则为 error）。
      // 只有它没改过状态时才兜底置 error，避免把「正在自动重连」覆盖掉。
      if (get().statuses[id] === 'connecting') {
        get().setStatus(id, 'error', result.error)
      }
      toast.error('连接失败', { description: result.error })
      return
    }
    get().setStatus(id, 'connected')
    const config = get().connections.find((item) => item.id === id)
    toast.success('连接成功', { description: config ? `${config.name}` : undefined })
  },

  disconnect: async (id) => {
    const result = await window.api.disconnect(id)
    if (!result.ok) {
      toast.error('断开失败', { description: result.error })
      return
    }
    // 主动断开后立即清空 attempts / lastErrors，确保下次连接从干净状态开始
    set((state) => {
      const { [id]: _a, ...attempts } = state.attempts
      const { [id]: _e, ...lastErrors } = state.lastErrors
      return {
        statuses: { ...state.statuses, [id]: 'disconnected' },
        statusMessages: { ...state.statusMessages, [id]: '' },
        attempts,
        lastErrors
      }
    })
  },

  subscribe: async (id, topic, qos) => {
    const result = await window.api.subscribe(id, topic, qos)
    if (!result.ok) {
      toast.error('订阅失败', { description: result.error })
      return false
    }
    get().addSubscriptionToState(id, topic, qos)
    return true
  },

  unsubscribe: async (id, topic) => {
    const result = await window.api.unsubscribe(id, topic)
    if (!result.ok) {
      toast.error('取消订阅失败', { description: result.error })
      return
    }
    get().removeSubscriptionFromState(id, topic)
  },

  setStatus: (id, status, message) =>
    set((state) => ({
      statuses: { ...state.statuses, [id]: status },
      // message 为空（含 undefined / ''）就清空，避免上一次错误的残留干扰新状态展示
      statusMessages: message
        ? { ...state.statusMessages, [id]: message }
        : { ...state.statusMessages, [id]: '' }
    })),

  applyStatus: (payload) =>
    set((state) => {
      const next: Pick<
        ConnectionState,
        'statuses' | 'statusMessages' | 'attempts' | 'lastErrors'
      > = {
        statuses: { ...state.statuses, [payload.id]: payload.status },
        statusMessages:
          payload.message !== undefined
            ? { ...state.statusMessages, [payload.id]: payload.message }
            : state.statusMessages,
        attempts: state.attempts,
        lastErrors: state.lastErrors
      }

      // 状态相关的 attempt / lastError 维护规则：
      // - connected：清零 + 清错 + 清消息
      // - disconnected：清零 + 清错 + 清消息（正常退出）
      // - error：保留 lastError 给用户看，不清 attempt
      // - reconnecting：用 payload.attempt 覆盖；lastError 优先用 payload，否则保留之前的
      // - connecting：清理 attempt，从零开始
      if (payload.status === 'connected' || payload.status === 'disconnected') {
        const { [payload.id]: _a, ...attempts } = state.attempts
        const { [payload.id]: _e, ...lastErrors } = state.lastErrors
        const { [payload.id]: _m, ...statusMessages } = state.statusMessages
        next.attempts = attempts
        next.lastErrors = lastErrors
        next.statusMessages = { ...statusMessages, [payload.id]: '' }
      } else if (payload.status === 'connecting') {
        const { [payload.id]: _a, ...attempts } = state.attempts
        const { [payload.id]: _e, ...lastErrors } = state.lastErrors
        next.attempts = attempts
        next.lastErrors = lastErrors
      } else if (payload.status === 'reconnecting') {
        next.attempts = {
          ...state.attempts,
          [payload.id]: payload.attempt ?? state.attempts[payload.id] ?? 0
        }
        next.lastErrors = {
          ...state.lastErrors,
          [payload.id]: payload.lastError ?? state.lastErrors[payload.id] ?? ''
        }
      } else if (payload.status === 'error') {
        if (payload.lastError) {
          next.lastErrors = { ...state.lastErrors, [payload.id]: payload.lastError }
        }
      }
      return next
    }),

  applyServerConnections: (list) =>
    set((state) => {
      const statuses = { ...state.statuses }
      list.forEach((item) => {
        if (!statuses[item.id]) statuses[item.id] = 'disconnected'
      })
      return { connections: list, statuses }
    }),

  addSubscriptionToState: (id, topic, qos) =>
    set((state) => ({
      connections: state.connections.map((item) =>
        item.id === id && !item.subscriptions.some((s) => s.topic === topic)
          ? { ...item, subscriptions: [...item.subscriptions, { topic, qos, createdAt: Date.now() }] }
          : item
      )
    })),

  removeSubscriptionFromState: (id, topic) =>
    set((state) => ({
      connections: state.connections.map((item) =>
        item.id === id
          ? { ...item, subscriptions: item.subscriptions.filter((s) => s.topic !== topic) }
          : item
      )
    }))
}))

export { MAX_MESSAGES_PER_CONNECTION }
