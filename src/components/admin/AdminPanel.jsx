import { useState, useEffect } from 'react'
import {
  collection, getDocs, doc, setDoc, deleteDoc,
  query, where, onSnapshot, serverTimestamp
} from 'firebase/firestore'
import { db } from '../../services/firebase'
import { useAuth } from '../../contexts/AuthContext'
import { DEFAULT_DRIVERS, DEFAULT_DRIVER_NAMES, DEFAULT_CASHIERS, DEFAULT_CASHIER_NAMES } from '../../services/roles'
import Logo from '../common/Logo'
import StatusBadge from '../common/StatusBadge'
import { format, startOfDay, endOfDay } from 'date-fns'
import { es } from 'date-fns/locale'
import {
  Users, LayoutDashboard, ClipboardList, BarChart2,
  LogOut, MapPin, Plus, Trash2, Receipt, Bike,
  TrendingUp, Package, CheckCircle, Clock
} from 'lucide-react'

const TABS = [
  { id: 'dashboard', label: 'Dashboard',  icon: LayoutDashboard },
  { id: 'users',     label: 'Usuarios',   icon: Users },
  { id: 'orders',    label: 'Pedidos',    icon: ClipboardList },
  { id: 'reports',   label: 'Reportes',   icon: BarChart2 },
]

export default function AdminPanel() {
  const { user, sede, logout, selectSede } = useAuth()
  const [tab, setTab] = useState('dashboard')
  const today = format(new Date(), "EEEE dd 'de' MMMM yyyy", { locale: es })

  return (
    <div className="min-h-screen-safe flex flex-col bg-gradient-soft">
      {/* Header */}
      <header className="page-header">
        <div className="flex items-center gap-3">
          <Logo variant="light" size="sm" />
          <div>
            <p className="font-display text-base text-coal tracking-wide leading-tight">
              Administrador
            </p>
            <p className="font-body text-xs text-coal/50 capitalize">{today}</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => selectSede(null)} className="btn-icon" title="Cambiar sede">
            <MapPin size={20} />
          </button>
          <button onClick={logout} className="btn-icon" title="Cerrar sesión">
            <LogOut size={20} />
          </button>
        </div>
      </header>

      {/* Sede badge */}
      {sede && (
        <div className="mx-4 mt-2 flex items-center gap-2 bg-cherry/10 rounded-full px-4 py-2 w-fit">
          <MapPin size={14} className="text-cherry" />
          <span className="font-body text-sm font-semibold text-cherry">{sede.name}</span>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-coal/10 bg-cream/80 px-2 mt-2 overflow-x-auto">
        {TABS.map(t => {
          const Icon = t.icon
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-4 py-3 text-xs font-semibold uppercase tracking-wider border-b-2 transition-all duration-200 whitespace-nowrap ${
                tab === t.id ? 'border-cherry text-cherry' : 'border-transparent text-coal/50 hover:text-coal/70'
              }`}>
              <Icon size={14} />
              {t.label}
            </button>
          )
        })}
      </div>

      {/* Content */}
      <main className="flex-1 overflow-y-auto scroll-custom p-4">
        {tab === 'dashboard' && <DashboardTab sede={sede} />}
        {tab === 'users'     && <UsersTab />}
        {tab === 'orders'    && <OrdersTab sede={sede} />}
        {tab === 'reports'   && <ReportsTab sede={sede} />}
      </main>
    </div>
  )
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
function DashboardTab({ sede }) {
  const [orders, setOrders] = useState([])

  useEffect(() => {
    if (!sede) return
    const q = query(collection(db, 'orders'), where('sedeId', '==', sede.id))
    return onSnapshot(q, snap => setOrders(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
  }, [sede])

  const active    = orders.filter(o => ['assigned','accepted','in_transit','arrived'].includes(o.status)).length
  const delivered = orders.filter(o => ['delivered_paid','completed'].includes(o.status)).length
  const cuadre    = orders.filter(o => o.status === 'pending_cuadre').length
  const total     = orders.length

  return (
    <div className="flex flex-col gap-4 animate-fade-in">
      <p className="section-title">Resumen de hoy</p>

      <div className="grid grid-cols-2 gap-3">
        <StatCard icon={Package}     color="bg-cherry"   label="Activos"          value={active} />
        <StatCard icon={CheckCircle} color="bg-mint"     label="Entregados"       value={delivered} />
        <StatCard icon={Clock}       color="bg-mustard"  label="Pdte. cuadre"     value={cuadre} />
        <StatCard icon={TrendingUp}  color="bg-coal"     label="Total pedidos"    value={total} />
      </div>

      <p className="section-title mt-2">Pedidos activos en {sede?.name}</p>
      {orders.filter(o => ['assigned','accepted','in_transit','arrived'].includes(o.status)).length === 0 ? (
        <p className="font-body text-sm text-coal/40">No hay pedidos activos</p>
      ) : (
        <div className="flex flex-col gap-2">
          {orders
            .filter(o => ['assigned','accepted','in_transit','arrived'].includes(o.status))
            .map(o => (
              <div key={o.id} className="card flex items-center justify-between gap-3">
                <div>
                  {o.orderNumber && <span className="font-display text-base text-cherry mr-2">#{o.orderNumber}</span>}
                  <span className="font-body text-sm font-semibold">{o.name}</span>
                  <p className="font-body text-xs text-coal/50 truncate">{o.fullAddress}</p>
                </div>
                <StatusBadge status={o.status} />
              </div>
            ))}
        </div>
      )}
    </div>
  )
}

function StatCard({ icon: Icon, color, label, value }) {
  return (
    <div className="card flex items-center gap-3">
      <div className={`w-10 h-10 ${color} rounded-full flex items-center justify-center flex-shrink-0`}>
        <Icon size={18} className="text-cream" />
      </div>
      <div>
        <p className="font-display text-2xl text-coal leading-none">{value}</p>
        <p className="font-body text-xs text-coal/50">{label}</p>
      </div>
    </div>
  )
}

// ─── Users management ─────────────────────────────────────────────────────────
function UsersTab() {
  const [cashiers, setCashiers] = useState([])
  const [drivers,  setDrivers]  = useState([])
  const [newEmail, setNewEmail] = useState('')
  const [newName,  setNewName]  = useState('')
  const [newRole,  setNewRole]  = useState('cashier')
  const [msg,      setMsg]      = useState('')

  const load = async () => {
    const [cs, ds] = await Promise.all([
      getDocs(collection(db, 'roles_cashiers')),
      getDocs(collection(db, 'roles_drivers')),
    ])
    const firestoreCashiers = cs.docs.map(d => ({ id: d.id, ...d.data() }))
    const firestoreDrivers  = ds.docs.map(d => ({ id: d.id, ...d.data() }))

    const cashierIds = firestoreCashiers.map(d => d.id)
    const defaultCashierObjs = DEFAULT_CASHIERS
      .filter(e => !cashierIds.includes(e))
      .map(e => ({ id: e, name: DEFAULT_CASHIER_NAMES[e] || e, isDefault: true }))

    const driverIds = firestoreDrivers.map(d => d.id)
    const defaultDriverObjs = DEFAULT_DRIVERS
      .filter(e => !driverIds.includes(e))
      .map(e => ({ id: e, name: DEFAULT_DRIVER_NAMES[e] || e, isDefault: true }))

    setCashiers([...defaultCashierObjs, ...firestoreCashiers])
    setDrivers([...defaultDriverObjs, ...firestoreDrivers])
  }

  useEffect(() => { load() }, [])

  const addUser = async () => {
    if (!newEmail.trim()) return
    const email = newEmail.trim().toLowerCase()
    const col   = newRole === 'cashier' ? 'roles_cashiers' : 'roles_drivers'
    try {
      await setDoc(doc(db, col, email), {
        email, name: newName.trim() || email, addedAt: serverTimestamp(),
      })
      setMsg(`✅ ${email} agregado como ${newRole === 'cashier' ? 'cajero' : 'domiciliario'}`)
      setNewEmail(''); setNewName('')
      load()
    } catch { setMsg('❌ Error al agregar usuario') }
  }

  const removeUser = async (email, role) => {
    const col = role === 'cashier' ? 'roles_cashiers' : 'roles_drivers'
    await deleteDoc(doc(db, col, email))
    setMsg(`Eliminado: ${email}`)
    load()
  }

  return (
    <div className="flex flex-col gap-5 animate-fade-in">
      {/* Add user form */}
      <div className="card border border-mint/30">
        <p className="font-display text-base tracking-wide mb-3">Agregar usuario</p>
        <div className="flex flex-col gap-2">
          <input className="input-field" placeholder="Correo de Google *"
            value={newEmail} onChange={e => setNewEmail(e.target.value)} />
          <input className="input-field" placeholder="Nombre (opcional)"
            value={newName} onChange={e => setNewName(e.target.value)} />
          <select className="input-field" value={newRole} onChange={e => setNewRole(e.target.value)}>
            <option value="cashier">Cajero</option>
            <option value="driver">Domiciliario</option>
          </select>
          <button onClick={addUser} className="btn-primary btn-sm">
            <Plus size={16} /> Agregar
          </button>
          {msg && <p className="font-body text-sm">{msg}</p>}
        </div>
      </div>

      {/* Cashiers list */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Receipt size={16} className="text-cherry" />
          <p className="section-title">Cajeros ({cashiers.length})</p>
        </div>
        {cashiers.length === 0 ? <p className="font-body text-sm text-coal/40">Solo los cajeros por defecto</p> : (
          <div className="flex flex-col gap-2">
            {cashiers.map(c => (
              <div key={c.id} className="card flex items-center justify-between gap-3">
                <div>
                  <p className="font-body font-semibold text-sm">{c.name || c.id}</p>
                  <p className="font-body text-xs text-coal/50">{c.id}</p>
                </div>
                {c.isDefault
                  ? <span className="font-body text-[10px] text-coal/30 uppercase tracking-wider">fijo</span>
                  : <button onClick={() => removeUser(c.id, 'cashier')} className="btn-icon text-pepper"><Trash2 size={16} /></button>
                }
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Drivers list */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Bike size={16} className="text-mint" />
          <p className="section-title">Domiciliarios ({drivers.length})</p>
        </div>
        {drivers.length === 0 ? <p className="font-body text-sm text-coal/40">Solo los domiciliarios por defecto</p> : (
          <div className="flex flex-col gap-2">
            {drivers.map(d => (
              <div key={d.id} className="card flex items-center justify-between gap-3">
                <div>
                  <p className="font-body font-semibold text-sm">{d.name || d.id}</p>
                  <p className="font-body text-xs text-coal/50">{d.id}</p>
                </div>
                {d.isDefault
                  ? <span className="font-body text-[10px] text-coal/30 uppercase tracking-wider">fijo</span>
                  : <button onClick={() => removeUser(d.id, 'driver')} className="btn-icon text-pepper"><Trash2 size={16} /></button>
                }
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Orders history ───────────────────────────────────────────────────────────
function OrdersTab({ sede }) {
  const [orders,    setOrders]    = useState([])
  const [filter,    setFilter]    = useState('all')
  const [confirmId, setConfirmId] = useState(null)

  useEffect(() => {
    if (!sede) return
    const q = query(collection(db, 'orders'), where('sedeId', '==', sede.id))
    return onSnapshot(q, snap => {
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      docs.sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0))
      setOrders(docs)
    })
  }, [sede])

  const handleDelete = async (id) => {
    await deleteDoc(doc(db, 'orders', id))
    setConfirmId(null)
  }

  const filtered = filter === 'all' ? orders : orders.filter(o => o.status === filter)

  return (
    <div className="flex flex-col gap-3 animate-fade-in">
      <div className="flex gap-2 overflow-x-auto pb-1">
        {[
          { v: 'all',           l: 'Todos' },
          { v: 'assigned',      l: 'Asignados' },
          { v: 'in_transit',    l: 'En camino' },
          { v: 'pending_cuadre',l: 'Cuadre' },
          { v: 'completed',     l: 'Completados' },
        ].map(f => (
          <button key={f.v} onClick={() => setFilter(f.v)}
            className={`px-4 py-2 rounded-full text-xs font-semibold font-body uppercase tracking-wider whitespace-nowrap transition-all ${
              filter === f.v ? 'bg-cherry text-cream' : 'bg-smoked text-coal/60 hover:bg-smoked/80'
            }`}>
            {f.l}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="font-body text-coal/40 text-sm py-8 text-center">Sin pedidos</p>
      ) : (
        filtered.map(o => (
          <div key={o.id} className="card flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                {o.orderNumber && <span className="font-display text-base text-cherry">#{o.orderNumber}</span>}
                <StatusBadge status={o.status} />
              </div>
              <p className="font-body font-semibold text-sm">{o.name}</p>
              <p className="font-body text-xs text-coal/50 truncate">{o.fullAddress}</p>
              <p className="font-body text-xs text-coal/40 mt-0.5">
                🛵 {o.driverName || '—'} · {o.cashierName || '—'}
              </p>
              <p className="font-body text-xs text-coal/40">
                {o.createdAt?.toDate ? format(o.createdAt.toDate(), 'dd/MM HH:mm') : '--'}
              </p>
            </div>

            <div className="flex flex-col items-end gap-2 flex-shrink-0">
              {confirmId === o.id ? (
                <div className="flex gap-2">
                  <button onClick={() => setConfirmId(null)}
                    className="px-3 py-1 rounded-lg text-xs font-semibold bg-smoked text-coal font-body">
                    Cancelar
                  </button>
                  <button onClick={() => handleDelete(o.id)}
                    className="px-3 py-1 rounded-lg text-xs font-semibold bg-pepper text-cream font-body">
                    Eliminar
                  </button>
                </div>
              ) : (
                <button onClick={() => setConfirmId(o.id)} className="btn-icon text-pepper/60 hover:text-pepper">
                  <Trash2 size={16} />
                </button>
              )}
            </div>
          </div>
        ))
      )}
    </div>
  )
}

// ─── Reports ──────────────────────────────────────────────────────────────────
function ReportsTab({ sede }) {
  const [orders, setOrders] = useState([])

  useEffect(() => {
    if (!sede) return
    const q = query(collection(db, 'orders'), where('sedeId', '==', sede.id))
    return onSnapshot(q, snap => setOrders(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
  }, [sede])

  // Group by driver
  const byDriver = orders.reduce((acc, o) => {
    const key = o.driverName || 'Sin asignar'
    if (!acc[key]) acc[key] = { total: 0, completed: 0, cash: 0, paid: 0 }
    acc[key].total++
    if (['completed','delivered_paid'].includes(o.status)) acc[key].completed++
    if (o.status === 'pending_cuadre') acc[key].cash++
    if (o.status === 'delivered_paid') acc[key].paid++
    return acc
  }, {})

  const totalCompleted    = orders.filter(o => ['completed','delivered_paid'].includes(o.status)).length
  const totalCashPending  = orders.filter(o => o.status === 'pending_cuadre').length

  return (
    <div className="flex flex-col gap-4 animate-fade-in">
      <div className="card bg-coal text-cream">
        <p className="font-display text-2xl tracking-wide">{orders.length}</p>
        <p className="font-body text-sm opacity-60">Pedidos totales · {sede?.name}</p>
        <div className="flex gap-4 mt-3 text-sm font-body">
          <span className="text-mint">✓ {totalCompleted} completados</span>
          <span className="text-mustard">⏳ {totalCashPending} pdte. cuadre</span>
        </div>
      </div>

      <p className="section-title">Por domiciliario</p>
      {Object.entries(byDriver).map(([name, stats]) => (
        <div key={name} className="card">
          <div className="flex items-center justify-between mb-2">
            <p className="font-display text-base tracking-wide">{name}</p>
            <span className="font-display text-xl text-cherry">{stats.total}</span>
          </div>
          <div className="flex gap-3 text-xs font-body text-coal/60">
            <span className="text-mint">✓ {stats.completed} completados</span>
            <span className="text-mustard">💰 {stats.cash} pdte. cuadre</span>
          </div>
          {/* Bar */}
          <div className="mt-2 w-full bg-smoked rounded-full h-1.5">
            <div className="bg-gradient-to-r from-cherry to-tangelo h-1.5 rounded-full"
              style={{ width: `${stats.total > 0 ? (stats.completed / stats.total) * 100 : 0}%` }} />
          </div>
        </div>
      ))}
    </div>
  )
}
