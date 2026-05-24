import { useState, useEffect } from 'react'
import { X } from 'lucide-react'

export default function InstallPromptBanner() {
  const [prompt,    setPrompt]    = useState(null)
  const [dismissed, setDismissed] = useState(
    () => localStorage.getItem('pwa_install_dismissed') === '1'
  )

  useEffect(() => {
    const handler = e => { e.preventDefault(); setPrompt(e) }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  if (!prompt || dismissed) return null

  const install = async () => {
    prompt.prompt()
    const { outcome } = await prompt.userChoice
    if (outcome === 'accepted') {
      setPrompt(null)
    } else {
      setDismissed(true)
      localStorage.setItem('pwa_install_dismissed', '1')
    }
  }

  const dismiss = () => {
    setDismissed(true)
    localStorage.setItem('pwa_install_dismissed', '1')
  }

  return (
    <div className="fixed bottom-20 left-4 right-4 z-[150] bg-coal text-cream rounded-2xl px-4 py-3 flex items-center gap-3 shadow-xl animate-fade-in">
      <img src="/logo_sello.png" alt="DeliStars" className="w-10 h-10 flex-shrink-0 rounded-xl object-cover" />
      <div className="flex-1 min-w-0">
        <p className="font-body font-semibold text-sm">Instalar DeliStars</p>
        <p className="font-body text-xs text-cream/60">Agrega la app a tu pantalla de inicio</p>
      </div>
      <button
        onClick={install}
        className="flex-shrink-0 bg-cherry text-cream font-body text-xs font-semibold px-3 py-1.5 rounded-xl hover:bg-cherry/80 transition-colors"
      >
        Instalar
      </button>
      <button onClick={dismiss} className="flex-shrink-0 text-cream/40 hover:text-cream transition-colors">
        <X size={16} />
      </button>
    </div>
  )
}
