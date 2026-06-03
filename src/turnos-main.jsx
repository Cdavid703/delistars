import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import TurnosPage from './pages/TurnosPage'
import './index.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <TurnosPage />
  </StrictMode>,
)
