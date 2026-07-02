import { useEffect, useState } from 'react'
import { collection, getDocs, doc, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '@/services/firebase'
import { toast } from 'sonner'
import { DEFAULT_CASHIERS, DEFAULT_DRIVERS, ADMIN_EMAILS } from '@/lib/team'
import { Lock, Pencil, Save, Trash2, X } from 'lucide-react'

type Role = 'cashier' | 'driver'

// Un empleado puede tener uno o ambos roles a la vez (cajero y/o domiciliario).
// Los "fijos" vienen hardcodeados en el código (DEFAULT_CASHIERS/DEFAULT_DRIVERS)
// y no se pueden quitar desde aquí; los agregados desde este panel viven en
// Firestore (roles_cashiers / roles_drivers) y sí se pueden editar/quitar.
interface Employee {
  email: string
  name: string
  phone?: string
  isCashier: boolean
  cashierFixed: boolean
  isDriver: boolean
  driverFixed: boolean
}

export default function Usuarios() {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)

  const [newEmail, setNewEmail] = useState('')
  const [newName, setNewName] = useState('')
  const [newPhone, setNewPhone] = useState('')
  const [newCashier, setNewCashier] = useState(true)
  const [newDriver, setNewDriver] = useState(false)

  const [editing, setEditing] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editPhone, setEditPhone] = useState('')

  const load = async () => {
    setLoading(true)
    try {
      const [cs, ds] = await Promise.all([
        getDocs(collection(db, 'roles_cashiers')),
        getDocs(collection(db, 'roles_drivers')),
      ])
      const dynCashiers = new Map(cs.docs.map((d) => [d.id.toLowerCase(), d.data() as { name?: string; phone?: string }]))
      const dynDrivers = new Map(ds.docs.map((d) => [d.id.toLowerCase(), d.data() as { name?: string; phone?: string }]))

      const emails = new Set([
        ...Object.keys(DEFAULT_CASHIERS).map((e) => e.toLowerCase()),
        ...Object.keys(DEFAULT_DRIVERS).map((e) => e.toLowerCase()),
        ...dynCashiers.keys(),
        ...dynDrivers.keys(),
      ])

      const list: Employee[] = Array.from(emails).map((email) => {
        const cashierFixed = email in Object.fromEntries(Object.entries(DEFAULT_CASHIERS).map(([k, v]) => [k.toLowerCase(), v]))
        const driverFixed = email in Object.fromEntries(Object.entries(DEFAULT_DRIVERS).map(([k, v]) => [k.toLowerCase(), v]))
        const dynCashier = dynCashiers.get(email)
        const dynDriver = dynDrivers.get(email)
        const fixedCashierName = Object.entries(DEFAULT_CASHIERS).find(([k]) => k.toLowerCase() === email)?.[1]
        const fixedDriverName = Object.entries(DEFAULT_DRIVERS).find(([k]) => k.toLowerCase() === email)?.[1]
        return {
          email,
          name: dynCashier?.name || dynDriver?.name || fixedCashierName || fixedDriverName || email,
          phone: dynCashier?.phone || dynDriver?.phone || undefined,
          isCashier: cashierFixed || dynCashiers.has(email),
          cashierFixed,
          isDriver: driverFixed || dynDrivers.has(email),
          driverFixed,
        }
      })
      list.sort((a, b) => a.name.localeCompare(b.name))
      setEmployees(list)
    } catch {
      toast.error('Error al cargar el equipo')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const addEmployee = async () => {
    const email = newEmail.trim().toLowerCase()
    if (!email) { toast.error('El correo es obligatorio'); return }
    if (!newCashier && !newDriver) { toast.error('Elige al menos un rol (cajero o domiciliario)'); return }
    try {
      const payload = { email, name: newName.trim() || email, phone: newPhone.trim() || null, addedAt: serverTimestamp() }
      if (newCashier) await setDoc(doc(db, 'roles_cashiers', email), payload)
      if (newDriver) await setDoc(doc(db, 'roles_drivers', email), payload)
      toast.success(`${email} agregado`)
      setNewEmail(''); setNewName(''); setNewPhone(''); setNewCashier(true); setNewDriver(false)
      load()
    } catch {
      toast.error('Error al agregar el empleado')
    }
  }

  const toggleRole = async (emp: Employee, role: Role) => {
    const fixed = role === 'cashier' ? emp.cashierFixed : emp.driverFixed
    if (fixed) return // los roles fijos no se editan desde la UI
    const col = role === 'cashier' ? 'roles_cashiers' : 'roles_drivers'
    const has = role === 'cashier' ? emp.isCashier : emp.isDriver
    try {
      if (has) {
        await deleteDoc(doc(db, col, emp.email))
      } else {
        await setDoc(doc(db, col, emp.email), { email: emp.email, name: emp.name, phone: emp.phone || null, addedAt: serverTimestamp() })
      }
      load()
    } catch {
      toast.error('Error al actualizar el rol')
    }
  }

  const startEdit = (emp: Employee) => {
    setEditing(emp.email)
    setEditName(emp.name)
    setEditPhone(emp.phone || '')
  }

  const saveEdit = async (emp: Employee) => {
    try {
      const payload = { email: emp.email, name: editName.trim() || emp.email, phone: editPhone.trim() || null }
      if (emp.isCashier && !emp.cashierFixed) await setDoc(doc(db, 'roles_cashiers', emp.email), payload, { merge: true })
      if (emp.isDriver && !emp.driverFixed) await setDoc(doc(db, 'roles_drivers', emp.email), payload, { merge: true })
      setEditing(null)
      toast.success('Datos actualizados')
      load()
    } catch {
      toast.error('Error al guardar los cambios')
    }
  }

  const removeEmployee = async (emp: Employee) => {
    if (emp.cashierFixed || emp.driverFixed) return
    if (!window.confirm(`¿Quitar a ${emp.name} de todos los roles?`)) return
    try {
      if (emp.isCashier) await deleteDoc(doc(db, 'roles_cashiers', emp.email))
      if (emp.isDriver) await deleteDoc(doc(db, 'roles_drivers', emp.email))
      toast.success('Empleado eliminado')
      load()
    } catch {
      toast.error('Error al eliminar')
    }
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-4xl font-display font-bold text-coal">Empleados</h1>
        <p className="text-muted-fg mt-1">Cajeros y domiciliarios del sistema de domicilios — un empleado puede tener ambos roles</p>
      </div>

      {/* Admins — solo lectura, fijos en el código por seguridad */}
      <div className="bg-white border border-gray-200 rounded-lg p-4 mb-6 max-w-xl">
        <div className="flex items-center gap-2 mb-2">
          <Lock className="w-4 h-4 text-muted-fg" />
          <h2 className="text-sm font-display font-semibold text-coal">Administradores</h2>
        </div>
        <p className="text-xs text-muted-fg mb-2">
          Fijos en el código por seguridad (no se gestionan desde aquí — requiere editar ADMIN_EMAILS y publicar reglas de Firestore).
        </p>
        <div className="flex flex-wrap gap-2">
          {ADMIN_EMAILS.map((email) => (
            <span key={email} className="text-xs bg-gray-100 text-coal rounded-full px-3 py-1">{email}</span>
          ))}
        </div>
      </div>

      {/* Agregar empleado */}
      <div className="bg-white border border-gray-200 rounded-lg p-4 mb-8 max-w-xl">
        <h2 className="text-lg font-display font-semibold text-coal mb-3">Agregar empleado</h2>
        <div className="flex flex-col gap-2">
          <input className="border rounded px-3 py-2 text-sm" placeholder="Correo de Google *" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
          <input className="border rounded px-3 py-2 text-sm" placeholder="Nombre" value={newName} onChange={(e) => setNewName(e.target.value)} />
          <input className="border rounded px-3 py-2 text-sm" placeholder="Teléfono (opcional)" value={newPhone} onChange={(e) => setNewPhone(e.target.value)} />
          <div className="flex items-center gap-4 text-sm">
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={newCashier} onChange={(e) => setNewCashier(e.target.checked)} /> Cajero
            </label>
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={newDriver} onChange={(e) => setNewDriver(e.target.checked)} /> Domiciliario
            </label>
          </div>
          <button onClick={addEmployee} className="bg-primary text-white rounded px-4 py-2 text-sm font-medium">Agregar</button>
        </div>
      </div>

      {loading ? (
        <p className="text-muted-fg">Cargando equipo…</p>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden max-w-4xl">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-semibold text-coal">Empleado</th>
                <th className="px-4 py-3 text-center text-sm font-semibold text-coal">Cajero</th>
                <th className="px-4 py-3 text-center text-sm font-semibold text-coal">Domiciliario</th>
                <th className="px-4 py-3 text-right text-sm font-semibold text-coal">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {employees.map((emp) => (
                <tr key={emp.email} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    {editing === emp.email ? (
                      <div className="flex flex-col gap-1">
                        <input className="border rounded px-2 py-1 text-sm" value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="Nombre" />
                        <input className="border rounded px-2 py-1 text-sm" value={editPhone} onChange={(e) => setEditPhone(e.target.value)} placeholder="Teléfono" />
                      </div>
                    ) : (
                      <>
                        <p className="text-sm font-medium text-coal">{emp.name}</p>
                        <p className="text-xs text-muted-fg">{emp.email}{emp.phone ? ` · ${emp.phone}` : ''}</p>
                      </>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {emp.cashierFixed ? (
                      <span title="Fijo en el código" className="text-[10px] text-coal/30 uppercase tracking-wider">fijo</span>
                    ) : (
                      <input type="checkbox" checked={emp.isCashier} onChange={() => toggleRole(emp, 'cashier')} />
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {emp.driverFixed ? (
                      <span title="Fijo en el código" className="text-[10px] text-coal/30 uppercase tracking-wider">fijo</span>
                    ) : (
                      <input type="checkbox" checked={emp.isDriver} onChange={() => toggleRole(emp, 'driver')} />
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {editing === emp.email ? (
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => saveEdit(emp)} className="text-mint hover:bg-mint/10 rounded p-1.5"><Save className="w-4 h-4" /></button>
                        <button onClick={() => setEditing(null)} className="text-coal/50 hover:bg-gray-100 rounded p-1.5"><X className="w-4 h-4" /></button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-end gap-2">
                        {!(emp.cashierFixed && emp.driverFixed) && (
                          <button onClick={() => startEdit(emp)} className="text-primary hover:bg-primary/10 rounded p-1.5"><Pencil className="w-4 h-4" /></button>
                        )}
                        {!emp.cashierFixed && !emp.driverFixed && (
                          <button onClick={() => removeEmployee(emp)} className="text-red-600 hover:bg-red-50 rounded p-1.5"><Trash2 className="w-4 h-4" /></button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
