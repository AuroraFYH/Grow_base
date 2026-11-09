import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { Spin } from 'antd'
import { useAuthStore } from '../store/auth'
import { authApi } from '../api/auth'

export default function RequireAuth({ children }: { children: React.ReactNode }) {
  const { token, user, setAuth, logout } = useAuthStore()
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    let active = true
    const finish = () => { if (active) setChecking(false) }

    if (user && token) {
      finish()
      return
    }
    if (token) {
      authApi.me()
        .then(({ data }) => { if (active) { setAuth(data, token); finish() } })
        .catch(() => {
          logout()
          finish()
        })
      return () => { active = false }
    }
    finish()
    return () => { active = false }
  }, [token, user, setAuth, logout])

  if (checking) {
    return (
      <div className="auth-state" role="status">
        <Spin size="large" />
        <span>正在连接 GrowBase...</span>
      </div>
    )
  }
  if (!token) return <Navigate to="/login" replace />
  return <>{children}</>
}
