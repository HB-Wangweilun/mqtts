import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import {
  Copy,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plug,
  PlugZap,
  Plus,
  Search,
  Settings,
  Trash2,
  X
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { StatusDot, statusTextClass } from './StatusDot'
import { useConnectionStore } from '@/store/useConnectionStore'
import { useUiStore } from '@/store/useUiStore'
import { useMessageStore } from '@/store/useMessageStore'
import { cn } from '@/lib/utils'
import type { ConnectionConfig } from '@shared/types'

export function ConnectionSidebar() {
  const connections = useConnectionStore((s) => s.connections)
  const statuses = useConnectionStore((s) => s.statuses)
  const attempts = useConnectionStore((s) => s.attempts)
  const activeId = useConnectionStore((s) => s.activeId)
  const setActive = useConnectionStore((s) => s.setActive)
  const connect = useConnectionStore((s) => s.connect)
  const disconnect = useConnectionStore((s) => s.disconnect)
  const remove = useConnectionStore((s) => s.remove)
  const duplicate = useConnectionStore((s) => s.duplicate)
  const openDialog = useUiStore((s) => s.openConnectionDialog)
  const messages = useMessageStore((s) => s.messages)

  const [keyword, setKeyword] = useState('')
  // 待删除的连接：用应用内确认弹窗代替 window.confirm。
  // window.confirm 在 Electron 中是同步原生模态框，会阻塞渲染进程，
  // 关闭后窗口常无法正确取回键盘焦点 —— 表现就是"鼠标能点、键盘敲不进字"。
  const [pendingDelete, setPendingDelete] = useState<ConnectionConfig | null>(null)

  const confirmDelete = async () => {
    const item = pendingDelete
    if (!item) return
    setPendingDelete(null)
    await remove(item.id)
    toast.success('连接已删除')
  }

  const list = useMemo(() => {
    const kw = keyword.trim().toLowerCase()
    if (!kw) return connections
    return connections.filter(
      (c) =>
        c.name.toLowerCase().includes(kw) ||
        c.host.toLowerCase().includes(kw) ||
        String(c.port).includes(kw)
    )
  }, [connections, keyword])

  const connectedCount = useMemo(
    () => Object.values(statuses).filter((s) => s === 'connected').length,
    [statuses]
  )

  return (
    <aside className="glass-panel flex h-full w-[272px] shrink-0 flex-col">
      {/* 头部：仅保留「新建连接」快捷入口。
        * Logo + 品牌名已经搬到顶部 TitleBar，侧边栏不必重复。 */}
      <div className="flex h-12 items-center justify-between gap-2 px-3">
        <div className="text-xs font-medium text-muted-foreground">
          {connectedCount} / {connections.length} 已连接
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button size="icon-sm" onClick={() => openDialog('new')}>
              <Plus />
            </Button>
          </TooltipTrigger>
          <TooltipContent>新建连接</TooltipContent>
        </Tooltip>
      </div>

      <Separator className="bg-border/60" />

      {/* 搜索 */}
      <div className="p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="搜索连接"
            className="h-8 pl-8 text-xs"
          />
        </div>
      </div>

      {/* 连接列表 */}
      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {list.length === 0 && (
          <div className="px-2 py-10 text-center text-xs text-muted-foreground">
            {keyword ? '没有匹配的连接' : '还没有连接，点击上方 + 新建'}
          </div>
        )}

        <AnimatePresence initial={false}>
          {list.map((item) => (
            <ConnectionItem
              key={item.id}
              config={item}
              active={item.id === activeId}
              status={statuses[item.id] ?? 'disconnected'}
              attempt={attempts[item.id] ?? 0}
              unread={(messages[item.id] ?? []).length}
              onSelect={() => setActive(item.id)}
              onToggle={async (e) => {
                e.stopPropagation()
                // 重连中点击即中止重试
                const st = statuses[item.id]
                if (st === 'connected' || st === 'reconnecting') await disconnect(item.id)
                else await connect(item.id)
              }}
              onEdit={() => openDialog(item)}
              onDuplicate={() => duplicate(item.id)}
              onDelete={() => setPendingDelete(item)}
            />
          ))}
        </AnimatePresence>
      </div>

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(next) => {
          if (!next) setPendingDelete(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除连接</AlertDialogTitle>
            <AlertDialogDescription>
              确定删除连接「{pendingDelete?.name}」？该操作不可恢复。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel asChild>
              <Button variant="outline">取消</Button>
            </AlertDialogCancel>
            <AlertDialogAction asChild>
              <Button variant="destructive" onClick={confirmDelete}>
                删除
              </Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </aside>
  )
}

function ConnectionItem({
  config,
  active,
  status,
  attempt,
  unread,
  onSelect,
  onToggle,
  onEdit,
  onDuplicate,
  onDelete
}: {
  config: ConnectionConfig
  active: boolean
  status: ReturnType<typeof useConnectionStore.getState>['statuses'][string]
  attempt: number
  unread: number
  onSelect: () => void
  onToggle: (e: React.MouseEvent) => void
  onEdit: () => void
  onDuplicate: () => void
  onDelete: () => void
}) {
  const connected = status === 'connected'
  const reconnecting = status === 'reconnecting'
  const connecting = status === 'connecting'
  // 仅握手阶段禁用；reconnecting 保持可点，用于中止自动重连
  const busy = connecting

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.16 }}
    >
      <div
        onClick={onSelect}
        className={cn(
          'group relative mb-1 cursor-pointer rounded-lg border px-3 py-2.5 transition-colors',
          active
            ? 'border-primary/40 bg-primary/[0.07]'
            : 'border-transparent hover:bg-accent/60'
        )}
      >
        {active && (
          <motion.span
            layoutId="active-connection-indicator"
            className="absolute left-0 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-r-full bg-primary"
          />
        )}

        <div className="flex items-start gap-2">
          <StatusDot status={status} className="mt-1.5" withPulse />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="truncate text-sm font-medium">{config.name}</span>
              {config.subscriptions.length > 0 && (
                <span className="shrink-0 rounded bg-muted px-1 text-[10px] text-muted-foreground">
                  {config.subscriptions.length}
                </span>
              )}
            </div>
            <div className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">
              {config.protocol}://{config.host}:{config.port}
            </div>
            <div
              className={cn(
                'mt-0.5 flex items-center gap-1 text-[11px]',
                statusTextClass(status)
              )}
            >
              {connecting && <Loader2 className="h-3 w-3 animate-spin shrink-0" />}
              {reconnecting && <Loader2 className="h-3 w-3 animate-spin shrink-0" />}
              <span>
                {status === 'disconnected' && '未连接'}
                {status === 'connecting' && '连接中…'}
                {status === 'connected' && `已连接 · ${unread} 条消息`}
                {status === 'reconnecting' &&
                  (attempt > 0 ? `重连中（第 ${attempt} 次）` : '重连中…')}
                {status === 'error' && '连接错误'}
              </span>
            </div>
          </div>

          {/* 悬停操作 */}
          <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon-xs"
                  variant={reconnecting ? 'destructive' : 'ghost'}
                  disabled={busy}
                  onClick={(e) => {
                    e.stopPropagation()
                    onToggle(e)
                  }}
                >
                  {reconnecting ? <X /> : connected ? <PlugZap /> : <Plug />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {reconnecting ? '取消重连' : connected ? '断开' : '连接'}
              </TooltipContent>
            </Tooltip>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="icon-xs"
                  variant="ghost"
                  onClick={(e) => e.stopPropagation()}
                >
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                <DropdownMenuItem onSelect={onEdit}>
                  <Settings />
                  编辑
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={onDuplicate}>
                  <Copy />
                  复制
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onSelect={onDelete}>
                  <Trash2 />
                  删除
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
    </motion.div>
  )
}
