import api from './client'

export interface DigestSubscription {
  id: number
  organization_id: number
  name: string
  topics: string[]
  sources: string[]
  frequency: 'daily' | 'weekly'
  send_hour: number
  send_minute: number
  timezone: string
  workflow_url: string
  has_workflow_secret: boolean
  has_feishu_webhook: boolean
  enabled: boolean
  last_run_at: string | null
  next_run_at: string | null
  last_status: 'running' | 'success' | 'error' | null
  last_error: string | null
  created_at: string
  updated_at: string | null
}

export interface DigestDelivery {
  id: number
  subscription_id: number
  status: string
  title: string | null
  content: string | null
  item_count: number
  sent_to_feishu: boolean
  error: string | null
  created_at: string
}

export interface DigestSubscriptionPayload {
  organization_id: number
  name: string
  topics: string[]
  sources: string[]
  frequency: 'daily' | 'weekly'
  send_hour: number
  send_minute: number
  timezone: string
  workflow_url: string
  workflow_secret?: string
  feishu_webhook_url?: string
  enabled?: boolean
}

export const feedsApi = {
  list: () => api.get<DigestSubscription[]>('/api/feeds'),
  create: (data: DigestSubscriptionPayload) => api.post<DigestSubscription>('/api/feeds', data),
  update: (id: number, data: Partial<DigestSubscriptionPayload>) => api.patch<DigestSubscription>(`/api/feeds/${id}`, data),
  remove: (id: number) => api.delete(`/api/feeds/${id}`),
  run: (id: number) => api.post<DigestSubscription>(`/api/feeds/${id}/run`),
  deliveries: (id: number) => api.get<DigestDelivery[]>(`/api/feeds/${id}/deliveries`),
}
