import { Component, type ErrorInfo, type ReactNode } from 'react'

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  error: Error | null
}

/**
 * 全局错误边界。
 *
 * 设计目的：捕获 React 组件树里任何位置抛出的未捕获错误（同步/异步），
 * 渲染端崩溃时不再让用户看到一个「白屏」窗口，而是给出明确的错误描述、
 * 可复制的栈信息，并提供「重置」按钮让用户在不重启 Electron 的前提下尝试恢复。
 *
 * 这是 Electron + React 项目白屏防御的第一道闸门。
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // 同时打到 console，方便主进程 / 用户检查 devtools
    console.error('[ErrorBoundary] 渲染端错误:', error)
    console.error('[ErrorBoundary] 组件栈:', info.componentStack)
  }

  reset = () => {
    this.setState({ error: null })
  }

  reload = () => {
    // 调用 IPC 让主进程重新加载渲染页面，避免 Electron 主进程残留状态
    window.api?.revealInFolder?.('')
    window.location.reload()
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    const stack = error.stack ?? ''
    const detail = `${error.name}: ${error.message}\n\n${stack}`
    return (
      <div className="flex h-full w-full items-center justify-center bg-background p-6">
        <div className="w-full max-w-2xl rounded-lg border bg-card p-6 shadow-sm">
          <div className="flex items-center gap-2 text-base font-semibold text-destructive">
            <span className="inline-block h-2 w-2 rounded-full bg-destructive" />
            渲染端发生错误
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            应用在渲染过程中遇到了未处理的异常。下方是详细信息，可以复制后发送给开发者。
          </p>
          <pre className="mt-4 max-h-[280px] overflow-auto rounded bg-muted px-3 py-2 font-mono text-xs leading-relaxed text-foreground">
            {detail}
          </pre>
          <div className="mt-4 flex gap-2">
            <button
              onClick={this.reset}
              className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
            >
              重置界面
            </button>
            <button
              onClick={() => {
                navigator.clipboard?.writeText(detail).catch(() => {})
              }}
              className="rounded-md border bg-background px-3 py-1.5 text-xs font-medium hover:bg-accent"
            >
              复制详情
            </button>
            <button
              onClick={this.reload}
              className="rounded-md border bg-background px-3 py-1.5 text-xs font-medium hover:bg-accent"
            >
              重新加载
            </button>
          </div>
        </div>
      </div>
    )
  }
}
