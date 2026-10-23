import { useEffect, useMemo, useState } from 'react'
import { doc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../services/firebase'

// Caja con varios aparatos por sede (Fase 6, especificación §18): uno
// principal suena y los demás solo muestran el aviso. Lo elige la caja, nunca
// es automático. Cada aparato reporta que sigue conectado; si el principal
// deja de reportar, los demás lo ven y ofrecen "Usar este como principal".
// Mientras no haya principal conectado, suenan todos (para no perder pedidos).
const LATIDO_MS = 30000
const VIVO_MS = 90000

// Id de este aparato (queda en el navegador): se calcula una vez por página.
let idCache = null
function idDeAparato() {
  if (idCache) return idCache
  try {
    idCache = localStorage.getItem('ds_aparato_caja')
    if (!idCache) {
      idCache = (crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`).replace(/[^a-zA-Z0-9-]/g, '')
      localStorage.setItem('ds_aparato_caja', idCache)
    }
  } catch { idCache = `temporal-${Math.random().toString(36).slice(2)}` }
  return idCache
}
const ahoraMs = () => Date.now()

function nombreAparato() {
  const ua = navigator.userAgent
  if (/iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'iPad'
  if (/iPhone/.test(ua)) return 'iPhone'
  if (/Android/.test(ua)) return /Mobile/.test(ua) ? 'Celular Android' : 'Tablet Android'
  return 'Computador'
}

export default function usePuestoCaja(sedeId, email) {
  const unaSede = !!sedeId && sedeId !== 'all'
  const aparatoId = useMemo(() => idDeAparato(), [])
  const nombre = useMemo(() => nombreAparato(), [])
  const [puesto, setPuesto] = useState(null)
  const [ahora, setAhora] = useState(ahoraMs)

  useEffect(() => {
    if (!unaSede) return
    return onSnapshot(doc(db, 'caja_puestos', sedeId), (s) => setPuesto(s.exists() ? s.data() : {}), () => setPuesto({}))
  }, [sedeId, unaSede])

  const esPrincipal = unaSede && puesto?.principal === aparatoId

  // Latido: este aparato sigue conectado (y, si es el principal, lo dice).
  useEffect(() => {
    if (!unaSede || !email) return
    const latir = () => {
      setAhora(ahoraMs())
      setDoc(doc(db, 'caja_puestos', sedeId, 'aparatos', aparatoId), { nombre, email, latido: serverTimestamp() }).catch(() => {})
      if (esPrincipal) setDoc(doc(db, 'caja_puestos', sedeId), { latidoPrincipal: serverTimestamp() }, { merge: true }).catch(() => {})
    }
    latir()
    const t = setInterval(latir, LATIDO_MS)
    return () => clearInterval(t)
  }, [sedeId, unaSede, email, aparatoId, nombre, esPrincipal])

  const latido = puesto?.latidoPrincipal?.toMillis?.() ?? 0
  const principalActivo = unaSede && !!puesto?.principal && ahora - latido < VIVO_MS

  const hacerPrincipal = () => setDoc(doc(db, 'caja_puestos', sedeId), {
    principal: aparatoId, principalNombre: `${nombre} · ${String(email || '').split('@')[0]}`,
    principalPor: email || null, principalDesde: serverTimestamp(), latidoPrincipal: serverTimestamp(),
  })

  return {
    disponible: unaSede,
    esPrincipal,
    principalActivo,
    principalNombre: puesto?.principalNombre || null,
    hayPrincipal: !!puesto?.principal,
    // Suena el principal; si no hay uno conectado, suenan todos.
    suena: !unaSede || esPrincipal || !principalActivo,
    hacerPrincipal,
    cargando: unaSede && puesto === null,
  }
}
