import { useEffect, useMemo, useRef } from 'react'
import { motion } from 'motion/react'
import { ArrowDown, ArrowUp, Download, Search, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useMessageStore, filterMessages } from '@/store/useMessageStore'
import { useUiStore } from '@/store/useUiStore'
import { cn, formatTime } from '@/lib/utils'
import type { ConnectionConfig, MqttMessage } from '@shared/types'

const MAX_RENDER = 400

// 避免 zustand selector 返回 `[]` 字面量导致 React 19 + zustand 5 无限重渲染
const EMPTY_MESSAGES: MqttMessage[] = []

export function MessageList({ config }: { config: ConnectionConfig }) {
  const all = useMessageStore((s) => s.messages[config.id] ?? EMPTY_MESSAGES)
  const topicFilter = useMessageStore((s) => s.topicFilter)
  const directionFilter = useMessageStore((s) => s.directionFilter)
  const keyword = useMessageStore((s) => s.keyword)
  const setDirectionFilter = useMessageStore((s) => s.setDirectionFilter)
  const setKeyword = useMessageStore((s) => s.setKeyword)
  const setTopicFilter = useMessageStore((s) => s.setTopicFilter)
  const selectedId = useMessageStore((s) => s.selectedMessageId)
  const select = useMessageStore((s) => s.select)
  const clear = useMessageStore((s) => s.clear)

  const viewportRef = useRef<HTMLDivElement>(null)
  const stickToBottom = useRef(true)
  const openExportDialog = useUiStore((s) => s.openExportDialog)

  const list = useMemo(
    () => filterMessages(all, { topic: topicFilter, direction: directionFilter, keyword }),
    [all, topicFilter, directionFilter, keyword]
  )

  // 只渲染最后若干条，避免高频消息拖垮 DOM
  const visible = useMemo(
    () => (list.length > MAX_RENDER ? list.slice(list.length - MAX_RENDER) : list),
    [list]
  )

  useEffect(() => {
    const el = viewportRef.current
    if (el && stickToBottom.current) {
      el.scrollTop = el.scrollHeight
    }
  }, [visible.length])

  const handleScroll = () => {
    const el = viewportRef.current
    if (!el) return
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40
  }

  return (
    <div className="glass-panel flex min-h-0 flex-1 flex-col overflow-hidden">
      {/* 工具条 */}
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-white/40 px-3">
        <div className="flex rounded-md border p-0.5">
          {(
            [
              ['all', '全部'],
              ['in', '接收'],
              ['out', '发送']
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              onClick={() => setDirectionFilter(value)}
              className={cn(
                'relative rounded px-2 py-0.5 text-[11px] transition-colors',
                directionFilter === value
                  ? 'text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {directionFilter === value && (
                <motion.span
                  layoutId="direction-filter-bg"
                  className="absolute inset-0 rounded bg-primary"
                  transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                />
              )}
              <span className="relative">{label}</span>
            </button>
          ))}
        </div>

        {topicFilter && (
          <Badge variant="default" className="cursor-pointer gap-1" onClick={() => setTopicFilter(null)}>
            {topicFilter}
            <span className="opacity-70">×</span>
          </Badge>
        )}

        <div className="relative ml-auto w-52">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="搜索主题或内容"
            className="h-7 pl-8 text-xs"
          />
        </div>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon-sm"
              variant="ghost"
              onClick={() => openExportDialog(config.id)}
              disabled={!all.length}
            >
              <Download />
            </Button>
          </TooltipTrigger>
          <TooltipContent>导出消息记录</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon-sm"
              variant="ghost"
              onClick={() => clear(config.id)}
              disabled={!all.length}
            >
              <Trash2 />
            </Button>
          </TooltipTrigger>
          <TooltipContent>清空消息</TooltipContent>
        </Tooltip>
      </div>

      {/* 表头 */}
      <div className="flex h-8 shrink-0 items-center gap-3 border-b border-white/30 bg-white/20 px-3 text-[11px] font-medium text-muted-foreground">
        <span className="w-[92px] shrink-0">时间</span>
        <span className="w-5 shrink-0" />
        <span className="w-[180px] shrink-0">主题</span>
        <span className="w-9 shrink-0">QoS</span>
        <span className="min-w-0 flex-1">内容</span>
      </div>

      {/* 列表 */}
      <div
        ref={viewportRef}
        onScroll={handleScroll}
        className="min-h-0 flex-1 overflow-y-auto"
      >
        {visible.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-1 text-center text-xs text-muted-foreground">
            <span>暂无消息</span>
            <span className="text-[11px]">
              {all.length > 0 ? '当前筛选条件下没有匹配的消息' : '订阅主题后即可收到消息'}
            </span>
          </div>
        ) : (
          visible.map((msg) => (
            <div
              key={msg.id}
              onClick={() => select(msg.id)}
              className={cn(
                'flex cursor-pointer items-center gap-3 border-b border-border/50 px-3 py-1.5 text-xs transition-colors hover:bg-accent/50',
                selectedId === msg.id && 'bg-primary/[0.08]'
              )}
            >
              <span className="w-[92px] shrink-0 font-mono text-[11px] text-muted-foreground">
                {formatTime(msg.timestamp)}
              </span>
              <span className="w-5 shrink-0">
                {msg.direction === 'in' ? (
                  <ArrowDown className="h-3.5 w-3.5 text-primary" />
                ) : (
                  <ArrowUp className="h-3.5 w-3.5 text-success" />
                )}
              </span>
              <span className="w-[180px] shrink-0 truncate font-mono text-[11px]">
                {msg.topic}
              </span>
              <span className="w-9 shrink-0">
                <Badge variant="muted" className="px-1 py-0 text-[10px]">
                  {msg.qos}
                </Badge>
              </span>
              <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-foreground/80">
                {msg.payload}
              </span>
              {msg.retain && (
                <Badge variant="warning" className="shrink-0 px-1 py-0 text-[10px]">
                  R
                </Badge>
              )}
            </div>
          ))
        )}
      </div>

      <div className="flex h-6 shrink-0 items-center border-t border-white/30 bg-white/10 px-3 text-[10px] text-muted-foreground">
        显示 {visible.length} / {list.length} 条
        {list.length > MAX_RENDER && '（仅渲染最近 400 条）'}
      </div>
    </div>
  )
}
