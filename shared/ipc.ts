/** IPC 频道常量，主进程与预加载脚本共用 */
export const IPC = {
  LIST_CONNECTIONS: 'conn:list',
  SAVE_CONNECTION: 'conn:save',
  REMOVE_CONNECTION: 'conn:remove',
  DUPLICATE_CONNECTION: 'conn:duplicate',

  CONNECT: 'mqtt:connect',
  DISCONNECT: 'mqtt:disconnect',
  SUBSCRIBE: 'mqtt:subscribe',
  UNSUBSCRIBE: 'mqtt:unsubscribe',
  PUBLISH: 'mqtt:publish',

  STATUS_CHANGED: 'mqtt:status-changed',
  MESSAGE: 'mqtt:message',
  SUBSCRIPTION_CHANGED: 'mqtt:subscription-changed',
  ERROR: 'mqtt:error',

  EXPORT_MESSAGES: 'export:messages',
  REVEAL_IN_FOLDER: 'export:reveal',

  /** 自定义标题栏：最小化 / 切换最大化 / 关闭 */
  WINDOW_MINIMIZE: 'window:minimize',
  WINDOW_MAXIMIZE: 'window:maximize',
  WINDOW_CLOSE: 'window:close',
  /** 主进程主动通知渲染端最大化状态变化（用于切换按钮图标） */
  WINDOW_MAXIMIZE_CHANGED: 'window:maximize-changed'
} as const
