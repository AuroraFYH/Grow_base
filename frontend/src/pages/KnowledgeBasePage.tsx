import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Alert, Avatar, Badge, Button, Card, Empty, Form, Input, Layout, List,
  Modal, Popconfirm, Progress, Select, Space, Spin, Steps, Tag, Tabs,
  Typography, message,
} from 'antd'
import {
  ArrowLeftOutlined, BookOutlined, CheckCircleOutlined, DeleteOutlined,
  LinkOutlined, LoadingOutlined, PlusOutlined, RobotOutlined, SendOutlined,
  SettingOutlined, SyncOutlined, AppstoreOutlined,
} from '@ant-design/icons'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { orgApi } from '../api/organizations'
import type { CategoryOut, ClassificationConfig, ClassificationTemplate } from '../api/organizations'
import { knowledgeApi } from '../api/knowledge'
import type { ChatMessage, KnowledgeItem } from '../api/knowledge'

const { Header, Content, Sider } = Layout
const { Title, Text, Paragraph } = Typography

function flattenCategories(categories: CategoryOut[]): CategoryOut[] {
  return categories.flatMap((c) => [c, ...flattenCategories(c.children)])
}

function statusMeta(status: KnowledgeItem['status']) {
  if (status === 'review') return { color: 'gold' as const, label: '需要确认' }
  if (status === 'processing') return { color: 'processing' as const, label: '整理中' }
  if (status === 'error') return { color: 'error' as const, label: '处理失败' }
  return { color: 'green' as const, label: '已整理' }
}

// Shows a step-by-step progress indicator for items being processed
function ProcessingCard({ item }: { item: KnowledgeItem }) {
  const [step, setStep] = useState(0)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)
  const steps = item.source_type === 'video_tutorial'
    ? ['解析视频链接', 'DTK / Whisper 提取字幕', '生成文字版教程', '分类与入库']
    : item.source_type === 'link'
      ? ['正在抓取链接内容', 'AI 阅读理解中', '分类与生成摘要']
      : ['读取笔记内容', 'AI 分析中', '分类与生成摘要']

  useEffect(() => {
    timer.current = setInterval(() => {
      setStep((s) => (s < steps.length - 1 ? s + 1 : s))
    }, 4000)
    return () => { if (timer.current) clearInterval(timer.current) }
  }, [steps.length])

  return (
    <Card style={{ width: '100%', borderColor: '#91caff', background: '#f0f7ff' }} bodyStyle={{ padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Space wrap style={{ marginBottom: 12 }}>
            <Title level={5} style={{ margin: 0 }}>{item.title}</Title>
            <Badge status="processing" text={<Text style={{ color: '#1677ff' }}>AI 正在整理…</Text>} />
          </Space>
          <Steps
            size="small"
            current={step}
            items={steps.map((s, i) => ({
              title: s,
              icon: i < step
                ? <CheckCircleOutlined style={{ color: '#52c41a' }} />
                : i === step
                ? <LoadingOutlined style={{ color: '#1677ff' }} />
                : undefined,
            }))}
            style={{ marginTop: 4 }}
          />
          <Progress percent={Math.round(((step + 1) / steps.length) * 85)} showInfo={false} strokeColor="#1677ff" style={{ marginTop: 12, marginBottom: 0 }} />
        </div>
        {item.source_url && (
          <a href={item.source_url} target="_blank" rel="noreferrer" style={{ flexShrink: 0 }}>
            <LinkOutlined /> 来源
          </a>
        )}
      </div>
    </Card>
  )
}

// Template picker used both in create-org flow and standalone
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
  const [selected, setSelected] = useState<string>(currentKey || templates[0]?.key || '')
  const [customPrompt, setCustomPrompt] = useState('')
  const template = templates.find((t) => t.key === selected)

  useEffect(() => {
    setSelected(currentKey || templates[0]?.key || '')
  }, [currentKey, templates])

  useEffect(() => {
    if (template) setCustomPrompt(template.default_prompt)
  }, [selected])

  const handleOk = () => {
    onSelect(selected, customPrompt, !!currentKey && currentKey !== selected)
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        {templates.map((t) => (
          <Card
            key={t.key}
            size="small"
            hoverable
            onClick={() => setSelected(t.key)}
            style={{
              width: 180,
              border: selected === t.key ? '2px solid #1677ff' : '1px solid #d9d9d9',
              cursor: 'pointer',
              background: selected === t.key ? '#f0f7ff' : '#fff',
            }}
          >
            <Text strong style={{ display: 'block', marginBottom: 4 }}>{t.name}</Text>
            <Text type="secondary" style={{ fontSize: 12 }}>{t.summary}</Text>
          </Card>
        ))}
      </div>

      {template && (
        <Card size="small" style={{ marginBottom: 16, background: '#fafafa' }}>
          <Text type="secondary">{template.description}</Text>
          <br />
          <Text type="secondary">适合：{template.suitable_for}</Text>
        </Card>
      )}

      <div style={{ marginBottom: 8 }}>
        <Text strong>分类提示词</Text>
        <Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>可以直接使用模板默认值，也可以按你的习惯调整</Text>
      </div>
      <Input.TextArea
        rows={5}
        value={customPrompt}
        onChange={(e) => setCustomPrompt(e.target.value)}
        placeholder="描述 AI 应该如何判断资料所属分类"
      />

      <Button
        type="primary"
        block
        style={{ marginTop: 16 }}
        loading={loading}
        onClick={handleOk}
        disabled={selected === 'custom' && !customPrompt.trim()}
      >
        {currentKey ? '保存分类配置' : '应用并进入知识库'}
      </Button>
    </div>
  )
}

export default function KnowledgeBasePage() {
  const { orgId } = useParams<{ orgId: string }>()
  const id = Number(orgId)
  const location = useLocation()
  const navigate = useNavigate()

  const [items, setItems] = useState<KnowledgeItem[]>([])
  const [categories, setCategories] = useState<CategoryOut[]>([])
  const [config, setConfig] = useState<ClassificationConfig | null>(null)
  const [templates, setTemplates] = useState<ClassificationTemplate[]>([])
  const [search, setSearch] = useState('')
  const [categoryId, setCategoryId] = useState<number | undefined>()
  const [loading, setLoading] = useState(true)
  const [addOpen, setAddOpen] = useState(false)
  const [addLoading, setAddLoading] = useState(false)
  const [templateOpen, setTemplateOpen] = useState(false)
  const [templateSaving, setTemplateSaving] = useState(false)
  const [form] = Form.useForm()
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const [selectedItem, setSelectedItem] = useState<KnowledgeItem | null>(null)

  const isAssistant = location.pathname.endsWith('/assistant')
  const flatCats = useMemo(() => flattenCategories(categories), [categories])

  const loadKnowledge = async () => {
    setLoading(true)
    try {
      const [{ data: knowledge }, { data: categoryData }, { data: classification }] = await Promise.all([
        knowledgeApi.list(id, { search: search || undefined, category_id: categoryId }),
        orgApi.getCategories(id),
        orgApi.getClassification(id),
      ])
      setItems(knowledge)
      setCategories(categoryData)
      setConfig(classification)
    } catch (err: any) {
      message.error(err.response?.data?.detail || '加载知识库失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadKnowledge() }, [id, categoryId])

  useEffect(() => {
    orgApi.getClassificationTemplates().then(({ data }) => setTemplates(data)).catch(() => {})
  }, [])

  // Auto-poll every 3s while any item is still processing
  useEffect(() => {
    if (!items.some((i) => i.status === 'processing')) return
    const timer = setTimeout(() => loadKnowledge(), 3000)
    return () => clearTimeout(timer)
  }, [items])

  useEffect(() => {
    if (!isAssistant) return
    knowledgeApi.history(id).then(({ data }) => setChatMessages(data)).catch(() => {})
  }, [id, isAssistant])

  const handleSearch = () => loadKnowledge()

  const handleAdd = async (values: { title?: string; source_url?: string; content?: string; instructions?: string }) => {
    setAddLoading(true)
    try {
      const newItem = (await knowledgeApi.create(id, values)).data
      setAddOpen(false)
      form.resetFields()
      setItems((prev) => [newItem, ...prev])
      message.success('已添加，AI 正在后台处理…')
    } catch (err: any) {
      message.error(err.response?.data?.detail || '添加知识失败')
    } finally {
      setAddLoading(false)
    }
  }

  const handleRemove = async (knowledgeId: number) => {
    try {
      await knowledgeApi.remove(id, knowledgeId)
      setItems((prev) => prev.filter((item) => item.id !== knowledgeId))
    } catch (err: any) {
      message.error(err.response?.data?.detail || '移除失败')
    }
  }

  const handleReprocess = async () => {
    try {
      const { data } = await knowledgeApi.reprocess(id)
      setItems(data)
      message.success(`已触发重新整理 ${data.length} 条知识`)
    } catch (err: any) {
      message.error(err.response?.data?.detail || '重新整理失败')
    }
  }

  const handleChat = async () => {
    const text = chatInput.trim()
    if (!text || chatLoading) return
    setChatInput('')
    setChatMessages((prev) => [...prev, { id: Date.now(), role: 'user', content: text, created_at: new Date().toISOString() }])
    setChatLoading(true)
    try {
      const { data } = await knowledgeApi.chat(id, text)
      setChatMessages((prev) => [...prev, data.message])
      if (data.action === 'reprocess') await loadKnowledge()
    } catch (err: any) {
      message.error(err.response?.data?.detail || 'AI 暂时无法响应')
    } finally {
      setChatLoading(false)
    }
  }

  const handleTemplateSave = async (key: string, prompt: string, replace: boolean) => {
    setTemplateSaving(true)
    try {
      const { data } = await orgApi.updateClassification(id, {
        template_key: key,
        custom_prompt: prompt || undefined,
        replace_existing: replace,
      })
      setConfig(data)
      const { data: cats } = await orgApi.getCategories(id)
      setCategories(cats)
      setTemplateOpen(false)
      message.success('分类体系已更新')
    } catch (err: any) {
      message.error(err.response?.data?.detail || '保存失败')
    } finally {
      setTemplateSaving(false)
    }
  }

  const processingCount = items.filter((i) => i.status === 'processing').length

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider width={220} theme="light" style={{ borderRight: '1px solid #edf0f5' }}>
        <div style={{ padding: '18px 16px', borderBottom: '1px solid #edf0f5' }}>
          <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate('/')}>
            返回空间列表
          </Button>
        </div>
        <div style={{ padding: '20px 20px 8px' }}>
          <Text type="secondary" style={{ fontSize: 11 }}>GROWBASE</Text>
          <Title level={5} style={{ margin: '6px 0 0' }}>知识工作台</Title>
        </div>
        <Tabs
          tabPosition="left"
          activeKey={isAssistant ? 'assistant' : 'knowledge'}
          onChange={(key) => navigate(`/org/${id}/${key === 'assistant' ? 'assistant' : 'knowledge'}`)}
          items={[
            {
              key: 'knowledge',
              label: (
                <Space>
                  <BookOutlined />
                  知识库
                  {processingCount > 0 && <Badge count={processingCount} size="small" />}
                </Space>
              ),
            },
            { key: 'assistant', label: <span><RobotOutlined /> AI 助手</span> },
          ]}
          style={{ marginTop: 16 }}
        />
        <div style={{ padding: '16px 20px', borderTop: '1px solid #edf0f5', marginTop: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>分类体系</Text>
            <Button
              type="link"
              size="small"
              style={{ padding: 0, fontSize: 12 }}
              onClick={() => setTemplateOpen(true)}
            >
              {config?.template_key ? '修改' : '选择'}
            </Button>
          </div>
          {config?.template_name
            ? <Tag color="blue">{config.template_name}</Tag>
            : <Text type="secondary" style={{ fontSize: 12 }}>尚未配置</Text>}
        </div>
      </Sider>

      <Layout>
        <Header style={{ background: '#fff', borderBottom: '1px solid #edf0f5', padding: '0 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <Title level={3} style={{ margin: 0 }}>{isAssistant ? 'AI 助手' : '知识库'}</Title>
            <Text type="secondary">
              {isAssistant ? '从你的知识库中检索、总结并执行整理动作' : '把链接和笔记交给 AI，形成可检索的个人知识库'}
            </Text>
          </div>
          {!isAssistant && (
            <Space>
              <Button icon={<SettingOutlined />} onClick={() => navigate('/settings')}>AI 设置</Button>
              <Button icon={<SyncOutlined />} onClick={handleReprocess}>重新整理</Button>
              <Button type="primary" icon={<PlusOutlined />} onClick={() => setAddOpen(true)}>添加知识</Button>
            </Space>
          )}
        </Header>

        <Content style={{ background: '#f6f8fb', padding: 32 }}>
          <div style={{ maxWidth: 1100, margin: '0 auto' }}>
            {isAssistant ? (
              <Card style={{ minHeight: 620 }} bodyStyle={{ padding: 0 }}>
                <div style={{ height: 500, overflowY: 'auto', padding: 28 }} id="chat-scroll">
                  {chatMessages.length === 0 ? (
                    <Empty image={<RobotOutlined style={{ fontSize: 46, color: '#1677ff' }} />} description={false}>
                      <Title level={4}>从你的知识库开始提问</Title>
                      <Paragraph type="secondary">可以问主题、来源、分类，也可以说"重新整理全部知识"。</Paragraph>
                      <Space wrap>
                        {['我的知识库里有哪些内容？', '整理全部知识', '哪些内容需要确认？'].map((p) => (
                          <Button key={p} onClick={() => setChatInput(p)}>{p}</Button>
                        ))}
                      </Space>
                    </Empty>
                  ) : chatMessages.map((chat) => (
                    <div key={chat.id} style={{ display: 'flex', gap: 12, marginBottom: 22, justifyContent: chat.role === 'user' ? 'flex-end' : 'flex-start' }}>
                      {chat.role === 'assistant' && <Avatar icon={<RobotOutlined />} style={{ background: '#1677ff' }} />}
                      <div style={{ maxWidth: '76%', background: chat.role === 'user' ? '#1677ff' : '#f0f3f8', color: chat.role === 'user' ? '#fff' : '#1f2937', borderRadius: 10, padding: '12px 16px', whiteSpace: 'pre-wrap' }}>
                        {chat.content}
                      </div>
                      {chat.role === 'user' && <Avatar style={{ background: '#8c8c8c' }}>我</Avatar>}
                    </div>
                  ))}
                  {chatLoading && (
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 16 }}>
                      <Avatar icon={<RobotOutlined />} style={{ background: '#1677ff' }} />
                      <div style={{ background: '#f0f3f8', borderRadius: 10, padding: '12px 16px' }}>
                        <Spin size="small" /> <Text type="secondary" style={{ marginLeft: 8 }}>正在思考…</Text>
                      </div>
                    </div>
                  )}
                </div>
                <div style={{ borderTop: '1px solid #edf0f5', padding: 20, display: 'flex', gap: 12 }}>
                  <Input
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onPressEnter={handleChat}
                    placeholder={'询问你的知识库，或输入"整理知识"'}
                    disabled={chatLoading}
                  />
                  <Button type="primary" icon={<SendOutlined />} onClick={handleChat} loading={chatLoading}>发送</Button>
                </div>
              </Card>
            ) : (
              <>
                {!config?.template_key && (
                  <Alert
                    type="warning"
                    showIcon
                    message="还没有选择分类体系"
                    description="选择一套分类模板后，AI 才能按你的规则整理知识。"
                    action={
                      <Button size="small" type="primary" icon={<AppstoreOutlined />} onClick={() => setTemplateOpen(true)}>
                        立即选择
                      </Button>
                    }
                    style={{ marginBottom: 20 }}
                  />
                )}
                {processingCount > 0 && (
                  <Alert
                    type="info"
                    showIcon
                    icon={<LoadingOutlined />}
                    message={`AI 正在处理 ${processingCount} 条知识，页面会自动刷新…`}
                    style={{ marginBottom: 16 }}
                  />
                )}
                <Card style={{ marginBottom: 20 }} bodyStyle={{ padding: 16 }}>
                  <Space.Compact style={{ width: '100%' }}>
                    <Input.Search
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      onSearch={handleSearch}
                      placeholder="搜索标题、正文或摘要"
                      enterButton="搜索"
                    />
                    <Select
                      allowClear
                      value={categoryId}
                      onChange={setCategoryId}
                      placeholder="全部分类"
                      style={{ minWidth: 180 }}
                      options={flatCats.map((c) => ({ value: c.id, label: c.name }))}
                    />
                  </Space.Compact>
                </Card>

                <List
                  loading={loading}
                  dataSource={items}
                  locale={{ emptyText: <Empty description="还没有知识，先添加一个链接或笔记" /> }}
                  renderItem={(item) => {
                    if (item.status === 'processing') {
                      return (
                        <List.Item style={{ padding: 0, marginBottom: 14 }}>
                          <ProcessingCard item={item} />
                        </List.Item>
                      )
                    }
                    const status = statusMeta(item.status)
                    return (
                      <List.Item style={{ padding: 0, marginBottom: 14 }}>
                        <Card style={{ width: '100%' }} bodyStyle={{ padding: 20 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
                            <div style={{ minWidth: 0 }}>
                              <Space wrap>
                                <Title level={5} style={{ margin: 0 }}>{item.title}</Title>
                                <Tag color={status.color}>{status.label}</Tag>
                                {item.category_name && <Tag color="blue">{item.category_name}</Tag>}
                              </Space>
                              <Paragraph ellipsis={{ rows: 2 }} type="secondary" style={{ margin: '10px 0' }}>
                                {item.summary}
                              </Paragraph>
                              <Space wrap>
                                {item.tags.map((tag) => <Tag key={tag}>{tag}</Tag>)}
                                {item.content && (
                                  <Button type="link" size="small" icon={<BookOutlined />} onClick={() => setSelectedItem(item)}>
                                    {item.source_type === 'video_tutorial' ? '查看教程' : '查看正文'}
                                  </Button>
                                )}
                                {item.source_url && (
                                  <a href={item.source_url} target="_blank" rel="noreferrer">
                                    <LinkOutlined /> 打开来源
                                  </a>
                                )}
                              </Space>
                              {item.ai_reason && (
                                <Text type="secondary" style={{ display: 'block', marginTop: 10, fontSize: 12 }}>
                                  AI：{item.ai_reason}
                                </Text>
                              )}
                            </div>
                            <Popconfirm title="确定移除这条知识？" onConfirm={() => handleRemove(item.id)}>
                              <Button type="text" danger icon={<DeleteOutlined />} />
                            </Popconfirm>
                          </div>
                        </Card>
                      </List.Item>
                    )
                  }}
                />
              </>
            )}
          </div>
        </Content>
      </Layout>

      <Modal
        title={selectedItem?.title}
        open={Boolean(selectedItem)}
        onCancel={() => setSelectedItem(null)}
        footer={null}
        width={860}
      >
        <Typography.Paragraph style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', lineHeight: 1.8, maxHeight: '68vh', overflowY: 'auto' }}>
          {selectedItem?.content}
        </Typography.Paragraph>
      </Modal>

      {/* Add knowledge modal */}
      <Modal title="添加知识" open={addOpen} onCancel={() => { setAddOpen(false); form.resetFields() }} footer={null} width={640}>
        <Form form={form} layout="vertical" onFinish={handleAdd} style={{ marginTop: 16 }}>
          <Form.Item name="title" label="标题">
            <Input placeholder="不填时会使用链接标题或默认名称" />
          </Form.Item>
          <Form.Item name="source_url" label="知识链接">
            <Input prefix={<LinkOutlined />} placeholder="https://…（博客、GitHub 仓库、YouTube/B站 视频）" />
          </Form.Item>
          <Form.Item name="instructions" label="处理要求">
            <Input.TextArea rows={2} placeholder="例如：把视频内容转换成知识库文档，整理成文字版教程" />
          </Form.Item>
          <Form.Item name="content" label="补充正文或笔记">
            <Input.TextArea rows={6} placeholder="粘贴摘要、笔记或网页正文。链接和正文至少填写一项。" />
          </Form.Item>
          <Button type="primary" htmlType="submit" block loading={addLoading} icon={<RobotOutlined />}>
            添加并让 AI 整理
          </Button>
        </Form>
      </Modal>

      {/* Classification template modal */}
      <Modal
        title={<Space><AppstoreOutlined />选择分类体系</Space>}
        open={templateOpen}
        onCancel={() => setTemplateOpen(false)}
        footer={null}
        width={720}
        destroyOnClose
      >
        {templates.length > 0 && (
          <TemplatePicker
            templates={templates}
            currentKey={config?.template_key ?? null}
            onSelect={handleTemplateSave}
            loading={templateSaving}
          />
        )}
      </Modal>
    </Layout>
  )
}
