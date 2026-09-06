import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { ErrorBoundary } from './components/ErrorBoundary'
import './index.css'

const root = document.getElementById('root')

/**
 * 关掉启动 loader —— index.html 里塞了一张占位（#app-loader），
 * 用 critical CSS 让 HTML 解析完就显示，避免可执行文件拉起到 React 首次 commit
 * 这一段 OS 亚克力/桌面色还没合成的窗口期里出现白屏。
 *
 * ⚠️ 关键：dismiss 时机绝不能在 main.tsx 里做！
 *
 * React 18+ 的 createRoot().render() 是**异步**的，commit 要等 React 渲染管线跑完。
 * 之前在 main.tsx 里两次 rAF 后立刻 dismiss，React 大概率还没把组件挂到 #root，
 * loader 透明度 1→0 的 260ms 里 body 是 transparent —— 用户看到的就是
 * "loader 渐隐的那几帧桌面 wallpaper 透过来" = 视觉上的白屏。
 *
 * 正确做法：让 App 组件在 React 真正 commit + painted 之后 + bootstrap 完成后
 * 自己去 dismiss loader。在 App.tsx 顶层 useEffect 里、绑定 store.loading 状态
 * （loading 从 true→false 时 loader 才淡出）。
 *
 * 这里 main.tsx 只留兜底：
 *  1. 3.5 秒还没被 React 接管就强制切换到 .al-stuck 降级提示并淡出
 *     （preload 挂掉/React 渲染失败时，用户不会对着静态 loader 干瞪眼）
 *  2. 监听 window 'error' 事件兜一道（防止 load 函数本身抛错时 loader 永驻）
 */
function dismissAppLoader() {
  const loader = document.getElementById('app-loader')
  if (!loader || loader.classList.contains('al-off')) return
  loader.classList.add('al-off')
  // 淡出动画结束后彻底从 DOM 摘掉，避免抢占点击/焦点
  const remove = () => {
    if (loader.parentNode) loader.parentNode.removeChild(loader)
  }
  loader.addEventListener('transitionend', remove, { once: true })
  // 兜底：万一 transitionend 没触发（CSS 没生效/被覆盖/被 reduced-motion 关掉），600ms 后也摘
  setTimeout(remove, 600)
}

function watchAppLoaderFallback() {
  // 3.5 秒还没被 React 接管就强制切换到兜底提示 + 淡出
  setTimeout(() => {
    const loader = document.getElementById('app-loader')
    if (loader && !loader.classList.contains('al-off')) {
      loader.classList.add('al-stuck')
      dismissAppLoader()
    }
  }, 3500)
}

// 启动 loader 兜底监听
watchAppLoaderFallback()

// 防 load 阶段抛错导致 loader 永驻：catch 后立即触发强制隐藏
window.addEventListener(
  'error',
  () => {
    const loader = document.getElementById('app-loader')
    if (loader && !loader.classList.contains('al-off')) {
      // 二次兜底：哪怕 React 渲染过程中抛错，也让用户看到错误提示而不是永驻 loader
      dismissAppLoader()
    }
  },
  { once: false }
)

if (!root) {
  // 渲染根不存在意味着 HTML 模板被改坏了——根本没法 mount，
  // 在控制台直接打出最显眼的错误（Electron 主进程的 console 会被记录）。
  console.error('[renderer] 找不到 #root 节点，HTML 模板异常')
  dismissAppLoader()
} else {
  // 这里不再调用 dismissAppLoader —— 真正的 dismiss 时机由 App.tsx 控制。
  // App 顶层 useEffect 会监听 useConnectionStore 的 loading 状态从 true→false
  // （即 bootstrap 完成），并在 store 渲染完毕后触发 loader 淡出，
  // 保证 loader 摘掉那一刻 #root 下已经有完整的 React 内容覆盖整屏，
  // 不会有"中间裸透明"的瞬间。
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </React.StrictMode>
  )
}
