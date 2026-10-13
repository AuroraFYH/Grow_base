import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuthStore } from '../store/auth'
import { authApi } from '../api/auth'

export default function RequireAuth({ children }: { children: React.ReactNode }) {
  const { token, user, setAuth, logout } = useAuthStore()
  const [checking, setChecking] = useState(!user && !!token)

  useEffect(() => {
    if (!user && token) {
      authApi.me()
        .then(({ data }) => { setAuth(data, token); setChecking(false) })
        .catch(() => { logout(); setChecking(false) })
    }
  }, [])

  if (checking) return null
  if (!token) return <Navigate to="/login" replace />
  return <>{children}</>
}
