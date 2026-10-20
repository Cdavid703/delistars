import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { UserPlus, Check, X } from 'lucide-react'
import { auth } from '@/services/firebase'

// Solicitudes de acceso al equipo (especificación §6). Quien quiere trabajar en
// caja o reparto las pide desde la app con su cuenta; aquí se aprueban o
// rechazan. Aprobar crea el mismo rol que "Agregar empleado", con su sede.
const API = import.meta.env.VITE_API_URL || 'http://localhost:3000/api/v1'
const SEDE: Record<string, string> = { santa_lucia: 'Santa Lucía', santa_teresita: 'Santa Teresita' }
const ROL: Record<string, string> = { caja: 'Caja', domiciliario: 'Domiciliario' }

interface Solicitud { uid: string; email: string; nombre: string; telefono: string; rol: string; sedeId: string; creadaAt: string | null }

async function llamar(ruta: string, metodo = 'GET', cuerpo?: unknown) {
  const token = await auth.currentUser?.getIdToken()
  const r = await fetch(`${API}/equipo/${ruta}`, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  })
  const datos = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(datos.error || `Error ${r.status}`)
  return datos
}

export default function SolicitudesAcceso({ onCambio }: { onCambio?: () => void }) {
  const [lista, setLista] = useState<Solicitud[] | null>(null)
  const [ocupado, setOcupado] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    try { setLista(await llamar('solicitudes')) } catch { setLista([]) }
  }, [])
  useEffect(() => { cargar() }, [cargar])

  const resolver = async (s: Solicitud, accion: 'aprobar' | 'rechazar') => {
    let motivo: string | null = null
    if (accion === 'rechazar') {
      motivo = window.prompt(`¿Por qué no se aprueba a ${s.nombre}? (opcional)`, '')
      if (motivo === null) return
    }
    setOcupado(s.uid)
    try {
      await llamar(`solicitudes/${s.uid}/${accion}`, 'POST', accion === 'rechazar' ? { motivo } : {})
      toast.success(accion === 'aprobar' ? `${s.nombre} ya tiene acceso de ${ROL[s.rol].toLowerCase()} en ${SEDE[s.sedeId]}` : 'Solicitud rechazada')
      await cargar()
      onCambio?.()
    } catch (e) {
      toast.error((e as Error).message)
    } finally { setOcupado(null) }
  }

  if (!lista || lista.length === 0) return null
  return (
    <div className="bg-amber-50 border border-amber-300 rounded-lg p-4 mb-6 max-w-xl">
      <div className="flex items-center gap-2 mb-3">
        <UserPlus className="w-5 h-5 text-amber-700" />
        <h2 className="text-lg font-display font-semibold text-coal">
          Solicitudes de acceso ({lista.length})
        </h2>
      </div>
      <div className="flex flex-col gap-2">
        {lista.map((s) => (
          <div key={s.uid} className="bg-white rounded-md border border-amber-200 p-3 flex flex-wrap items-center gap-2 justify-between">
            <div className="text-sm">
              <p className="font-semibold text-coal">{s.nombre} · {ROL[s.rol]} en {SEDE[s.sedeId]}</p>
              <p className="text-xs text-muted-fg">{s.email} · {s.telefono}</p>
            </div>
            <div className="flex gap-2">
              <button disabled={ocupado === s.uid} onClick={() => resolver(s, 'aprobar')}
                className="flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-semibold bg-emerald-600 text-white hover:opacity-90 disabled:opacity-50">
                <Check className="w-3.5 h-3.5" /> Aprobar
              </button>
              <button disabled={ocupado === s.uid} onClick={() => resolver(s, 'rechazar')}
                className="flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-semibold border border-gray-300 hover:bg-gray-50 disabled:opacity-50">
                <X className="w-3.5 h-3.5" /> Rechazar
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
