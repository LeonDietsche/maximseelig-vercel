import { StrictMode, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import './index.css'
import Signup from './pages/Signup'
import Player from './pages/Player'
import { RequireAuth, RedirectIfAuthed } from './routes/guards'

function BootRedirect() {
  return <Signup />
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* If already logged in, jump straight to /release */}
        <Route
          path="/"
          element={
            <RedirectIfAuthed to="/release">
              <Signup />
            </RedirectIfAuthed>
          }
        />
        {/* Only allow if session is valid; otherwise send to / */}
        <Route
          path="/release"
          element={
            <RequireAuth>
              <Player />
            </RequireAuth>
          }
        />
        {/* Fallback */}
        <Route path="*" element={<Signup />} />
      </Routes>
    </BrowserRouter>
  )
}


createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
)
