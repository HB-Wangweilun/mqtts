import { useEffect, useMemo, useState } from 'react'
import {
  Calendar,
  CheckCircle2,
  Clock,
  Download,
  FileJson,
  FileSpreadsheet,
  FileText,
  Loader2,
  X
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { useMessageStore } from '@/store/useMessageStore'
import { useConnectionStore } from '@/store/useConnectionStore'
import { useUiStore } from '@/store/useUiStore'
import {
  filterExportMessages,
  formatExportStamp,
  sanitizeFileName
} from '@shared/export'
import type {
  ExportDirection,
  ExportFormat,
  ExportRequest,
  MqttMessage
} from '@shared/types'

type TimePreset = 'all' | '1h' | '24h' | '7d' | '30d' | 'custom'

/** 共享的空数组常量，避免在 zustand selector 中返回字面量导致无限重渲染。
 *
 * React 19 + zustand 5 的 useSyncExternalStore 会把 selector 的返回值跟前一次比较（Object.is），
 * 一旦 selector 返回新引用（例如 `s.x ?? []` 中 `[]` 字面量每次都是新对象），
 * 就会判定 store 变了，触发 forceStoreRerender → 重渲染 → 再判定变 → 死循环。
 * 修复办法是给 selector 一个稳定引用：模块级常量。 */
const EMPTY_MESSAGES: MqttMessage[] = []

interface FormatOption {
  value: ExportFormat
  label: string
  description: string
  icon: typeof FileSpreadsheet
}

const FORMAT_OPTIONS: FormatOption[] = [
  {
    value: 'xlsx',
    label: 'Excel 工作簿',
    description: '每个主题一个工作表，含表头筛选',
    icon: FileSpreadsheet
  },
  { value: 'json', label: 'JSON', description: '结构化数据，方便程序解析', icon: FileJson },
  {
    value: 'txt',
    label: '纯文本',
    description: '人类可读，每条消息一个段落',
    icon: FileText
  }
]

const TIME_PRESET_LABEL: Record<TimePreset, string> = {
  all: '全部时间',
  '1h': '最近 1 小时',
  '24h': '最近 24 小时',
  '7d': '最近 7 天',
  '30d': '最近 30 天',
  custom: '自定义…'
}

const DIRECTION_OPTIONS: { value: ExportDirection; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'in', label: '接收' },
  { value: 'out', label: '发送' }
]

/** 数字输入 → 时间戳；解析失败返回 0 */
function parseDateInput(value: string, endOfDay = false): number {
  if (!value) return 0
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 0
  if (endOfDay) {
    date.setHours(23, 59, 59, 999)
  } else {
    date.setHours(0, 0, 0, 0)
  }
  return date.getTime()
}

function resolveTimeRange(preset: TimePreset, customFrom: string, customTo: string) {
  if (preset === 'custom') {
    return { from: parseDateInput(customFrom), to: parseDateInput(customTo, true) }
  }
  if (preset === 'all') return { from: 0, to: 0 }
  const now = Date.now()
  const hours = preset === '1h' ? 1 : preset === '24h' ? 24 : preset === '7d' ? 168 : 720
  return { from: now - hours * 3600 * 1000, to: 0 }
}

interface TopicStats {
  topic: string
  count: number
}

/**
 * 导出设置弹窗。
 *
 * 用法：在 useUiStore 设置 exportingConnectionId 即可打开，传 null 关闭。
 */
export function ExportDialog() {
  const exportingConnectionId = useUiStore((s) => s.exportingConnectionId)
  const close = useUiStore((s) => s.closeExportDialog)
  const connection = useConnectionStore((s) =>
    exportingConnectionId ? s.connections.find((c) => c.id === exportingConnectionId) ?? null : null
  )
  // 注意：selector 里禁止返回 `[]` 字面量（每次渲染产生新数组，Object.is 永远 false → 无限重渲染）。
  // 用模块级常量 EMPTY_MESSAGES 作为稳定兜底。
  const messages = useMessageStore((s) =>
    exportingConnectionId ? (s.messages[exportingConnectionId] ?? EMPTY_MESSAGES) : EMPTY_MESSAGES
  )

  // 重置每次打开的状态：用 dialog 本身的 open + key 实现
  const open = !!connection

  if (!connection) {
    return (
      <Dialog
        open={open}
        onOpenChange={(v) => {
          if (!v) close()
        }}
      >
        <DialogContent className="max-w-md" hideClose />
      </Dialog>
    )
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) close()
      }}
    >
      <DialogContent className="max-w-2xl">
        <ExportDialogBody key={connection.id} connectionName={connection.name} messages={messages} onClose={close} />
      </DialogContent>
    </Dialog>
  )
}

function ExportDialogBody({
  connectionName,
  messages,
  onClose
}: {
  connectionName: string
  messages: MqttMessage[]
  onClose: () => void
}) {
  const [format, setFormat] = useState<ExportFormat>('xlsx')
  const [direction, setDirection] = useState<ExportDirection>('all')
  const [useAllTopics, setUseAllTopics] = useState(true)
  const [selectedTopics, setSelectedTopics] = useState<Set<string>>(() => new Set())
  const [preset, setPreset] = useState<TimePreset>('all')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [groupByTopic, setGroupByTopic] = useState(true)
  const [splitDirection, setSplitDirection] = useState(false)
  const [exporting, setExporting] = useState(false)

  // 派生：每个主题在该方向 + 时间范围下的条数
  const topicStats = useMemo<TopicStats[]>(() => {
    const { from, to } = resolveTimeRange(preset, customFrom, customTo)
    const counts = new Map<string, number>()
    for (const m of messages) {
      if (direction !== 'all' && m.direction !== direction) continue
      if (from > 0 && m.timestamp < from) continue
      if (to > 0 && m.timestamp > to) continue
      counts.set(m.topic, (counts.get(m.topic) ?? 0) + 1)
    }
    return Array.from(counts.entries())
      .map(([topic, count]) => ({ topic, count }))
      .sort((a, b) => a.topic.localeCompare(b.topic))
  }, [messages, direction, preset, customFrom, customTo])

  // 主题列表以 stats 为准，避免给空消息显示一堆空主题
  const topicList = useMemo(() => topicStats.map((s) => s.topic), [topicStats])

  // 切换方向时，若变成单方向，自动关掉 splitDirection
  useEffect(() => {
    if (direction !== 'all' && splitDirection) setSplitDirection(false)
  }, [direction, splitDirection])

  // 切换到「全部主题」时把选中状态清空
  useEffect(() => {
    if (useAllTopics) setSelectedTopics(new Set())
  }, [useAllTopics])

  // 当主题列表变化（例如方向切了导致某些主题消失），把不存在的勾选去掉
  useEffect(() => {
    setSelectedTopics((prev) => {
      const next = new Set<string>()
      for (const t of prev) if (topicList.includes(t)) next.add(t)
      return next.size === prev.size ? prev : next
    })
  }, [topicList])

  const toggleTopic = (topic: string) => {
    setSelectedTopics((prev) => {
      const next = new Set(prev)
      if (next.has(topic)) next.delete(topic)
      else next.add(topic)
      return next
    })
  }

  // 实际参与导出的主题
  const effectiveTopics = useAllTopics ? [] : Array.from(selectedTopics)

  // 实时预览命中条数（与主进程共享同一段筛选逻辑）
  const previewCount = useMemo(() => {
    const { from, to } = resolveTimeRange(preset, customFrom, customTo)
    return filterExportMessages(messages, {
      direction,
      topics: effectiveTopics,
      from,
      to
    }).length
  }, [messages, direction, effectiveTopics, preset, customFrom, customTo])

  const canExport = previewCount > 0 && !exporting

  const handleExport = async () => {
    if (!canExport) return
    const { from, to } = resolveTimeRange(preset, customFrom, customTo)
    const connection = useConnectionStore.getState().connections.find(
      (c) => c.name === connectionName
    )
    const req: ExportRequest = {
      connectionId: connection?.id ?? '',
      connectionName,
      format,
      direction,
      topics: effectiveTopics,
      from,
      to,
      groupByTopic,
      splitDirection,
      messages
    }

    setExporting(true)
    try {
      const result = await window.api.exportMessages(req)
      if (!result.ok) {
        if (!result.canceled) toast.error(result.error ?? '导出失败')
        return
      }
      const stamp = formatExportStamp(Date.now())
      const filename = result.path?.split(/[\\/]/).pop() ?? `${sanitizeFileName(connectionName)}-${stamp}.${format}`
      toast.success(`已导出 ${result.count ?? previewCount} 条消息`, {
        description: filename,
        action: result.path
          ? {
              label: '打开位置',
              onClick: () => window.api.revealInFolder(result.path!)
            }
          : undefined
      })
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setExporting(false)
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Download className="h-4 w-4" />
          导出消息记录
        </DialogTitle>
        <DialogDescription className="truncate">连接：{connectionName} · 共 {messages.length} 条</DialogDescription>
      </DialogHeader>

      <div className="space-y-5">
        {/* 文件类型 */}
        <Section title="文件类型" icon={Download}>
          <div className="grid grid-cols-3 gap-2">
            {FORMAT_OPTIONS.map((opt) => {
              const Icon = opt.icon
              const active = format === opt.value
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setFormat(opt.value)}
                  className={cn(
                    'flex flex-col items-start gap-1 rounded-md border p-3 text-left transition-colors',
                    active
                      ? 'border-primary bg-primary/[0.06] ring-1 ring-primary'
                      : 'border-border hover:border-primary/40 hover:bg-accent/50'
                  )}
                >
                  <span className="flex items-center gap-1.5 text-sm font-medium">
                    <Icon className={cn('h-4 w-4', active ? 'text-primary' : 'text-muted-foreground')} />
                    {opt.label}
                  </span>
                  <span className="text-[11px] leading-tight text-muted-foreground">
                    {opt.description}
                  </span>
                </button>
              )
            })}
          </div>
        </Section>

        {/* 方向 + 组织方式 */}
        <div className="grid grid-cols-2 gap-4">
          <Section title="消息方向" icon={CheckCircle2}>
            <div className="flex rounded-md border p-0.5">
              {DIRECTION_OPTIONS.map((opt) => {
                const active = direction === opt.value
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setDirection(opt.value)}
                    className={cn(
                      'flex-1 rounded px-3 py-1 text-xs transition-colors',
                      active ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    {opt.label}
                  </button>
                )
              })}
            </div>
          </Section>

          <Section title="组织方式" icon={FileText}>
            <div className="space-y-2">
              <CheckboxLabel
                checked={groupByTopic}
                onChange={(v) => setGroupByTopic(v)}
                label="按主题分组"
                description={
                  format === 'xlsx'
                    ? '每个主题一个工作表'
                    : format === 'json'
                      ? '以 topics 为键分组输出'
                      : '每个主题一段独立章节'
                }
              />
              <CheckboxLabel
                checked={splitDirection && direction === 'all'}
                onChange={(v) => setSplitDirection(v)}
                disabled={direction !== 'all'}
                label="按方向分块"
                description={
                  direction === 'all'
                    ? '把接收与发送拆成独立的分组'
                    : '单方向模式下无需拆分'
                }
              />
            </div>
          </Section>
        </div>

        {/* 主题 */}
        <Section title="主题范围" icon={FileText} rightHint={`${topicList.length} 个主题`}>
          <div className="flex items-center gap-2">
            <CheckboxLabel
              checked={useAllTopics}
              onChange={setUseAllTopics}
              label="全部主题"
              description={topicList.length > 0 ? `共 ${topicList.length} 个` : '当前无主题'}
            />
          </div>

          {!useAllTopics && topicList.length > 0 && (
            <div className="mt-2 max-h-40 overflow-y-auto rounded-md border bg-muted/30 p-1">
              {topicList.map((topic) => {
                const count = topicStats.find((s) => s.topic === topic)?.count ?? 0
                const checked = selectedTopics.has(topic)
                return (
                  <label
                    key={topic}
                    className="flex cursor-pointer items-center justify-between gap-2 rounded px-2 py-1 text-xs hover:bg-accent/60"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() => toggleTopic(topic)}
                        className="h-3.5 w-3.5"
                      />
                      <span className="truncate font-mono text-[11px]">{topic}</span>
                    </span>
                    <Badge variant="muted" className="px-1 py-0 text-[10px] tabular-nums">
                      {count}
                    </Badge>
                  </label>
                )
              })}
            </div>
          )}

          {!useAllTopics && selectedTopics.size === 0 && (
            <p className="mt-2 text-[11px] text-warning">请至少勾选一个主题</p>
          )}
        </Section>

        {/* 时间范围 */}
        <Section title="时间范围" icon={Clock}>
          <div className="flex items-center gap-2">
            <Select value={preset} onValueChange={(v) => setPreset(v as TimePreset)}>
              <SelectTrigger className="h-9 w-44 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.entries(TIME_PRESET_LABEL) as [TimePreset, string][]).map(([k, v]) => (
                  <SelectItem key={k} value={k}>
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {preset === 'custom' && (
              <span className="flex flex-1 items-center gap-2">
                <Calendar className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <Input
                  type="datetime-local"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="h-9 text-xs"
                  aria-label="起始时间"
                />
                <span className="text-xs text-muted-foreground">至</span>
                <Input
                  type="datetime-local"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="h-9 text-xs"
                  aria-label="结束时间"
                />
              </span>
            )}
          </div>
          {preset === 'custom' && customFrom && customTo && parseDateInput(customTo) < parseDateInput(customFrom) && (
            <p className="mt-1 text-[11px] text-destructive">结束时间不能早于起始时间</p>
          )}
        </Section>
      </div>

      <DialogFooter className="mt-2 flex-row items-center justify-between sm:justify-between">
        <span className="text-xs text-muted-foreground">
          {previewCount > 0 ? (
            <>
              将导出{' '}
              <span className="font-medium text-foreground tabular-nums">{previewCount}</span> 条消息
              {previewCount > messages.length && (
                <span className="ml-1 text-warning">
                  （当前筛选条件匹配 {previewCount} 条）
                </span>
              )}
            </>
          ) : (
            <span className="text-warning">当前条件下没有可导出的消息</span>
          )}
        </span>
        <span className="flex gap-2">
          <Button variant="outline" onClick={onClose} disabled={exporting}>
            取消
          </Button>
          <Button onClick={handleExport} disabled={!canExport}>
            {exporting ? <Loader2 className="animate-spin" /> : <Download />}
            {exporting ? '导出中…' : '导出'}
          </Button>
        </span>
      </DialogFooter>
    </>
  )
}

function Section({
  title,
  icon: Icon,
  rightHint,
  children
}: {
  title: string
  icon: typeof CheckCircle2
  rightHint?: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Icon className="h-3.5 w-3.5" />
          {title}
        </Label>
        {rightHint && <span className="text-[11px] text-muted-foreground">{rightHint}</span>}
      </div>
      {children}
    </div>
  )
}

function CheckboxLabel({
  checked,
  onChange,
  disabled,
  label,
  description
}: {
  checked: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
  label: string
  description?: string
}) {
  return (
    <label
      className={cn(
        'flex cursor-pointer items-start gap-2 rounded-md border border-transparent px-2 py-1.5 transition-colors',
        !disabled && 'hover:bg-accent/40',
        disabled && 'cursor-not-allowed opacity-50'
      )}
    >
      <Checkbox
        checked={checked}
        onCheckedChange={(v) => onChange(v === true)}
        disabled={disabled}
        className="mt-0.5"
      />
      <span className="min-w-0">
        <span className="block text-xs font-medium">{label}</span>
        {description && <span className="block text-[11px] text-muted-foreground">{description}</span>}
      </span>
    </label>
  )
}