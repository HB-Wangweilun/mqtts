/// <reference types="vite/client" />

declare namespace NodeJS {
  interface ProcessEnv {
    /** electron-vite 注入的渲染进程开发服务器地址 */
    ELECTRON_RENDERER_URL?: string
    ELECTRON_RENDERER_PORT?: string
  }
}
