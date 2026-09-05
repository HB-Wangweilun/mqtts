/**
 * 导出相关的纯逻辑，主进程与渲染进程共用。
 *
 * 放在共享层是为了保证「弹窗里预览的条数」和「真正写进文件的条数」
 * 用的是同一套筛选规则，不会出现预览 100 条、导出 80 条这种偏差。
 */
import type { ExportDirection, MessageDirection, MqttMessage } from './types'

/** 筛选条件 */
export interface ExportFilterOptions {
  direction: ExportDirection
  /** 选中的主题；空数组表示全部主题 */
  topics: string[]
  /** 起始时间戳（含），0 表示不限 */
  from: number
  /** 结束时间戳（含），0 表示不限 */
  to: number
}

/** 分组方式 */
export interface ExportGroupOptions {
  groupByTopic: boolean
  splitDirection: boolean
  direction: ExportDirection
}

export interface ExportGroup {
  /** 分组标题，用于 xlsx 工作表名 / txt 段落标题 / json 标签 */
  label: string
  /** 该分组对应的主题，null 表示未分组 */
  topic: string | null
  /** 该分组对应的方向，null 表示未拆分方向 */
  direction: MessageDirection | null
  messages: MqttMessage[]
}

export function directionLabel(direction: MessageDirection | null): string {
  if (direction === 'in') return '接收'
  if (direction === 'out') return '发送'
  return '全部'
}

/** 按方向 / 主题 / 时间范围筛选消息 */
export function filterExportMessages(
  messages: MqttMessage[],
  opts: ExportFilterOptions
): MqttMessage[] {
  const topicSet = opts.topics.length > 0 ? new Set(opts.topics) : null
  return messages.filter((msg) => {
    if (opts.direction !== 'all' && msg.direction !== opts.direction) return false
    if (topicSet && !topicSet.has(msg.topic)) return false
    if (opts.from > 0 && msg.timestamp < opts.from) return false
    if (opts.to > 0 && msg.timestamp > opts.to) return false
    return true
  })
}

/**
 * 把消息切成若干分组。
 *
 * - 先按方向切（splitDirection 且 direction === 'all' 时切成 接收 / 发送）
 * - 再按主题切（groupByTopic 时每个主题一组，主题名按字典序稳定输出）
 * - 消息本身保持原始时序，不做重排
 */
export function buildExportGroups(
  messages: MqttMessage[],
  opts: ExportGroupOptions
): ExportGroup[] {
  const dirGroups: (MessageDirection | null)[] =
    opts.splitDirection && opts.direction === 'all'
      ? ['in', 'out']
      : [opts.direction === 'all' ? null : opts.direction]

  const groups: ExportGroup[] = []

  for (const dir of dirGroups) {
    const byDir = dir ? messages.filter((m) => m.direction === dir) : messages

    if (!opts.groupByTopic) {
      groups.push({
        label: dir ? directionLabel(dir) : '全部消息',
        topic: null,
        direction: dir,
        messages: byDir
      })
      continue
    }

    const topics = Array.from(new Set(byDir.map((m) => m.topic))).sort((a, b) =>
      a.localeCompare(b)
    )

    // 即使没有消息也保留一个空分组，避免用户导出后打开文件一片空白、怀疑没导出成功
    if (topics.length === 0) {
      groups.push({
        label: dir ? directionLabel(dir) : '全部消息',
        topic: null,
        direction: dir,
        messages: []
      })
      continue
    }

    for (const topic of topics) {
      groups.push({
        label: dir ? `${directionLabel(dir)} · ${topic}` : topic,
        topic,
        direction: dir,
        messages: byDir.filter((m) => m.topic === topic)
      })
    }
  }

  return groups
}

const pad = (n: number, width = 2) => String(n).padStart(width, '0')

/** 统一的时间格式：yyyy-MM-dd HH:mm:ss.SSS */
export function formatExportTimestamp(timestamp: number): string {
  const d = new Date(timestamp)
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.` +
    `${pad(d.getMilliseconds(), 3)}`
  )
}

/** 文件名用的时间戳：yyyyMMdd-HHmmss */
export function formatExportStamp(timestamp: number): string {
  const d = new Date(timestamp)
  return (
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
    `-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  )
}

/** 时间范围的人类可读描述 */
export function describeRange(from: number, to: number): string {
  if (from <= 0 && to <= 0) return '全部时间'
  if (from > 0 && to <= 0) return `${formatExportTimestamp(from)} 之后`
  if (from <= 0 && to > 0) return `${formatExportTimestamp(to)} 之前`
  return `${formatExportTimestamp(from)} ~ ${formatExportTimestamp(to)}`
}

/** 去掉 Windows / macOS 文件名不允许的字符 */
export function sanitizeFileName(name: string): string {
  return (
    name
      .replace(/[\\/:*?"<>|]/g, '_')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 60) || 'messages'
  )
}

const FORMAT_LABEL: Record<string, string> = {
  xlsx: 'Excel 工作簿 (*.xlsx)',
  json: 'JSON 数据 (*.json)',
  txt: '纯文本 (*.txt)'
}

export function formatLabel(format: string): string {
  return FORMAT_LABEL[format] ?? format
}
