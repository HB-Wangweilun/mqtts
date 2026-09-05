import { useEffect, useState } from 'react'
import { motion } from 'motion/react'
import { Loader2, Pencil, Plug, PlugZap, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { StatusDot } from '@/components/connections/StatusDot'
import { useConnectionStore } from '@/store/useConnectionStore'
import { useMessageStore } from '@/store/useMessageStore'
import { useUiStore } from '@/store/useUiStore'
import { toast } from 'sonner'
import type { ConnectionConfig, ConnectionStatus } from '@shared/types'

const STATUS_VARIANT: Record<ConnectionStatus, 'success' | 'warning' | 'destructive' | 'muted'> = {
  connected: 'success',
  connecting: 'warning',
  reconnecting: 'warning',
  error: 'destructive',
  disconnected: 'muted'
}

const STATUS_TEXT: Record<ConnectionStatus, string> = {
  connected: '已连接',
  connecting: '连接中',
  reconnecting: '重连中',
  error: '连接错误',
  disconnected: '未连接'
}

/**
 * 顶部连接状态条。
 *
 * 这里把"重连中到底在干嘛"摆到台面上：
 * - 用 spinner 表达系统在工作（不是死锁）
 * - 显示「第 N 次重试」让用户知道还在挣扎
 * - 显示首连错误消息，让用户知道为什么失败
 * - 倒计时到下次重试，基于配置的 reconnectPeriod 估算
 */
export function ConnectionHeader({ config }: { config: ConnectionConfig }) {
  const status = useConnectionStore((s) => s.statuses[config.id] ?? 'disconnected')
  const statusMessage = useConnectionStore((s) => s.statusMessages[config.id])
  const attempt = useConnectionStore((s) => s.attempts[config.id] ?? 0)
  const lastError = useConnectionStore((s) => s.lastErrors[config.id] ?? '')
  const connect = useConnectionStore((s) => s.connect)
  const disconnect = useConnectionStore((s) => s.disconnect)
  const openDialog = useUiStore((s) => s.openConnectionDialog)
  // 拿 messages[id] 的引用，undefined 时用空数组（不会引发无限渲染，因为是组件内计算的）
  const messages = useMessageStore((s) => s.messages[config.id])
  const clear = useMessageStore((s) => s.clear)

  const connected = status === 'connected'
  // 只有首次握手阶段的 connecting 才阻塞按钮。
  // reconnecting 是后台自动重连，必须保持可点击，否则 broker 长时间不可用时会卡死。
  const connecting = status === 'connecting'
  const reconnecting = status === 'reconnecting'
  const errored = status === 'error'
  const total = messages?.length ?? 0

  return (
    <header className="glass-panel flex h-14 shrink-0 items-center gap-3 px-4">
      <StatusDot status={status} withPulse />

      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <h2 className="truncate text-sm font-semibold">{config.name}</h2>
          <Badge variant={STATUS_VARIANT[status]} className="shrink-0">
            {STATUS_TEXT[status]}
          </Badge>
          {reconnecting && attempt > 0 && (
            <Badge variant="outline" className="shrink-0 border-warning/40 text-warning">
              第 {attempt}
              {config.maxReconnectAttempts > 0 ? ` / ${config.maxReconnectAttempts}` : ''} 次重试
            </Badge>
          )}
        </div>
        <div className="truncate font-mono text-[11px] text-muted-foreground">
          {config.protocol}://{config.host}:{config.port}
          {config.clientId ? ` · ${config.clientId}` : ''}
        </div>
      </div>

      {/* 状态详情：错误原因 / 重连描述。
          error 时用红色，reconnecting 时用 warning 琥珀色。*/}
      <StatusDetail
        status={status}
        statusMessage={statusMessage}
        lastError={lastError}
        attempt={attempt}
        reconnectPeriod={config.reconnectPeriod}
      />

      <div className="ml-auto flex shrink-0 items-center gap-1.5">
        <span className="mr-1 text-xs text-muted-foreground">{total} 条消息</span>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="outline" size="xs" onClick={() => openDialog(config)}>
              <Pencil />
              编辑
            </Button>
          </TooltipTrigger>
          <TooltipContent>编辑连接</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="xs"
              onClick={() => {
                if (total === 0) return
                clear(config.id)
                toast.success('消息已清空')
              }}
            >
              <Trash2 />
              清空
            </Button>
          </TooltipTrigger>
          <TooltipContent>清空当前连接的消息记录</TooltipContent>
        </Tooltip>

        {reconnecting ? (
          <Button
            size="sm"
            variant="destructive"
            onClick={() => disconnect(config.id)}
            className="gap-1.5"
          >
            <X />
            取消重连
          </Button>
        ) : (
          <Button
            size="sm"
            variant={connected ? 'outline' : errored ? 'default' : 'default'}
            disabled={connecting}
            onClick={() => {
              if (connected) disconnect(config.id)
              else connect(config.id)
            }}
          >
            {connecting ? (
              <Loader2 className="animate-spin" />
            ) : connected ? (
              <PlugZap />
            ) : (
              <Plug />
            )}
            {connecting
              ? '连接中…'
              : connected
                ? '断开连接'
                : errored
                  ? '重新连接'
                  : '连接'}
          </Button>
        )}
      </div>
    </header>
  )
}

/**
 * 状态详情区。把 statusMessage 和 lastError 用不同配色展示出来。
 * reconnecting 时再额外加一个"下次重试倒计时"。
 */
function StatusDetail({
  status,
  statusMessage,
  lastError,
  attempt,
  reconnectPeriod
}: {
  status: ConnectionStatus
  statusMessage: string
  lastError: string
  attempt: number
  reconnectPeriod: number
}) {
  // disconnected / connected 不显示详情区，留给正常状态的视觉简洁
  if (status === 'disconnected' || status === 'connected') return null

  if (status === 'reconnecting') {
    return (
      <ReconnectingDetail
        message={statusMessage}
        lastError={lastError}
        attempt={attempt}
        reconnectPeriod={reconnectPeriod}
      />
    )
  }

  // connecting / error：用一种通用的告警样式
  const isError = status === 'error'
  return (
    <motion.span
      initial={{ opacity: 0, x: -6 }}
      animate={{ opacity: 1, x: 0 }}
      className={
        'hidden min-w-0 flex-1 truncate text-xs lg:inline-block ' +
        (isError ? 'text-destructive' : 'text-warning')
      }
      title={statusMessage || lastError || STATUS_TEXT[status]}
    >
      {isError ? (
        <>
          <span className="font-semibold">错误：</span>
          {statusMessage || lastError || '未知错误'}
        </>
      ) : (
        <>
          <Loader2 className="-mt-0.5 mr-1 inline h-3 w-3 animate-spin align-middle" />
          {statusMessage || '正在连接…'}
        </>
      )}
    </motion.span>
  )
}

/**
 * 重连专用详情区：消息描述 + 重试倒计时（基于 reconnectPeriod 估算）。
 * 倒计时并非精确到 mqtt.js 下次重试的毫秒级时刻，而是给用户一个"还在尝试"的视觉节拍。
 */
function ReconnectingDetail({
  message,
  lastError,
  attempt,
  reconnectPeriod
}: {
  message: string
  lastError: string
  attempt: number
  reconnectPeriod: number
}) {
  // 重试间隔（秒）。如果用户配置了 0 表示不重连，但这里既然状态已经是 reconnecting，
  // 说明至少 >0。用 max(1, ...) 防止除零以及让用户能感知到节奏。
  const period = Math.max(1, reconnectPeriod || 5)
  const [countdown, setCountdown] = useState<number>(period)

  // 每次 attempt 变化时重置倒计时为完整周期
  useEffect(() => {
    setCountdown(period)
  }, [attempt, period])

  // 每秒递减，0 后回到 period，形成视觉上的"心跳"
  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((c) => (c <= 1 ? period : c - 1))
    }, 1000)
    return () => clearInterval(timer)
  }, [period])

  return (
    <motion.div
      key={attempt}
      initial={{ opacity: 0, x: -6 }}
      animate={{ opacity: 1, x: 0 }}
      className="hidden min-w-0 flex-1 items-center gap-2 lg:flex"
    >
      <span className="text-warning">
        <Loader2 className="inline h-3.5 w-3.5 animate-spin align-[-2px]" />
      </span>
      <div className="min-w-0 flex-1">
        <div
          className="truncate text-xs font-medium text-warning"
          title={message || `正在第 ${attempt} 次重连`}
        >
          {message || `正在第 ${attempt} 次重连…`}
        </div>
        {lastError && (
          <div
            className="truncate text-[11px] text-muted-foreground"
            title={`上次失败原因：${lastError}`}
          >
            上次失败：{lastError}
          </div>
        )}
      </div>
      <div className="shrink-0 rounded border border-warning/40 px-1.5 py-0.5 font-mono text-[11px] text-warning tabular-nums">
        约 {countdown}s 后重试
      </div>
    </motion.div>
  )
}
