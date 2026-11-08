import api from './client'

export interface KnowledgeItem {
  id: number
  title: string
  source_type: 'link' | 'note' | 'video_tutorial'
  source_url: string | null
  content: string | null
  summary: string | null
  tags: string[]
  status: 'ready' | 'review' | 'processing' | 'error'
  ai_reason: string | null
  category_id: number | null
  category_name: string | null
  created_by: number
  created_at: string
  updated_at: string | null
}

export interface ChatMessage {
  id: number
  role: 'user' | 'assistant'
  content: string
  created_at: string
}

export interface ChatResponse {
  message: ChatMessage
  citations: KnowledgeItem[]
  action: string | null
}

export const knowledgeApi = {
  list: (orgId: number, params?: { search?: string; category_id?: number }) =>
    api.get<KnowledgeItem[]>(`/api/organizations/${orgId}/knowledge`, { params }),

  create: (orgId: number, data: { title?: string; source_url?: string; content?: string; instructions?: string }) =>
    api.post<KnowledgeItem>(`/api/organizations/${orgId}/knowledge`, data),

  remove: (orgId: number, knowledgeId: number) =>
    api.delete(`/api/organizations/${orgId}/knowledge/${knowledgeId}`),

  reprocess: (orgId: number) =>
    api.post<KnowledgeItem[]>(`/api/organizations/${orgId}/knowledge/reprocess`),

  history: (orgId: number) =>
    api.get<ChatMessage[]>(`/api/organizations/${orgId}/ai/history`),

  chat: (orgId: number, message: string) =>
    api.post<ChatResponse>(`/api/organizations/${orgId}/ai/chat`, { message }),
}
