import { cn } from '@/lib/utils'
import type { ConnectionStatus } from '@shared/types'

const MAP: Record<ConnectionStatus, { color: string; label: string; ring: string }> = {
  disconnected: {
    color: 'bg-muted-foreground/50',
    ring: 'bg-muted-foreground/50',
    label: '未连接'
  },
  connecting: {
    color: 'bg-warning',
    ring: 'bg-warning/60',
    label: '连接中'
  },
  connected: {
    color: 'bg-success',
    ring: 'bg-success/60',
    label: '已连接'
  },
  reconnecting: {
    color: 'bg-warning',
    ring: 'bg-warning/60',
    label: '重连中'
  },
  error: {
    color: 'bg-destructive',
    ring: 'bg-destructive/60',
    label: '错误'
  }
}

/**
 * 状态指示点。
 * - connected：脉冲扩散（代表活跃）
 * - connecting / reconnecting：也持续脉冲，让用户看到「正在努力」
 * - error：短促脉冲吸引注意
 * - disconnected：完全静止
 */
export function StatusDot({
  status,
  className,
  withPulse
}: {
  status: ConnectionStatus
  className?: string
  withPulse?: boolean
}) {
  const item = MAP[status]
  // 默认所有非 disconnected 都脉冲；显式传 withPulse=false 可以关掉
  const active = withPulse ?? status !== 'disconnected'

  return (
    <span className={cn('relative inline-flex h-2 w-2 shrink-0', className)}>
      {active && (
        <span
          key={status}
          className={cn('absolute inset-0 animate-pulse-ring rounded-full', item.ring)}
          aria-hidden
        />
      )}
      <span className={cn('relative inline-flex h-2 w-2 rounded-full', item.color)} />
    </span>
  )
}

export function statusLabel(status: ConnectionStatus): string {
  return MAP[status].label
}

export function statusTextClass(status: ConnectionStatus): string {
  switch (status) {
    case 'connected':
      return 'text-success'
    case 'connecting':
    case 'reconnecting':
      return 'text-warning'
    case 'error':
      return 'text-destructive'
    default:
      return 'text-muted-foreground'
  }
}
