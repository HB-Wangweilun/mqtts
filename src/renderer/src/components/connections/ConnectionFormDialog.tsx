import { useEffect, useMemo, useRef, useState } from 'react'
import { Eye, EyeOff, RefreshCw, Save } from 'lucide-react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useUiStore } from '@/store/useUiStore'
import { createEmptyConnection, useConnectionStore } from '@/store/useConnectionStore'
import { randomClientId } from '@/lib/utils'
import type { ConnectionConfig, MqttProtocol } from '@shared/types'

const PROTOCOL_PORTS: Record<MqttProtocol, number> = {
  mqtt: 1883,
  mqtts: 8883,
  ws: 8083,
  wss: 8084
}

const PROTOCOL_LABELS: Record<MqttProtocol, string> = {
  mqtt: 'mqtt://（TCP）',
  mqtts: 'mqtts://（TLS）',
  ws: 'ws://（WebSocket）',
  wss: 'wss://（WebSocket + TLS）'
}

export function ConnectionFormDialog() {
  const target = useUiStore((s) => s.editingConnection)
  const closeDialog = useUiStore((s) => s.closeConnectionDialog)
  const open = target !== null

  // 关键修复：Radix Dialog 在打开动画的 200ms 内仍会响应 pointerdown，
  // 即使用户点的是 input 也会被误判为 overlay（动画期间 dialog 在 transform 偏位置）。
  // 记录打开时间，动画结束前屏蔽 onPointerDownOutside，避免点击穿透关闭弹窗。
  const openAtRef = useRef(0)
  useEffect(() => {
    if (open) openAtRef.current = Date.now()
  }, [open])

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => !next && closeDialog()}
    >
      {/*
        用 key 让表单在每次打开 / 切换目标时重新挂载，
        表单状态永远从 target 初始化，无需 effect 同步，避免状态被意外重置。
      */}
      {open && (
        <ConnectionForm
          key={target === 'new' ? '__new__' : target.id}
          target={target}
          onClose={closeDialog}
          onPointerDownOutside={(e) => {
            // 头 350ms 内屏蔽：跳过入场动画期间被误判的外部点击
            if (Date.now() - openAtRef.current < 350) e.preventDefault()
          }}
        />
      )}
    </Dialog>
  )
}

function ConnectionForm({
  target,
  onClose,
  onPointerDownOutside
}: {
  target: ConnectionConfig | 'new'
  onClose: () => void
  onPointerDownOutside?: (e: { preventDefault: () => void }) => void
}) {
  const save = useConnectionStore((s) => s.save)
  const statuses = useConnectionStore((s) => s.statuses)

  const [form, setForm] = useState<ConnectionConfig>(() =>
    target === 'new' ? createEmptyConnection() : { ...target }
  )
  const [saving, setSaving] = useState(false)
  // 密码框明文 / 密文切换
  const [showPassword, setShowPassword] = useState(false)

  // 把焦点可靠地钉在「连接名称」输入框上。autoFocus + Radix Dialog 在动画期间可能
  // 落到不可靠位置，用 ref 重新 focus 一下，可以保证键盘立刻可用。
  const nameRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const t = setTimeout(() => nameRef.current?.focus(), 50)
    return () => clearTimeout(t)
  }, [])

  const urlPreview = useMemo(() => {
    const base = `${form.protocol}://${form.host || '<host>'}:${form.port}`
    if (form.protocol === 'ws' || form.protocol === 'wss') {
      return base + (form.path.startsWith('/') ? form.path : `/${form.path}`)
    }
    return base
  }, [form.protocol, form.host, form.port, form.path])

  const patch = (key: keyof ConnectionConfig, value: unknown) => {
    setForm((prev) => ({ ...prev, [key]: value }) as ConnectionConfig)
  }

  const handleProtocolChange = (protocol: MqttProtocol) => {
    setForm((prev) => ({
      ...prev,
      protocol,
      // 仅当端口仍是旧协议默认值时才自动跟随，避免覆盖用户自定义端口
      port: Object.values(PROTOCOL_PORTS).includes(prev.port)
        ? PROTOCOL_PORTS[protocol]
        : prev.port
    }))
  }

  const handleSubmit = async () => {
    const host = form.host.trim()
    if (!host) {
      toast.error('请填写 Broker 地址')
      return
    }
    if (!Number.isInteger(form.port) || form.port <= 0 || form.port > 65535) {
      toast.error('端口需在 1 ~ 65535 之间')
      return
    }

    // 名称留空时自动取 Broker 地址，减少必填项
    const name = form.name.trim() || host

    setSaving(true)
    try {
      await save({ ...form, name, host })
      toast.success('连接已保存')
      onClose()
    } finally {
      setSaving(false)
    }
  }

  const isConnected = statuses[form.id] === 'connected'

  return (
    <DialogContent
      className="flex max-h-[92vh] max-w-2xl flex-col p-0"
      onPointerDownOutside={onPointerDownOutside}
      // Radix 默认的自动聚焦会选中内容区第一个可聚焦元素，位置不保证。
      // 这里显式把光标交给「连接名称」，确保打开即可直接输入。
      onOpenAutoFocus={(e) => {
        e.preventDefault()
        nameRef.current?.focus()
      }}
    >
      <DialogHeader className="shrink-0 border-b px-6 py-4">
        <DialogTitle>{target === 'new' ? '新建连接' : '编辑连接'}</DialogTitle>
        <DialogDescription className="font-mono text-xs">{urlPreview}</DialogDescription>
      </DialogHeader>

      <Tabs defaultValue="general" className="flex min-h-0 flex-1 flex-col px-6">
        <TabsList className="mt-4 shrink-0 self-start">
          <TabsTrigger value="general">常规</TabsTrigger>
          <TabsTrigger value="auth">认证</TabsTrigger>
          <TabsTrigger value="advanced">高级</TabsTrigger>
          <TabsTrigger value="note">备注</TabsTrigger>
        </TabsList>

        {/* 常规 */}
        <TabsContent value="general" className="min-h-0 flex-1 overflow-y-auto px-1 py-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="连接名称" className="col-span-2" hint="留空则自动使用 Broker 地址">
              <Input
                ref={nameRef}
                value={form.name}
                onChange={(e) => patch('name', e.target.value)}
                placeholder="例如：生产环境 Broker"
                autoFocus
                autoComplete="off"
                spellCheck={false}
              />
            </Field>

            <Field label="协议" hint="切换协议会同步建议端口">
              <Select
                value={form.protocol}
                onValueChange={(v) => handleProtocolChange(v as MqttProtocol)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(PROTOCOL_LABELS) as MqttProtocol[]).map((p) => (
                    <SelectItem key={p} value={p}>
                      {PROTOCOL_LABELS[p]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field label="端口">
              <Input
                type="number"
                value={form.port}
                onChange={(e) => patch('port', Number(e.target.value))}
                autoComplete="off"
              />
            </Field>

            <Field label="Broker 地址" className="col-span-2">
              <Input
                value={form.host}
                onChange={(e) => patch('host', e.target.value)}
                placeholder="broker.emqx.io"
                autoComplete="off"
                spellCheck={false}
              />
            </Field>

            {(form.protocol === 'ws' || form.protocol === 'wss') && (
              <Field label="WebSocket 路径" className="col-span-2">
                <Input
                  value={form.path}
                  onChange={(e) => patch('path', e.target.value)}
                  placeholder="/mqtt"
                  autoComplete="off"
                  spellCheck={false}
                />
              </Field>
            )}

            <Field label="Client ID" className="col-span-2">
              <div className="flex gap-2">
                <Input
                  value={form.clientId}
                  onChange={(e) => patch('clientId', e.target.value)}
                  className="font-mono text-xs"
                  placeholder="留空将自动生成"
                  autoComplete="off"
                  spellCheck={false}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => patch('clientId', randomClientId())}
                >
                  <RefreshCw />
                </Button>
              </div>
            </Field>
          </div>
        </TabsContent>

        {/* 认证 */}
        <TabsContent value="auth" className="min-h-0 flex-1 overflow-y-auto px-1 py-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="用户名" hint="Broker 未开启认证时可留空">
              <Input
                value={form.username}
                autoComplete="off"
                spellCheck={false}
                onChange={(e) => patch('username', e.target.value)}
              />
            </Field>
            <Field label="密码">
              {/* 相对定位容器 + 右侧显隐按钮；输入框 pr-10 给按钮留位，避免文字被盖住 */}
              <div className="relative">
                <Input
                  type={showPassword ? 'text' : 'password'}
                  value={form.password}
                  autoComplete="new-password"
                  className="pr-10"
                  onChange={(e) => patch('password', e.target.value)}
                />
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm p-1 text-muted-foreground transition-colors hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={showPassword ? '隐藏密码' : '显示密码'}
                  title={showPassword ? '隐藏密码' : '显示密码'}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </Field>
          </div>
        </TabsContent>

        {/* 高级 */}
        <TabsContent value="advanced" className="min-h-0 flex-1 overflow-y-auto px-1 py-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Keep Alive（秒）">
              <Input
                type="number"
                value={form.keepalive}
                onChange={(e) => patch('keepalive', Number(e.target.value))}
              />
            </Field>
            <Field label="连接超时（秒）">
              <Input
                type="number"
                value={form.connectTimeout}
                onChange={(e) => patch('connectTimeout', Number(e.target.value))}
              />
            </Field>
            <Field label="自动重连间隔（秒）" hint="填 0 表示关闭自动重连">
              <Input
                type="number"
                min={0}
                value={form.reconnectPeriod}
                onChange={(e) => patch('reconnectPeriod', Number(e.target.value))}
              />
            </Field>
            <Field
              label="重连次数上限"
              hint="填 0 表示不设上限，一直重连直到成功或手动停止"
            >
              <Input
                type="number"
                min={0}
                value={form.maxReconnectAttempts ?? 0}
                onChange={(e) => patch('maxReconnectAttempts', Math.max(0, Number(e.target.value)))}
              />
            </Field>

            <ToggleRow
              label="清除会话（Clean Session）"
              desc="关闭后 Broker 会保留离线消息与订阅关系"
              checked={form.clean}
              onChange={(v) => patch('clean', v)}
              className="col-span-2"
            />
            <ToggleRow
              label="连接后自动订阅"
              desc="连接成功时自动恢复该连接下已保存的主题"
              checked={form.autoSubscribe}
              onChange={(v) => patch('autoSubscribe', v)}
              className="col-span-2"
            />
            <ToggleRow
              label="校验服务端证书"
              desc="使用自签名证书时可关闭，仅限内网调试"
              checked={form.rejectUnauthorized}
              onChange={(v) => patch('rejectUnauthorized', v)}
              className="col-span-2"
            />
          </div>
        </TabsContent>

        {/* 备注 */}
        <TabsContent value="note" className="min-h-0 flex-1 overflow-y-auto px-1 py-4">
          <Field label="备注信息">
            <Textarea
              value={form.remark}
              onChange={(e) => patch('remark', e.target.value)}
              rows={6}
              placeholder="记录这条连接的用途、负责人、环境等信息"
            />
          </Field>
        </TabsContent>
      </Tabs>

      <DialogFooter className="shrink-0 border-t px-6 py-4">
        {isConnected && (
          <span className="mr-auto self-center text-xs text-warning">
            该连接在线，保存后需重新连接才会生效
          </span>
        )}
        <Button variant="outline" onClick={onClose}>
          取消
        </Button>
        <Button onClick={handleSubmit} disabled={saving}>
          <Save />
          {saving ? '保存中…' : '保存'}
        </Button>
      </DialogFooter>
    </DialogContent>
  )
}

function Field({
  label,
  hint,
  className,
  children
}: {
  label: string
  hint?: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={className}>
      <Label className="mb-1.5 block text-xs">{label}</Label>
      {children}
      {hint && <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  )
}

function ToggleRow({
  label,
  desc,
  checked,
  onChange,
  className
}: {
  label: string
  desc?: string
  checked: boolean
  onChange: (v: boolean) => void
  className?: string
}) {
  return (
    <div className={`flex items-center justify-between rounded-lg border p-3 ${className ?? ''}`}>
      <div className="min-w-0 pr-3">
        <div className="text-sm font-medium">{label}</div>
        {desc && <div className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{desc}</div>}
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  )
}
