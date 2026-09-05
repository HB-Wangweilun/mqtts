import { useEffect, useState } from 'react'
import { motion } from 'motion/react'
import { Plus, Radio } from 'lucide-react'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Button } from '@/components/ui/button'
import { TitleBar } from '@/components/layout/TitleBar'
import { ConnectionSidebar } from '@/components/connections/ConnectionSidebar'
import { ConnectionFormDialog } from '@/components/connections/ConnectionFormDialog'
import { ConnectionHeader } from '@/components/workbench/ConnectionHeader'
import { SubscriptionPanel } from '@/components/workbench/SubscriptionPanel'
import { MessageList } from '@/components/workbench/MessageList'
import { MessageDetail } from '@/components/workbench/MessageDetail'
import { PublishPanel } from '@/components/workbench/PublishPanel'
import { ExportDialog } from '@/components/workbench/ExportDialog'
import { useConnectionStore } from '@/store/useConnectionStore'
import { useMessageStore } from '@/store/useMessageStore'
import { useUiStore } from '@/store/useUiStore'

export default function App() {
  const bootstrap = useConnectionStore((s) => s.bootstrap)
  const connections = useConnectionStore((s) => s.connections)
  const activeId = useConnectionStore((s) => s.activeId)
  const loading = useConnectionStore((s) => s.loading)
  const setActive = useConnectionStore((s) => s.setActive)
  const applyStatus = useConnectionStore((s) => s.applyStatus)
  const applyServerConnections = useConnectionStore((s) => s.applyServerConnections)
  const removeSubscriptionFromState = useConnectionStore((s) => s.removeSubscriptionFromState)
  const addMessage = useMessageStore((s) => s.addMessage)
  const openDialog = useUiStore((s) => s.openConnectionDialog)

  // 如果「正在加载…」一直挂住（典型原因：主进程 IPC handler 没挂上 / preload 异步 API 拿不到），
  // 6 秒后给用户一个明显的兜底提示，而不是让窗口永远停在「正在加载连接…」。
  const [loadStuck, setLoadStuck] = useState(false)
  useEffect(() => {
    if (!loading) {
      setLoadStuck(false)
      return
    }
    const timer = setTimeout(() => setLoadStuck(true), 6000)
    return () => clearTimeout(timer)
  }, [loading])

  // preload 没挂上时 window.api 就是 undefined。
  // 这种情况通常是 preload 文件路径配置错误或被恶意替换，让用户先看到一个明确提示，
  // 避免整个 React 树炸成一面白屏。
  if (typeof window === 'undefined' || !window.api) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-background p-6">
        <div className="w-full max-w-md rounded-lg border bg-card p-6 text-center shadow-sm">
          <div className="text-base font-semibold text-destructive">预加载脚本未挂载</div>
          <p className="mt-2 text-sm text-muted-foreground">
            未能检测到 <code className="rounded bg-muted px-1 font-mono text-xs">window.api</code>。
            这通常意味着 Electron preload 没有正常加载，常见原因：
          </p>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-left text-xs text-muted-foreground">
            <li>主进程配置里 preload 路径写错</li>
            <li>重新构建后没有重启 dev server</li>
            <li>preload 内部抛错导致 contextBridge 没调用成功</li>
          </ul>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 rounded-md bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
          >
            重新加载
          </button>
        </div>
      </div>
    )
  }

  // 初始化：读取连接配置
  useEffect(() => {
    bootstrap()
  }, [bootstrap])

  // 订阅主进程推送的事件
  useEffect(() => {
    const offStatus = window.api.onStatusChanged((payload) => {
      // 用 applyStatus 把 attempt / lastError 等扩展字段一并处理，
      // 这样重连次数和首次错误能落到 UI 上，否则用户只看到「重连中」三个字。
      applyStatus(payload)
    })
    const offMessage = window.api.onMessage((message) => addMessage(message))
    const offSub = window.api.onSubscriptionChanged(({ id, topic, qos, action }) => {
      if (action === 'unsubscribe') removeSubscriptionFromState(id, topic)
      else {
        // 订阅已在 store 内维护，这里仅兜底同步服务端状态
        const store = useConnectionStore.getState()
        const config = store.connections.find((c) => c.id === id)
        if (config && !config.subscriptions.some((s) => s.topic === topic)) {
          store.addSubscriptionToState(id, topic, qos)
        }
      }
    })

    return () => {
      offStatus()
      offMessage()
      offSub()
    }
  }, [applyStatus, addMessage, removeSubscriptionFromState])

  // 主进程连接列表变化时同步（例如删除操作由其它入口触发）
  useEffect(() => {
    const handler = () => {
      window.api.listConnections().then((list) => {
        applyServerConnections(list)
        if (!activeId && list.length) setActive(list[0].id)
      })
    }
    window.addEventListener('focus', handler)
    return () => window.removeEventListener('focus', handler)
  }, [activeId, setActive, applyServerConnections])

  const active = connections.find((item) => item.id === activeId) ?? null

  return (
    <TooltipProvider delayDuration={300}>
      {/* 两层结构让窗口"圆角化"：
        *  - 外层 wrapper 撑满整个 BrowserWindow（bg 透明，接收事件）
        *  - 面板直接铺满窗口，圆角由系统 roundedCorners 负责（Win11 亚克力）
        *  - 不预留间隙：亚克力若在面板外透出会形成一道偏亮的"边框"，去掉它 */} 
      <div className="flex h-full w-full flex-col bg-transparent">
        <div className="glass-shell flex h-full w-full flex-col overflow-hidden">
          <TitleBar />

          <div className="flex min-h-0 flex-1 gap-2 p-2">
            <ConnectionSidebar />

            <main className="flex min-w-0 flex-1 flex-col gap-2">
              {loading ? (
                <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
                  正在加载连接…
                  {loadStuck && (
                    <div className="mt-4 max-w-sm rounded-md border bg-card p-4 text-xs text-muted-foreground">
                      <div className="font-medium text-foreground">
                        加载超过 6 秒，可能是主进程没有响应
                      </div>
                      <p className="mt-2 leading-relaxed">
                        通常意味着 IPC 通道不可用。点击下方按钮尝试重新连接，或重启应用后再尝试。
                      </p>
                      <button
                        onClick={() => {
                          useConnectionStore.getState().bootstrap().catch(() => {})
                        }}
                        className="mt-3 rounded-md bg-primary px-3 py-1 text-primary-foreground hover:bg-primary/90"
                      >
                        重新加载连接列表
                      </button>
                    </div>
                  )}
                </div>
              ) : active ? (
                <div key={active.id} className="flex h-full min-h-0 flex-col gap-2">
                  <ConnectionHeader config={active} />
                  <div className="flex min-h-0 flex-1 gap-2">
                    <SubscriptionPanel config={active} />
                    <div className="flex min-w-0 flex-1 flex-col gap-2">
                      <MessageList config={active} />
                      <PublishPanel config={active} />
                    </div>
                    <MessageDetail config={active} />
                  </div>
                </div>
              ) : (
                <EmptyState onCreate={() => openDialog('new')} />
              )}
            </main>
          </div>
        </div>

        <ConnectionFormDialog />
        <ExportDialog />
      </div>
      <Toaster />
    </TooltipProvider>
  )
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex h-full flex-col items-center justify-center gap-4"
    >
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
        <Radio className="h-7 w-7 text-muted-foreground" />
      </div>
      <div className="text-center">
        <div className="text-sm font-medium">还没有选择连接</div>
        <div className="mt-1 text-xs text-muted-foreground">
          新建一条连接，开始订阅主题并收发消息
        </div>
      </div>
      <Button onClick={onCreate}>
        <Plus />
        新建连接
      </Button>
    </motion.div>
  )
}
