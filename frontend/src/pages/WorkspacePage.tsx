import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Checkbox, Form, Input, Modal, Popconfirm, message,
} from 'antd'
import { orgApi } from '../api/organizations'
import type { CategoryOut, ClassificationConfig, ClassificationTemplate, OrganizationOut } from '../api/organizations'
import { knowledgeApi } from '../api/knowledge'
import type { ChatMessage, KnowledgeItem } from '../api/knowledge'
import { useAuthStore } from '../store/auth'
import KnowledgeOrb from '../components/KnowledgeOrb'

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
  palette: 'M12 3a9 9 0 0 0 0 18h1.2a1.8 1.8 0 0 0 1.2-3.14 1.8 1.8 0 0 1 1.2-3.16H18A3 3 0 0 0 21 12a9 9 0 0 0-9-9zM7.5 12h.01M8.5 7.5h.01M13 6.5h.01M17 9h.01',
  file: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8M8 17h8',
  upload: 'M12 16V4M7 9l5-5 5 5M5 20h14',
  download: 'M12 3v12M7 10l5 5 5-5M5 21h14',
}

type AppearanceSettings = {
  theme: 'tech' | 'piggy'
  backgroundPreset: string
  backgroundImage: string | null
  coverStyles: Record<string, string>
  coverImages: Record<string, string>
}

const APPEARANCE_STORAGE_KEY = 'growbase-appearance'
const BACKGROUND_PRESETS = [
  { key: 'aurora', label: '极光', backgroundImage: 'radial-gradient(circle at 78% 12%, rgba(58, 164, 189, .38), transparent 34%), radial-gradient(circle at 20% 78%, rgba(104, 73, 179, .34), transparent 38%), linear-gradient(135deg, #07111f, #10122b 52%, #07151a)' },
  { key: 'graphite', label: '石墨', backgroundImage: 'linear-gradient(135deg, #090d16, #171b28 54%, #070911)' },
  { key: 'ocean', label: '深海', backgroundImage: 'radial-gradient(circle at 16% 20%, rgba(26, 153, 180, .32), transparent 32%), linear-gradient(145deg, #06141c, #092e3c 54%, #07131f)' },
  { key: 'violet', label: '暮紫', backgroundImage: 'radial-gradient(circle at 78% 20%, rgba(157, 103, 220, .3), transparent 30%), linear-gradient(145deg, #100b1d, #21152f 52%, #090b17)' },
]
const COVER_STYLES = [
  { key: 'cyan', label: '极光蓝', colors: ['#0b3340', '#0e7780'], accent: '#8ff7f1' },
  { key: 'violet', label: '星云紫', colors: ['#211541', '#713f96'], accent: '#f2c6ff' },
  { key: 'amber', label: '琥珀金', colors: ['#3a2414', '#a2612b'], accent: '#ffd28a' },
  { key: 'rose', label: '玫瑰红', colors: ['#3a152b', '#a33c68'], accent: '#ffc0dc' },
  { key: 'mint', label: '薄荷绿', colors: ['#10382f', '#1a856b'], accent: '#b4ffe2' },
]

function readAppearanceSettings(): AppearanceSettings {
  const fallback: AppearanceSettings = {
    theme: 'tech',
    backgroundPreset: 'aurora',
    backgroundImage: null,
    coverStyles: {},
    coverImages: {},
  }
  if (typeof window === 'undefined') return fallback
  try {
    const saved = JSON.parse(localStorage.getItem(APPEARANCE_STORAGE_KEY) || 'null')
    return {
      ...fallback,
      ...(saved && typeof saved === 'object' ? saved : {}),
      theme: saved?.theme === 'piggy' ? 'piggy' : 'tech',
      coverStyles: saved?.coverStyles && typeof saved.coverStyles === 'object' ? saved.coverStyles : {},
      coverImages: saved?.coverImages && typeof saved.coverImages === 'object' ? saved.coverImages : {},
    }
  } catch {
    return fallback
  }
}

type PiggyVariant = 'standing' | 'sleeping' | 'dizzy'

function PiggyMascot({ compact = false, variant = 'standing' }: { compact?: boolean; variant?: PiggyVariant }) {
  return <img className={`piggy-mascot${compact ? ' compact' : ''}`} src={`/themes/piggy/piggy-${variant}.png`} alt="" aria-hidden="true" />
}

// ──────────────────────────────────────────────
// helpers
// ──────────────────────────────────────────────
function flattenCategories(cats: CategoryOut[]): CategoryOut[] {
  return cats.flatMap((c) => [c, ...flattenCategories(c.children)])
}

function formatFileSize(bytes: number | null) {
  if (bytes == null) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function statusMeta(status: KnowledgeItem['status']) {
  if (status === 'archived') return { cls: 'status-archived', label: '仅存档' }
  if (status === 'review') return { cls: 'status-review', label: '需要确认' }
  if (status === 'processing') return { cls: 'status-processing', label: '整理中' }
  if (status === 'error') return { cls: 'status-error', label: '处理失败' }
  return { cls: 'status-ready', label: '已整理' }
}

// ──────────────────────────────────────────────
// ProcessingCard – animated steps for in-progress items
// ──────────────────────────────────────────────
function ProcessingCard({ item, theme }: { item: KnowledgeItem; theme: AppearanceSettings['theme'] }) {
  const [step, setStep] = useState(0)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)
  const steps = item.source_type === 'video_tutorial'
    ? ['解析视频', '提取字幕', '生成文字教程', '分类入库']
    : item.source_type === 'file'
      ? ['读取文件', '按要求整理', '生成知识文档', '分类入库']
    : item.source_type === 'link'
      ? ['抓取内容', 'AI 分析中', '生成摘要']
      : ['读取笔记', 'AI 分析中', '生成摘要']

  useEffect(() => {
    timer.current = setInterval(() => setStep((s) => (s < steps.length - 1 ? s + 1 : s)), 4000)
    return () => { if (timer.current) clearInterval(timer.current) }
  }, [steps.length])

  return (
    <div className="k-card k-card-processing">
      {theme === 'piggy' && <span className="processing-piggy"><PiggyMascot variant="dizzy" /></span>}
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

function ShelfBook({
  org,
  count,
  index,
  active,
  coverStyleKey,
  coverImage,
  theme,
  onClick,
}: {
  org: OrganizationOut
  count: number
  index: number
  active: boolean
  coverStyleKey?: string
  coverImage?: string
  theme: AppearanceSettings['theme']
  onClick: () => void
}) {
  const piggyVariants: PiggyVariant[] = ['standing', 'sleeping', 'dizzy']
  const piggyCovers = [
    { colors: ['#ffd9e4', '#f47fa5'], accent: '#6d365f' },
    { colors: ['#fff0c9', '#f7a8bd'], accent: '#a32c67' },
    { colors: ['#e7d9ff', '#b983cf'], accent: '#5d376c' },
  ]
  const preset = theme === 'piggy' && !coverImage
    ? piggyCovers[index % piggyCovers.length]
    : COVER_STYLES.find((style) => style.key === coverStyleKey) ?? COVER_STYLES[index % COVER_STYLES.length]
  const coverStyle = coverImage
    ? { backgroundImage: `linear-gradient(145deg, rgba(5, 10, 20, .3), rgba(5, 10, 20, .76)), url(${coverImage})` }
    : {
        backgroundImage: `linear-gradient(145deg, ${preset.colors[0]}, ${preset.colors[1]})`,
        '--book-accent': preset.accent,
      }

  return (
    <button className={`shelf-book${active ? ' active' : ''}${theme === 'piggy' && !coverImage ? ' piggy-book' : ''}`} onClick={onClick} title={`打开 ${org.name}`}>
      <span className="shelf-book-cover" style={coverStyle}>
        <span className="book-cover-shine" />
        {theme === 'piggy' && !coverImage
          ? <span className="book-cover-pig"><PiggyMascot compact variant={piggyVariants[index % piggyVariants.length]} /></span>
          : <span className="book-cover-mark">G<span>+</span></span>}
        <strong>{org.name}</strong>
        <small>{count} 条知识</small>
      </span>
      <span className="shelf-book-label">{org.name}</span>
    </button>
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
  const [addMode, setAddMode] = useState<'text' | 'file'>('text')
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [shouldProcessFile, setShouldProcessFile] = useState(false)
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
  const [appearanceOpen, setAppearanceOpen] = useState(false)
  const [appearance, setAppearance] = useState<AppearanceSettings>(readAppearanceSettings)

  const [form] = Form.useForm()
  const [newOrgForm] = Form.useForm()
  const backgroundInputRef = useRef<HTMLInputElement | null>(null)
  const coverInputRef = useRef<HTMLInputElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    try {
      localStorage.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify(appearance))
    } catch {
      message.error('图片过大，无法保存外观设置，请换一张小一些的图片')
    }
  }, [appearance])

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
    if (addMode === 'file' && !uploadFile) {
      message.error('请先选择要上传的文件')
      return
    }
    setAddLoading(true)
    try {
      const { data: newItem } = addMode === 'file'
        ? await knowledgeApi.upload(activeOrgId, {
            file: uploadFile!,
            title: values.title,
            shouldProcess: shouldProcessFile,
            instructions: values.instructions,
          })
        : await knowledgeApi.create(activeOrgId, values)
      setAddOpen(false)
      form.resetFields()
      setUploadFile(null)
      setShouldProcessFile(false)
      setOrgStates((prev) => ({
        ...prev,
        [activeOrgId]: { ...prev[activeOrgId], items: [newItem, ...(prev[activeOrgId]?.items ?? [])] },
      }))
      message.success(addMode === 'file' && !shouldProcessFile ? '文件已存入知识库（未进行 AI 整理）' : '已添加，AI 正在后台处理…')
    } catch (err: any) {
      message.error(err.response?.data?.detail || '添加知识失败')
    } finally {
      setAddLoading(false)
    }
  }

  const handleDownload = async (item: KnowledgeItem) => {
    if (!activeOrgId || !item.file_name) return
    try {
      const { data } = await knowledgeApi.download(activeOrgId, item.id)
      const url = URL.createObjectURL(data)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = item.file_name
      anchor.click()
      URL.revokeObjectURL(url)
    } catch (err: any) {
      message.error(err.response?.data?.detail || '文件下载失败')
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
  const selectedBackground = BACKGROUND_PRESETS.find((preset) => preset.key === appearance.backgroundPreset) ?? BACKGROUND_PRESETS[0]
  const piggyWallpaper = 'radial-gradient(circle at 82% 14%, rgba(255, 255, 255, .92) 0 7%, transparent 7.3%), radial-gradient(circle at 84% 13%, rgba(240, 90, 145, .22), transparent 22%), linear-gradient(140deg, #fff8f3 0%, #ffe8ee 46%, #eee3ff 100%)'
  const wallpaper = appearance.backgroundImage
    ? `url(${appearance.backgroundImage})`
    : appearance.theme === 'piggy' ? piggyWallpaper : selectedBackground.backgroundImage

  function readUploadedImage(file: File, onLoaded: (dataUrl: string) => void) {
    if (!file.type.startsWith('image/')) {
      message.error('请选择图片文件')
      return
    }
    if (file.size > 1.5 * 1024 * 1024) {
      message.error('图片请控制在 1.5MB 以内，便于保存在当前浏览器')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') onLoaded(reader.result)
    }
    reader.readAsDataURL(file)
  }

  function handleBackgroundUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (file) readUploadedImage(file, (dataUrl) => {
      setAppearance((prev) => ({ ...prev, backgroundImage: dataUrl }))
      message.success('自定义背景已添加并应用')
    })
    event.target.value = ''
  }

  function handleCoverUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (file && activeOrgId) {
      readUploadedImage(file, (dataUrl) => {
        setAppearance((prev) => ({
          ...prev,
          coverImages: { ...prev.coverImages, [String(activeOrgId)]: dataUrl },
        }))
        message.success('知识库封面已添加并应用')
      })
    }
    event.target.value = ''
  }

  function clearCustomBackground() {
    setAppearance((prev) => ({ ...prev, backgroundImage: null }))
  }

  function clearActiveCover() {
    if (!activeOrgId) return
    setAppearance((prev) => {
      const coverImages = { ...prev.coverImages }
      delete coverImages[String(activeOrgId)]
      return { ...prev, coverImages }
    })
  }

  return (
    <>
      <style>{workspaceCSS}</style>
      <div className={`ws-shell theme-${appearance.theme}${wallpaper ? ' has-wallpaper' : ''}`} style={{ '--ws-wallpaper': wallpaper } as React.CSSProperties}>

        {/* ICON RAIL */}
        <nav className="ws-rail">
          <div className="ws-brand-mark" aria-label="GrowBase">
            {appearance.theme === 'piggy' ? <PiggyMascot compact /> : <>G<span>+</span></>}
          </div>
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
          {appearance.theme === 'piggy' && (
            <div className="piggy-sidebar-footer">
              <PiggyMascot variant="sleeping" />
              <span>知识都收好啦</span>
            </div>
          )}
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
              <button className="ws-btn ws-personalize-btn" onClick={() => setAppearanceOpen(true)}>
                <Icon d={I.palette} size={13} />个性化
              </button>
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
                      {appearance.theme === 'piggy' ? <PiggyMascot variant="dizzy" /> : <Icon d={I.robot} size={40} />}
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
                <section className="book-shelf-panel" aria-label="知识库书架">
                  <div className="book-shelf-header">
                    <div>
                      <div className="shelf-kicker"><span className="shelf-kicker-line" /> PERSONAL LIBRARY</div>
                      <h2>我的知识书架</h2>
                      <p>把每个知识空间，变成一本可以持续填充的书。</p>
                    </div>
                    <div className="shelf-header-actions">
                      {appearance.theme === 'piggy' && (
                        <div className="piggy-shelf-status">
                          <PiggyMascot variant="sleeping" />
                          <span>慢慢装满</span>
                        </div>
                      )}
                      <span className="shelf-count">{orgs.length} 本知识库</span>
                      <button className="ws-btn" onClick={() => setNewOrgOpen(true)}><Icon d={I.plus} size={13} />新建书</button>
                    </div>
                  </div>
                  <div className="book-shelf-track">
                    {orgs.map((org, index) => {
                      const orgState = orgStates[org.id]
                      return (
                        <ShelfBook
                          key={org.id}
                          org={org}
                          index={index}
                          count={orgState?.items?.length ?? 0}
                          active={activeOrgId === org.id}
                          coverStyleKey={appearance.coverStyles[String(org.id)]}
                          coverImage={appearance.coverImages[String(org.id)]}
                          theme={appearance.theme}
                          onClick={() => { setActiveOrgId(org.id); setActiveCatId(null); setSearch('') }}
                        />
                      )
                    })}
                    <button className="shelf-add-book" onClick={() => setNewOrgOpen(true)}>
                      <span className="shelf-add-icon"><Icon d={I.plus} size={19} /></span>
                      <strong>新建知识库</strong>
                      <small>开启一本新书</small>
                    </button>
                  </div>
                  <div className="shelf-wood" />
                </section>
                <section className="ws-hero" aria-label="知识空间概览">
                  <div className="ws-hero-copy">
                    <div className="ws-eyebrow"><span className="eyebrow-pulse" /> {appearance.theme === 'piggy' ? 'PIGGY LIBRARY / HAPPY' : 'KNOWLEDGE SYSTEM / 01'}</div>
                    <h1>{activeOrg?.name ?? '知识空间'}</h1>
                    <p>{activeOrg?.description || '把链接、视频和想法沉淀成可以持续复用的知识。'}</p>
                    <div className="ws-hero-metrics">
                      <div><strong>{activeState?.items?.length ?? 0}</strong><span>知识条目</span></div>
                      <div><strong>{flattenCategories(categories).length}</strong><span>内容分支</span></div>
                      <div><strong>{processingCount}</strong><span>处理中</span></div>
                    </div>
                  </div>
                  <div className="ws-hero-visual">
                    <div className="visual-caption"><span>{appearance.theme === 'piggy' ? 'IDEAS IN BLOOM' : 'LIVE GRAPH'}</span><small>{activeState?.items?.length ?? 0} NODES</small></div>
                    <KnowledgeOrb nodeCount={Math.max(3, activeState?.items?.length ?? 0)} theme={appearance.theme} />
                    {appearance.theme === 'piggy' && <div className="hero-piggy"><PiggyMascot /></div>}
                  </div>
                </section>
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
                  <div className="ws-section-actions">
                    {appearance.theme === 'piggy' && (
                      <div className="piggy-mood-chip">
                        <PiggyMascot compact variant="dizzy" />
                        <span>脑袋转转，知识归位</span>
                      </div>
                    )}
                    <div className="ws-view-toggle">
                      <button className={`view-btn${viewMode === 'grid' ? ' active' : ''}`} onClick={() => setViewMode('grid')}><Icon d={I.grid} size={13} /></button>
                      <button className={`view-btn${viewMode === 'list' ? ' active' : ''}`} onClick={() => setViewMode('list')}><Icon d={I.list} size={13} /></button>
                    </div>
                  </div>
                </div>
                {activeState?.loading ? (
                  <div className="ws-loading">加载中…</div>
                ) : filteredItems.length === 0 ? (
                  <div className="ws-empty">
                    {appearance.theme === 'piggy' ? <PiggyMascot variant="sleeping" /> : <Icon d={I.book} size={36} />}
                    <strong>这里还没有知识</strong>
                    <p>可添加链接、笔记，或直接上传文件到知识库</p>
                  </div>
                ) : (
                  <div className={viewMode === 'grid' ? 'k-grid' : 'k-list'}>
                    {filteredItems.map((item) => {
                      if (item.status === 'processing') return <ProcessingCard key={item.id} item={item} theme={appearance.theme} />
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
                          {item.ai_reason && <p className="k-reason">{item.status === 'archived' ? '' : 'AI：'}{item.ai_reason}</p>}
                          <div className="k-footer">
                            {item.source_url ? (
                              <a className="k-source" href={item.source_url} target="_blank" rel="noreferrer">
                                <Icon d={I.link} size={11} />
                                {(() => { try { return new URL(item.source_url).hostname } catch { return item.source_url } })()}
                              </a>
                            ) : item.file_name ? (
                              <span className="k-source"><Icon d={I.file} size={11} />{item.file_name} · {formatFileSize(item.file_size)}</span>
                            ) : <span />}
                            <div className="k-actions">
                              {item.content && (
                                <button className="k-view-btn" onClick={() => setSelectedItem(item)}>
                                  <Icon d={I.book} size={13} />
                                  {item.source_type === 'video_tutorial' ? '查看教程' : '查看正文'}
                                </button>
                              )}
                              {item.file_name && (
                                <button className="k-view-btn" onClick={() => handleDownload(item)}>
                                  <Icon d={I.download} size={13} />下载文件
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
        rootClassName={appearance.theme === 'piggy' ? 'piggy-modal' : ''}
        open={Boolean(selectedItem)}
        onCancel={() => setSelectedItem(null)}
        footer={null}
        width={860}
      >
        <article className="tutorial-content">{selectedItem?.content}</article>
      </Modal>

      {/* ADD KNOWLEDGE MODAL */}
      <Modal rootClassName={appearance.theme === 'piggy' ? 'piggy-modal' : ''} title="添加知识" open={addOpen} onCancel={() => { setAddOpen(false); form.resetFields(); setUploadFile(null); setShouldProcessFile(false) }} footer={null} width={580}>
        <Form form={form} layout="vertical" onFinish={handleAdd} style={{ marginTop: 16 }}>
          <div className="add-mode-tabs">
            <button type="button" className={addMode === 'text' ? 'active' : ''} onClick={() => setAddMode('text')}><Icon d={I.link} size={14} />链接 / 笔记</button>
            <button type="button" className={addMode === 'file' ? 'active' : ''} onClick={() => setAddMode('file')}><Icon d={I.upload} size={14} />上传文件</button>
          </div>
          <Form.Item name="title" label="标题"><Input placeholder={addMode === 'file' ? '可选，默认使用文件名' : '不填时会使用链接标题或默认名称'} /></Form.Item>
          {addMode === 'text' ? (
            <>
              <Form.Item name="source_url" label="知识链接"><Input placeholder="https://…（博客、GitHub 仓库、YouTube/B站 视频）" /></Form.Item>
              <Form.Item name="instructions" label="处理要求"><Input.TextArea rows={2} placeholder="例如：把视频内容转换成知识库文档，整理成文字版教程" /></Form.Item>
              <Form.Item name="content" label="补充正文或笔记"><Input.TextArea rows={5} placeholder="粘贴摘要、笔记或网页正文。链接和正文至少填写一项。" /></Form.Item>
            </>
          ) : (
            <>
              <input ref={fileInputRef} className="hidden-file-input" type="file" onChange={(event) => setUploadFile(event.target.files?.[0] ?? null)} />
              <button type="button" className={`file-dropzone${uploadFile ? ' has-file' : ''}`} onClick={() => fileInputRef.current?.click()}>
                <span className="file-drop-icon"><Icon d={uploadFile ? I.file : I.upload} size={22} /></span>
                {uploadFile ? (
                  <span><strong>{uploadFile.name}</strong><small>{formatFileSize(uploadFile.size)} · 点击重新选择</small></span>
                ) : (
                  <span><strong>选择要存入知识库的文件</strong><small>单个文件最大 25 MB</small></span>
                )}
              </button>
              <div className="file-process-option">
                <Checkbox checked={shouldProcessFile} onChange={(event) => setShouldProcessFile(event.target.checked)}>需要 AI 整理</Checkbox>
                <small>{shouldProcessFile ? '上传后会读取文字并生成结构化知识文档' : '默认只保存原文件，不读取内容，也不调用 AI'}</small>
              </div>
              {shouldProcessFile && (
                <Form.Item name="instructions" label="整理要求">
                  <Input.TextArea rows={3} placeholder="例如：整理成面向初学者的教程，保留代码示例和注意事项" />
                </Form.Item>
              )}
            </>
          )}
          <button type="submit" className={`ws-btn ws-btn-primary${addLoading ? ' loading' : ''}`} style={{ width: '100%', justifyContent: 'center' }} disabled={addLoading}>
            <Icon d={addMode === 'file' && !shouldProcessFile ? I.upload : I.robot} size={14} />
            {addLoading ? '添加中…' : addMode === 'file' ? (shouldProcessFile ? '上传并让 AI 整理' : '上传到知识库') : '添加并让 AI 整理'}
          </button>
        </Form>
      </Modal>

      {/* NEW ORG MODAL */}
      <Modal rootClassName={appearance.theme === 'piggy' ? 'piggy-modal' : ''} title="新建知识库" open={newOrgOpen} onCancel={() => { setNewOrgOpen(false); newOrgForm.resetFields() }} footer={null}>
        <Form form={newOrgForm} layout="vertical" onFinish={handleNewOrg} style={{ marginTop: 16 }}>
          <Form.Item name="name" label="名称" rules={[{ required: true, message: '请输入名称' }]}><Input placeholder="例如：个人读书笔记" /></Form.Item>
          <Form.Item name="description" label="描述"><Input placeholder="可选" /></Form.Item>
          <button type="submit" className={`ws-btn ws-btn-primary${newOrgLoading ? ' loading' : ''}`} style={{ width: '100%', justifyContent: 'center' }} disabled={newOrgLoading}>
            {newOrgLoading ? '创建中…' : '创建知识库'}
          </button>
        </Form>
      </Modal>

      {/* TEMPLATE PICKER MODAL */}
      <Modal rootClassName={appearance.theme === 'piggy' ? 'piggy-modal' : ''} title="选择分类体系" open={templateOrgId !== null} onCancel={() => setTemplateOrgId(null)} footer={null} width={680} destroyOnClose>
        {templates.length > 0 && (
          <TemplatePicker
            templates={templates}
            currentKey={templateOrgState?.config?.template_key ?? null}
            onSelect={handleTemplateSave}
            loading={templateSaving}
          />
        )}
      </Modal>

      {/* PERSONALIZATION MODAL */}
      <Modal
        title="个性化知识空间"
        rootClassName={appearance.theme === 'piggy' ? 'piggy-modal' : ''}
        open={appearanceOpen}
        onCancel={() => setAppearanceOpen(false)}
        footer={null}
        width={720}
        destroyOnClose
      >
        <div className="appearance-panel">
          <section className="appearance-section theme-picker-section">
            <div className="appearance-section-head">
              <div><strong>界面主题</strong><span>整套切换颜色、组件、书架和知识库封面</span></div>
            </div>
            <div className="theme-options">
              <button
                className={`theme-option tech${appearance.theme === 'tech' ? ' selected' : ''}`}
                onClick={() => setAppearance((prev) => ({ ...prev, theme: 'tech' }))}
              >
                <span className="theme-preview tech-preview"><i /><i /><i /></span>
                <span className="theme-option-copy"><strong>科技夜航</strong><small>深色 · 极光 · 未来感</small></span>
                <span className="theme-check">✓</span>
              </button>
              <button
                className={`theme-option piggy${appearance.theme === 'piggy' ? ' selected' : ''}`}
                onClick={() => setAppearance((prev) => ({ ...prev, theme: 'piggy' }))}
              >
                <span className="theme-preview piggy-preview"><PiggyMascot compact /></span>
                <span className="theme-option-copy"><strong>猪猪乐园</strong><small>奶油 · 莓果 · 软萌感</small></span>
                <span className="theme-check">✓</span>
              </button>
            </div>
          </section>

          <section className="appearance-section">
            <div className="appearance-section-head">
              <div>
                <strong>空间背景</strong>
                <span>{appearance.backgroundImage ? '自定义图片已应用，可替换或切换回预设背景' : '选择一个氛围，或上传自己的图片'}</span>
              </div>
              <div className="appearance-file-actions">
                <input ref={backgroundInputRef} className="appearance-file-input" type="file" accept="image/*" onChange={handleBackgroundUpload} />
                <button className="ws-btn" onClick={() => backgroundInputRef.current?.click()}><Icon d={I.palette} size={13} />{appearance.backgroundImage ? '替换背景' : '上传背景'}</button>
                {appearance.backgroundImage && <button className="ws-link-btn" onClick={clearCustomBackground}>恢复预设</button>}
              </div>
            </div>
            <div className="background-options">
              {BACKGROUND_PRESETS.map((preset) => (
                <button
                  key={preset.key}
                  className={`background-option${!appearance.backgroundImage && appearance.backgroundPreset === preset.key ? ' selected' : ''}`}
                  style={{ backgroundImage: preset.backgroundImage }}
                  onClick={() => setAppearance((prev) => ({ ...prev, backgroundPreset: preset.key, backgroundImage: null }))}
                >
                  <span>{preset.label}</span>
                </button>
              ))}
              {appearance.backgroundImage && (
                <button
                  className="background-option custom selected"
                  style={{ backgroundImage: `linear-gradient(180deg, transparent 30%, rgba(0,0,0,.64)), url(${appearance.backgroundImage})` }}
                  onClick={() => setAppearance((prev) => ({ ...prev, backgroundImage: appearance.backgroundImage }))}
                >
                  <span>自定义背景 <b>已应用</b></span>
                </button>
              )}
            </div>
          </section>

          <section className="appearance-section">
            <div className="appearance-section-head">
              <div><strong>当前知识库封面</strong><span>{activeOrg?.name ?? '请先选择一本知识库'}</span></div>
              <div className="appearance-file-actions">
                <input ref={coverInputRef} className="appearance-file-input" type="file" accept="image/*" onChange={handleCoverUpload} />
                <button className="ws-btn" disabled={!activeOrgId} onClick={() => coverInputRef.current?.click()}><Icon d={I.palette} size={13} />上传封面</button>
                {activeOrgId && appearance.coverImages[String(activeOrgId)] && <button className="ws-link-btn" onClick={clearActiveCover}>移除图片</button>}
              </div>
            </div>
            {appearance.theme === 'piggy' ? (
              <div className="piggy-cover-default">
                <PiggyMascot compact />
                <div><strong>猪猪主题书封</strong><span>书架会自动使用桃粉、奶油和淡紫色封面；上传图片仍可单独覆盖。</span></div>
              </div>
            ) : (
              <div className="cover-options">
                {COVER_STYLES.map((style) => (
                  <button
                    key={style.key}
                    className={`cover-option${appearance.coverStyles[String(activeOrgId)] === style.key ? ' selected' : ''}`}
                    style={{ backgroundImage: `linear-gradient(145deg, ${style.colors[0]}, ${style.colors[1]})` }}
                    onClick={() => activeOrgId && setAppearance((prev) => ({ ...prev, coverStyles: { ...prev.coverStyles, [String(activeOrgId)]: style.key }, coverImages: Object.fromEntries(Object.entries(prev.coverImages).filter(([id]) => id !== String(activeOrgId))) }))}
                  >
                    <span className="cover-option-dot" style={{ background: style.accent }} />
                    <span>{style.label}</span>
                  </button>
                ))}
              </div>
            )}
          </section>

          <div className="appearance-note"><Icon d={I.apps} size={13} />外观设置保存在当前浏览器中，不会修改知识库内容。</div>
        </div>
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
  --ws-bg: #070a13;
  --ws-panel: #0b101b;
  --ws-item: #101827;
  --ws-hover: #152238;
  --ws-active: #172a42;
  --ws-border: rgba(135, 159, 201, .16);
  --ws-fg: #e7eefc;
  --ws-muted: #8190aa;
  --ws-dim: #506078;
  --ws-accent: #6ee7f9;
  --accent-2: #a78bfa;
  --ws-green: #74e2a5;
  --ws-yellow: #f5c86b;
  --ws-red: #fb7185;
  --ws-rail: 58px;
  --ws-tree: 272px;
}
.ws-shell {
  display: grid; grid-template-columns: var(--ws-rail) var(--ws-tree) 1fr;
  height: 100vh; overflow: hidden;
  position: relative; isolation: isolate;
  background: var(--ws-bg); color: var(--ws-fg);
  font-family: Manrope, "PingFang SC", sans-serif; font-size: 13px;
}
.ws-shell.has-wallpaper {
  background-image: linear-gradient(115deg, rgba(5, 8, 17, .82), rgba(5, 8, 17, .56)), var(--ws-wallpaper);
  background-size: cover; background-position: center; background-attachment: fixed;
}
.ws-shell.has-wallpaper .ws-main { background: rgba(7, 10, 19, .58); }
.ws-shell::before {
  content: ''; position: absolute; inset: 0; pointer-events: none; z-index: -1; opacity: .3;
  background-image: linear-gradient(rgba(110,231,249,.035) 1px, transparent 1px), linear-gradient(90deg, rgba(110,231,249,.035) 1px, transparent 1px);
  background-size: 42px 42px;
}
.ws-shell::after {
  content: ''; position: absolute; left: 58px; right: 0; top: 59px; height: 1px; pointer-events: none;
  background: rgba(110,231,249,.2); opacity: .65;
}
.ws-shell > * { position: relative; z-index: 1; }
.ws-brand-mark {
  width: 34px; height: 34px; margin: 0 0 18px; border: 1px solid rgba(110,231,249,.52); border-radius: 10px;
  display: grid; place-items: center; color: var(--ws-accent); font-size: 15px; font-weight: 800; letter-spacing: -.08em;
  box-shadow: 0 0 22px rgba(110,231,249,.14), inset 0 0 18px rgba(110,231,249,.06);
}
.ws-brand-mark span { color: var(--accent-2); margin-left: 1px; }
.ws-hero {
  min-height: 214px; display: flex; align-items: stretch; justify-content: space-between; gap: 28px;
  border: 1px solid var(--ws-border); border-radius: 10px; overflow: hidden; margin-bottom: 22px;
  background: rgba(10,16,28,.76); box-shadow: 0 18px 48px rgba(0,0,0,.18);
}
.ws-hero-copy { padding: 28px 0 24px 30px; min-width: 0; display: flex; flex-direction: column; justify-content: center; }
.ws-eyebrow { display: flex; align-items: center; gap: 8px; color: var(--ws-accent); font-family: "IBM Plex Mono", monospace; font-size: 10px; letter-spacing: .14em; }
.eyebrow-pulse { width: 6px; height: 6px; border-radius: 50%; background: var(--ws-green); box-shadow: 0 0 12px var(--ws-green); }
.ws-hero h1 { margin: 12px 0 8px; color: var(--ws-fg); font-size: clamp(26px, 3vw, 38px); line-height: 1.08; letter-spacing: -.04em; }
.ws-hero-copy > p { max-width: 470px; margin: 0; color: var(--ws-muted); font-size: 13px; line-height: 1.7; }
.ws-hero-metrics { display: flex; gap: 28px; margin-top: 24px; }
.ws-hero-metrics div { display: flex; flex-direction: column; gap: 3px; }
.ws-hero-metrics strong { color: var(--ws-fg); font-family: "IBM Plex Mono", monospace; font-size: 18px; font-weight: 500; }
.ws-hero-metrics span { color: var(--ws-dim); font-size: 10px; letter-spacing: .06em; }
.ws-hero-visual { width: min(42%, 340px); min-width: 230px; position: relative; border-left: 1px solid var(--ws-border); overflow: hidden; }
.visual-caption { position: absolute; z-index: 2; left: 18px; top: 17px; display: flex; flex-direction: column; gap: 3px; font-family: "IBM Plex Mono", monospace; font-size: 9px; letter-spacing: .11em; color: var(--ws-accent); }
.visual-caption small { color: var(--ws-dim); font-size: 9px; }
.knowledge-orb { position: absolute; inset: 0; cursor: crosshair; }
.knowledge-orb canvas { display: block; width: 100%; height: 100%; }
.ws-topbar { height: 60px; border-bottom-color: var(--ws-border); background: rgba(7,10,19,.78); backdrop-filter: blur(16px); }
.ws-sidebar, .ws-rail { background: rgba(11,16,27,.82); backdrop-filter: blur(18px); }
.ws-sidebar-title { color: var(--ws-dim); font-family: "IBM Plex Mono", monospace; letter-spacing: .14em; }
.ws-content { padding: 26px 30px 42px; }
.book-shelf-panel {
  position: relative; overflow: hidden; margin-bottom: 22px; padding: 24px 26px 0;
  border: 1px solid rgba(135, 159, 201, .18); border-radius: 12px;
  background: linear-gradient(150deg, rgba(19, 29, 47, .86), rgba(9, 14, 25, .7));
  box-shadow: 0 20px 50px rgba(0, 0, 0, .16), inset 0 1px 0 rgba(255,255,255,.03);
}
.book-shelf-panel::before {
  content: ''; position: absolute; right: -90px; top: -120px; width: 310px; height: 250px; pointer-events: none;
  background: radial-gradient(circle, rgba(110, 231, 249, .12), transparent 68%);
}
.book-shelf-header { position: relative; z-index: 1; display: flex; justify-content: space-between; align-items: flex-start; gap: 20px; }
.shelf-kicker { display: flex; align-items: center; gap: 8px; color: var(--ws-accent); font: 10px "IBM Plex Mono", monospace; letter-spacing: .16em; }
.shelf-kicker-line { width: 22px; height: 1px; background: var(--ws-accent); box-shadow: 0 0 9px var(--ws-accent); }
.book-shelf-header h2 { margin: 9px 0 4px; color: var(--ws-fg); font-size: 21px; letter-spacing: -.03em; }
.book-shelf-header p { margin: 0; color: var(--ws-muted); font-size: 12px; }
.shelf-header-actions { display: flex; align-items: center; gap: 12px; }
.shelf-count { color: var(--ws-dim); font: 10px "IBM Plex Mono", monospace; letter-spacing: .08em; white-space: nowrap; }
.book-shelf-track { position: relative; z-index: 1; display: flex; align-items: flex-end; gap: 18px; min-height: 194px; padding: 22px 2px 19px; overflow-x: auto; }
.shelf-book, .shelf-add-book { appearance: none; border: 0; background: none; color: inherit; font: inherit; cursor: pointer; }
.shelf-book { width: 116px; flex: 0 0 116px; text-align: left; transition: transform .2s ease; }
.shelf-book:hover, .shelf-book.active { transform: translateY(-9px); }
.shelf-book-cover { position: relative; display: flex; flex-direction: column; justify-content: flex-end; overflow: hidden; width: 100%; height: 145px; padding: 14px 12px; box-sizing: border-box; border-radius: 3px 8px 8px 3px; border-left: 5px solid color-mix(in srgb, var(--book-accent, #6ee7f9) 70%, #101827); box-shadow: 8px 11px 0 rgba(0,0,0,.24), 0 18px 26px rgba(0,0,0,.24); background-size: cover; background-position: center; isolation: isolate; }
.shelf-book-cover::after { content: ''; position: absolute; inset: 0; z-index: -1; background: linear-gradient(180deg, transparent 26%, rgba(0,0,0,.56)); }
.book-cover-shine { position: absolute; top: -25%; right: 12px; width: 18px; height: 170%; transform: rotate(17deg); background: rgba(255,255,255,.12); filter: blur(5px); }
.book-cover-mark { color: var(--book-accent, #b7fbff); font-size: 12px; font-weight: 800; letter-spacing: -.08em; }
.book-cover-mark span { color: #fff; }
.shelf-book-cover strong { display: -webkit-box; overflow: hidden; margin-top: auto; color: #fff; font-size: 12px; line-height: 1.25; -webkit-line-clamp: 3; -webkit-box-orient: vertical; }
.shelf-book-cover small { margin-top: 6px; color: rgba(255,255,255,.68); font-size: 9px; }
.shelf-book-label { display: block; overflow: hidden; margin-top: 13px; color: var(--ws-muted); font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
.shelf-book.active .shelf-book-label { color: var(--ws-accent); }
.shelf-add-book { display: flex; flex: 0 0 116px; width: 116px; height: 145px; align-items: center; justify-content: center; flex-direction: column; gap: 7px; margin-bottom: 0; border: 1px dashed rgba(135, 159, 201, .28); border-radius: 6px; color: var(--ws-muted); transition: border-color .15s, color .15s, background .15s; }
.shelf-add-book:hover { border-color: var(--ws-accent); color: var(--ws-accent); background: rgba(110,231,249,.05); }
.shelf-add-icon { display: grid; place-items: center; width: 34px; height: 34px; border: 1px solid currentColor; border-radius: 50%; }
.shelf-add-book strong { font-size: 11px; font-weight: 600; }
.shelf-add-book small { color: var(--ws-dim); font-size: 9px; }
.shelf-wood { position: relative; height: 12px; margin: 0 -26px; border-top: 1px solid rgba(204, 168, 112, .3); background: linear-gradient(180deg, rgba(104, 70, 38, .7), rgba(37, 24, 21, .9)); box-shadow: 0 -6px 16px rgba(224, 163, 90, .08); }
.ws-personalize-btn { color: var(--ws-accent); }
.appearance-panel { padding-top: 6px; }
.appearance-section { padding: 14px 0 18px; border-bottom: 1px solid var(--ws-border); }
.appearance-section:last-of-type { border-bottom: 0; }
.appearance-section-head { display: flex; justify-content: space-between; align-items: center; gap: 16px; margin-bottom: 13px; }
.appearance-section-head > div:first-child { display: flex; flex-direction: column; gap: 4px; }
.appearance-section-head strong { color: var(--ws-fg); font-size: 13px; }
.appearance-section-head span { color: var(--ws-muted); font-size: 11px; }
.appearance-file-actions { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
.appearance-file-input { display: none; }
.background-options, .cover-options { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
.background-option, .cover-option { position: relative; overflow: hidden; min-height: 68px; border: 1px solid var(--ws-border); border-radius: 7px; background-color: var(--ws-item); background-size: cover; background-position: center; color: #fff; cursor: pointer; transition: border-color .15s, transform .15s; }
.background-option:hover, .cover-option:hover { transform: translateY(-2px); border-color: var(--ws-accent); }
.background-option::after, .cover-option::after { content: ''; position: absolute; inset: 0; background: linear-gradient(180deg, transparent 20%, rgba(0,0,0,.62)); }
.background-option span, .cover-option span:last-child { position: absolute; z-index: 1; left: 10px; bottom: 8px; font-size: 11px; }
.background-option.custom span { display: flex; align-items: center; gap: 6px; }
.background-option.custom b { padding: 2px 5px; border-radius: 3px; background: var(--ws-accent); color: #061018; font-size: 8px; font-weight: 700; }
.background-option.selected, .cover-option.selected { border-color: var(--ws-accent); box-shadow: 0 0 0 1px var(--ws-accent), 0 0 18px rgba(110,231,249,.16); }
.cover-options { grid-template-columns: repeat(5, 1fr); }
.cover-option { min-height: 88px; display: flex; align-items: flex-start; justify-content: flex-end; flex-direction: column; padding: 10px; box-sizing: border-box; }
.cover-option-dot { position: relative; z-index: 1; width: 7px; height: 7px; margin-bottom: auto; border-radius: 50%; box-shadow: 0 0 12px currentColor; }
.piggy-cover-default { display: flex; align-items: center; gap: 12px; min-height: 62px; padding: 10px 13px; border: 1px solid rgba(217,66,122,.2); border-radius: 8px; background: linear-gradient(120deg,#fff8ef,#ffe6ee 58%,#eee5ff); }
.piggy-cover-default > div { display: flex; min-width: 0; flex-direction: column; gap: 4px; }
.piggy-cover-default strong { color: #563450; font-size: 12px; }
.piggy-cover-default span { color: #9c6b86; font-size: 10px; line-height: 1.5; }
.appearance-note { display: flex; align-items: center; gap: 7px; margin-top: 15px; color: var(--ws-dim); font-size: 11px; }
.ws-btn, .ws-search-box { border-color: var(--ws-border); background: rgba(16,24,39,.86); }
.ws-btn-primary { background: var(--ws-accent); border-color: var(--ws-accent); color: #061018; box-shadow: 0 0 20px rgba(110,231,249,.14); }
.ws-btn-primary:hover:not(:disabled) { background: #a5f3fc; color: #061018; }
.k-card { background: rgba(16,24,39,.82); box-shadow: 0 10px 24px rgba(0,0,0,.12); }
.k-card:hover { border-color: rgba(110,231,249,.6); box-shadow: 0 14px 30px rgba(0,0,0,.2); transform: translateY(-1px); }
.k-card { transition: border-color .16s, box-shadow .16s, transform .16s; }
.ws-section-title { font-family: "IBM Plex Mono", monospace; letter-spacing: .04em; }
.ws-section-tag, .k-tag { background: rgba(110,231,249,.08); border: 1px solid rgba(110,231,249,.12); }
.ws-chat-bubble, .ws-chat-input { background: rgba(16,24,39,.84); }
.ws-chat-msg.user .ws-chat-bubble { color: #061018; }
.ws-tree::-webkit-scrollbar-thumb,.ws-content::-webkit-scrollbar-thumb,.ws-chat-messages::-webkit-scrollbar-thumb { background: #263852; }
@media (max-width: 820px) {
  .ws-hero-visual { width: 34%; min-width: 180px; }
  .ws-content { padding: 20px 18px 32px; }
  .book-shelf-panel { padding-left: 18px; padding-right: 18px; }
  .shelf-wood { margin-left: -18px; margin-right: -18px; }
  .book-shelf-track { gap: 14px; }
}
@media (max-width: 640px) {
  .ws-hero { min-height: 250px; }
  .ws-hero-copy { padding: 22px 20px; }
  .ws-hero-visual { display: none; }
  .ws-hero-metrics { gap: 18px; }
  .book-shelf-header { flex-direction: column; gap: 14px; }
  .shelf-header-actions { width: 100%; justify-content: space-between; }
  .ws-personalize-btn { padding-left: 7px; padding-right: 7px; }
  .appearance-section-head { align-items: flex-start; flex-direction: column; }
  .background-options { grid-template-columns: repeat(2, 1fr); }
  .cover-options { grid-template-columns: repeat(3, 1fr); }
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
.ws-main { display: flex; flex-direction: column; min-width: 0; overflow: hidden; background: var(--ws-bg); }
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
.ws-section-actions { display: flex; align-items: center; gap: 9px; }
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
  position: relative; overflow: hidden;
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
  .ws-shell { grid-template-columns: var(--ws-rail) minmax(0, 1fr); }
  .ws-sidebar { display: none; }
  .ws-topbar { height: 52px; padding: 0 10px; gap: 6px; }
  .ws-breadcrumb { min-width: 0; max-width: 116px; overflow: hidden; white-space: nowrap; }
  .ws-breadcrumb span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .ws-topbar-right { min-width: 0; gap: 4px; }
  .ws-search-box, .ws-topbar-right > .ws-btn:not(.ws-personalize-btn):not(.ws-btn-primary) { display: none; }
  .ws-personalize-btn, .ws-topbar-right .ws-btn-primary { justify-content: center; width: 34px; padding-left: 0; padding-right: 0; font-size: 0; }
  .ws-content { min-width: 0; padding: 16px 12px 28px; }
  .book-shelf-panel { min-width: 0; padding: 18px 14px 0; }
  .shelf-wood { margin-left: -14px; margin-right: -14px; }
  .book-shelf-track { margin-right: -14px; padding-right: 14px; }
}

/* Transparent mascot assets extracted from the user-provided reference images. */
.piggy-mascot { display: block; width: 126px; height: 102px; object-fit: contain; flex: 0 0 auto; }
.piggy-mascot.compact { width: 34px; height: 34px; }
.processing-piggy { position: absolute; right: 12px; bottom: 10px; width: 48px; height: 48px; opacity: .72; pointer-events: none; }
.processing-piggy .piggy-mascot { width: 100%; height: 100%; }
.piggy-sidebar-footer { position: relative; flex: 0 0 92px; overflow: hidden; border-top: 1px solid rgba(217,66,122,.13); background: linear-gradient(150deg,rgba(255,244,247,.72),rgba(239,229,255,.58)); }
.piggy-sidebar-footer .piggy-mascot { position: absolute; left: 4px; bottom: -13px; width: 92px; height: 76px; filter: drop-shadow(0 7px 7px rgba(112,58,88,.12)); }
.piggy-sidebar-footer span { position: absolute; right: 13px; top: 31px; color: #a06a87; font-size: 10px; letter-spacing: .04em; }
.piggy-shelf-status { display: flex; align-items: center; gap: 3px; height: 34px; padding: 0 8px 0 2px; border: 1px solid rgba(217,66,122,.14); border-radius: 17px; background: rgba(255,250,247,.66); color: #a06a87; font-size: 9px; white-space: nowrap; }
.piggy-shelf-status .piggy-mascot { width: 48px; height: 38px; margin-bottom: 5px; }
.piggy-mood-chip { display: flex; align-items: center; height: 28px; padding: 0 10px 0 3px; border: 1px solid rgba(116,81,139,.15); border-radius: 14px; background: linear-gradient(100deg,rgba(255,233,239,.88),rgba(238,229,255,.82)); color: #815676; font-size: 10px; white-space: nowrap; }
.piggy-mood-chip .piggy-mascot { width: 34px; height: 34px; margin-right: 2px; }

.theme-options { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.theme-option {
  position: relative; display: grid; grid-template-columns: 74px minmax(0, 1fr) 22px; align-items: center; gap: 12px;
  min-height: 92px; padding: 10px 12px; border: 1px solid rgba(135,159,201,.2); border-radius: 8px;
  background: #101827; color: #e7eefc; text-align: left; cursor: pointer; transition: transform .16s, border-color .16s, box-shadow .16s;
}
.theme-option:hover { transform: translateY(-2px); }
.theme-option.selected { border-color: #6ee7f9; box-shadow: 0 0 0 1px #6ee7f9; }
.theme-option.piggy { background: #fff8f3; color: #563450; border-color: #efb5c5; }
.theme-option.piggy.selected { border-color: #d9427a; box-shadow: 0 0 0 1px #d9427a, 0 8px 24px rgba(160, 53, 100, .12); }
.theme-preview { position: relative; display: grid; place-items: center; width: 74px; height: 68px; overflow: hidden; border-radius: 6px; }
.tech-preview { background: radial-gradient(circle at 70% 25%, rgba(110,231,249,.42), transparent 30%), linear-gradient(145deg,#07111f,#21152f); }
.tech-preview::before { content: ''; width: 29px; height: 29px; border: 1px solid #6ee7f9; border-radius: 50%; box-shadow: 0 0 18px #6ee7f9; }
.tech-preview i { position: absolute; width: 3px; height: 3px; border-radius: 50%; background: #a78bfa; box-shadow: 14px -12px #6ee7f9, -18px 8px #6ee7f9, 19px 14px #a78bfa; }
.piggy-preview { background: linear-gradient(145deg,#fff6e7,#ffe1ea 56%,#e9ddff); }
.theme-option-copy { min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.theme-option-copy strong { font-size: 13px; }
.theme-option-copy small { color: #8190aa; font-size: 10px; }
.theme-option.piggy .theme-option-copy small { color: #9c6b86; }
.theme-check { display: grid; place-items: center; width: 20px; height: 20px; border-radius: 50%; background: rgba(255,255,255,.08); color: transparent; font-size: 11px; }
.theme-option.selected .theme-check { background: #6ee7f9; color: #07111f; }
.theme-option.piggy.selected .theme-check { background: #d9427a; color: #fff; }

.hero-piggy { position: absolute; z-index: 3; right: 16px; bottom: 9px; filter: drop-shadow(0 10px 11px rgba(95, 49, 81, .18)); animation: piggy-float 4.6s ease-in-out infinite; pointer-events: none; }
@keyframes piggy-float { 0%, 100% { transform: translateY(2px) rotate(-1deg); } 50% { transform: translateY(-5px) rotate(1deg); } }
.book-cover-pig { position: absolute; z-index: 2; top: 10px; left: 10px; display: grid; place-items: center; width: 44px; height: 44px; border-radius: 50%; background: rgba(255,255,255,.5); box-shadow: inset 0 0 0 1px rgba(109,54,95,.14); }
.book-cover-pig .piggy-mascot { width: 42px; height: 42px; }
.piggy-book .shelf-book-cover::before { content: '✦'; position: absolute; top: 13px; right: 13px; color: var(--book-accent); font-size: 12px; }

.ws-shell.theme-piggy {
  --ws-bg: #fff8f3;
  --ws-panel: #fffaf7;
  --ws-item: #fffdfb;
  --ws-hover: #ffe8ef;
  --ws-active: #fbd9e5;
  --ws-border: rgba(105, 61, 91, .16);
  --ws-fg: #52324d;
  --ws-muted: #8e6680;
  --ws-dim: #b18ba3;
  --ws-accent: #d9427a;
  --accent-2: #74518b;
  --ws-green: #4e9b77;
  --ws-yellow: #c78a2e;
  --ws-red: #cc4b63;
}
.ws-shell.theme-piggy.has-wallpaper { background-image: linear-gradient(115deg, rgba(255,250,247,.86), rgba(255,245,248,.72)), var(--ws-wallpaper); }
.ws-shell.theme-piggy.has-wallpaper .ws-main { background: rgba(255, 250, 247, .55); }
.ws-shell.theme-piggy::before {
  opacity: .72; background-image: radial-gradient(circle, rgba(217,66,122,.13) 1.5px, transparent 1.7px), radial-gradient(circle, rgba(116,81,139,.1) 1px, transparent 1.2px);
  background-position: 0 0, 18px 18px; background-size: 36px 36px;
}
.ws-shell.theme-piggy::after { top: 59px; background: rgba(217,66,122,.2); }
.theme-piggy .ws-brand-mark { border-color: #ef9bb5; background: #fff4f6; box-shadow: 0 8px 18px rgba(143,72,105,.13); }
.theme-piggy .ws-topbar { background: rgba(255,250,247,.82); }
.theme-piggy .ws-sidebar, .theme-piggy .ws-rail { background: rgba(255,250,247,.87); }
.theme-piggy .ws-rail-btn.active { color: #fff; background: #d9427a; box-shadow: 0 5px 13px rgba(217,66,122,.2); }
.theme-piggy .ws-hero {
  border-color: rgba(116,81,139,.18); background: linear-gradient(115deg, rgba(255,253,248,.94), rgba(255,226,236,.88) 60%, rgba(232,220,255,.88));
  box-shadow: 0 18px 44px rgba(120,72,102,.12), inset 0 1px 0 #fff;
}
.theme-piggy .ws-hero-visual { background: rgba(255,255,255,.26); }
.theme-piggy .knowledge-orb { opacity: .72; transform: scale(.94); }
.theme-piggy .book-shelf-panel {
  border-color: rgba(217,66,122,.18); background: linear-gradient(145deg, rgba(255,253,247,.96), rgba(255,226,236,.88) 62%, rgba(231,222,253,.78));
  box-shadow: 0 19px 44px rgba(126,75,104,.11), inset 0 1px 0 #fff;
}
.theme-piggy .book-shelf-panel::before { right: -40px; top: -78px; width: 210px; height: 180px; background: radial-gradient(circle, rgba(116,81,139,.12), transparent 68%); }
.theme-piggy .shelf-wood { height: 14px; border-top-color: rgba(112,55,83,.28); background: repeating-linear-gradient(105deg, #9a5574 0 32px, #bd708a 32px 64px); box-shadow: 0 -7px 16px rgba(177,88,119,.13); }
.theme-piggy .shelf-book-cover { box-shadow: 7px 10px 0 rgba(104,54,82,.17), 0 17px 25px rgba(123,69,98,.16); }
.theme-piggy .shelf-add-book { border-color: rgba(217,66,122,.32); background: rgba(255,255,255,.34); }
.theme-piggy .ws-btn, .theme-piggy .ws-search-box { background: rgba(255,253,251,.88); box-shadow: 0 4px 13px rgba(116,65,94,.06); }
.theme-piggy .ws-btn-primary { background: #d9427a; border-color: #d9427a; color: #fff; box-shadow: 0 8px 18px rgba(217,66,122,.18); }
.theme-piggy .ws-btn-primary:hover:not(:disabled) { background: #bd3168; color: #fff; }
.theme-piggy .k-card { background: rgba(255,253,251,.91); box-shadow: 0 10px 26px rgba(106,62,89,.08); }
.theme-piggy .k-card:hover { border-color: rgba(217,66,122,.55); box-shadow: 0 14px 30px rgba(106,62,89,.13); }
.theme-piggy .ws-section-tag, .theme-piggy .k-tag { background: rgba(217,66,122,.07); border-color: rgba(217,66,122,.12); }
.theme-piggy .ws-view-toggle, .theme-piggy .ws-chat-bubble, .theme-piggy .ws-chat-input, .theme-piggy .template-desc { background: rgba(255,253,251,.9); }
.theme-piggy .ws-chat-msg.user .ws-chat-bubble { background: #d9427a; color: #fff; }
.theme-piggy .ws-chat-avatar { color: #fff; }
.theme-piggy .ws-tree::-webkit-scrollbar-thumb, .theme-piggy .ws-content::-webkit-scrollbar-thumb, .theme-piggy .ws-chat-messages::-webkit-scrollbar-thumb { background: #e8b8c8; }

.piggy-modal .ant-modal-content, .piggy-modal .ant-modal-header { background: #fffaf7 !important; color: #52324d !important; }
.piggy-modal .ant-modal-title, .piggy-modal .ant-modal-close, .piggy-modal .ant-form-item-label > label { color: #52324d !important; }
.piggy-modal .ant-modal-close:hover { color: #d9427a !important; }
.piggy-modal .ant-input, .piggy-modal .ant-input-affix-wrapper, .piggy-modal .ant-select-selector, .piggy-modal textarea.ant-input {
  background: #fffdfb !important; border-color: rgba(105,61,91,.2) !important; color: #52324d !important;
}
.piggy-modal .ant-input::placeholder, .piggy-modal textarea.ant-input::placeholder { color: #b18ba3 !important; }
.piggy-modal .appearance-section { border-color: rgba(105,61,91,.15); }
.piggy-modal .appearance-section-head strong { color: #52324d; }
.piggy-modal .appearance-section-head span, .piggy-modal .appearance-note { color: #8e6680; }
.piggy-modal .ws-btn { color: #52324d; background: #fffdfb; border-color: rgba(105,61,91,.2); }
.piggy-modal .ws-link-btn { color: #d9427a; }

@media (max-width: 640px) {
  .theme-options { grid-template-columns: 1fr; }
  .theme-option { min-height: 82px; }
  .hero-piggy { display: none; }
  .piggy-shelf-status, .piggy-mood-chip span { display: none; }
  .piggy-mood-chip { width: 31px; padding: 0; justify-content: center; }
}
`
