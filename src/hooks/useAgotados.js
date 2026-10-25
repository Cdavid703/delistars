import { useEffect, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '../services/firebase'

const VACIO = { ids: new Set(), nombres: {} }

// Agotados de una sede en vivo (agotados/{sedeId}: { ids, nombres }). Ver utils/agotados.js.
export default function useAgotados(sedeId) {
  const [estado, setEstado] = useState(VACIO)
  useEffect(() => {
    if (!sedeId || sedeId === 'all') return undefined
    return onSnapshot(doc(db, 'agotados', sedeId), (snap) => {
      const d = snap.data() || {}
      setEstado({ ids: new Set((d.ids || []).map(Number)), nombres: d.nombres || {} })
    }, () => setEstado(VACIO))
  }, [sedeId])
  return sedeId && sedeId !== 'all' ? estado : VACIO
}
