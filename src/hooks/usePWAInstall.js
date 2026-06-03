import { useState, useEffect } from 'react'

// Singleton — un solo listener global, múltiples componentes suscritos
const subscribers = new Set()
let deferredPrompt = null

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault()
    deferredPrompt = e
    subscribers.forEach(cb => cb(e))
  })
}

export function usePWAInstall() {
  const [prompt, setPrompt] = useState(deferredPrompt)

  useEffect(() => {
    subscribers.add(setPrompt)
    return () => subscribers.delete(setPrompt)
  }, [])

  const install = async () => {
    if (!deferredPrompt) return false
    deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    deferredPrompt = null
    subscribers.forEach(cb => cb(null))
    return outcome === 'accepted'
  }

  return { canInstall: !!prompt, install }
}
