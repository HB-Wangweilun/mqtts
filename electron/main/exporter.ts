/**
 * 消息导出：把筛选后的消息渲染成 xlsx / json / txt 三种格式的内容。
 *
 * 这里只负责「生成字节」，弹保存对话框和落盘在 index.ts，
 * 这样导出逻辑本身是可单测的纯函数。
 */
import ExcelJS from 'exceljs'
import type { ExportRequest, MqttMessage } from '@shared/types'
import {
  buildExportGroups,
  describeRange,
  directionLabel,
  filterExportMessages,
  formatExportTimestamp
} from '@shared/export'

/** Excel 单元格最多容纳 32767 个字符，超出的部分截断并标注 */
const MAX_CELL_LENGTH = 32000

/** Excel XML 不允许的控制字符 */
const INVALID_XML_CHARS = /[\x00-\x08\x0B\x0C\x0E-\x1F]/g

function safeText(text: string): string {
  const cleaned = String(text ?? '').replace(INVALID_XML_CHARS, '')
  if (cleaned.length <= MAX_CELL_LENGTH) return cleaned
  return cleaned.slice(0, MAX_CELL_LENGTH) + '…[内容过长已截断]'
}

/** Excel 工作表名限制：不超过 31 字符，且不能包含 : \ / ? * [ ] */
function safeSheetName(raw: string, used: Set<string>): string {
  const illegal = /[:\\/?*[\]]/g
  let name = String(raw ?? '').replace(illegal, '_').trim() || 'Sheet'
  if (name.length > 28) name = name.slice(0, 28) + '…'
  let candidate = name
  let index = 2
  while (used.has(candidate.toLowerCase())) {
    const suffix = `(${index})`
    candidate = name.slice(0, 31 - suffix.length) + suffix
    index += 1
  }
  used.add(candidate.toLowerCase())
  return candidate
}

export interface BuiltExport {
  content: Buffer
  /** 实际写入文件的消息条数（筛选后） */
  count: number
}

export async function buildExportContent(req: ExportRequest): Promise<BuiltExport> {
  const messages = filterExportMessages(req.messages, req)
  switch (req.format) {
    case 'xlsx':
      return { content: await buildXlsx(req, messages), count: messages.length }
    case 'json':
      return { content: Buffer.from(buildJson(req, messages), 'utf8'), count: messages.length }
    case 'txt':
      return { content: Buffer.from(buildTxt(req, messages), 'utf8'), count: messages.length }
  }
}

/* ------------------------------------------------------------------ */
/* XLSX                                                                */
/* ------------------------------------------------------------------ */

async function buildXlsx(req: ExportRequest, messages: MqttMessage[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'MQTTS'
  workbook.created = new Date()

  const groups = buildExportGroups(messages, req)
  const used = new Set<string>()

  for (const group of groups) {
    const sheet = workbook.addWorksheet(safeSheetName(group.label, used))
    fillSheet(sheet, group.messages)
  }

  const buffer = await workbook.xlsx.writeBuffer()
  return Buffer.from(buffer as ArrayBuffer)
}

function fillSheet(sheet: ExcelJS.Worksheet, messages: MqttMessage[]) {
  sheet.columns = [
    { header: '序号', key: 'index', width: 8 },
    { header: '时间', key: 'time', width: 24 },
    { header: '方向', key: 'direction', width: 8 },
    { header: '主题', key: 'topic', width: 36 },
    { header: 'QoS', key: 'qos', width: 6 },
    { header: '保留', key: 'retain', width: 6 },
    { header: '内容', key: 'payload', width: 90 }
  ]

  const header = sheet.getRow(1)
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } }
  header.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF3B6EF6' }
  }
  header.alignment = { vertical: 'middle', horizontal: 'center' }
  header.height = 20

  // 冻结表头 + 自动筛选，方便在 Excel 里直接按主题/方向过滤
  sheet.views = [{ state: 'frozen', ySplit: 1 }]
  if (messages.length > 0) {
    sheet.autoFilter = { from: 'A1', to: `G1` }
  }

  const payloadCol = sheet.getColumn('payload')
  payloadCol.alignment = { wrapText: false, vertical: 'top' }

  messages.forEach((msg, i) => {
    const row = sheet.addRow({
      index: i + 1,
      time: formatExportTimestamp(msg.timestamp),
      direction: directionLabel(msg.direction),
      topic: safeText(msg.topic),
      qos: msg.qos,
      retain: msg.retain ? '是' : '',
      payload: safeText(msg.payload)
    })
    // 接收 / 发送 用不同字色，扫一眼就能区分
    row.getCell('direction').font = {
      color: { argb: msg.direction === 'in' ? 'FF1D4ED8' : 'FF15803D' }
    }
  })
}

/* ------------------------------------------------------------------ */
/* JSON                                                               */
/* ------------------------------------------------------------------ */

interface JsonMessage {
  time: string
  timestamp: number
  direction: 'in' | 'out'
  directionLabel: string
  topic: string
  qos: number
  retain: boolean
  payload: string
}

function toJsonMessage(msg: MqttMessage): JsonMessage {
  return {
    time: formatExportTimestamp(msg.timestamp),
    timestamp: msg.timestamp,
    direction: msg.direction,
    directionLabel: directionLabel(msg.direction),
    topic: msg.topic,
    qos: msg.qos,
    retain: msg.retain,
    payload: msg.payload
  }
}

function buildJson(req: ExportRequest, messages: MqttMessage[]): string {
  const base = {
    connection: req.connectionName,
    connectionId: req.connectionId,
    exportedAt: formatExportTimestamp(Date.now()),
    range: describeRange(req.from, req.to),
    direction: directionLabel(req.direction === 'all' ? null : req.direction),
    groupByTopic: req.groupByTopic,
    splitDirection: req.splitDirection,
    total: messages.length
  }

  const groups = buildExportGroups(messages, req)

  // 未分组时输出扁平数组，最方便被其他程序消费；分组时输出 groups 结构
  if (!req.groupByTopic && !(req.splitDirection && req.direction === 'all')) {
    return JSON.stringify({ ...base, messages: messages.map(toJsonMessage) }, null, 2)
  }

  return JSON.stringify(
    {
      ...base,
      groups: groups.map((group) => ({
        label: group.label,
        topic: group.topic,
        direction: group.direction,
        directionLabel: directionLabel(group.direction),
        count: group.messages.length,
        messages: group.messages.map(toJsonMessage)
      }))
    },
    null,
    2
  )
}

/* ------------------------------------------------------------------ */
/* TXT                                                                */
/* ------------------------------------------------------------------ */

function buildTxt(req: ExportRequest, messages: MqttMessage[]): string {
  const lines: string[] = []
  const line = '='.repeat(72)

  lines.push('MQTTS 消息导出')
  lines.push(`连接：${req.connectionName}`)
  lines.push(`导出时间：${formatExportTimestamp(Date.now())}`)
  lines.push(`时间范围：${describeRange(req.from, req.to)}`)
  lines.push(`方向：${directionLabel(req.direction === 'all' ? null : req.direction)}`)
  lines.push(`共 ${messages.length} 条`)
  lines.push('')

  const groups = buildExportGroups(messages, req)

  for (const group of groups) {
    lines.push(line)
    lines.push(`【${group.label}】 ${group.messages.length} 条`)
    lines.push(line)

    if (group.messages.length === 0) {
      lines.push('（无消息）')
      lines.push('')
      continue
    }

    group.messages.forEach((msg, i) => {
      lines.push(
        `#${String(i + 1).padStart(4, '0')}  [${formatExportTimestamp(msg.timestamp)}]  ` +
          `${msg.direction === 'in' ? '↓ 接收' : '↑ 发送'}  QoS ${msg.qos}` +
          `${msg.retain ? '  [保留]' : ''}`
      )
      lines.push(`主题：${msg.topic}`)
      lines.push('内容：')
      lines.push(msg.payload)
      lines.push('-'.repeat(72))
    })
    lines.push('')
  }

  return lines.join('\n')
}
