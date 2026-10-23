import { useEffect, useState } from 'react'
import { collection, onSnapshot } from 'firebase/firestore'
import { db } from '../services/firebase'

// Turno de cada domiciliario (Fase 5): { [correo]: { estado, nombre, sedes } }.
// Lo escribe el servidor; la caja lo lee para saber quién está disponible.
export const TEXTO_TURNO = { activo: 'En turno', pausa: 'En pausa', fuera: 'Fuera de turno' }

export default function useTurnosDomiciliarios(sedeId) {
  const [turnos, setTurnos] = useState({})
  useEffect(() => onSnapshot(collection(db, 'turnos_domiciliario'), (snap) => {
    const t = {}
    for (const d of snap.docs) {
      const x = d.data()
      const sedes = Array.isArray(x.sedes) ? x.sedes : []
      if (sedeId && sedeId !== 'all' && sedes.length && !sedes.includes(sedeId)) continue
      t[d.id] = { estado: x.estado || 'fuera', nombre: x.nombre || d.id, sedes }
    }
    setTurnos(t)
  }, () => setTurnos({})), [sedeId])
  return turnos
}
