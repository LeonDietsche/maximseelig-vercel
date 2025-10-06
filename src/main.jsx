import { StrictMode, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import './index.css'
import Signup from './pages/Signup'
import Player from './pages/Player'

function BootRedirect() {
  return <Signup />
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<BootRedirect />} />
        <Route path="/app" element={<Player />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
)
