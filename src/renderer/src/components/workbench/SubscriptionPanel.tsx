import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Hash, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useConnectionStore } from '@/store/useConnectionStore'
import { useMessageStore, topicMatch } from '@/store/useMessageStore'
import { cn } from '@/lib/utils'
import type { ConnectionConfig, MqttMessage, QoS } from '@shared/types'

const QOS_OPTIONS: QoS[] = [0, 1, 2]

// 避免 zustand selector 返回 `[]` 字面量导致 React 19 + zustand 5 无限重渲染
const EMPTY_MESSAGES: MqttMessage[] = []

export function SubscriptionPanel({ config }: { config: ConnectionConfig }) {
  const status = useConnectionStore((s) => s.statuses[config.id] ?? 'disconnected')
  const subscribe = useConnectionStore((s) => s.subscribe)
  const unsubscribe = useConnectionStore((s) => s.unsubscribe)
  const messages = useMessageStore((s) => s.messages[config.id] ?? EMPTY_MESSAGES)
  const topicFilter = useMessageStore((s) => s.topicFilter)
  const setTopicFilter = useMessageStore((s) => s.setTopicFilter)

  const [topic, setTopic] = useState('')
  const [qos, setQos] = useState<QoS>(0)
  const [pending, setPending] = useState(false)

  const connected = status === 'connected'

  /** 统计每个订阅主题收到的消息数（考虑通配符） */
  const counts = useMemo(() => {
    const map = new Map<string, number>()
    for (const sub of config.subscriptions) {
      map.set(
        sub.topic,
        messages.filter((m) => m.direction === 'in' && topicMatch(sub.topic, m.topic)).length
      )
    }
    return map
  }, [config.subscriptions, messages])

  const handleSubscribe = async () => {
    const value = topic.trim()
    if (!value) return
    if (!connected) {
      return
    }
    setPending(true)
    const ok = await subscribe(config.id, value, qos)
    setPending(false)
    if (ok) setTopic('')
  }

  return (
    <section className="glass-panel flex h-full w-[268px] shrink-0 flex-col">
      <div className="flex h-10 shrink-0 items-center gap-1.5 border-b px-3">
        <Hash className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs font-semibold">主题管理</span>
        <Badge variant="muted" className="ml-auto">
          {config.subscriptions.length}
        </Badge>
      </div>

      {/* 新增订阅 */}
      <div className="space-y-2 border-b p-3">
        <Input
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSubscribe()}
          placeholder="topic/#"
          className="h-8 font-mono text-xs"
          disabled={!connected}
        />
        <div className="flex gap-2">
          <Select value={String(qos)} onValueChange={(v) => setQos(Number(v) as QoS)}>
            <SelectTrigger className="h-8 w-[92px] text-xs" disabled={!connected}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {QOS_OPTIONS.map((q) => (
                <SelectItem key={q} value={String(q)}>
                  QoS {q}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            className="h-8 flex-1"
            onClick={handleSubscribe}
            disabled={!connected || pending}
          >
            <Plus />
            订阅
          </Button>
        </div>
        {!connected && (
          <p className="text-[11px] text-muted-foreground">连接成功后即可订阅主题</p>
        )}
      </div>

      {/* 订阅列表 */}
      <div className="flex-1 overflow-y-auto p-2">
        {config.subscriptions.length === 0 ? (
          <div className="px-2 py-10 text-center text-xs leading-relaxed text-muted-foreground">
            暂无订阅
            <br />
            在上方输入主题后点击订阅
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {config.subscriptions.map((sub) => {
              const active = topicFilter === sub.topic
              return (
                <motion.div
                  key={sub.topic}
                  layout
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -8, height: 0 }}
                  transition={{ duration: 0.15 }}
                >
                  <div
                    onClick={() => setTopicFilter(active ? null : sub.topic)}
                    className={cn(
                      'group mb-1 cursor-pointer rounded-lg border px-2.5 py-2 transition-colors',
                      active
                        ? 'border-primary/40 bg-primary/[0.07]'
                        : 'border-transparent hover:bg-accent/60'
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate font-mono text-xs">
                        {sub.topic}
                      </span>
                      <Badge variant="muted" className="shrink-0 px-1.5 py-0 text-[10px]">
                        QoS {sub.qos}
                      </Badge>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            size="icon-xs"
                            variant="ghost"
                            className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                            disabled={!connected}
                            onClick={(e) => {
                              e.stopPropagation()
                              unsubscribe(config.id, sub.topic)
                            }}
                          >
                            <Trash2 className="text-destructive" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>取消订阅</TooltipContent>
                      </Tooltip>
                    </div>
                    <div className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground">
                      <span
                        className={cn(
                          'inline-block h-1.5 w-1.5 rounded-full',
                          connected ? 'bg-success' : 'bg-muted-foreground/40'
                        )}
                      />
                      {connected ? '监听中' : '未监听'} · {counts.get(sub.topic) ?? 0} 条
                    </div>
                  </div>
                </motion.div>
              )
            })}
          </AnimatePresence>
        )}
      </div>
    </section>
  )
}
