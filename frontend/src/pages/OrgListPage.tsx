import { useState, useEffect } from 'react'
import {
  Button, Card, Modal, Form, Input, List, Tag, Space,
  Typography, Dropdown, message, Empty, Steps,
} from 'antd'
import {
  PlusOutlined, TeamOutlined, EllipsisOutlined, SettingOutlined,
  AppstoreOutlined, CheckCircleOutlined,
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { orgApi } from '../api/organizations'
import type { OrganizationOut, ClassificationTemplate } from '../api/organizations'
import { useAuthStore } from '../store/auth'

const { Title, Text } = Typography

function TemplatePickerInline({
  templates,
  onSelect,
  loading,
}: {
  templates: ClassificationTemplate[]
  onSelect: (key: string, prompt: string) => Promise<void>
  loading: boolean
}) {
  const [selected, setSelected] = useState(templates[0]?.key || '')
  const [customPrompt, setCustomPrompt] = useState(templates[0]?.default_prompt || '')
  const template = templates.find((t) => t.key === selected)

  const handleSelect = (key: string) => {
    setSelected(key)
    const t = templates.find((tt) => tt.key === key)
    if (t) setCustomPrompt(t.default_prompt)
  }

  return (
    <div>
      <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
        选择一套知识管理方法，AI 会按这套体系帮你分类整理。之后随时可以修改。
      </Text>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        {templates.map((t) => (
          <Card
            key={t.key}
            size="small"
            hoverable
            onClick={() => handleSelect(t.key)}
            style={{
              width: 160,
              border: selected === t.key ? '2px solid #1677ff' : '1px solid #d9d9d9',
              background: selected === t.key ? '#f0f7ff' : '#fff',
              cursor: 'pointer',
            }}
          >
            <Text strong style={{ display: 'block', marginBottom: 2, fontSize: 13 }}>{t.name}</Text>
            <Text type="secondary" style={{ fontSize: 11 }}>{t.summary}</Text>
          </Card>
        ))}
      </div>

      {template && (
        <Card size="small" style={{ marginBottom: 12, background: '#fafafa' }}>
          <Text type="secondary" style={{ fontSize: 12 }}>{template.description}</Text>
          <br />
          <Text type="secondary" style={{ fontSize: 12 }}>适合：{template.suitable_for}</Text>
        </Card>
      )}

      {selected === 'custom' && (
        <Input.TextArea
          rows={4}
          value={customPrompt}
          onChange={(e) => setCustomPrompt(e.target.value)}
          placeholder="描述 AI 应该如何判断资料所属分类"
          style={{ marginBottom: 12 }}
        />
      )}

      <Button
        type="primary"
        block
        loading={loading}
        disabled={selected === 'custom' && !customPrompt.trim()}
        onClick={() => onSelect(selected, customPrompt)}
      >
        应用并进入知识库
      </Button>
    </div>
  )
}

export default function OrgListPage() {
  const [orgs, setOrgs] = useState<OrganizationOut[]>([])
  const [templates, setTemplates] = useState<ClassificationTemplate[]>([])
  const [loading, setLoading] = useState(false)
  const [createStep, setCreateStep] = useState<0 | 1>(0)
  const [createOpen, setCreateOpen] = useState(false)
  const [newOrgId, setNewOrgId] = useState<number | null>(null)
  const [templateSaving, setTemplateSaving] = useState(false)
  const [form] = Form.useForm()
  const navigate = useNavigate()
  const { user } = useAuthStore()

  const fetchOrgs = async () => {
    setLoading(true)
    try {
      const { data } = await orgApi.list()
      setOrgs(data)
    } catch {
      message.error('加载组织列表失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchOrgs()
    orgApi.getClassificationTemplates().then(({ data }) => setTemplates(data)).catch(() => {})
  }, [])

  const openCreate = () => {
    setCreateStep(0)
    setNewOrgId(null)
    form.resetFields()
    setCreateOpen(true)
  }

  const handleCreateOrg = async (values: { name: string; description?: string }) => {
    try {
      const { data } = await orgApi.create(values)
      setNewOrgId(data.id)
      fetchOrgs()
      setCreateStep(1)
    } catch (err: any) {
      message.error(err.response?.data?.detail || '创建失败')
    }
  }

  const handleApplyTemplate = async (key: string, prompt: string) => {
    if (!newOrgId) return
    setTemplateSaving(true)
    try {
      await orgApi.updateClassification(newOrgId, {
        template_key: key,
        custom_prompt: prompt || undefined,
        replace_existing: false,
      })
      setCreateOpen(false)
      message.success('知识库已创建，可以开始添加知识了')
      navigate(`/org/${newOrgId}/knowledge`)
    } catch (err: any) {
      message.error(err.response?.data?.detail || '应用模板失败')
    } finally {
      setTemplateSaving(false)
    }
  }

  const handleSkipTemplate = () => {
    if (!newOrgId) return
    setCreateOpen(false)
    navigate(`/org/${newOrgId}/knowledge`)
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f0f2f5' }}>
      <div style={{ background: '#fff', padding: '16px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }}>
        <Title level={4} style={{ margin: 0 }}>GrowBase</Title>
        <Space>
          <Tag color="blue">本地模式</Tag>
          <Button icon={<SettingOutlined />} onClick={() => navigate('/settings')}>AI 设置</Button>
        </Space>
      </div>

      <div style={{ maxWidth: 960, margin: '32px auto', padding: '0 16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <Title level={4} style={{ margin: 0 }}>我的知识空间</Title>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            新建知识空间
          </Button>
        </div>

        {orgs.length === 0 && !loading ? (
          <Empty description="还没有知识空间，先创建一个吧" />
        ) : (
          <List
            loading={loading}
            grid={{ gutter: 16, xs: 1, sm: 2, md: 3 }}
            dataSource={orgs}
            renderItem={(org) => (
              <List.Item>
                <Card
                  hoverable
                  onClick={() => navigate(`/org/${org.id}/knowledge`)}
                  actions={[
                    <div key="more" onClick={(e) => e.stopPropagation()}>
                      <Dropdown
                        menu={{
                          items: [{ key: 'settings', label: '组织设置' }],
                          onClick: ({ domEvent }) => { domEvent.stopPropagation(); navigate(`/org/${org.id}`) },
                        }}
                        trigger={['click']}
                      >
                        <EllipsisOutlined />
                      </Dropdown>
                    </div>,
                  ]}
                >
                  <Card.Meta
                    avatar={<TeamOutlined style={{ fontSize: 24, color: '#1677ff' }} />}
                    title={org.name}
                    description={org.description || <Text type="secondary">暂无描述</Text>}
                  />
                  <div style={{ marginTop: 12 }}>
                    <Tag color="blue">{org.member_count} 名成员</Tag>
                    {org.owner_id === user?.id && <Tag color="gold">创建者</Tag>}
                  </div>
                </Card>
              </List.Item>
            )}
          />
        )}
      </div>

      <Modal
        title={
          <Steps
            size="small"
            current={createStep}
            style={{ maxWidth: 360, marginTop: 4 }}
            items={[
              { title: '基本信息', icon: createStep > 0 ? <CheckCircleOutlined /> : undefined },
              { title: '选择分类体系', icon: createStep === 1 ? <AppstoreOutlined /> : undefined },
            ]}
          />
        }
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        footer={null}
        width={createStep === 1 ? 680 : 480}
        destroyOnClose
      >
        {createStep === 0 ? (
          <Form form={form} onFinish={handleCreateOrg} layout="vertical" style={{ marginTop: 16 }}>
            <Form.Item name="name" label="空间名称" rules={[{ required: true, message: '请输入空间名称' }]}>
              <Input placeholder="例如：我的技术笔记、读书摘要" />
            </Form.Item>
            <Form.Item name="description" label="描述（可选）">
              <Input.TextArea rows={2} placeholder="简短描述这个知识库的用途" />
            </Form.Item>
            <Button type="primary" htmlType="submit" block>下一步：选择分类体系</Button>
          </Form>
        ) : (
          <div style={{ marginTop: 16 }}>
            {templates.length > 0 ? (
              <TemplatePickerInline
                templates={templates}
                onSelect={handleApplyTemplate}
                loading={templateSaving}
              />
            ) : (
              <Text type="secondary">加载模板中…</Text>
            )}
            <Button type="link" block style={{ marginTop: 8 }} onClick={handleSkipTemplate}>
              暂时跳过，稍后再选
            </Button>
          </div>
        )}
      </Modal>
    </div>
  )
}
