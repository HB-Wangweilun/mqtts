import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import type { ConnectionConfig } from '@shared/types'

const DATA_FILE = 'connections.json'

function getDataPath(): string {
  return path.join(app.getPath('userData'), DATA_FILE)
}

/** 读取持久化的连接配置，失败时返回空数组，绝不因脏数据导致应用崩溃 */
export function loadConnections(): ConnectionConfig[] {
  try {
    const file = getDataPath()
    if (!fs.existsSync(file)) return []
    const raw = fs.readFileSync(file, 'utf-8')
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item): item is ConnectionConfig => !!item && typeof item.id === 'string')
  } catch (err) {
    console.error('[store] 读取连接配置失败:', err)
    return []
  }
}

/** 写入连接配置 */
export function saveConnections(list: ConnectionConfig[]): void {
  try {
    const file = getDataPath()
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, JSON.stringify(list, null, 2), 'utf-8')
  } catch (err) {
    console.error('[store] 写入连接配置失败:', err)
  }
}
