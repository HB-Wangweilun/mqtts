import { create } from 'zustand'
import type { MqttMessage } from '@shared/types'
import { MAX_MESSAGES_PER_CONNECTION } from './useConnectionStore'

interface MessageState {
  /** 按连接 id 分组存储消息 */
  messages: Record<string, MqttMessage[]>
  selectedMessageId: string | null
  /** 仅显示某个主题的消息，null 表示全部 */
  topicFilter: string | null
  /** 仅显示某个方向 */
  directionFilter: 'all' | 'in' | 'out'
  /** 关键字搜索 */
  keyword: string

  addMessage: (message: MqttMessage) => void
  clear: (connectionId: string) => void
  select: (id: string | null) => void
  setTopicFilter: (topic: string | null) => void
  setDirectionFilter: (direction: 'all' | 'in' | 'out') => void
  setKeyword: (keyword: string) => void
}

export const useMessageStore = create<MessageState>()((set) => ({
  messages: {},
  selectedMessageId: null,
  topicFilter: null,
  directionFilter: 'all',
  keyword: '',

  addMessage: (message) =>
    set((state) => {
      const list = state.messages[message.connectionId] ?? []
      const next = [...list, message]
      // 超出上限时裁剪，避免长时间运行导致内存膨胀
      const trimmed =
        next.length > MAX_MESSAGES_PER_CONNECTION
          ? next.slice(next.length - MAX_MESSAGES_PER_CONNECTION)
          : next
      return { messages: { ...state.messages, [message.connectionId]: trimmed } }
    }),

  clear: (connectionId) =>
    set((state) => ({
      messages: { ...state.messages, [connectionId]: [] },
      selectedMessageId: null
    })),

  select: (id) => set({ selectedMessageId: id }),
  setTopicFilter: (topic) => set({ topicFilter: topic }),
  setDirectionFilter: (direction) => set({ directionFilter: direction }),
  setKeyword: (keyword) => set({ keyword })
}))

/** 从列表中筛选消息 */
export function filterMessages(
  list: MqttMessage[],
  opts: { topic: string | null; direction: 'all' | 'in' | 'out'; keyword: string }
): MqttMessage[] {
  const keyword = opts.keyword.trim().toLowerCase()
  return list.filter((msg) => {
    if (opts.topic && msg.topic !== opts.topic) return false
    if (opts.direction !== 'all' && msg.direction !== opts.direction) return false
    if (keyword) {
      const hay = `${msg.topic}\n${msg.payload}`.toLowerCase()
      if (!hay.includes(keyword)) return false
    }
    return true
  })
}

/** 判断 MQTT 主题是否匹配订阅过滤器（支持 + 与 #） */
export function topicMatch(filter: string, topic: string): boolean {
  const f = filter.split('/')
  const t = topic.split('/')
  for (let i = 0; i < f.length; i++) {
    const part = f[i]
    if (part === '#') return true
    if (i >= t.length) return false
    if (part === '+') continue
    if (part !== t[i]) return false
  }
  return f.length === t.length
}
