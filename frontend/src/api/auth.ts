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

export const authApi = {
  register: (data: { email: string; username: string; password: string }) =>
    api.post<UserOut>('/api/auth/register', data),

  login: (data: { email: string; password: string }) =>
    api.post<Token>('/api/auth/login', data),

  me: () => api.get<UserOut>('/api/auth/me'),
}
