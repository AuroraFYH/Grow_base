import api from './client'

export interface UserOut {
  id: number
  email: string
  username: string
  created_at: string
}

export interface Token {
  access_token: string
  token_type: string
  user: UserOut
}

export interface LocalBootstrap {
  access_token: string
  token_type: string
  user: UserOut
  workspace_id: number
  workspace_name: string
}

export const authApi = {
  localBootstrap: () => api.post<LocalBootstrap>('/api/auth/local/bootstrap'),
  register: (data: { email: string; username: string; password: string }) =>
    api.post<UserOut>('/api/auth/register', data),

  login: (data: { email: string; password: string }) =>
    api.post<Token>('/api/auth/login', data),

  me: () => api.get<UserOut>('/api/auth/me'),
}
