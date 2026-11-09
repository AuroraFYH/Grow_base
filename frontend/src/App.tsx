import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import WorkspacePage from './pages/WorkspacePage'
import SettingsPage from './pages/SettingsPage'
import LoginPage from './pages/LoginPage'
import RequireAuth from './components/RequireAuth'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<RequireAuth><WorkspacePage /></RequireAuth>} />
        <Route path="/workspace" element={<RequireAuth><WorkspacePage /></RequireAuth>} />
        <Route path="/workspace/:orgId" element={<RequireAuth><WorkspacePage /></RequireAuth>} />
        <Route path="/settings" element={<RequireAuth><SettingsPage /></RequireAuth>} />
        {/* legacy redirects */}
        <Route path="/org/:orgId" element={<RequireAuth><WorkspacePage /></RequireAuth>} />
        <Route path="/org/:orgId/knowledge" element={<RequireAuth><WorkspacePage /></RequireAuth>} />
        <Route path="/org/:orgId/assistant" element={<RequireAuth><WorkspacePage /></RequireAuth>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

