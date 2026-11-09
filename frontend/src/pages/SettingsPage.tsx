import { useEffect, useState } from 'react'
import {
  Button, Card, Checkbox, Form, Input, Select, Space, Typography, message, Tag, Divider, Switch,
} from 'antd'
import { ArrowLeftOutlined, CheckCircleOutlined, SettingOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { llmConfigApi } from '../api/llm_config'
import type { LLMConfigOut } from '../api/llm_config'
import { feedsApi } from '../api/feeds'
import type { DigestSubscription, DigestSubscriptionPayload } from '../api/feeds'
import { orgApi } from '../api/organizations'
import type { OrganizationOut } from '../api/organizations'

const { Title, Text, Paragraph } = Typography

const PROVIDER_PRESETS: Record<string, { label: string; base_url: string; models: string[] }> = {
  openai: {
    label: 'OpenAI',
    base_url: 'https://api.openai.com',
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'],
  },
  anthropic: {
    label: 'Anthropic (Claude)',
    base_url: 'https://api.anthropic.com',
    models: ['claude-3-5-sonnet-20241022', 'claude-3-haiku-20240307', 'claude-3-opus-20240229'],
  },
  deepseek: {
    label: 'DeepSeek',
    base_url: 'https://api.deepseek.com',
    models: ['deepseek-chat', 'deepseek-reasoner'],
  },
  zhipu: {
    label: '智谱 AI (GLM)',
    base_url: 'https://open.bigmodel.cn/api/paas',
    models: ['glm-4-flash', 'glm-4-air', 'glm-4'],
  },
  moonshot: {
    label: 'Moonshot (Kimi)',
    base_url: 'https://api.moonshot.cn',
    models: ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k'],
  },
  qwen: {
    label: '通义千问 (Qwen)',
    base_url: 'https://dashscope.aliyuncs.com/compatible-mode',
    models: ['qwen-plus', 'qwen-turbo', 'qwen-max'],
  },
  custom: {
    label: '自定义',
    base_url: '',
    models: [],
  },
}

export default function SettingsPage() {
  const navigate = useNavigate()
  const [form] = Form.useForm()
  const [saving, setSaving] = useState(false)
  const [config, setConfig] = useState<LLMConfigOut | null>(null)
  const [provider, setProvider] = useState('openai')
  const [orgs, setOrgs] = useState<OrganizationOut[]>([])
  const [subscriptions, setSubscriptions] = useState<DigestSubscription[]>([])
  const [feedSaving, setFeedSaving] = useState(false)
  const [feedForm] = Form.useForm()

  useEffect(() => {
    llmConfigApi.get().then(({ data }) => {
      setConfig(data)
      const providerKey = Object.keys(PROVIDER_PRESETS).find(
        (k) => PROVIDER_PRESETS[k].base_url === data.base_url
      ) || 'custom'
      setProvider(providerKey)
      form.setFieldsValue({
        provider: providerKey,
        base_url: data.base_url || '',
        model_name: data.model_name,
        vault_path: data.vault_path || '',
        cookies_file: data.cookies_file || '',
      })
    }).catch(() => {})
  }, [form])

  useEffect(() => {
    Promise.all([orgApi.list(), feedsApi.list()]).then(([orgResult, feedResult]) => {
      setOrgs(orgResult.data)
      setSubscriptions(feedResult.data)
      if (orgResult.data[0]) feedForm.setFieldValue('organization_id', orgResult.data[0].id)
    }).catch(() => {})
  }, [feedForm])

  const handleProviderChange = (value: string) => {
    setProvider(value)
    const preset = PROVIDER_PRESETS[value]
    form.setFieldsValue({
      base_url: preset.base_url,
      model_name: preset.models[0] || '',
    })
  }

  const handleSave = async (values: {
    provider: string
    base_url: string
    model_name: string
    api_key?: string
    vault_path?: string
    cookies_file?: string
  }) => {
    setSaving(true)
    try {
      const { data } = await llmConfigApi.update({
        provider: values.provider,
        base_url: values.base_url || undefined,
        model_name: values.model_name,
        api_key: values.api_key || undefined,
        vault_path: values.vault_path || undefined,
        cookies_file: values.cookies_file || undefined,
      })
      setConfig(data)
      message.success('AI 设置已保存')
    } catch (err: any) {
      message.error(err.response?.data?.detail || '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const preset = PROVIDER_PRESETS[provider]

  const handleFeedSave = async (values: any) => {
    setFeedSaving(true)
    try {
      const payload: DigestSubscriptionPayload = {
        ...values,
        topics: String(values.topics).split(/[,，\n]/).map((value: string) => value.trim()).filter(Boolean),
        sources: values.sources || ['news', 'social'],
        send_hour: Number(values.send_hour ?? 9),
        send_minute: Number(values.send_minute ?? 0),
      }
      const { data } = await feedsApi.create(payload)
      setSubscriptions((items) => [data, ...items])
      feedForm.resetFields(['name', 'topics', 'workflow_url', 'workflow_secret', 'feishu_webhook_url'])
      message.success('自动简讯订阅已创建')
    } catch (err: any) {
      message.error(err.response?.data?.detail || '订阅创建失败')
    } finally {
      setFeedSaving(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f0f2f5' }}>
      <div style={{ background: '#fff', padding: '16px 32px', display: 'flex', alignItems: 'center', gap: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }}>
        <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate('/')}>返回</Button>
        <Title level={4} style={{ margin: 0 }}>
          <SettingOutlined style={{ marginRight: 8 }} />
          AI 设置
        </Title>
      </div>

      <div style={{ maxWidth: 640, margin: '32px auto', padding: '0 16px' }}>
        <Card>
          <Title level={5}>AI 模型配置</Title>
          <Paragraph type="secondary">
            配置你自己的 AI 模型。API key 加密存储在本地，不会上传到任何第三方服务器。
          </Paragraph>
          {config?.has_api_key && (
            <div style={{ marginBottom: 20 }}>
              <Tag icon={<CheckCircleOutlined />} color="success">已配置 API Key</Tag>
              <Text type="secondary" style={{ marginLeft: 8 }}>当前模型：{config.model_name}</Text>
            </div>
          )}

          <Form form={form} layout="vertical" onFinish={handleSave}>
            <Form.Item name="provider" label="服务商" rules={[{ required: true }]}>
              <Select onChange={handleProviderChange}>
                {Object.entries(PROVIDER_PRESETS).map(([key, p]) => (
                  <Select.Option key={key} value={key}>{p.label}</Select.Option>
                ))}
              </Select>
            </Form.Item>

            <Form.Item
              name="base_url"
              label="API Base URL"
              rules={[{ required: true, message: '请填写 Base URL' }]}
            >
              <Input placeholder="https://api.openai.com" />
            </Form.Item>

            <Form.Item
              name="model_name"
              label="模型名称"
              rules={[{ required: true, message: '请填写模型名称' }]}
            >
              {preset?.models.length > 0 ? (
                <Select showSearch>
                  {preset.models.map((m) => (
                    <Select.Option key={m} value={m}>{m}</Select.Option>
                  ))}
                </Select>
              ) : (
                <Input placeholder="例如：gpt-4o-mini" />
              )}
            </Form.Item>

            <Form.Item
              name="api_key"
              label={
                <Space>
                  <span>API Key</span>
                  {config?.has_api_key && <Tag color="blue">已设置，留空则保持不变</Tag>}
                </Space>
              }
            >
              <Input.Password
                placeholder={config?.has_api_key ? '留空则保持现有 Key 不变' : '输入你的 API Key'}
                autoComplete="off"
              />
            </Form.Item>

            <Divider />

            <Title level={5} style={{ marginBottom: 4 }}>Obsidian 集成</Title>
            <Paragraph type="secondary" style={{ marginBottom: 16 }}>
              填写 vault 根目录的绝对路径后，每条知识整理完成后会自动写入对应的 .md 文件，
              并由 AI 判断应链接到 vault 中哪些已有笔记（生成 [[wikilinks]]）。
              写入位置：<code>vault/GrowBase/知识库名/分类/</code>
            </Paragraph>
            <Form.Item
              name="vault_path"
              label="Obsidian Vault 路径"
            >
              <Input placeholder="/home/用户名/Documents/MyVault（留空则不写入文件）" />
            </Form.Item>
            {config?.vault_path && (
              <div style={{ marginBottom: 16 }}>
                <Tag icon={<CheckCircleOutlined />} color="success">已配置</Tag>
                <Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>{config.vault_path}</Text>
              </div>
            )}

            <Form.Item
              name="cookies_file"
              label="视频平台 Cookies 文件（可选）"
              tooltip="抖音、B站等需要登录才能下载的视频，需提供从浏览器导出的 cookies.txt 文件路径"
            >
              <Input placeholder="/home/用户名/cookies.txt（留空则只能访问公开视频）" />
            </Form.Item>
            {config?.cookies_file && (
              <div style={{ marginBottom: 16 }}>
                <Tag icon={<CheckCircleOutlined />} color="success">已配置 Cookies</Tag>
                <Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>{config.cookies_file}</Text>
              </div>
            )}

            <Divider />

            <Form.Item style={{ marginBottom: 0 }}>
              <Button type="primary" htmlType="submit" loading={saving} block>
                保存设置
              </Button>
            </Form.Item>
          </Form>
        </Card>

        <Card style={{ marginTop: 16 }}>
          <Title level={5}>使用说明</Title>
          <ul style={{ paddingLeft: 20, color: '#666', lineHeight: '2' }}>
            <li>所有服务商均需要使用 <strong>OpenAI 兼容格式</strong> 的 API</li>
            <li>添加链接时，AI 会自动抓取内容并按你的分类体系整理</li>
            <li>GitHub 仓库链接会读取 README，视频链接会提取字幕或语音转写</li>
            <li>未配置 AI 时会退回到关键词匹配模式，分类精度较低</li>
            <li>配置 Obsidian vault 路径后，每条知识整理完成后会自动生成 <strong>视频笔记</strong> 和 <strong>知识节点</strong> 两类文件，并自动打 [[wikilinks]]</li>
            <li>在 AI 助手里发送「<strong>重新生成链接</strong>，你的补充要求」可以让 AI 重新判断节点间的链接关系</li>
          </ul>
        </Card>

        <Card style={{ marginTop: 16 }}>
          <Title level={5}>自动简讯与知识库自生长</Title>
          <Paragraph type="secondary">
            配置你已有的采集工作流。GrowBase 会按计划把话题和来源发给工作流，工作流返回的简讯自动写入选定知识库；填写飞书机器人 Webhook 后还会同步发送。
          </Paragraph>
          <Form
            form={feedForm}
            layout="vertical"
            initialValues={{ frequency: 'daily', send_hour: 9, send_minute: 0, timezone: 'Asia/Shanghai', sources: ['news', 'social'] }}
            onFinish={handleFeedSave}
          >
            <Form.Item name="organization_id" label="写入知识库" rules={[{ required: true, message: '请选择知识库' }]}>
              <Select placeholder="选择一个知识库">
                {orgs.map((org) => <Select.Option key={org.id} value={org.id}>{org.name}</Select.Option>)}
              </Select>
            </Form.Item>
            <Form.Item name="name" label="订阅名称" rules={[{ required: true, message: '请填写订阅名称' }]}>
              <Input placeholder="例如：AI 行业每日简讯" />
            </Form.Item>
            <Form.Item name="topics" label="感兴趣的话题" rules={[{ required: true, message: '至少填写一个话题' }]}>
              <Input.TextArea rows={2} placeholder="例如：AI Agent，具身智能，独立开发（逗号或换行分隔）" />
            </Form.Item>
            <Form.Item name="sources" label="内容来源">
              <Checkbox.Group options={[{ label: '新闻', value: 'news' }, { label: '社交媒体 / 推文', value: 'social' }, { label: 'GitHub', value: 'github' }, { label: '博客 / RSS', value: 'rss' }]} />
            </Form.Item>
            <Space.Compact block>
              <Form.Item name="frequency" label="频率" style={{ width: '34%' }}><Select><Select.Option value="daily">每天</Select.Option><Select.Option value="weekly">每周</Select.Option></Select></Form.Item>
              <Form.Item name="send_hour" label="发送时间（时）" style={{ width: '33%' }}><Input type="number" min={0} max={23} /></Form.Item>
              <Form.Item name="send_minute" label="分" style={{ width: '33%' }}><Input type="number" min={0} max={59} /></Form.Item>
            </Space.Compact>
            <Form.Item name="workflow_url" label="工作流 Webhook 地址" rules={[{ required: true, message: '请填写工作流 Webhook' }, { type: 'url', message: '请输入有效 URL' }]}>
              <Input placeholder="https://你的工作流.example.com/webhook" />
            </Form.Item>
            <Form.Item name="workflow_secret" label="工作流密钥（可选）">
              <Input.Password placeholder="会以 Bearer Token 发送" />
            </Form.Item>
            <Form.Item name="feishu_webhook_url" label="飞书机器人 Webhook（可选）" rules={[{ type: 'url', message: '请输入有效 URL' }]}>
              <Input placeholder="https://open.feishu.cn/open-apis/bot/v2/hook/..." />
            </Form.Item>
            <Button type="primary" htmlType="submit" loading={feedSaving} block>创建自动简讯订阅</Button>
          </Form>

          {subscriptions.length > 0 && <Divider />}
          {subscriptions.map((subscription) => (
            <div key={subscription.id} style={{ padding: '12px 0', borderBottom: '1px solid #f0f0f0' }}>
              <Space style={{ width: '100%', justifyContent: 'space-between' }} align="start">
                <div>
                  <Text strong>{subscription.name}</Text>
                  <div style={{ marginTop: 4 }}><Tag color={subscription.last_status === 'error' ? 'error' : subscription.enabled ? 'green' : 'default'}>{subscription.last_status === 'error' ? '上次失败' : subscription.enabled ? '运行中' : '已停用'}</Tag><Text type="secondary">{subscription.topics.join(' · ')}</Text></div>
                  <Text type="secondary" style={{ fontSize: 12 }}>{subscription.frequency === 'daily' ? '每天' : '每周'} {String(subscription.send_hour).padStart(2, '0')}:{String(subscription.send_minute).padStart(2, '0')} · 下次 {subscription.next_run_at ? new Date(subscription.next_run_at).toLocaleString() : '未计划'}</Text>
                  {subscription.last_error && <div style={{ color: '#cf1322', fontSize: 12, marginTop: 4 }}>{subscription.last_error}</div>}
                </div>
                <Space>
                  <Switch size="small" checked={subscription.enabled} onChange={async (enabled) => { const { data } = await feedsApi.update(subscription.id, { enabled }); setSubscriptions((items) => items.map((item) => item.id === data.id ? data : item)) }} />
                </Space>
              </Space>
            </div>
          ))}
        </Card>
      </div>
    </div>
  )
}
