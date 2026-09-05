import { AnimatePresence, motion } from 'motion/react'
import { Braces, Copy, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { useMessageStore } from '@/store/useMessageStore'
import { formatDateTime, formatBytes, isJson, tryPrettyJson } from '@/lib/utils'
import type { ConnectionConfig, MqttMessage } from '@shared/types'

// 避免 zustand selector 返回 `[]` 字面量导致 React 19 + zustand 5 无限重渲染
const EMPTY_MESSAGES: MqttMessage[] = []

export function MessageDetail({ config }: { config: ConnectionConfig }) {
  const messages = useMessageStore((s) => s.messages[config.id] ?? EMPTY_MESSAGES)
  const selectedId = useMessageStore((s) => s.selectedMessageId)
  const select = useMessageStore((s) => s.select)

  const message = messages.find((m) => m.id === selectedId) ?? null

  return (
    <AnimatePresence>
      {message && (
        <motion.aside
          key="detail"
          initial={{ width: 0, opacity: 0 }}
          animate={{ width: 340, opacity: 1 }}
          exit={{ width: 0, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 380, damping: 34 }}
          className="glass-panel h-full shrink-0 overflow-hidden"
        >
          <div className="flex h-full w-[340px] flex-col">
            <div className="flex h-10 shrink-0 items-center gap-2 border-b px-3">
              <span className="text-xs font-semibold">消息详情</span>
              <Badge variant={message.direction === 'in' ? 'secondary' : 'success'} className="ml-1">
                {message.direction === 'in' ? '接收' : '发送'}
              </Badge>
              <Button
                size="icon-xs"
                variant="ghost"
                className="ml-auto"
                onClick={() => select(null)}
              >
                <X />
              </Button>
            </div>

            <div className="flex-1 overflow-y-auto p-3">
              <Row label="主题">
                <span className="break-all font-mono text-xs">{message.topic}</span>
              </Row>
              <Row label="时间">
                <span className="font-mono text-xs">{formatDateTime(message.timestamp)}</span>
              </Row>
              <Row label="QoS">
                <Badge variant="muted">{message.qos}</Badge>
              </Row>
              <Row label="保留消息">
                <Badge variant={message.retain ? 'warning' : 'muted'}>
                  {message.retain ? '是' : '否'}
                </Badge>
              </Row>
              <Row label="大小">
                <span className="font-mono text-xs">
                  {formatBytes(new Blob([message.payload]).size)}
                </span>
              </Row>

              <Separator className="my-3" />

              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-[11px] font-medium text-muted-foreground">内容</span>
                <div className="flex gap-1">
                  {isJson(message.payload) && (
                    <Badge variant="success" className="gap-1">
                      <Braces className="h-3 w-3" />
                      JSON
                    </Badge>
                  )}
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    onClick={() => {
                      navigator.clipboard.writeText(message.payload)
                      toast.success('已复制到剪贴板')
                    }}
                  >
                    <Copy />
                  </Button>
                </div>
              </div>

              <pre className="max-h-[46vh] overflow-auto whitespace-pre-wrap break-all rounded-lg bg-muted/60 p-3 font-mono text-[11px] leading-relaxed">
                {tryPrettyJson(message.payload)}
              </pre>
            </div>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-2 flex items-start gap-3">
      <span className="w-16 shrink-0 pt-0.5 text-[11px] text-muted-foreground">{label}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}
