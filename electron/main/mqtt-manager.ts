import mqtt, { type MqttClient, type IClientOptions } from 'mqtt'
import { randomUUID } from 'node:crypto'
import type {
  ConnectionConfig,
  ConnectionStatus,
  MqttMessage,
  QoS,
  StatusPayload
} from '@shared/types'

export interface ManagerHandlers {
  onStatus: (payload: StatusPayload) => void
  onMessage: (message: MqttMessage) => void
  onSubscriptionChanged: (
    id: string,
    topic: string,
    qos: QoS,
    action: 'subscribe' | 'unsubscribe'
  ) => void
}

interface ClientEntry {
  client: MqttClient
  config: ConnectionConfig
  /** true 表示用户主动断开，避免把正常断开识别成异常掉线 */
  manualClose: boolean
  /** 至少成功连接过一次 */
  everConnected: boolean
  /** 首次连接已得出最终结论（成功或失败） */
  settled: boolean
  /**
   * 客户端已彻底终止（首连失败且未开启自动重连）。
   * 为 true 时忽略一切后续事件，避免把已确定的 error 状态覆盖回去。
   */
  abandoned: boolean
  /** 当前重连尝试次数（含首次失败后的第一次重连）。成功或断开后清零 */
  attempt: number
  /** 首次连接失败的错误描述，reconnecting 期间持续携带直到下次成功 */
  lastError: string
  /**
   * 当前展示给用户的状态。`MqttClient.connected` 只能反映「握手完成」，
   * 但用户在 UI 上更需要区分 connecting / connected / reconnecting 三种活跃状态。
   * 每次 `emitStatus` 时同步更新，便于主进程在窗口关闭时查询「还有多少连接是活的」。
   */
  currentStatus: ConnectionStatus
}

/** 用于「关闭软件时检查活跃连接」等场景的轻量结构 */
export interface ActiveConnectionInfo {
  id: string
  name: string
  status: ConnectionStatus
}

/** 根据配置拼装连接地址 */
export function buildUrl(config: ConnectionConfig): string {
  const { protocol, host, port } = config
  return `${protocol}://${host}:${port}`
}

/**
 * MQTT 连接管理器
 * 所有 MQTT 连接都运行在主进程，渲染进程通过 IPC 与之通信。
 * 这样做的原因：mqtt:// / mqtts:// 依赖 Node 的 net 模块，无法在渲染进程直接建立。
 */
export class MqttManager {
  private clients = new Map<string, ClientEntry>()
  private handlers: ManagerHandlers

  constructor(handlers: ManagerHandlers) {
    this.handlers = handlers
  }

  isConnected(id: string): boolean {
    const entry = this.clients.get(id)
    return !!entry && entry.client.connected
  }

  /** 建立连接 */
  async connect(config: ConnectionConfig): Promise<void> {
    if (this.clients.has(config.id)) {
      await this.disconnect(config.id)
    }

    this.emitStatus(config.id, 'connecting')

    const options: IClientOptions = {
      clientId: config.clientId?.trim() || `mqtts_${randomUUID().slice(0, 8)}`,
      keepalive: config.keepalive,
      clean: config.clean,
      connectTimeout: config.connectTimeout * 1000,
      reconnectPeriod: config.reconnectPeriod > 0 ? config.reconnectPeriod * 1000 : 0,
      rejectUnauthorized: config.rejectUnauthorized,
      resubscribe: true,
      protocolVersion: 4
    }

    if (config.username) options.username = config.username
    if (config.password) options.password = config.password
    if (config.protocol === 'ws' || config.protocol === 'wss') {
      options.path = config.path?.startsWith('/') ? config.path : `/${config.path ?? ''}`
    }

    let client: MqttClient
    try {
      client = mqtt.connect(buildUrl(config), options)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      this.emitStatus(config.id, 'error', message)
      throw new Error(message)
    }

    const entry: ClientEntry = {
      client,
      config,
      manualClose: false,
      everConnected: false,
      settled: false,
      abandoned: false,
      attempt: 0,
      lastError: '',
      currentStatus: 'connecting'
    }
    this.clients.set(config.id, entry)
    this.bindEvents(entry)

    // 等待首次连接结果，超时则抛出，便于渲染进程给出明确反馈
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`连接超时（${config.connectTimeout}s）`))
      }, config.connectTimeout * 1000 + 500)

      client.once('connect', () => {
        clearTimeout(timer)
        resolve()
      })
      client.once('error', (err: Error) => {
        clearTimeout(timer)
        reject(err)
      })
    }).catch((err: Error) => {
      entry.settled = true
      const message = err instanceof Error ? err.message : String(err)
      entry.lastError = message

      if (config.reconnectPeriod > 0) {
        // 保留了 client，让 mqtt.js 在后台持续自动重连，broker 恢复后能自动连上。
        // 关键：状态落到 reconnecting 而不是停在 connecting，
        // 按钮才不会一直卡在「处理中…」，用户也能随时中止重试。
        // attempt 保持 0：真正的第 1 次重试由 mqtt.js 触发 'reconnect' 事件时开始计数，
        // 这样 attempt 与实际重试次数一一对应，重连上限的判断才准确。
        this.emitStatus(config.id, 'reconnecting', `连接失败：${message}，正在自动重连…`, {
          attempt: 0,
          lastError: message
        })
      } else {
        // 未启用自动重连：彻底结束客户端，状态停在 error，由用户手动重试
        entry.abandoned = true
        entry.manualClose = true
        this.clients.delete(config.id)
        try {
          client.end(true)
        } catch {
          /* 忽略 end 阶段的异常 */
        }
        this.emitStatus(config.id, 'error', message)
      }
      throw err
    })
  }

  private bindEvents(entry: ClientEntry) {
    const { client, config } = entry

    // 客户端已被终止（首连失败且未开启自动重连），后续事件一律忽略，
    // 避免把已经确定的 error 状态又覆盖回 reconnecting。
    const isDead = () => entry.abandoned

    client.on('connect', () => {
      entry.everConnected = true
      entry.settled = true
      entry.attempt = 0
      entry.lastError = ''
      this.emitStatus(config.id, 'connected')
    })

    client.on('reconnect', () => {
      if (isDead() || entry.manualClose) return

      // 重连次数上限：maxReconnectAttempts > 0 时，用完额度即彻底终止并给出 error 终态。
      // maxReconnectAttempts = 0（含旧配置缺字段）表示不设上限，保持一直重连。
      const max = entry.config.maxReconnectAttempts ?? 0
      if (max > 0 && entry.attempt >= max) {
        entry.abandoned = true
        entry.manualClose = true
        this.clients.delete(config.id)
        try {
          client.end(true)
        } catch {
          /* 忽略 end 阶段的异常 */
        }
        this.emitStatus(
          config.id,
          'error',
          `已自动重试 ${entry.attempt} 次仍无法连接，已停止重连`,
          { lastError: entry.lastError }
        )
        return
      }

      // 每次 mqtt.js 内部触发 reconnect 事件就累计一次计数，
      // 与实际发起的重试次数一一对应，UI 上的「第 N 次」和上限判断都依赖它。
      entry.attempt += 1
      const message = entry.lastError
        ? `连接失败：${entry.lastError}，正在第 ${entry.attempt}${max > 0 ? `/${max}` : ''} 次重连…`
        : `正在第 ${entry.attempt}${max > 0 ? `/${max}` : ''} 次重连…`
      this.emitStatus(config.id, 'reconnecting', message, {
        attempt: entry.attempt,
        lastError: entry.lastError || undefined
      })
    })

    client.on('close', () => {
      if (isDead()) return
      if (entry.manualClose) {
        // 用户主动断开：清空 attempt / lastError，避免下次连接时残留旧数据
        entry.attempt = 0
        entry.lastError = ''
        this.emitStatus(config.id, 'disconnected')
        this.clients.delete(config.id)
      } else if (config.reconnectPeriod <= 0) {
        // 未启用自动重连：掉线后直接回到未连接，而不是永远卡在「重连中」
        entry.attempt = 0
        entry.lastError = ''
        this.emitStatus(config.id, 'disconnected', '连接已断开（未启用自动重连）')
        this.clients.delete(config.id)
      } else {
        // 这里只更新消息描述，真正的 reconnecting 状态由 'reconnect' 事件触发并自增 attempt
        const message = entry.lastError
          ? `连接已断开：${entry.lastError}，正在自动重连…`
          : '连接已断开，正在自动重连…'
        this.emitStatus(config.id, 'reconnecting', message, {
          attempt: entry.attempt,
          lastError: entry.lastError || undefined
        })
      }
    })

    client.on('offline', () => {
      if (isDead()) return
      if (entry.manualClose || config.reconnectPeriod <= 0) {
        return
      }
      // 设备离线：mqtt.js 仍会按 reconnectPeriod 自动重连，沿用现有计数
      this.emitStatus(
        config.id,
        'reconnecting',
        entry.lastError
          ? `网络离线：${entry.lastError}，等待网络恢复后继续重连…`
          : '设备离线，正在等待网络恢复…',
        {
          attempt: entry.attempt,
          lastError: entry.lastError || undefined
        }
      )
    })

    client.on('end', () => {
      if (entry.manualClose) {
        this.emitStatus(config.id, 'disconnected')
        this.clients.delete(config.id)
      }
    })

    client.on('error', (err: Error) => {
      // 首连阶段的错误由 connect() 的 Promise 统一上报，这里跳过；
      // 已启用重连时错误会伴随 close 走 reconnecting，避免状态来回抖动。
      if (!entry.everConnected || entry.manualClose || config.reconnectPeriod > 0) {
        // 仍然更新 lastError，让 close/reconnect 事件能基于最新错误描述状态
        if (config.reconnectPeriod > 0) entry.lastError = err.message
        return
      }
      this.emitStatus(config.id, 'error', err.message)
    })

    client.on('message', (topic, payload, packet) => {
      const message: MqttMessage = {
        id: randomUUID(),
        connectionId: config.id,
        topic,
        payload: payload.toString('utf-8'),
        qos: (packet.qos ?? 0) as QoS,
        retain: !!packet.retain,
        direction: 'in',
        timestamp: Date.now()
      }
      this.handlers.onMessage(message)
    })
  }

  async disconnect(id: string): Promise<void> {
    const entry = this.clients.get(id)
    if (!entry) return
    entry.manualClose = true
    entry.attempt = 0
    entry.lastError = ''
    await new Promise<void>((resolve) => {
      entry.client.end(true, {}, () => resolve())
    })
    this.clients.delete(id)
    this.emitStatus(id, 'disconnected')
  }

  async subscribe(id: string, topic: string, qos: QoS): Promise<void> {
    const entry = this.clients.get(id)
    if (!entry) throw new Error('当前连接未建立')
    await entry.client.subscribeAsync(topic, { qos })
    this.handlers.onSubscriptionChanged(id, topic, qos, 'subscribe')
  }

  async unsubscribe(id: string, topic: string): Promise<void> {
    const entry = this.clients.get(id)
    if (!entry) throw new Error('当前连接未建立')
    await entry.client.unsubscribeAsync(topic)
    this.handlers.onSubscriptionChanged(id, topic, 0, 'unsubscribe')
  }

  async publish(
    id: string,
    topic: string,
    payload: string,
    qos: QoS,
    retain: boolean
  ): Promise<void> {
    const entry = this.clients.get(id)
    if (!entry) throw new Error('当前连接未建立')
    await entry.client.publishAsync(topic, payload, { qos, retain })
    const message: MqttMessage = {
      id: randomUUID(),
      connectionId: id,
      topic,
      payload,
      qos,
      retain,
      direction: 'out',
      timestamp: Date.now()
    }
    this.handlers.onMessage(message)
  }

  /** 应用退出时清理全部连接 */
  async dispose(): Promise<void> {
    const ids = [...this.clients.keys()]
    await Promise.all(ids.map((id) => this.disconnect(id)))
  }

  /**
   * 推送给渲染端的状态变更。
   * extras 用于携带额外元数据（attempt / lastError），仅在 reconnecting / error 时有意义。
   */
  private emitStatus(
    id: string,
    status: ConnectionStatus,
    message?: string,
    extras?: { attempt?: number; lastError?: string }
  ) {
    const payload: StatusPayload = { id, status, message }
    if (extras?.attempt !== undefined) payload.attempt = extras.attempt
    if (extras?.lastError !== undefined) payload.lastError = extras.lastError
    const entry = this.clients.get(id)
    if (entry) entry.currentStatus = status
    this.handlers.onStatus(payload)
  }

  /**
   * 获取当前「活跃」的连接（connecting / connected / reconnecting）。
   * 关闭软件时主进程靠这个判断要不要弹确认框。
   */
  getActiveConnections(): ActiveConnectionInfo[] {
    const result: ActiveConnectionInfo[] = []
    for (const [id, entry] of this.clients) {
      result.push({ id, name: entry.config.name, status: entry.currentStatus })
    }
    return result
  }
}
