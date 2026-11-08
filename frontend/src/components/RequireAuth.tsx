import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuthStore } from '../store/auth'
import { authApi } from '../api/auth'

export default function RequireAuth({ children }: { children: React.ReactNode }) {
  const { token, user, setAuth, logout } = useAuthStore()
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    if (user && token) {
      setChecking(false)
      return
    }
    if (token) {
      authApi.me()
        .then(({ data }) => { setAuth(data, token); setChecking(false) })
        .catch(() => {
          logout()
          authApi.localBootstrap()
            .then(({ data }) => { setAuth(data.user, data.access_token); setChecking(false) })
            .catch(() => setChecking(false))
        })
      return
    }
    authApi.localBootstrap()
      .then(({ data }) => { setAuth(data.user, data.access_token); setChecking(false) })
      .catch(() => setChecking(false))
  }, [token, user, setAuth, logout])

  if (checking) return null
  if (!token) return <Navigate to="/login" replace />
  return <>{children}</>
}
