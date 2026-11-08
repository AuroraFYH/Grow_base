import { useState, useEffect, type ReactNode } from 'react'
import {
  Layout, Menu, Typography, Button, Modal, Form, Input,
  Table, Tag, Space, Popconfirm, message, Tree, Select, Tooltip, Card, Alert
} from 'antd'
import {
  PlusOutlined, DeleteOutlined, EditOutlined,
  ArrowLeftOutlined, TeamOutlined, FolderOutlined
} from '@ant-design/icons'
import { useParams, useNavigate } from 'react-router-dom'
import { orgApi } from '../api/organizations'
import type {
  OrganizationOut, MemberOut, CategoryOut, ClassificationConfig,
  ClassificationTemplate, TemplateCategory,
} from '../api/organizations'
import { useAuthStore } from '../store/auth'

const { Sider, Content } = Layout
const { Title, Text } = Typography

type TabKey = 'members' | 'categories'

function buildTreeData(cats: CategoryOut[]): any[] {
  return cats.map((c) => ({
    key: c.id,
    title: c.name,
    children: buildTreeData(c.children),
    rawData: c,
  }))
}

function renderTemplateCategories(categories: TemplateCategory[], level = 0): ReactNode[] {
  return categories.flatMap((category) => [
    <div key={`${level}-${category.name}`} style={{ paddingLeft: level * 16, marginBottom: 4 }}>
      <Text>{category.name}</Text>
      {category.description && <Text type="secondary">：{category.description}</Text>}
    </div>,
    ...renderTemplateCategories(category.children, level + 1),
  ])
}

export default function OrgDetailPage() {
  const { orgId } = useParams<{ orgId: string }>()
  const id = Number(orgId)
  const navigate = useNavigate()
  const { user } = useAuthStore()

  const [org, setOrg] = useState<OrganizationOut | null>(null)
  const [members, setMembers] = useState<MemberOut[]>([])
  const [categories, setCategories] = useState<CategoryOut[]>([])
  const [classificationConfig, setClassificationConfig] = useState<ClassificationConfig | null>(null)
  const [classificationTemplates, setClassificationTemplates] = useState<ClassificationTemplate[]>([])
  const [tab, setTab] = useState<TabKey>('members')
  const [inviteOpen, setInviteOpen] = useState(false)
  const [catOpen, setCatOpen] = useState(false)
  const [editCatOpen, setEditCatOpen] = useState(false)
  const [templateOpen, setTemplateOpen] = useState(false)
  const [selectedTemplateKey, setSelectedTemplateKey] = useState('')
  const [selectedCat, setSelectedCat] = useState<CategoryOut | null>(null)
  const [inviteForm] = Form.useForm()
  const [catForm] = Form.useForm()
  const [editCatForm] = Form.useForm()
  const [templateForm] = Form.useForm()

  const isAdmin = members.find((m) => m.user_id === user?.id)?.role !== 'member'

  useEffect(() => {
    orgApi.get(id).then(({ data }) => setOrg(data)).catch(() => navigate('/'))
    orgApi.listMembers(id).then(({ data }) => setMembers(data))
    orgApi.getCategories(id).then(({ data }) => setCategories(data))
    orgApi.getClassification(id).then(({ data }) => setClassificationConfig(data))
    orgApi.getClassificationTemplates().then(({ data }) => setClassificationTemplates(data))
  }, [id])

  const handleInvite = async (values: { email: string; role: string }) => {
    try {
      const { data } = await orgApi.inviteMember(id, values)
      setMembers((prev) => [...prev, data])
      message.success('邀请成功')
      setInviteOpen(false)
      inviteForm.resetFields()
    } catch (err: any) {
      message.error(err.response?.data?.detail || '邀请失败')
    }
  }

  const handleRemoveMember = async (userId: number) => {
    try {
      await orgApi.removeMember(id, userId)
      setMembers((prev) => prev.filter((m) => m.user_id !== userId))
      message.success('已移除')
    } catch (err: any) {
      message.error(err.response?.data?.detail || '操作失败')
    }
  }

  const handleCreateCat = async (values: { name: string; description?: string; parent_id?: number }) => {
    try {
      await orgApi.createCategory(id, values)
      const { data } = await orgApi.getCategories(id)
      setCategories(data)
      message.success('分类创建成功')
      setCatOpen(false)
      catForm.resetFields()
    } catch (err: any) {
      message.error(err.response?.data?.detail || '创建失败')
    }
  }

  const handleEditCat = async (values: { name: string; description?: string }) => {
    if (!selectedCat) return
    try {
      await orgApi.updateCategory(id, selectedCat.id, values)
      const { data } = await orgApi.getCategories(id)
      setCategories(data)
      message.success('已更新')
      setEditCatOpen(false)
    } catch (err: any) {
      message.error(err.response?.data?.detail || '更新失败')
    }
  }

  const handleDeleteCat = async (catId: number) => {
    try {
      await orgApi.deleteCategory(id, catId)
      const { data } = await orgApi.getCategories(id)
      setCategories(data)
      message.success('已删除')
    } catch (err: any) {
      message.error(err.response?.data?.detail || '删除失败')
    }
  }

  const selectedTemplate = classificationTemplates.find((template) => template.key === selectedTemplateKey)

  const openTemplateModal = () => {
    const templateKey = classificationConfig?.template_key || classificationTemplates[0]?.key || ''
    const template = classificationTemplates.find((item) => item.key === templateKey)
    setSelectedTemplateKey(templateKey)
    templateForm.setFieldsValue({
      template_key: templateKey,
      custom_prompt: classificationConfig?.custom_prompt || template?.default_prompt || '',
    })
    setTemplateOpen(true)
  }

  const persistClassification = async (values: { template_key: string; custom_prompt?: string }, replaceExisting = false) => {
    try {
      const { data } = await orgApi.updateClassification(id, {
        template_key: values.template_key,
        custom_prompt: values.custom_prompt,
        replace_existing: replaceExisting,
      })
      setClassificationConfig(data)
      const categoriesResult = await orgApi.getCategories(id)
      setCategories(categoriesResult.data)
      message.success(values.template_key === 'custom' ? '自定义分类配置已保存' : '分类模板已应用')
      setTemplateOpen(false)
    } catch (err: any) {
      message.error(err.response?.data?.detail || '保存分类配置失败')
    }
  }

  const handleTemplateSubmit = (values: { template_key: string; custom_prompt?: string }) => {
    const isSwitching = classificationConfig?.template_key !== values.template_key
    if (values.template_key !== 'custom' && categories.length > 0 && isSwitching) {
      Modal.confirm({
        title: '替换现有目录？',
        content: '应用这个模板会删除当前目录并生成模板目录，已有目录名称和层级不会保留。是否继续？',
        okText: '替换并应用',
        cancelText: '取消',
        onOk: () => persistClassification(values, true),
      })
      return
    }
    persistClassification(values)
  }

  const flatCategories = (cats: CategoryOut[]): CategoryOut[] =>
    cats.flatMap((c) => [c, ...flatCategories(c.children)])

  const memberColumns = [
    { title: '用户名', dataIndex: 'username', key: 'username' },
    { title: '邮箱', dataIndex: 'email', key: 'email' },
    {
      title: '角色', dataIndex: 'role', key: 'role',
      render: (role: string) => (
        <Tag color={role === 'owner' ? 'gold' : role === 'admin' ? 'blue' : 'default'}>
          {role === 'owner' ? '创建者' : role === 'admin' ? '管理员' : '成员'}
        </Tag>
      ),
    },
    {
      title: '操作', key: 'action',
      render: (_: any, record: MemberOut) => (
        record.role !== 'owner' && isAdmin ? (
          <Popconfirm title="确认移除该成员？" onConfirm={() => handleRemoveMember(record.user_id)}>
            <Button type="text" danger icon={<DeleteOutlined />} size="small" />
          </Popconfirm>
        ) : null
      ),
    },
  ]

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider width={220} style={{ background: '#fff', borderRight: '1px solid #f0f0f0' }}>
        <div style={{ padding: '16px', borderBottom: '1px solid #f0f0f0' }}>
          <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate('/')}>
            返回
          </Button>
        </div>
        <Menu
          mode="inline"
          selectedKeys={[tab]}
          onClick={({ key }) => setTab(key as TabKey)}
          items={[
            { key: 'knowledge', icon: <FolderOutlined />, label: '知识库', onClick: () => navigate(`/org/${id}/knowledge`) },
            { key: 'assistant', icon: <FolderOutlined />, label: 'AI 助手', onClick: () => navigate(`/org/${id}/assistant`) },
            { key: 'members', icon: <TeamOutlined />, label: '成员管理' },
            { key: 'categories', icon: <FolderOutlined />, label: '目录结构' },
          ]}
          style={{ borderRight: 0, marginTop: 8 }}
        />
      </Sider>

      <Content style={{ background: '#f0f2f5', padding: 32 }}>
        <div style={{ maxWidth: 800 }}>
          <Title level={4} style={{ marginBottom: 4 }}>{org?.name}</Title>
          <Text type="secondary" style={{ marginBottom: 24, display: 'block' }}>{org?.description}</Text>

          {tab === 'members' && (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
                <Text strong>成员列表（{members.length}人）</Text>
                {isAdmin && (
                  <Button type="primary" icon={<PlusOutlined />} size="small" onClick={() => setInviteOpen(true)}>
                    邀请成员
                  </Button>
                )}
              </div>
              <Table
                dataSource={members}
                columns={memberColumns}
                rowKey="id"
                pagination={false}
                style={{ background: '#fff', borderRadius: 8 }}
              />
            </>
          )}

          {tab === 'categories' && (
            <>
              <Card size="small" style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start' }}>
                  <div style={{ minWidth: 0 }}>
                    <Text strong>分类体系</Text>
                    <div style={{ marginTop: 8 }}>
                      {classificationConfig?.template_name ? (
                        <Tag color="blue">{classificationConfig.template_name}</Tag>
                      ) : (
                        <Text type="secondary">尚未选择分类体系</Text>
                      )}
                    </div>
                    {classificationConfig?.effective_prompt && (
                      <Text type="secondary" style={{ display: 'block', marginTop: 8 }} ellipsis={{ tooltip: classificationConfig.effective_prompt }}>
                        当前提示词：{classificationConfig.effective_prompt}
                      </Text>
                    )}
                  </div>
                  {isAdmin && (
                    <Button type="primary" onClick={openTemplateModal}>
                      选择分类模板
                    </Button>
                  )}
                </div>
              </Card>
              {!classificationConfig?.template_key && (
                <Alert
                  type="info"
                  showIcon
                  style={{ marginBottom: 16 }}
                  message="先选择一套分类体系"
                  description="模板会生成一组可编辑的 starter 目录；如果没有合适的体系，可以选择自定义模板并填写自己的分类提示词。"
                />
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
                <Text strong>知识库目录结构</Text>
                {isAdmin && (
                  <Button type="primary" icon={<PlusOutlined />} size="small" onClick={() => setCatOpen(true)}>
                    新增分类
                  </Button>
                )}
              </div>
              {categories.length === 0 ? (
                <Text type="secondary">暂无分类，创建第一个目录吧</Text>
              ) : (
                <div style={{ background: '#fff', borderRadius: 8, padding: 16 }}>
                  <Tree
                    treeData={buildTreeData(categories)}
                    defaultExpandAll
                    titleRender={(node: any) => (
                      <Space>
                        <span>{node.title}</span>
                        {isAdmin && (
                          <>
                            <Tooltip title="编辑">
                              <EditOutlined
                                style={{ color: '#1677ff', cursor: 'pointer' }}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setSelectedCat(node.rawData)
                                  editCatForm.setFieldsValue({ name: node.rawData.name, description: node.rawData.description })
                                  setEditCatOpen(true)
                                }}
                              />
                            </Tooltip>
                            <Tooltip title="删除">
                              <Popconfirm title="删除后子分类也会一并删除，确认吗？" onConfirm={() => handleDeleteCat(node.key)}>
                                <DeleteOutlined style={{ color: '#ff4d4f', cursor: 'pointer' }} onClick={(e) => e.stopPropagation()} />
                              </Popconfirm>
                            </Tooltip>
                          </>
                        )}
                      </Space>
                    )}
                  />
                </div>
              )}
            </>
          )}
        </div>
      </Content>

      <Modal title="邀请成员" open={inviteOpen} onCancel={() => setInviteOpen(false)} footer={null}>
        <Form form={inviteForm} onFinish={handleInvite} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="email" label="邮箱" rules={[{ required: true, type: 'email' }]}>
            <Input placeholder="输入被邀请者的邮箱" />
          </Form.Item>
          <Form.Item name="role" label="角色" initialValue="member">
            <Select options={[{ value: 'member', label: '成员' }, { value: 'admin', label: '管理员' }]} />
          </Form.Item>
          <Button type="primary" htmlType="submit" block>邀请</Button>
        </Form>
      </Modal>

      <Modal title="新增分类" open={catOpen} onCancel={() => { setCatOpen(false); catForm.resetFields() }} footer={null}>
        <Form form={catForm} onFinish={handleCreateCat} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="name" label="分类名称" rules={[{ required: true }]}>
            <Input placeholder="例如：前端技术、架构设计" />
          </Form.Item>
          <Form.Item name="description" label="描述（可选）">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item name="parent_id" label="父级分类（可选）">
            <Select
              allowClear
              placeholder="不选则为顶级分类"
              options={flatCategories(categories).map((c) => ({ value: c.id, label: c.name }))}
            />
          </Form.Item>
          <Button type="primary" htmlType="submit" block>创建</Button>
        </Form>
      </Modal>

      <Modal title="编辑分类" open={editCatOpen} onCancel={() => setEditCatOpen(false)} footer={null}>
        <Form form={editCatForm} onFinish={handleEditCat} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="name" label="分类名称" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Button type="primary" htmlType="submit" block>保存</Button>
        </Form>
      </Modal>

      <Modal
        title="选择分类模板"
        open={templateOpen}
        onCancel={() => setTemplateOpen(false)}
        footer={null}
        width={680}
      >
        <Form
          form={templateForm}
          onFinish={handleTemplateSubmit}
          layout="vertical"
          style={{ marginTop: 16 }}
          onValuesChange={(changed) => {
            if (changed.template_key) {
              const nextKey = changed.template_key as string
              setSelectedTemplateKey(nextKey)
              const nextTemplate = classificationTemplates.find((template) => template.key === nextKey)
              if (nextTemplate) {
                templateForm.setFieldValue('custom_prompt', nextTemplate.default_prompt)
              }
            }
          }}
        >
          <Form.Item name="template_key" label="分类体系" rules={[{ required: true, message: '请选择分类体系' }]}>
            <Select
              showSearch
              optionFilterProp="label"
              options={classificationTemplates.map((template) => ({
                value: template.key,
                label: `${template.name}：${template.summary}`,
              }))}
            />
          </Form.Item>
          {selectedTemplate && (
            <Card size="small" style={{ marginBottom: 16, background: '#fafafa' }}>
              <Text strong>{selectedTemplate.name}</Text>
              <Text type="secondary" style={{ display: 'block', marginTop: 4 }}>{selectedTemplate.description}</Text>
              <Text type="secondary" style={{ display: 'block', marginTop: 4 }}>适合：{selectedTemplate.suitable_for}</Text>
              {selectedTemplate.categories.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <Text strong>将生成的 starter 目录</Text>
                  <div style={{ marginTop: 8 }}>{renderTemplateCategories(selectedTemplate.categories)}</div>
                </div>
              )}
            </Card>
          )}
          <Form.Item
            name="custom_prompt"
            label="分类提示词"
            rules={[{ required: selectedTemplateKey === 'custom', message: '自定义模板需要填写分类提示词' }]}
            extra="可以直接使用模板默认提示词，也可以按你的团队或个人习惯调整。"
          >
            <Input.TextArea rows={6} placeholder="描述 AI 应该如何判断资料所属分类" />
          </Form.Item>
          <Button type="primary" htmlType="submit" block>
            保存分类配置
          </Button>
        </Form>
      </Modal>
    </Layout>
  )
}
