import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ConnectionConfig } from '@shared/types'

export type Theme = 'light' | 'dark'

interface UiState {
  theme: Theme
  /** 连接编辑弹窗：null 表示关闭，'new' 表示新建，否则为编辑中的连接对象 */
  editingConnection: ConnectionConfig | 'new' | null
  /** 侧边栏是否折叠 */
  sidebarCollapsed: boolean
  /** 当前打开「导出消息记录」弹窗的连接 id */
  exportingConnectionId: string | null
  setTheme: (theme: Theme) => void
  toggleTheme: () => void
  openConnectionDialog: (target: ConnectionConfig | 'new') => void
  closeConnectionDialog: () => void
  setSidebarCollapsed: (collapsed: boolean) => void
  openExportDialog: (connectionId: string) => void
  closeExportDialog: () => void
}

function applyTheme(theme: Theme) {
  const root = document.documentElement
  root.classList.toggle('dark', theme === 'dark')
  root.style.colorScheme = theme
}

export const useUiStore = create<UiState>()(
  persist(
    (set, get) => ({
      theme: 'light',
      editingConnection: null,
      sidebarCollapsed: false,
      exportingConnectionId: null,

      setTheme: (theme) => {
        applyTheme(theme)
        set({ theme })
      },
      toggleTheme: () => {
        const next: Theme = get().theme === 'light' ? 'dark' : 'light'
        applyTheme(next)
        set({ theme: next })
      },
      openConnectionDialog: (target) => set({ editingConnection: target }),
      closeConnectionDialog: () => set({ editingConnection: null }),
      setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
      openExportDialog: (connectionId) => set({ exportingConnectionId: connectionId }),
      closeExportDialog: () => set({ exportingConnectionId: null })
    }),
    {
      name: 'mqtts-ui',
      partialize: (state) => ({ theme: state.theme, sidebarCollapsed: state.sidebarCollapsed }),
      onRehydrateStorage: () => (state) => {
        if (state) applyTheme(state.theme)
      }
    }
  )
)
