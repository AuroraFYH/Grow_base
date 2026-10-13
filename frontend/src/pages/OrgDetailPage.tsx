import { useState, useEffect } from 'react'
import {
  Layout, Menu, Typography, Button, Modal, Form, Input,
  Table, Tag, Space, Popconfirm, message, Tree, Select, Tooltip
} from 'antd'
import {
  PlusOutlined, DeleteOutlined, EditOutlined,
  ArrowLeftOutlined, TeamOutlined, FolderOutlined
} from '@ant-design/icons'
import { useParams, useNavigate } from 'react-router-dom'
import { orgApi } from '../api/organizations'
import type { OrganizationOut, MemberOut, CategoryOut } from '../api/organizations'
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

export default function OrgDetailPage() {
  const { orgId } = useParams<{ orgId: string }>()
  const id = Number(orgId)
  const navigate = useNavigate()
  const { user } = useAuthStore()

  const [org, setOrg] = useState<OrganizationOut | null>(null)
  const [members, setMembers] = useState<MemberOut[]>([])
  const [categories, setCategories] = useState<CategoryOut[]>([])
  const [tab, setTab] = useState<TabKey>('members')
  const [inviteOpen, setInviteOpen] = useState(false)
  const [catOpen, setCatOpen] = useState(false)
  const [editCatOpen, setEditCatOpen] = useState(false)
  const [selectedCat, setSelectedCat] = useState<CategoryOut | null>(null)
  const [inviteForm] = Form.useForm()
  const [catForm] = Form.useForm()
  const [editCatForm] = Form.useForm()

  const isAdmin = members.find((m) => m.user_id === user?.id)?.role !== 'member'

  useEffect(() => {
    orgApi.get(id).then(({ data }) => setOrg(data)).catch(() => navigate('/'))
    orgApi.listMembers(id).then(({ data }) => setMembers(data))
    orgApi.getCategories(id).then(({ data }) => setCategories(data))
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
    </Layout>
  )
}
