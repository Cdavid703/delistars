import { useEffect, useState } from 'react'
import { collection, getDocs, doc, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '@/services/firebase'
import { toast } from 'sonner'

// Mirror de src/services/roles.js (domicilios) — equipos por defecto.
const DEFAULT_CASHIERS: Record<string, string> = {
  'lluis02martinez@gmail.com': 'Jose Luis Martinez Villegas',
  'josemanuellondonorivillas@gmail.com': 'Jose Manuel Londoño Rivillas',
  'vvillegasmazo@gmail.com': 'Valentina Villegas Mazo',
  'yencytp@gmail.com': 'Yency Torres Parra',
  'cdavid.jaramillo@gmail.com': 'Carlos David Jaramillo',
  'thebesta4321@gmail.com': 'Andrés Elías Arango Monsalve',
}
const DEFAULT_DRIVERS: Record<string, string> = {
  'cdavid.jaramillo@gmail.com': 'Carlos David Jaramillo',
  'josemanuellondonorivillas@gmail.com': 'José Manuel Londoño',
}

type Role = 'cashier' | 'driver'
interface TeamMember { id: string; name: string; isDefault?: boolean }

const mergeDefaults = (defaults: Record<string, string>, fromDb: TeamMember[]): TeamMember[] => {
  const dbIds = fromDb.map((d) => d.id)
  const defaultObjs = Object.entries(defaults)
    .filter(([email]) => !dbIds.includes(email))
    .map(([email, name]) => ({ id: email, name, isDefault: true }))
  return [...defaultObjs, ...fromDb]
}

export default function Usuarios() {
  const [cashiers, setCashiers] = useState<TeamMember[]>([])
  const [drivers, setDrivers] = useState<TeamMember[]>([])
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [role, setRole] = useState<Role>('cashier')
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    try {
      const [cs, ds] = await Promise.all([
        getDocs(collection(db, 'roles_cashiers')),
        getDocs(collection(db, 'roles_drivers')),
      ])
      const fsCashiers = cs.docs.map((d) => ({ id: d.id, ...(d.data() as { name: string }) }))
      const fsDrivers = ds.docs.map((d) => ({ id: d.id, ...(d.data() as { name: string }) }))
      setCashiers(mergeDefaults(DEFAULT_CASHIERS, fsCashiers))
      setDrivers(mergeDefaults(DEFAULT_DRIVERS, fsDrivers))
    } catch {
      toast.error('Error al cargar el equipo')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const addUser = async () => {
    if (!email.trim()) return
    const e = email.trim().toLowerCase()
    const col = role === 'cashier' ? 'roles_cashiers' : 'roles_drivers'
    try {
      await setDoc(doc(db, col, e), { email: e, name: name.trim() || e, addedAt: serverTimestamp() })
      toast.success(`${e} agregado como ${role === 'cashier' ? 'cajero' : 'domiciliario'}`)
      setEmail(''); setName(''); load()
    } catch {
      toast.error('Error al agregar usuario')
    }
  }

  const removeUser = async (id: string, r: Role) => {
    if (!window.confirm(`¿Quitar a ${id}?`)) return
    const col = r === 'cashier' ? 'roles_cashiers' : 'roles_drivers'
    try { await deleteDoc(doc(db, col, id)); load() }
    catch { toast.error('Error al quitar usuario') }
  }

  const List = ({ title, members, role: r }: { title: string; members: TeamMember[]; role: Role }) => (
    <div>
      <h2 className="text-lg font-display font-semibold text-coal mb-3">{title} ({members.length})</h2>
      <div className="space-y-2">
        {members.map((m) => (
          <div key={m.id} className="bg-white border border-gray-200 rounded-lg p-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="font-semibold text-sm text-coal truncate">{m.name || m.id}</p>
              <p className="text-xs text-muted-fg truncate">{m.id}</p>
            </div>
            {m.isDefault ? (
              <span className="text-[10px] text-coal/30 uppercase tracking-wider shrink-0">fijo</span>
            ) : (
              <button onClick={() => removeUser(m.id, r)} className="text-pepper text-sm font-semibold shrink-0">Quitar</button>
            )}
          </div>
        ))}
      </div>
    </div>
  )

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-4xl font-display font-bold text-coal">Usuarios</h1>
        <p className="text-muted-fg mt-1">Cajeros y domiciliarios del sistema de domicilios</p>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-4 mb-8 max-w-xl">
        <h2 className="text-lg font-display font-semibold text-coal mb-3">Agregar usuario</h2>
        <div className="flex flex-col gap-2">
          <input className="border rounded px-3 py-2 text-sm" placeholder="Correo de Google *" value={email} onChange={(e) => setEmail(e.target.value)} />
          <input className="border rounded px-3 py-2 text-sm" placeholder="Nombre (opcional)" value={name} onChange={(e) => setName(e.target.value)} />
          <select className="border rounded px-3 py-2 text-sm" value={role} onChange={(e) => setRole(e.target.value as Role)}>
            <option value="cashier">Cajero</option>
            <option value="driver">Domiciliario</option>
          </select>
          <button onClick={addUser} className="bg-primary text-white rounded px-4 py-2 text-sm font-medium">Agregar</button>
        </div>
      </div>

      {loading ? (
        <p className="text-muted-fg">Cargando equipo…</p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <List title="Cajeros" members={cashiers} role="cashier" />
          <List title="Domiciliarios" members={drivers} role="driver" />
        </div>
      )}
    </div>
  )
}
