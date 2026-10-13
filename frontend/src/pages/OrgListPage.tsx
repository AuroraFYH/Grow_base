import { useState, useEffect } from 'react'
import {
  Button, Card, Modal, Form, Input, List, Tag, Space,
  Typography, Dropdown, message, Empty
} from 'antd'
import { PlusOutlined, TeamOutlined, EllipsisOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { orgApi } from '../api/organizations'
import type { OrganizationOut } from '../api/organizations'
import { useAuthStore } from '../store/auth'

const { Title, Text } = Typography

export default function OrgListPage() {
  const [orgs, setOrgs] = useState<OrganizationOut[]>([])
  const [loading, setLoading] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [form] = Form.useForm()
  const navigate = useNavigate()
  const { user, logout } = useAuthStore()

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

  useEffect(() => { fetchOrgs() }, [])

  const handleCreate = async (values: { name: string; description?: string }) => {
    try {
      await orgApi.create(values)
      message.success('组织创建成功')
      setModalOpen(false)
      form.resetFields()
      fetchOrgs()
    } catch (err: any) {
      message.error(err.response?.data?.detail || '创建失败')
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f0f2f5' }}>
      <div style={{ background: '#fff', padding: '16px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }}>
        <Title level={4} style={{ margin: 0 }}>GrowBase</Title>
        <Space>
          <Text type="secondary">{user?.username}</Text>
          <Button onClick={logout}>退出</Button>
        </Space>
      </div>

      <div style={{ maxWidth: 960, margin: '32px auto', padding: '0 16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <Title level={4} style={{ margin: 0 }}>我的组织</Title>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
            创建组织
          </Button>
        </div>

        {orgs.length === 0 && !loading ? (
          <Empty description="还没有加入任何组织，先创建一个吧" />
        ) : (
          <List
            loading={loading}
            grid={{ gutter: 16, xs: 1, sm: 2, md: 3 }}
            dataSource={orgs}
            renderItem={(org) => (
              <List.Item>
                <Card
                  hoverable
                  onClick={() => navigate(`/org/${org.id}`)}
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
        title="创建组织"
        open={modalOpen}
        onCancel={() => { setModalOpen(false); form.resetFields() }}
        footer={null}
      >
        <Form form={form} onFinish={handleCreate} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="name" label="组织名称" rules={[{ required: true, message: '请输入组织名称' }]}>
            <Input placeholder="例如：前端技术团队" />
          </Form.Item>
          <Form.Item name="description" label="描述（可选）">
            <Input.TextArea rows={3} placeholder="简短描述这个组织的用途" />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" block>创建</Button>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
