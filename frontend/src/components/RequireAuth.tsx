import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { Alert, Spin } from 'antd'
import { useAuthStore } from '../store/auth'
import { authApi } from '../api/auth'

export default function RequireAuth({ children }: { children: React.ReactNode }) {
  const { token, user, setAuth, logout } = useAuthStore()
  const [checking, setChecking] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    let active = true
    const finish = () => {
      if (active) setChecking(false)
    }

    if (user && token) {
      finish()
      return
    }
    if (token) {
      authApi.me()
        .then(({ data }) => { if (active) { setAuth(data, token); finish() } })
        .catch(() => {
          logout()
          authApi.localBootstrap()
            .then(({ data }) => { if (active) { setAuth(data.user, data.access_token); finish() } })
            .catch(() => { if (active) { setError(true); finish() } })
        })
      return () => { active = false }
    }
    authApi.localBootstrap()
      .then(({ data }) => { if (active) { setAuth(data.user, data.access_token); finish() } })
      .catch(() => { if (active) { setError(true); finish() } })
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
  if (error && !token) {
    return (
      <div className="auth-state auth-state-error">
        <Alert
          type="warning"
          showIcon
          message="暂时无法连接工作区"
          description="请确认本地后端服务已启动，然后刷新页面。"
        />
        <button className="auth-retry" type="button" onClick={() => window.location.reload()}>
          重新连接
        </button>
      </div>
    )
  }
  if (!token) return <Navigate to="/login" replace />
  return <>{children}</>
}
