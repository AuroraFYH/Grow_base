import { create } from 'zustand'
import type { UserOut } from '../api/auth'

interface AuthStore {
  user: UserOut | null
  token: string | null
  setAuth: (user: UserOut, token: string) => void
  logout: () => void
}

export const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  token: localStorage.getItem('token'),
  setAuth: (user, token) => {
    localStorage.setItem('token', token)
    set({ user, token })
  },
  logout: () => {
    localStorage.removeItem('token')
    set({ user: null, token: null })
  },
}))
