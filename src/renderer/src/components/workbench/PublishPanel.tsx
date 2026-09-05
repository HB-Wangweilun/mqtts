import { useState } from 'react'
import { motion } from 'motion/react'
import { Braces, Send, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useConnectionStore } from '@/store/useConnectionStore'
import { isJson, tryPrettyJson } from '@/lib/utils'
import type { ConnectionConfig, QoS } from '@shared/types'

const QOS_OPTIONS: QoS[] = [0, 1, 2]

const TEMPLATE = JSON.stringify(
  { msg: 'hello from MQTTS', ts: new Date().toISOString() },
  null,
  2
)

export function PublishPanel({ config }: { config: ConnectionConfig }) {
  const status = useConnectionStore((s) => s.statuses[config.id] ?? 'disconnected')
  const [topic, setTopic] = useState('')
  const [payload, setPayload] = useState('')
  const [qos, setQos] = useState<QoS>(0)
  const [retain, setRetain] = useState(false)
  const [sending, setSending] = useState(false)

  const connected = status === 'connected'

  const handleSend = async () => {
    const t = topic.trim()
    if (!t) return toast.error('请填写发布主题')
    if (!connected) return toast.error('请先连接 Broker')

    setSending(true)
    const result = await window.api.publish({
      connectionId: config.id,
      topic: t,
      payload,
      qos,
      retain
    })
    setSending(false)

    if (!result.ok) toast.error('发送失败', { description: result.error })
  }

  return (
    <section className="glass-panel shrink-0">
      <div className="flex h-9 items-center gap-2 border-b px-3">
        <Send className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs font-semibold">发布消息</span>

        <div className="ml-auto flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <Label className="text-[11px] text-muted-foreground">Retain</Label>
            <Switch checked={retain} onCheckedChange={setRetain} className="scale-90" />
          </div>
          <Select value={String(qos)} onValueChange={(v) => setQos(Number(v) as QoS)}>
            <SelectTrigger className="h-7 w-[88px] text-xs">
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
        </div>
      </div>

      <div className="p-3">
        <div className="flex gap-2">
          <Input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="发布到主题，例如 device/001/cmd"
            className="h-8 font-mono text-xs"
          />
          <Button size="sm" className="h-8 shrink-0" onClick={handleSend} disabled={!connected || sending}>
            <Send />
            发送
          </Button>
        </div>

        <div className="mt-2 flex gap-2">
          <Textarea
            value={payload}
            onChange={(e) => setPayload(e.target.value)}
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') handleSend()
            }}
            placeholder="消息内容，支持任意文本或 JSON"
            className="min-h-[86px] resize-none font-mono text-xs"
          />
          <div className="flex w-8 shrink-0 flex-col gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon-sm"
                  variant="outline"
                  disabled={!isJson(payload)}
                  onClick={() => setPayload(tryPrettyJson(payload))}
                >
                  <Braces />
                </Button>
              </TooltipTrigger>
              <TooltipContent>格式化 JSON</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon-sm"
                  variant="outline"
                  onClick={() => setPayload(TEMPLATE)}
                >
                  <Sparkles />
                </Button>
              </TooltipTrigger>
              <TooltipContent>插入示例 JSON</TooltipContent>
            </Tooltip>
          </div>
        </div>

        <div className="mt-1.5 flex items-center justify-between text-[10px] text-muted-foreground">
          <span>Ctrl / ⌘ + Enter 快速发送</span>
          {!connected && (
            <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-warning">
              未连接，无法发送消息
            </motion.span>
          )}
        </div>
      </div>
    </section>
  )
}
