import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { ErrorBoundary } from './components/ErrorBoundary'
import './index.css'

const root = document.getElementById('root')

if (!root) {
  // 渲染根不存在意味着 HTML 模板被改坏了——根本没法 mount，
  // 在控制台直接打出最显眼的错误（Electron 主进程的 console 会被记录）。
  console.error('[renderer] 找不到 #root 节点，HTML 模板异常')
} else {
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </React.StrictMode>
  )
}
