import api from './client'

export interface LLMConfigOut {
  provider: string
  base_url: string | null
  model_name: string
  has_api_key: boolean
  vault_path: string | null
  cookies_file: string | null
  updated_at: string | null
}

export interface LLMConfigUpdate {
  provider: string
  base_url?: string
  model_name: string
  api_key?: string
  vault_path?: string
  cookies_file?: string
}

export const llmConfigApi = {
  get: () => api.get<LLMConfigOut>('/api/user/llm-config'),
  update: (data: LLMConfigUpdate) => api.put<LLMConfigOut>('/api/user/llm-config', data),
}
