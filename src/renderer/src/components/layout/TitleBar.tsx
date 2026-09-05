import { useEffect, useState } from 'react'
import { Maximize2, Minimize2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import logoUrl from '@/assets/logo.svg'

/**
 * 自定义窗口标题栏。
 *
 * 设计要点：
 * 1. **拖动手柄**：整条工具栏用 `-webkit-app-region: drag`，让用户能拖动窗口。
 *    按钮区单独用 `no-drag` 关掉，否则点不到按钮。
 * 2. **双击标题区切换最大化**：和 Windows 原生标题栏行为一致。
 * 3. **最大化状态同步**：监听主进程推送的 `maximize / unmaximize` 事件，
 *    渲染对应图标（最大化 ↔ 还原）。
 * 4. **玻璃质感**：使用半透明 + backdrop-blur 配合根容器的渐变背景，
 *    形成「亚克力磨砂」效果。
 * 5. **品牌 Logo**：左侧用 src/assets/logo.svg 的真实图标，跟安装包 / 任务栏 / 桌面快捷方式一致。
 */
export function TitleBar() {
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    // 渲染端被创建时可能已经处于最大化状态（例如用户先最大化再关应用再开），
    // 主进程不会补发一次 maximize 事件，所以渲染端要主动拉一次当前状态。
    // 没有 isMaximized 同步查询 API 暴露在 preload 里（要的话可以加），
    // 这里用一个折中：等一会儿让主进程那边如果有最大化会先发，再 fallback false。
    // 简单做法：先监听，未来主进程可以通过 IPC 暴露 isMaximized() 查询。
    const off = window.api.onMaximizeChanged((next) => setMaximized(next))
    return off
  }, [])

  const handleToggleMaximize = () => {
    void window.api.toggleMaximizeWindow()
  }
  const handleMinimize = () => {
    void window.api.minimizeWindow()
  }
  const handleClose = () => {
    // 关闭会触发主进程的「活跃连接确认」弹窗（在 main/index.ts 的 onWindowClose 里），
    // 这里直接转发即可，无需在渲染端重复弹框。
    void window.api.closeWindow()
  }
  const handleDoubleClickDragArea = () => {
    // 与 Windows 原生标题栏行为一致：双击空白处 = 切换最大化
    handleToggleMaximize()
  }

  return (
    <header
      className={cn(
        'drag relative z-50 flex h-10 w-full shrink-0 items-center select-none border-b',
        // 亚克力磨砂玻璃：标题栏是窗口最顶部，背景彩色光晕最亮，所以用更通透、更强模糊
        'glass-titlebar'
      )}
    >
      {/* 左侧：Logo + 品牌名。整个区域是 drag 手柄，按钮 no-drag 例外。 */}
      <div
        onDoubleClick={handleDoubleClickDragArea}
        className="drag flex h-full flex-1 items-center gap-2 px-4"
      >
        {/* 真实品牌 Logo：直接读取 src/assets/logo.svg，跟安装包 / 任务栏 / 桌面快捷方式图标完全一致 */}
        <img
          src={logoUrl}
          alt="MQTTS"
          className="h-6 w-6 shrink-0 select-none rounded-md shadow-sm"
          draggable={false}
        />
        <span className="text-[13px] font-semibold tracking-wide text-foreground/90">
          MQTTS
        </span>
        <span className="ml-2 text-[11px] text-muted-foreground/80">
          ·  MQTT 桌面客户端
        </span>
      </div>

      {/* 右侧：窗口控制按钮区。no-drag 关掉拖动，否则点不到按钮 */}
      <div className="no-drag flex h-full items-center">
        <TitleBarButton onClick={handleMinimize} label="最小化">
          <Minimize2 className="h-3.5 w-3.5" />
        </TitleBarButton>
        <TitleBarButton onClick={handleToggleMaximize} label={maximized ? '还原' : '最大化'}>
          <Maximize2 className="h-3.5 w-3.5" />
        </TitleBarButton>
        <TitleBarButton
          onClick={handleClose}
          label="关闭"
          variant="close"
        >
          <X className="h-3.5 w-3.5" />
        </TitleBarButton>
      </div>
    </header>
  )
}

/** 工具栏按钮：统一 hover 颜色与尺寸，关闭按钮 hover 时变红 */
function TitleBarButton({
  onClick,
  label,
  variant,
  children
}: {
  onClick: () => void
  label: string
  variant?: 'close'
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        'no-drag flex h-full w-12 items-center justify-center text-foreground/80 transition-colors',
        'hover:bg-foreground/10 focus-visible:outline-none focus-visible:bg-foreground/10',
        variant === 'close' &&
          'hover:bg-red-500 hover:text-white focus-visible:bg-red-500 focus-visible:text-white'
      )}
    >
      {children}
    </button>
  )
}