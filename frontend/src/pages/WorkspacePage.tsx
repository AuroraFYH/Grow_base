import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Form, Input, Modal, Popconfirm, message,
} from 'antd'
import { orgApi } from '../api/organizations'
import type { CategoryOut, ClassificationConfig, ClassificationTemplate, OrganizationOut } from '../api/organizations'
import { knowledgeApi } from '../api/knowledge'
import type { ChatMessage, KnowledgeItem } from '../api/knowledge'
import { useAuthStore } from '../store/auth'

// ──────────────────────────────────────────────
// tiny inline SVG icons (no external deps needed)
// ──────────────────────────────────────────────
function Icon({ d, size = 14, ...rest }: { d: string; size?: number; strokeWidth?: number; [k: string]: unknown }) {
  const sw = (rest.strokeWidth as number) ?? 2
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  )
}
const I = {
  plus: 'M12 5v14M5 12h14',
  search: 'M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm7.07-2.29a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z',
  book: 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20M4 19.5V5A2.5 2.5 0 0 1 6.5 2.5H20v17H6.5',
  chat: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z',
  edit: 'M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z',
  chevronRight: 'M9 18l6-6-6-6',
  link: 'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3',
  trash: 'M3 6h18M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2',
  refresh: 'M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15',
  send: 'M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z',
  sun: 'M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10z',
  moon: 'M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z',
  grid: 'M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  robot: 'M12 2a2 2 0 0 1 2 2v1h2a2 2 0 0 1 2 2v1h1a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1h-1v1a2 2 0 0 1-2 2h-8a2 2 0 0 1-2-2v-1H5a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1h1V7a2 2 0 0 1 2-2h2V4a2 2 0 0 1 2-2zm-2 8a1 1 0 1 0 2 0 1 1 0 0 0-2 0zm4 0a1 1 0 1 0 2 0 1 1 0 0 0-2 0z',
  home: 'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM9 22V12h6v10',
  apps: 'M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z',
}

// ──────────────────────────────────────────────
// helpers
// ──────────────────────────────────────────────
function flattenCategories(cats: CategoryOut[]): CategoryOut[] {
  return cats.flatMap((c) => [c, ...flattenCategories(c.children)])
}

function statusMeta(status: KnowledgeItem['status']) {
  if (status === 'review') return { cls: 'status-review', label: '需要确认' }
  if (status === 'processing') return { cls: 'status-processing', label: '整理中' }
  if (status === 'error') return { cls: 'status-error', label: '处理失败' }
  return { cls: 'status-ready', label: '已整理' }
}

// ──────────────────────────────────────────────
// ProcessingCard – animated steps for in-progress items
// ──────────────────────────────────────────────
function ProcessingCard({ item }: { item: KnowledgeItem }) {
  const [step, setStep] = useState(0)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)
  const steps = item.source_type === 'video_tutorial'
    ? ['解析视频', '提取字幕', '生成文字教程', '分类入库']
    : item.source_type === 'link'
      ? ['抓取内容', 'AI 分析中', '生成摘要']
      : ['读取笔记', 'AI 分析中', '生成摘要']

  useEffect(() => {
    timer.current = setInterval(() => setStep((s) => (s < steps.length - 1 ? s + 1 : s)), 4000)
    return () => { if (timer.current) clearInterval(timer.current) }
  }, [steps.length])

  return (
    <div className="k-card k-card-processing">
      <div className="k-card-top">
        <span className="k-card-title">{item.title}</span>
        <span className="k-status status-processing">整理中</span>
      </div>
      <div className="proc-steps">
        {steps.map((s, i) => (
          <span key={s} className={`proc-step ${i < step ? 'done' : i === step ? 'current' : ''}`}>
            {i > 0 && <span className="proc-line" />}
            <span className="proc-dot" />
            {s}
          </span>
        ))}
      </div>
      {item.source_url && (
        <a className="k-source" href={item.source_url} target="_blank" rel="noreferrer">
          <Icon d={I.link} size={11} /> {new URL(item.source_url).hostname}
        </a>
      )}
    </div>
  )
}

// ──────────────────────────────────────────────
// TemplatePicker modal content
// ──────────────────────────────────────────────
function TemplatePicker({
  templates,
  currentKey,
  onSelect,
  loading,
}: {
  templates: ClassificationTemplate[]
  currentKey: string | null
  onSelect: (key: string, prompt: string, replace: boolean) => Promise<void>
  loading: boolean
}) {
  const [selected, setSelected] = useState(currentKey || templates[0]?.key || '')
  const [customPrompt, setCustomPrompt] = useState('')
  const template = templates.find((t) => t.key === selected)

  useEffect(() => { setSelected(currentKey || templates[0]?.key || '') }, [currentKey])
  useEffect(() => { if (template) setCustomPrompt(template.default_prompt) }, [selected])

  return (
    <div className="template-picker">
      <div className="template-cards">
        {templates.map((t) => (
          <div
            key={t.key}
            className={`template-card ${selected === t.key ? 'selected' : ''}`}
            onClick={() => setSelected(t.key)}
          >
            <strong>{t.name}</strong>
            <span>{t.summary}</span>
          </div>
        ))}
      </div>
      {template && (
        <div className="template-desc">
          <p>{template.description}</p>
          <p className="muted">适合：{template.suitable_for}</p>
        </div>
      )}
      <label className="field-label">分类提示词<span className="muted" style={{ marginLeft: 8, fontWeight: 400 }}>可调整</span></label>
      <Input.TextArea
        rows={5}
        value={customPrompt}
        onChange={(e) => setCustomPrompt(e.target.value)}
        placeholder="描述 AI 应该如何判断资料所属分类"
      />
      <button
        className={`ws-btn ws-btn-primary${loading ? ' loading' : ''}`}
        style={{ marginTop: 16, width: '100%', justifyContent: 'center' }}
        disabled={loading || (selected === 'custom' && !customPrompt.trim())}
        onClick={() => onSelect(selected, customPrompt, !!currentKey && currentKey !== selected)}
      >
        {loading ? '保存中…' : currentKey ? '保存分类配置' : '应用并进入知识库'}
      </button>
    </div>
  )
}

// ──────────────────────────────────────────────
// SidebarVault – one knowledge base in the tree
// ──────────────────────────────────────────────
interface VaultProps {
  org: OrganizationOut
  categories: CategoryOut[]
  config: ClassificationConfig | null
  itemCounts: Record<number, number>
  totalCount: number
  activeOrgId: number | null
  activeCatId: number | null
  onSelectOrg: (orgId: number) => void
  onSelectCat: (orgId: number, catId: number) => void
  onEditTemplate: (org: OrganizationOut) => void
}

function SidebarVault({
  org, categories, config, itemCounts, totalCount,
  activeOrgId, activeCatId,
  onSelectOrg, onSelectCat, onEditTemplate,
}: VaultProps) {
  const [open, setOpen] = useState(activeOrgId === org.id)
  const isActive = activeOrgId === org.id

  useEffect(() => { if (activeOrgId === org.id) setOpen(true) }, [activeOrgId])

  function renderCats(cats: CategoryOut[], depth = 0): React.ReactNode {
    return cats.map((cat) => (
      <div key={cat.id} style={{ paddingLeft: depth * 12 }}>
        <div
          className={`tree-item${activeCatId === cat.id && activeOrgId === org.id ? ' active' : ''}`}
          onClick={() => onSelectCat(org.id, cat.id)}
        >
          <span className="tree-dot" />
          <span className="tree-item-name">{cat.name}</span>
          <span className="tree-item-count">{itemCounts[cat.id] ?? 0}</span>
        </div>
        {cat.children.length > 0 && renderCats(cat.children, depth + 1)}
      </div>
    ))
  }

  return (
    <div className="vault">
      <div className={`vault-header${isActive ? ' vault-active' : ''}`} onClick={() => setOpen((o) => !o)}>
        <span className={`vault-chevron${open ? ' open' : ''}`}><Icon d={I.chevronRight} size={13} /></span>
        <Icon d={I.book} size={13} className="vault-icon" />
        <span className="vault-name">{org.name}</span>
        <span className="vault-count">{totalCount}</span>
      </div>

      {open && (
        <div className="vault-children">
          <div
            className={`tree-item${isActive && activeCatId === null ? ' active' : ''}`}
            onClick={() => onSelectOrg(org.id)}
          >
            <Icon d={I.grid} size={11} />
            <span className="tree-item-name">全部</span>
            <span className="tree-item-count">{totalCount}</span>
          </div>
          {renderCats(categories)}
          <div className="vault-footer">
            <span className="muted" style={{ fontSize: 11 }}>分类体系</span>
            <button
              className="ws-link-btn"
              onClick={(e) => { e.stopPropagation(); onEditTemplate(org) }}
            >
              <Icon d={I.edit} size={11} />{config?.template_key ? '修改' : '选择'}
            </button>
          </div>
          {config?.template_name && (
            <div style={{ padding: '0 12px 8px', fontSize: 12, color: 'var(--accent-2)', fontWeight: 500 }}>
              {config.template_name}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ──────────────────────────────────────────────
// Main WorkspacePage
// ──────────────────────────────────────────────
type ActiveView = 'knowledge' | 'assistant' | 'settings'

interface OrgState {
  org: OrganizationOut
  categories: CategoryOut[]
  config: ClassificationConfig | null
  items: KnowledgeItem[]
  loading: boolean
}

export default function WorkspacePage() {
  const { orgId: paramOrgId } = useParams<{ orgId?: string }>()
  const navigate = useNavigate()
  const { user } = useAuthStore()

  const [orgs, setOrgs] = useState<OrganizationOut[]>([])
  const [orgStates, setOrgStates] = useState<Record<number, OrgState>>({})
  const [templates, setTemplates] = useState<ClassificationTemplate[]>([])

  const [activeOrgId, setActiveOrgId] = useState<number | null>(null)
  const [activeCatId, setActiveCatId] = useState<number | null>(null)
  const [activeView, setActiveView] = useState<ActiveView>('knowledge')

  const [addOpen, setAddOpen] = useState(false)
  const [addLoading, setAddLoading] = useState(false)
  const [templateOrgId, setTemplateOrgId] = useState<number | null>(null)
  const [templateSaving, setTemplateSaving] = useState(false)
  const [newOrgOpen, setNewOrgOpen] = useState(false)
  const [newOrgLoading, setNewOrgLoading] = useState(false)

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)

  const [search, setSearch] = useState('')
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [selectedItem, setSelectedItem] = useState<KnowledgeItem | null>(null)

  const [form] = Form.useForm()
  const [newOrgForm] = Form.useForm()

  // load all orgs + their state on mount
  useEffect(() => {
    orgApi.list().then(({ data: orgsData }) => {
      setOrgs(orgsData)
      if (orgsData.length > 0) {
        const initId = paramOrgId ? Number(paramOrgId) : orgsData[0].id
        const id = orgsData.find((o) => o.id === initId) ? initId : orgsData[0].id
        setActiveOrgId(id)
        orgsData.forEach((o) => loadOrgState(o.id, orgsData))
      }
    }).catch(() => {})
    orgApi.getClassificationTemplates().then(({ data }) => setTemplates(data)).catch(() => {})
  }, [])

  async function loadOrgState(orgId: number, knownOrgs?: OrganizationOut[]) {
    setOrgStates((prev) => ({
      ...prev,
      [orgId]: prev[orgId] ? { ...prev[orgId], loading: true } : { org: {} as OrganizationOut, categories: [], config: null, items: [], loading: true },
    }))
    try {
      const [{ data: cats }, { data: items }, { data: cfg }] = await Promise.all([
        orgApi.getCategories(orgId),
        knowledgeApi.list(orgId),
        orgApi.getClassification(orgId),
      ])
      const allOrgs = knownOrgs ?? orgs
      const orgInfo = allOrgs.find((o) => o.id === orgId)
      setOrgStates((prev) => ({
        ...prev,
        [orgId]: {
          org: orgInfo ?? prev[orgId]?.org,
          categories: cats,
          config: cfg,
          items,
          loading: false,
        },
      }))
    } catch {
      setOrgStates((prev) => ({ ...prev, [orgId]: { ...prev[orgId], loading: false } }))
    }
  }

  // poll orgs with processing items
  useEffect(() => {
    const processingOrgs = Object.keys(orgStates).filter(
      (id) => orgStates[Number(id)]?.items?.some((i) => i.status === 'processing')
    )
    if (processingOrgs.length === 0) return
    const timer = setTimeout(() => {
      processingOrgs.forEach((id) => loadOrgState(Number(id)))
    }, 3000)
    return () => clearTimeout(timer)
  }, [orgStates])

  // load chat history
  useEffect(() => {
    if (activeView !== 'assistant' || !activeOrgId) return
    knowledgeApi.history(activeOrgId).then(({ data }) => setChatMessages(data)).catch(() => {})
  }, [activeView, activeOrgId])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages])

  const activeState = activeOrgId ? orgStates[activeOrgId] : null
  const activeOrg = orgs.find((o) => o.id === activeOrgId) ?? activeState?.org ?? null
  const categories = activeState?.categories ?? []
  const config = activeState?.config ?? null

  const filteredItems = (activeState?.items ?? []).filter((item) => {
    if (activeCatId && item.category_id !== activeCatId) return false
    if (search) {
      const q = search.toLowerCase()
      return (
        item.title.toLowerCase().includes(q) ||
        (item.summary ?? '').toLowerCase().includes(q) ||
        item.tags.some((t) => t.toLowerCase().includes(q))
      )
    }
    return true
  })

  const itemCounts: Record<number, number> = {}
  ;(activeState?.items ?? []).forEach((item) => {
    if (item.category_id) itemCounts[item.category_id] = (itemCounts[item.category_id] ?? 0) + 1
  })

  const processingCount = (activeState?.items ?? []).filter((i) => i.status === 'processing').length
  const breadcrumb = activeCatId
    ? flattenCategories(categories).find((c) => c.id === activeCatId)?.name ?? '未知分类'
    : '全部'

  const handleAdd = async (values: { title?: string; source_url?: string; content?: string; instructions?: string }) => {
    if (!activeOrgId) return
    setAddLoading(true)
    try {
      const { data: newItem } = await knowledgeApi.create(activeOrgId, values)
      setAddOpen(false)
      form.resetFields()
      setOrgStates((prev) => ({
        ...prev,
        [activeOrgId]: { ...prev[activeOrgId], items: [newItem, ...(prev[activeOrgId]?.items ?? [])] },
      }))
      message.success('已添加，AI 正在后台处理…')
    } catch (err: any) {
      message.error(err.response?.data?.detail || '添加知识失败')
    } finally {
      setAddLoading(false)
    }
  }

  const handleRemove = async (knowledgeId: number) => {
    if (!activeOrgId) return
    try {
      await knowledgeApi.remove(activeOrgId, knowledgeId)
      setOrgStates((prev) => ({
        ...prev,
        [activeOrgId]: { ...prev[activeOrgId], items: prev[activeOrgId].items.filter((i) => i.id !== knowledgeId) },
      }))
    } catch (err: any) {
      message.error(err.response?.data?.detail || '移除失败')
    }
  }

  const handleReprocess = async () => {
    if (!activeOrgId) return
    try {
      const { data } = await knowledgeApi.reprocess(activeOrgId)
      setOrgStates((prev) => ({ ...prev, [activeOrgId]: { ...prev[activeOrgId], items: data } }))
      message.success(`已触发重新整理 ${data.length} 条知识`)
    } catch (err: any) {
      message.error(err.response?.data?.detail || '重新整理失败')
    }
  }

  const handleTemplateSave = async (key: string, prompt: string, replace: boolean) => {
    if (!templateOrgId) return
    setTemplateSaving(true)
    try {
      const { data: cfg } = await orgApi.updateClassification(templateOrgId, {
        template_key: key, custom_prompt: prompt || undefined, replace_existing: replace,
      })
      const { data: cats } = await orgApi.getCategories(templateOrgId)
      setOrgStates((prev) => ({
        ...prev,
        [templateOrgId]: { ...prev[templateOrgId], config: cfg, categories: cats },
      }))
      setTemplateOrgId(null)
      message.success('分类体系已更新')
    } catch (err: any) {
      message.error(err.response?.data?.detail || '保存失败')
    } finally {
      setTemplateSaving(false)
    }
  }

  const handleNewOrg = async (values: { name: string; description?: string }) => {
    setNewOrgLoading(true)
    try {
      const { data: org } = await orgApi.create(values)
      setOrgs((prev) => [...prev, org])
      setNewOrgOpen(false)
      newOrgForm.resetFields()
      setActiveOrgId(org.id)
      await loadOrgState(org.id)
      setTemplateOrgId(org.id)
    } catch (err: any) {
      message.error(err.response?.data?.detail || '创建失败')
    } finally {
      setNewOrgLoading(false)
    }
  }

  const handleChat = async () => {
    const text = chatInput.trim()
    if (!text || chatLoading || !activeOrgId) return
    setChatInput('')
    setChatMessages((prev) => [...prev, { id: Date.now(), role: 'user', content: text, created_at: new Date().toISOString() }])
    setChatLoading(true)
    try {
      const { data } = await knowledgeApi.chat(activeOrgId, text)
      setChatMessages((prev) => [...prev, data.message])
      if (data.action === 'reprocess') await loadOrgState(activeOrgId)
    } catch (err: any) {
      message.error(err.response?.data?.detail || 'AI 暂时无法响应')
    } finally {
      setChatLoading(false)
    }
  }

  const templateOrgState = templateOrgId ? orgStates[templateOrgId] : null

  return (
    <>
      <style>{workspaceCSS}</style>
      <div className="ws-shell">

        {/* ICON RAIL */}
        <nav className="ws-rail">
          <button className={`ws-rail-btn${activeView === 'knowledge' ? ' active' : ''}`} title="知识库" onClick={() => setActiveView('knowledge')}>
            <Icon d={I.book} />
          </button>
          <button className={`ws-rail-btn${activeView === 'assistant' ? ' active' : ''}`} title="AI 助手" onClick={() => setActiveView('assistant')}>
            <Icon d={I.chat} />
          </button>
          <div className="ws-rail-spacer" />
          <button className="ws-rail-btn" title="AI 设置" onClick={() => navigate('/settings')}>
            <Icon d={I.settings} />
          </button>
        </nav>

        {/* SIDEBAR TREE */}
        <aside className="ws-sidebar">
          <div className="ws-sidebar-header">
            <span className="ws-sidebar-title">知识空间</span>
            <button className="ws-icon-btn" title="新建知识库" onClick={() => setNewOrgOpen(true)}>
              <Icon d={I.plus} size={12} strokeWidth={2.5} />
            </button>
          </div>
          <div className="ws-tree">
            {orgs.map((org, i) => {
              const state = orgStates[org.id]
              const counts: Record<number, number> = {}
              ;(state?.items ?? []).forEach((item) => {
                if (item.category_id) counts[item.category_id] = (counts[item.category_id] ?? 0) + 1
              })
              return (
                <div key={org.id}>
                  {i > 0 && <div className="tree-divider" />}
                  <SidebarVault
                    org={org}
                    categories={state?.categories ?? []}
                    config={state?.config ?? null}
                    itemCounts={counts}
                    totalCount={state?.items?.length ?? 0}
                    activeOrgId={activeOrgId}
                    activeCatId={activeCatId}
                    onSelectOrg={(id) => { setActiveOrgId(id); setActiveCatId(null); setSearch(''); setActiveView('knowledge') }}
                    onSelectCat={(orgId, catId) => { setActiveOrgId(orgId); setActiveCatId(catId); setSearch(''); setActiveView('knowledge') }}
                    onEditTemplate={(o) => setTemplateOrgId(o.id)}
                  />
                </div>
              )
            })}
          </div>
        </aside>

        {/* MAIN AREA */}
        <main className="ws-main">
          <div className="ws-topbar">
            <div className="ws-breadcrumb">
              <span>{activeOrg?.name ?? '—'}</span>
              <span className="bc-sep">/</span>
              <span className="bc-current">{activeView === 'assistant' ? 'AI 助手' : breadcrumb}</span>
            </div>
            <div className="ws-topbar-right">
              {activeView === 'knowledge' && (
                <>
                  <div className="ws-search-box">
                    <Icon d={I.search} size={13} />
                    <input placeholder="搜索知识…" value={search} onChange={(e) => setSearch(e.target.value)} />
                  </div>
                  <button className="ws-btn" onClick={handleReprocess}><Icon d={I.refresh} size={13} /></button>
                  <button className="ws-btn ws-btn-primary" onClick={() => setAddOpen(true)}>
                    <Icon d={I.plus} size={13} strokeWidth={2.5} />添加知识
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="ws-content">
            {activeView === 'assistant' ? (
              <div className="ws-chat">
                <div className="ws-chat-messages">
                  {chatMessages.length === 0 ? (
                    <div className="ws-chat-empty">
                      <Icon d={I.robot} size={40} />
                      <strong>从你的知识库开始提问</strong>
                      <p>可以问主题、来源、分类，也可以说"重新整理全部知识"。</p>
                      <div className="ws-chat-prompts">
                        {['我的知识库里有哪些内容？', '整理全部知识', '哪些内容需要确认？'].map((p) => (
                          <button key={p} className="ws-btn" onClick={() => setChatInput(p)}>{p}</button>
                        ))}
                      </div>
                    </div>
                  ) : chatMessages.map((chat) => (
                    <div key={chat.id} className={`ws-chat-msg ${chat.role}`}>
                      {chat.role === 'assistant' && <div className="ws-chat-avatar"><Icon d={I.robot} size={14} /></div>}
                      <div className="ws-chat-bubble">{chat.content}</div>
                      {chat.role === 'user' && <div className="ws-chat-avatar user">{user?.username?.[0]?.toUpperCase() ?? 'U'}</div>}
                    </div>
                  ))}
                  {chatLoading && (
                    <div className="ws-chat-msg assistant">
                      <div className="ws-chat-avatar"><Icon d={I.robot} size={14} /></div>
                      <div className="ws-chat-bubble typing"><span /><span /><span /></div>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>
                <div className="ws-chat-input-row">
                  <input
                    className="ws-chat-input"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleChat()}
                    placeholder='询问你的知识库，或输入"整理知识"'
                    disabled={chatLoading}
                  />
                  <button className="ws-btn ws-btn-primary" onClick={handleChat} disabled={chatLoading || !chatInput.trim()}>
                    <Icon d={I.send} size={13} />发送
                  </button>
                </div>
              </div>
            ) : (
              <>
                {!config?.template_key && activeOrgId && (
                  <div className="ws-banner">
                    <span>还没有选择分类体系。选择一套模板后，AI 才能按你的规则整理知识。</span>
                    <button className="ws-btn ws-btn-primary" style={{ flexShrink: 0 }} onClick={() => setTemplateOrgId(activeOrgId)}>
                      <Icon d={I.apps} size={13} />立即选择
                    </button>
                  </div>
                )}
                {processingCount > 0 && (
                  <div className="ws-banner info">
                    <span className="proc-pulse" />
                    AI 正在处理 {processingCount} 条知识，页面会自动刷新…
                  </div>
                )}
                <div className="ws-section-header">
                  <div className="ws-section-title">
                    {breadcrumb}
                    <span className="ws-section-tag">{filteredItems.length} 条</span>
                  </div>
                  <div className="ws-view-toggle">
                    <button className={`view-btn${viewMode === 'grid' ? ' active' : ''}`} onClick={() => setViewMode('grid')}><Icon d={I.grid} size={13} /></button>
                    <button className={`view-btn${viewMode === 'list' ? ' active' : ''}`} onClick={() => setViewMode('list')}><Icon d={I.list} size={13} /></button>
                  </div>
                </div>
                {activeState?.loading ? (
                  <div className="ws-loading">加载中…</div>
                ) : filteredItems.length === 0 ? (
                  <div className="ws-empty">
                    <Icon d={I.book} size={36} />
                    <strong>这里还没有知识</strong>
                    <p>点击「添加知识」，粘贴链接或笔记，AI 会自动整理</p>
                  </div>
                ) : (
                  <div className={viewMode === 'grid' ? 'k-grid' : 'k-list'}>
                    {filteredItems.map((item) => {
                      if (item.status === 'processing') return <ProcessingCard key={item.id} item={item} />
                      const { cls, label } = statusMeta(item.status)
                      return (
                        <div key={item.id} className={`k-card${viewMode === 'list' ? ' k-card-row' : ''}`}>
                          <div className="k-card-top">
                            <span className="k-card-title">{item.title}</span>
                            <span className={`k-status ${cls}`}>{label}</span>
                          </div>
                          {item.summary && <p className="k-summary">{item.summary}</p>}
                          <div className="k-tags">
                            {item.category_name && <span className="k-tag k-tag-cat">{item.category_name}</span>}
                            {item.tags.map((t) => <span key={t} className="k-tag">{t}</span>)}
                          </div>
                          {item.ai_reason && <p className="k-reason">AI：{item.ai_reason}</p>}
                          <div className="k-footer">
                            {item.source_url ? (
                              <a className="k-source" href={item.source_url} target="_blank" rel="noreferrer">
                                <Icon d={I.link} size={11} />
                                {(() => { try { return new URL(item.source_url).hostname } catch { return item.source_url } })()}
                              </a>
                            ) : <span />}
                            <div className="k-actions">
                              {item.content && (
                                <button className="k-view-btn" onClick={() => setSelectedItem(item)}>
                                  <Icon d={I.book} size={13} />
                                  {item.source_type === 'video_tutorial' ? '查看教程' : '查看正文'}
                                </button>
                              )}
                              <Popconfirm title="确定移除这条知识？" onConfirm={() => handleRemove(item.id)}>
                                <button className="ws-icon-btn danger"><Icon d={I.trash} size={13} /></button>
                              </Popconfirm>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </>
            )}
          </div>
        </main>
      </div>

      <Modal
        title={selectedItem?.title}
        open={Boolean(selectedItem)}
        onCancel={() => setSelectedItem(null)}
        footer={null}
        width={860}
      >
        <article className="tutorial-content">{selectedItem?.content}</article>
      </Modal>

      {/* ADD KNOWLEDGE MODAL */}
      <Modal title="添加知识" open={addOpen} onCancel={() => { setAddOpen(false); form.resetFields() }} footer={null} width={580}>
        <Form form={form} layout="vertical" onFinish={handleAdd} style={{ marginTop: 16 }}>
          <Form.Item name="title" label="标题"><Input placeholder="不填时会使用链接标题或默认名称" /></Form.Item>
          <Form.Item name="source_url" label="知识链接"><Input placeholder="https://…（博客、GitHub 仓库、YouTube/B站 视频）" /></Form.Item>
          <Form.Item name="instructions" label="处理要求"><Input.TextArea rows={2} placeholder="例如：把视频内容转换成知识库文档，整理成文字版教程" /></Form.Item>
          <Form.Item name="content" label="补充正文或笔记"><Input.TextArea rows={5} placeholder="粘贴摘要、笔记或网页正文。链接和正文至少填写一项。" /></Form.Item>
          <button type="submit" className={`ws-btn ws-btn-primary${addLoading ? ' loading' : ''}`} style={{ width: '100%', justifyContent: 'center' }} disabled={addLoading}>
            <Icon d={I.robot} size={14} />{addLoading ? '添加中…' : '添加并让 AI 整理'}
          </button>
        </Form>
      </Modal>

      {/* NEW ORG MODAL */}
      <Modal title="新建知识库" open={newOrgOpen} onCancel={() => { setNewOrgOpen(false); newOrgForm.resetFields() }} footer={null}>
        <Form form={newOrgForm} layout="vertical" onFinish={handleNewOrg} style={{ marginTop: 16 }}>
          <Form.Item name="name" label="名称" rules={[{ required: true, message: '请输入名称' }]}><Input placeholder="例如：个人读书笔记" /></Form.Item>
          <Form.Item name="description" label="描述"><Input placeholder="可选" /></Form.Item>
          <button type="submit" className={`ws-btn ws-btn-primary${newOrgLoading ? ' loading' : ''}`} style={{ width: '100%', justifyContent: 'center' }} disabled={newOrgLoading}>
            {newOrgLoading ? '创建中…' : '创建知识库'}
          </button>
        </Form>
      </Modal>

      {/* TEMPLATE PICKER MODAL */}
      <Modal title="选择分类体系" open={templateOrgId !== null} onCancel={() => setTemplateOrgId(null)} footer={null} width={680} destroyOnClose>
        {templates.length > 0 && (
          <TemplatePicker
            templates={templates}
            currentKey={templateOrgState?.config?.template_key ?? null}
            onSelect={handleTemplateSave}
            loading={templateSaving}
          />
        )}
      </Modal>
    </>
  )
}

// ──────────────────────────────────────────────
// CSS
// ──────────────────────────────────────────────
const workspaceCSS = `
html, body { height: 100%; margin: 0; padding: 0; }
#root { height: 100%; }
:root {
  --ws-bg: #1e1e2e;
  --ws-panel: #181825;
  --ws-item: #24243a;
  --ws-hover: #2a2a45;
  --ws-active: #313154;
  --ws-border: #313155;
  --ws-fg: #cdd6f4;
  --ws-muted: #6c7086;
  --ws-dim: #45475a;
  --ws-accent: #89b4fa;
  --accent-2: #cba6f7;
  --ws-green: #a6e3a1;
  --ws-yellow: #f9e2af;
  --ws-red: #f38ba8;
  --ws-rail: 44px;
  --ws-tree: 260px;
}
@media (prefers-color-scheme: light) {
  :root {
    --ws-bg: #f5f5f7; --ws-panel: #ffffff; --ws-item: #ffffff;
    --ws-hover: #eeeef4; --ws-active: #e4e4f0; --ws-border: #dcdce8;
    --ws-fg: #1e1e2e; --ws-muted: #6c7086; --ws-dim: #babbcc;
    --ws-accent: #1d6fe8; --accent-2: #7c3aed;
    --ws-green: #1a7f4b; --ws-yellow: #b45309; --ws-red: #c0392b;
  }
}
.ws-shell {
  display: grid; grid-template-columns: var(--ws-rail) var(--ws-tree) 1fr;
  height: 100vh; overflow: hidden;
  background: var(--ws-bg); color: var(--ws-fg);
  font-family: Inter, system-ui, sans-serif; font-size: 13px;
}
.ws-rail {
  background: var(--ws-panel); border-right: 1px solid var(--ws-border);
  display: flex; flex-direction: column; align-items: center; padding: 10px 0; gap: 2px;
}
.ws-rail-btn {
  width: 32px; height: 32px; border-radius: 6px; border: none;
  background: transparent; color: var(--ws-muted); cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: background .12s, color .12s;
}
.ws-rail-btn:hover { background: var(--ws-hover); color: var(--ws-fg); }
.ws-rail-btn.active { background: var(--ws-active); color: var(--ws-accent); }
.ws-rail-spacer { flex: 1; }
.ws-sidebar {
  background: var(--ws-panel); border-right: 1px solid var(--ws-border);
  display: flex; flex-direction: column; overflow: hidden;
}
.ws-sidebar-header {
  padding: 12px 14px 8px; border-bottom: 1px solid var(--ws-border);
  display: flex; align-items: center; justify-content: space-between; flex-shrink: 0;
}
.ws-sidebar-title {
  font-size: 11px; font-weight: 600; letter-spacing: .08em;
  text-transform: uppercase; color: var(--ws-muted);
}
.ws-tree { overflow-y: auto; flex: 1; padding: 6px 0; }
.vault { margin-bottom: 2px; }
.vault-header {
  display: flex; align-items: center; padding: 5px 10px 5px 8px;
  border-radius: 5px; cursor: pointer; gap: 6px; transition: background .1s;
  user-select: none; margin: 0 4px; color: var(--ws-fg);
}
.vault-header:hover { background: var(--ws-hover); }
.vault-header.vault-active { background: var(--ws-active); }
.vault-chevron { color: var(--ws-dim); transition: transform .15s; flex-shrink: 0; display: flex; }
.vault-chevron.open { transform: rotate(90deg); }
.vault-icon { color: var(--accent-2); flex-shrink: 0; display: flex; }
.vault-name { font-weight: 500; font-size: 13px; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.vault-count { font-size: 11px; color: var(--ws-dim); }
.vault-children { padding-left: 8px; }
.vault-footer {
  display: flex; align-items: center; justify-content: space-between;
  padding: 6px 12px 2px;
}
.tree-item {
  display: flex; align-items: center; padding: 4px 10px 4px 8px;
  border-radius: 5px; cursor: pointer; gap: 6px; transition: background .1s;
  margin: 1px 4px; color: var(--ws-muted);
}
.tree-item:hover { background: var(--ws-hover); color: var(--ws-fg); }
.tree-item.active { background: var(--ws-active); color: var(--ws-accent); }
.tree-item.active .tree-dot { background: var(--ws-accent); }
.tree-dot { width: 5px; height: 5px; border-radius: 50%; background: var(--ws-dim); flex-shrink: 0; margin-left: 4px; }
.tree-item-name { font-size: 12.5px; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tree-item-count { font-size: 11px; color: var(--ws-dim); }
.tree-divider { height: 1px; background: var(--ws-border); margin: 4px 12px; }
.ws-main { display: flex; flex-direction: column; overflow: hidden; background: var(--ws-bg); }
.ws-topbar {
  height: 44px; border-bottom: 1px solid var(--ws-border);
  display: flex; align-items: center; padding: 0 20px; gap: 12px; flex-shrink: 0;
}
.ws-breadcrumb { display: flex; align-items: center; gap: 6px; font-size: 13px; color: var(--ws-muted); }
.bc-sep { color: var(--ws-dim); }
.bc-current { color: var(--ws-fg); font-weight: 500; }
.ws-topbar-right { margin-left: auto; display: flex; gap: 8px; align-items: center; }
.ws-search-box {
  display: flex; align-items: center; background: var(--ws-item);
  border: 1px solid var(--ws-border); border-radius: 6px; padding: 4px 10px; gap: 6px; color: var(--ws-muted);
}
.ws-search-box input {
  background: none; border: none; outline: none;
  color: var(--ws-fg); font-size: 12px; width: 200px;
}
.ws-search-box input::placeholder { color: var(--ws-muted); }
.ws-btn {
  display: inline-flex; align-items: center; gap: 5px; padding: 5px 11px;
  border-radius: 6px; border: 1px solid var(--ws-border); background: var(--ws-item);
  color: var(--ws-fg); font-size: 12px; font-weight: 500; cursor: pointer;
  transition: background .1s; white-space: nowrap;
}
.ws-btn:hover:not(:disabled) { background: var(--ws-hover); }
.ws-btn:disabled { opacity: .5; cursor: not-allowed; }
.ws-btn-primary { background: var(--ws-accent); border-color: var(--ws-accent); color: #1e1e2e; }
.ws-btn-primary:hover:not(:disabled) { opacity: .88; background: var(--ws-accent); }
.ws-icon-btn {
  width: 24px; height: 24px; border: none; background: transparent; color: var(--ws-muted);
  cursor: pointer; border-radius: 4px; display: flex; align-items: center; justify-content: center;
  transition: background .1s, color .1s;
}
.ws-icon-btn:hover { background: var(--ws-hover); color: var(--ws-fg); }
.ws-icon-btn.danger:hover { background: color-mix(in srgb, var(--ws-red) 15%, transparent); color: var(--ws-red); }
.ws-link-btn {
  display: inline-flex; align-items: center; gap: 4px;
  font-size: 11px; color: var(--ws-accent); font-weight: 500;
  border: none; background: none; cursor: pointer; padding: 1px 4px; border-radius: 3px;
}
.ws-link-btn:hover { background: var(--ws-hover); }
.muted { color: var(--ws-muted); }
.field-label { display: block; font-size: 12px; font-weight: 600; color: var(--ws-muted); margin-bottom: 6px; }
.ws-content { flex: 1; overflow-y: auto; padding: 24px 28px; }
.ws-loading { display: flex; align-items: center; justify-content: center; height: 200px; color: var(--ws-muted); }
.ws-empty {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  text-align: center; padding: 60px 20px; gap: 10px; color: var(--ws-muted);
}
.ws-empty strong { color: var(--ws-fg); font-size: 15px; }
.ws-banner {
  display: flex; align-items: center;
  background: color-mix(in srgb, var(--ws-yellow) 10%, var(--ws-item));
  border: 1px solid color-mix(in srgb, var(--ws-yellow) 30%, var(--ws-border));
  border-radius: 8px; padding: 10px 14px; gap: 10px; margin-bottom: 16px;
  font-size: 12.5px; color: var(--ws-fg);
}
.ws-banner.info {
  background: color-mix(in srgb, var(--ws-accent) 8%, var(--ws-item));
  border-color: color-mix(in srgb, var(--ws-accent) 25%, var(--ws-border));
  align-items: center; gap: 8px;
}
.proc-pulse {
  width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0;
  background: var(--ws-accent); animation: pulse 1.2s ease-in-out infinite;
}
@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.35} }
.ws-section-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
.ws-section-title { font-size: 15px; font-weight: 600; color: var(--ws-fg); display: flex; align-items: center; gap: 8px; }
.ws-section-tag { font-size: 11px; font-weight: 500; background: var(--ws-active); color: var(--ws-muted); border-radius: 4px; padding: 1px 6px; }
.ws-view-toggle { display: flex; gap: 2px; background: var(--ws-item); border: 1px solid var(--ws-border); border-radius: 6px; padding: 2px; }
.view-btn { border: none; background: transparent; color: var(--ws-muted); border-radius: 4px; padding: 3px 7px; cursor: pointer; transition: background .1s, color .1s; display: flex; align-items: center; }
.view-btn.active { background: var(--ws-active); color: var(--ws-fg); }
.k-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px; }
.k-list { display: flex; flex-direction: column; gap: 8px; }
.k-card { background: var(--ws-item); border: 1px solid var(--ws-border); border-radius: 8px; padding: 14px 16px; transition: border-color .12s; }
.k-card:hover { border-color: var(--ws-accent); }
.k-card-row { padding: 10px 16px; }
.k-card-processing {
  border-color: color-mix(in srgb, var(--ws-accent) 35%, var(--ws-border));
  background: color-mix(in srgb, var(--ws-accent) 4%, var(--ws-item));
}
.k-card-top { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 8px; gap: 8px; }
.k-card-row .k-card-top { margin-bottom: 4px; }
.k-card-title { font-size: 13.5px; font-weight: 600; color: var(--ws-fg); line-height: 1.4; flex: 1; }
.k-status { font-size: 10.5px; font-weight: 500; border-radius: 4px; padding: 2px 6px; flex-shrink: 0; }
.status-ready { background: color-mix(in srgb, var(--ws-green) 15%, transparent); color: var(--ws-green); }
.status-review { background: color-mix(in srgb, var(--ws-yellow) 15%, transparent); color: var(--ws-yellow); }
.status-processing { background: color-mix(in srgb, var(--ws-accent) 15%, transparent); color: var(--ws-accent); animation: pulse 1.4s ease-in-out infinite; }
.status-error { background: color-mix(in srgb, var(--ws-red) 15%, transparent); color: var(--ws-red); }
.k-summary { font-size: 12px; color: var(--ws-muted); line-height: 1.5; margin-bottom: 8px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.k-tags { display: flex; gap: 5px; flex-wrap: wrap; margin-bottom: 8px; }
.k-tag { font-size: 11px; background: var(--ws-active); color: var(--ws-muted); border-radius: 4px; padding: 1px 6px; }
.k-tag-cat { color: var(--accent-2); }
.k-reason { font-size: 11px; color: var(--ws-dim); margin-bottom: 8px; line-height: 1.4; }
.k-footer { display: flex; align-items: center; justify-content: space-between; border-top: 1px solid var(--ws-border); padding-top: 8px; margin-top: 4px; }
.k-actions { display: flex; align-items: center; gap: 6px; }
.k-view-btn { border: 0; background: transparent; color: var(--ws-accent); cursor: pointer; display: inline-flex; align-items: center; gap: 5px; padding: 5px 7px; font: inherit; }
.k-view-btn:hover { background: var(--ws-hover); }
.tutorial-content { white-space: pre-wrap; overflow-wrap: anywhere; font-size: 14px; line-height: 1.8; color: var(--ws-text); max-height: 68vh; overflow-y: auto; }
.k-source { display: flex; align-items: center; gap: 4px; font-size: 11px; color: var(--ws-dim); text-decoration: none; }
.k-source:hover { color: var(--ws-accent); }
.proc-steps { display: flex; align-items: center; margin: 8px 0 6px; }
.proc-step { display: flex; align-items: center; gap: 4px; font-size: 11px; color: var(--ws-dim); flex: 1; }
.proc-step.done { color: var(--ws-green); }
.proc-step.current { color: var(--ws-accent); }
.proc-step .proc-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--ws-dim); flex-shrink: 0; }
.proc-step.done .proc-dot { background: var(--ws-green); }
.proc-step.current .proc-dot { background: var(--ws-accent); animation: pulse 1s ease-in-out infinite; }
.proc-line { flex: 1; height: 1px; background: var(--ws-border); margin: 0 4px; }
.ws-chat { display: flex; flex-direction: column; height: 100%; }
.ws-chat-messages { flex: 1; overflow-y: auto; padding-bottom: 16px; display: flex; flex-direction: column; gap: 16px; }
.ws-chat-empty {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  text-align: center; gap: 10px; padding: 60px 20px; color: var(--ws-muted); height: 100%;
}
.ws-chat-empty strong { font-size: 16px; color: var(--ws-fg); }
.ws-chat-prompts { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; margin-top: 4px; }
.ws-chat-msg { display: flex; align-items: flex-end; gap: 8px; }
.ws-chat-msg.user { flex-direction: row-reverse; }
.ws-chat-avatar {
  width: 30px; height: 30px; border-radius: 50%; background: var(--ws-accent); color: #1e1e2e;
  display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 600; flex-shrink: 0;
}
.ws-chat-avatar.user { background: var(--ws-dim); color: var(--ws-fg); }
.ws-chat-bubble {
  max-width: 72%; background: var(--ws-item); border: 1px solid var(--ws-border);
  border-radius: 10px; padding: 10px 14px; font-size: 13px; line-height: 1.6;
  white-space: pre-wrap; color: var(--ws-fg);
}
.ws-chat-msg.user .ws-chat-bubble { background: var(--ws-accent); border-color: var(--ws-accent); color: #1e1e2e; }
.ws-chat-bubble.typing { display: flex; align-items: center; gap: 4px; padding: 12px 16px; }
.ws-chat-bubble.typing span { width: 6px; height: 6px; border-radius: 50%; background: var(--ws-muted); animation: typing 1.2s infinite; }
.ws-chat-bubble.typing span:nth-child(2) { animation-delay: .2s; }
.ws-chat-bubble.typing span:nth-child(3) { animation-delay: .4s; }
@keyframes typing { 0%,60%,100%{opacity:.25} 30%{opacity:1} }
.ws-chat-input-row {
  display: flex; gap: 8px; align-items: center;
  border-top: 1px solid var(--ws-border); padding-top: 16px; flex-shrink: 0;
}
.ws-chat-input {
  flex: 1; background: var(--ws-item); border: 1px solid var(--ws-border);
  border-radius: 8px; padding: 8px 14px; color: var(--ws-fg); font-size: 13px; outline: none;
}
.ws-chat-input:focus { border-color: var(--ws-accent); }
.ws-chat-input::placeholder { color: var(--ws-muted); }
.template-picker { padding-top: 8px; }
.template-cards { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 14px; }
.template-card {
  width: 160px; padding: 10px 12px; border: 1px solid var(--ws-border); border-radius: 8px;
  cursor: pointer; transition: border-color .12s, background .12s; display: flex; flex-direction: column; gap: 4px;
}
.template-card:hover { border-color: var(--ws-accent); }
.template-card.selected { border-color: var(--ws-accent); background: color-mix(in srgb, var(--ws-accent) 8%, var(--ws-item)); }
.template-card strong { font-size: 13px; color: var(--ws-fg); }
.template-card span { font-size: 11px; color: var(--ws-muted); }
.template-desc { background: var(--ws-item); border: 1px solid var(--ws-border); border-radius: 6px; padding: 10px 12px; margin-bottom: 12px; font-size: 12px; color: var(--ws-muted); line-height: 1.5; }
.template-desc p { margin: 0 0 4px; }
.ws-tree::-webkit-scrollbar,.ws-content::-webkit-scrollbar,.ws-chat-messages::-webkit-scrollbar { width: 4px; }
.ws-tree::-webkit-scrollbar-track,.ws-content::-webkit-scrollbar-track,.ws-chat-messages::-webkit-scrollbar-track { background: transparent; }
.ws-tree::-webkit-scrollbar-thumb,.ws-content::-webkit-scrollbar-thumb,.ws-chat-messages::-webkit-scrollbar-thumb { background: var(--ws-border); border-radius: 2px; }
@media (max-width: 640px) {
  .ws-shell { grid-template-columns: var(--ws-rail) 1fr; }
  .ws-sidebar { display: none; }
}
`
