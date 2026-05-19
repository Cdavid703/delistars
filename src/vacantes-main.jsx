import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import VacantesPage from './pages/VacantesPage'
import './index.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <VacantesPage />
  </StrictMode>,
)
