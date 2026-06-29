import { useState, useEffect } from 'react'
import {
  collection, getDocs, doc, setDoc, deleteDoc,
  query, where, onSnapshot, serverTimestamp
} from 'firebase/firestore'
import { db } from '../../services/firebase'
import { useAuth } from '../../contexts/AuthContext'
import { DEFAULT_DRIVERS, DEFAULT_DRIVER_NAMES, DEFAULT_CASHIERS, DEFAULT_CASHIER_NAMES } from '../../services/roles'
import Logo from '../common/Logo'
import RoleSwitcher from '../common/RoleSwitcher'
import StatusBadge, { STATUS_MAP } from '../common/StatusBadge'
import { format, startOfDay } from 'date-fns'
import { es } from 'date-fns/locale'
import {
  Users, LayoutDashboard, ClipboardList, BarChart2,
  LogOut, MapPin, Plus, Trash2, Receipt, Bike,
  TrendingUp, Package, CheckCircle, Clock, Power,
  BookOpen, X, Search, ChevronDown, ChevronUp, HelpCircle, Star, Phone, Download
} from 'lucide-react'

const TABS = [
  { id: 'dashboard', label: 'Dashboard',  icon: LayoutDashboard },
  { id: 'users',     label: 'Usuarios',   icon: Users },
  { id: 'orders',    label: 'Pedidos',    icon: ClipboardList },
  { id: 'reports',   label: 'Reportes',   icon: BarChart2 },
  { id: 'clientes',  label: 'Clientes',   icon: Star },
  { id: 'manual',    label: 'Manual',     icon: BookOpen },
]

export default function AdminPanel() {
  const { user, sede, logout, selectSede } = useAuth()
  const [tab,            setTab]            = useState('dashboard')
  const [platformActive, setPlatformActive] = useState(null)
  const today = format(new Date(), "EEEE dd 'de' MMMM yyyy", { locale: es })

  useEffect(() => {
    return onSnapshot(doc(db, 'config', 'client_platform'), snap => {
      setPlatformActive(snap.exists() ? snap.data().active : false)
    })
  }, [])

  const togglePlatform = async () => {
    await setDoc(doc(db, 'config', 'client_platform'), {
      active:    !platformActive,
      updatedBy: user.email,
      updatedAt: serverTimestamp(),
    })
  }

  return (
    <div className="min-h-screen-safe flex flex-col bg-gradient-soft">
      {/* Header */}
      <header className="page-header">
        <div className="flex items-center gap-3">
          <Logo variant="light" size="sm" />
          <div>
            <p className="font-display text-base text-coal tracking-wide leading-tight">
              {user?.displayName?.split(' ')[0] || 'Admin'}
            </p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="font-body text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-cherry/15 text-cherry">Admin</span>
              <p className="font-body text-xs text-coal/50 capitalize">{today}</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={togglePlatform}
            title={platformActive ? 'Plataforma cliente: ACTIVA — click para apagar' : 'Plataforma cliente: APAGADA — click para activar'}
            className={`btn-icon relative ${platformActive ? 'text-mint' : 'text-coal/40'}`}
          >
            <Power size={20} />
            <span className={`absolute top-1 right-1 w-2 h-2 rounded-full ${platformActive ? 'bg-mint animate-pulse' : 'bg-coal/30'}`} />
          </button>
          <RoleSwitcher />
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
        {tab === 'clientes'  && <ClientsTab />}
        {tab === 'manual'    && <AdminManualTab />}
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

  const todayStr  = new Date().toDateString()
  const isToday   = ts => ts?.toDate ? ts.toDate().toDateString() === todayStr : false

  // Activos: sin filtro de fecha (un pedido de ayer aún en tránsito importa)
  const active    = orders.filter(o => ['assigned','accepted','in_transit','arrived'].includes(o.status)).length
  // Entregados y total: solo hoy (el dashboard dice "Resumen de hoy")
  const delivered = orders.filter(o => ['delivered_paid','completed'].includes(o.status) && isToday(o.createdAt)).length
  const cuadre    = orders.filter(o => o.status === 'pending_cuadre').length
  const total     = orders.filter(o => isToday(o.createdAt)).length

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
const isAdminDay = (ts, targetDate) => {
  if (!ts?.toDate) return false
  const target = targetDate ? new Date(targetDate + 'T00:00:00') : new Date()
  return ts.toDate().toDateString() === target.toDateString()
}

function AdminEntregadosSummary({ orders }) {
  const fmt2 = v => v ? `$${Number(v).toLocaleString('es-CO')}` : '—'
  const cashOrders    = orders.filter(o => o.cashOnDelivery || o.payment === 'Efectivo' || o.payment === 'Mixto')
  const digitalOrders = orders.filter(o => !o.cashOnDelivery && o.payment !== 'Efectivo' && o.payment !== 'Mixto')
  const totalRevenue  = orders.reduce((s, o) => s + (o.totalPrice || 0), 0)
  const totalFees     = orders.reduce((s, o) => s + (o.deliveryPrice || 0), 0)
  const netRevenue    = totalRevenue - totalFees
  return (
    <div className="bg-gradient-to-r from-cherry/10 to-tangelo/10 border border-cherry/20 rounded-2xl p-4 flex flex-col gap-3">
      <p className="font-display text-base tracking-wide text-coal">Resumen del día filtrado</p>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="bg-cream/80 rounded-xl p-2">
          <p className="font-display text-2xl text-cherry">{orders.length}</p>
          <p className="font-body text-[10px] text-coal/50 uppercase tracking-wider">Pedidos</p>
        </div>
        <div className="bg-cream/80 rounded-xl p-2">
          <p className="font-display text-2xl text-mustard">{cashOrders.length}</p>
          <p className="font-body text-[10px] text-coal/50 uppercase tracking-wider">Efectivo</p>
        </div>
        <div className="bg-cream/80 rounded-xl p-2">
          <p className="font-display text-2xl text-mint">{digitalOrders.length}</p>
          <p className="font-body text-[10px] text-coal/50 uppercase tracking-wider">Digital</p>
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <div className="flex justify-between items-center bg-cream/60 rounded-lg px-3 py-2">
          <span className="font-body text-xs text-coal/60">Total recaudado:</span>
          <span className="font-display text-base text-coal">{fmt2(totalRevenue)}</span>
        </div>
        <div className="flex justify-between items-center bg-cream/60 rounded-lg px-3 py-2">
          <span className="font-body text-xs text-coal/60">Total domicilios:</span>
          <span className="font-display text-base text-mint">{fmt2(totalFees)}</span>
        </div>
        <div className="flex justify-between items-center bg-tangelo/10 border border-tangelo/20 rounded-lg px-3 py-2">
          <span className="font-body text-xs font-semibold text-coal/70">Neto (sin domicilios):</span>
          <span className="font-display text-base text-tangelo">{fmt2(netRevenue)}</span>
        </div>
      </div>
    </div>
  )
}

function OrdersTab({ sede }) {
  const [orders,      setOrders]      = useState([])
  const [filter,      setFilter]      = useState('all')
  const [confirmId,   setConfirmId]   = useState(null)
  const [historyDate, setHistoryDate] = useState('')
  const [deleteError, setDeleteError] = useState('')

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
    setConfirmId(null)
    setDeleteError('')
    try {
      await deleteDoc(doc(db, 'orders', id))
    } catch (err) {
      setDeleteError('No se pudo eliminar. Verifica los permisos en Firebase.')
      console.error('Error al eliminar pedido:', err.code, err.message)
    }
  }

  const COMPLETED_STATUSES = ['completed', 'delivered_paid', 'delivered_cash', 'pending_cuadre']

  const filtered = orders.filter(o => {
    // Filtros por estado específico (asignados, en camino, cuadre) → sin límite de fecha,
    // para que pedidos viejos atascados sigan visibles y el admin pueda eliminarlos
    if (filter !== 'all' && filter !== 'entregados' && o.status !== filter) return false
    // Entregados: solo los estados completados, con selector de fecha
    if (filter === 'entregados' && !COMPLETED_STATUSES.includes(o.status)) return false
    if (filter === 'entregados') return isAdminDay(o.createdAt, historyDate)
    // Todos: filtra por fecha (hoy por defecto), con selector para días anteriores
    if (filter === 'all') return isAdminDay(o.createdAt, historyDate)
    return true
  })

  return (
    <div className="flex flex-col gap-3 animate-fade-in">
      <div className="flex gap-2 overflow-x-auto pb-1">
        {[
          { v: 'all',           l: 'Todos' },
          { v: 'assigned',      l: 'Asignados' },
          { v: 'in_transit',    l: 'En camino' },
          { v: 'pending_cuadre',l: 'Cuadre' },
          { v: 'entregados',    l: 'Entregados' },
        ].map(f => (
          <button key={f.v} onClick={() => { setFilter(f.v); setHistoryDate('') }}
            className={`px-4 py-2 rounded-full text-xs font-semibold font-body uppercase tracking-wider whitespace-nowrap transition-all ${
              filter === f.v ? 'bg-cherry text-cream' : 'bg-smoked text-coal/60 hover:bg-smoked/80'
            }`}>
            {f.l}
          </button>
        ))}
      </div>

      {/* Date picker para "Todos" y "Entregados" */}
      {(filter === 'all' || filter === 'entregados') && (
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 flex-1">
            <Search size={16} className="text-coal/40 flex-shrink-0" />
            <input type="date" className="input-field py-2 text-sm"
              value={historyDate} onChange={e => setHistoryDate(e.target.value)}
              max={format(new Date(), 'yyyy-MM-dd')} />
          </div>
          {historyDate && (
            <button onClick={() => setHistoryDate('')} className="text-xs font-body text-cherry underline whitespace-nowrap">
              Ver hoy
            </button>
          )}
        </div>
      )}

      {/* Summary when viewing all (by date) or entregados */}
      {(filter === 'entregados' || filter === 'all') && filtered.length > 0 && (
        <AdminEntregadosSummary orders={filtered} />
      )}

      {deleteError && (
        <div className="bg-pepper/10 border border-pepper/30 rounded-xl px-4 py-2.5 flex items-center justify-between">
          <p className="font-body text-xs text-pepper">{deleteError}</p>
          <button onClick={() => setDeleteError('')} className="text-pepper/60 hover:text-pepper ml-3">
            <X size={14} />
          </button>
        </div>
      )}

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
const COMPLETED_STATUSES_R = ['completed', 'delivered_paid', 'pending_cuadre', 'delivered_cash']

function ReportsTab({ sede }) {
  const [orders,      setOrders]      = useState([])
  const [range,       setRange]       = useState('today')
  const [customStart, setCustomStart] = useState('')
  const [customEnd,   setCustomEnd]   = useState('')
  // Filtros adicionales del reporte
  const [fStatus,  setFStatus]  = useState('all')
  const [fDriver,  setFDriver]  = useState('all')
  const [fCashier, setFCashier] = useState('all')
  const [fPayment, setFPayment] = useState('all')
  const [fSearch,  setFSearch]  = useState('')

  useEffect(() => {
    if (!sede) return
    const q = query(collection(db, 'orders'), where('sedeId', '==', sede.id))
    return onSnapshot(q, snap => setOrders(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
  }, [sede])

  const getRangeStart = () => {
    const now = new Date()
    if (range === 'today') return startOfDay(now)
    if (range === 'week') {
      const d = new Date(now)
      const day = d.getDay()
      d.setDate(d.getDate() - (day === 0 ? 6 : day - 1))
      return startOfDay(d)
    }
    if (range === 'month') return new Date(now.getFullYear(), now.getMonth(), 1)
    if (range === 'custom' && customStart) return new Date(customStart + 'T00:00:00')
    return null
  }

  // 1) Filtro por rango de fecha → base para las opciones de los desplegables
  const dateFiltered = orders.filter(o => {
    if (!o.createdAt?.toDate) return false
    const d = o.createdAt.toDate()
    const start = getRangeStart()
    const end = range === 'custom' && customEnd ? new Date(customEnd + 'T23:59:59') : new Date()
    if (start && d < start) return false
    if (d > end) return false
    return true
  })

  // Opciones de los desplegables (derivadas de lo que hay en el rango de fecha)
  const uniq = (arr) => [...new Set(arr.filter(Boolean))].sort((a, b) => a.localeCompare(b))
  const statusOptions  = uniq(dateFiltered.map(o => o.status))
  const driverOptions  = uniq(dateFiltered.map(o => o.driverName))
  const cashierOptions = uniq(dateFiltered.map(o => o.cashierName))
  const paymentOptions = uniq(dateFiltered.map(o => o.payment))

  // 2) Filtros adicionales → conjunto final que alimenta tarjetas y exportación
  const filtered = dateFiltered.filter(o => {
    if (fStatus  !== 'all' && o.status      !== fStatus)  return false
    if (fDriver  !== 'all' && (o.driverName  || '') !== fDriver)  return false
    if (fCashier !== 'all' && (o.cashierName || '') !== fCashier) return false
    if (fPayment !== 'all' && (o.payment     || '') !== fPayment) return false
    if (fSearch.trim()) {
      const q = fSearch.toLowerCase().trim()
      const hay = [o.orderNumber, o.name, o.clientName, o.fullAddress, o.driverName, o.cashierName]
        .map(v => String(v || '').toLowerCase())
      if (!hay.some(v => v.includes(q))) return false
    }
    return true
  })

  const activeFilterCount =
    (fStatus !== 'all' ? 1 : 0) + (fDriver !== 'all' ? 1 : 0) +
    (fCashier !== 'all' ? 1 : 0) + (fPayment !== 'all' ? 1 : 0) +
    (fSearch.trim() ? 1 : 0)
  const clearFilters = () => {
    setFStatus('all'); setFDriver('all'); setFCashier('all'); setFPayment('all'); setFSearch('')
  }

  const completed     = filtered.filter(o => COMPLETED_STATUSES_R.includes(o.status))
  const cashOrders    = completed.filter(o => o.cashOnDelivery || o.payment === 'Efectivo' || o.payment === 'Mixto')
  const digitalOrders = completed.filter(o => !o.cashOnDelivery && o.payment !== 'Efectivo' && o.payment !== 'Mixto')
  const totalRevenue  = completed.reduce((s, o) => s + (o.totalPrice    || 0), 0)
  const totalFees     = completed.reduce((s, o) => s + (o.deliveryPrice || 0), 0)

  const byPayment = completed.reduce((acc, o) => {
    const key = o.payment || 'Sin especificar'
    if (!acc[key]) acc[key] = { count: 0, total: 0 }
    acc[key].count++
    acc[key].total += (o.totalPrice || 0)
    return acc
  }, {})

  const byDriver = completed.reduce((acc, o) => {
    const key = o.driverName || 'Sin asignar'
    if (!acc[key]) acc[key] = { count: 0, fees: 0, total: 0 }
    acc[key].count++
    acc[key].fees  += (o.deliveryPrice || 0)
    acc[key].total += (o.totalPrice    || 0)
    return acc
  }, {})

  const fmt2 = v => `$${Number(v || 0).toLocaleString('es-CO')}`

  // Resume el array de items como "2x Hamburguesa, 1x Perro" (defensivo ante formatos)
  const fmtItems = (items) => {
    if (!Array.isArray(items)) return ''
    return items.map(it => {
      if (it == null) return ''
      if (typeof it === 'string') return it
      const qty  = it.qty ?? it.quantity ?? it.cantidad ?? it.count ?? 1
      const name = it.name ?? it.nombre ?? it.nombre_producto ?? it.title ?? it.producto ?? ''
      return name ? `${qty}x ${name}` : ''
    }).filter(Boolean).join(', ')
  }

  const statusLabel = (s) => STATUS_MAP[s]?.label || s || ''
  const deliveryLabel = (m) => ({ pickup: 'Recoge en sede', delivery: 'Domicilio' }[m] || m || 'Domicilio')

  const exportExcel = async () => {
    // Carga diferida: exceljs (~900 KB) solo se descarga al exportar, no en el
    // bundle principal que ven todos los clientes de /domicilios/.
    const ExcelJS = (await import('exceljs')).default
    const wb = new ExcelJS.Workbook()
    wb.creator = 'DeliStars'
    wb.created = new Date()

    // ── Hoja 1: Pedidos ────────────────────────────────────────────────
    const ws = wb.addWorksheet('Pedidos', {
      views: [{ state: 'frozen', ySplit: 1 }],   // congela el encabezado
    })
    ws.columns = [
      { header: 'Número',       key: 'num',      width: 10 },
      { header: 'Fecha',        key: 'fecha',    width: 12 },
      { header: 'Hora',         key: 'hora',     width: 8  },
      { header: 'Cliente',      key: 'cliente',  width: 22 },
      { header: 'Dirección',    key: 'dir',      width: 38 },
      { header: 'Entrega',      key: 'entrega',  width: 16 },
      { header: 'Método pago',  key: 'pago',     width: 14 },
      { header: 'Domicilio',    key: 'domi',     width: 12, style: { numFmt: '"$"#,##0' } },
      { header: 'Total',        key: 'total',    width: 14, style: { numFmt: '"$"#,##0' } },
      { header: 'Estado',       key: 'estado',   width: 18 },
      { header: 'Domiciliario', key: 'driver',   width: 20 },
      { header: 'Cajero',       key: 'cajero',   width: 20 },
      { header: 'Productos',    key: 'items',    width: 50 },
    ]

    filtered.forEach(o => {
      const d = o.createdAt?.toDate ? o.createdAt.toDate() : null
      ws.addRow({
        num:     o.orderNumber || '',
        fecha:   d ? format(d, 'dd/MM/yyyy') : '',
        hora:    d ? format(d, 'HH:mm') : '',
        cliente: o.name || o.clientName || '',
        dir:     o.fullAddress || '',
        entrega: deliveryLabel(o.deliveryMode),
        pago:    o.payment || '',
        domi:    o.deliveryPrice || 0,
        total:   o.totalPrice || 0,
        estado:  statusLabel(o.status),
        driver:  o.driverName || '',
        cajero:  o.cashierName || '',
        items:   fmtItems(o.items),
      })
    })

    // Encabezado en negrita con fondo oscuro y texto claro
    const header = ws.getRow(1)
    header.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A1A1A' } }
    header.alignment = { vertical: 'middle' }
    header.height = 20

    // Autofiltro en TODAS las columnas (desplegables de filtro de Excel)
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: ws.columns.length } }

    // Fila de totales al final
    const totalDomi  = filtered.reduce((s, o) => s + (o.deliveryPrice || 0), 0)
    const totalVenta = filtered.reduce((s, o) => s + (o.totalPrice || 0), 0)
    const totalRow = ws.addRow({ cliente: `TOTAL (${filtered.length} pedidos)`, domi: totalDomi, total: totalVenta })
    totalRow.font = { bold: true }
    totalRow.getCell('domi').numFmt = '"$"#,##0'
    totalRow.getCell('total').numFmt = '"$"#,##0'

    // ── Hoja 2: Resumen ────────────────────────────────────────────────
    const rs = wb.addWorksheet('Resumen')
    rs.addRow(['Resumen del reporte']).font = { bold: true, size: 14 }
    rs.addRow([])
    rs.addRow(['Sede', sede?.name || ''])
    rs.addRow(['Rango', range])
    rs.addRow(['Filtros activos', activeFilterCount])
    rs.addRow(['Pedidos (filtrados)', filtered.length])
    rs.addRow(['Total domicilios', totalDomi]).getCell(2).numFmt = '"$"#,##0'
    rs.addRow(['Total ventas', totalVenta]).getCell(2).numFmt = '"$"#,##0'
    rs.addRow([])

    const byDriverRows = Object.entries(
      filtered.reduce((acc, o) => {
        const k = o.driverName || 'Sin asignar'
        acc[k] = acc[k] || { count: 0, fees: 0, total: 0 }
        acc[k].count++; acc[k].fees += (o.deliveryPrice || 0); acc[k].total += (o.totalPrice || 0)
        return acc
      }, {})
    )
    const dh = rs.addRow(['Por domiciliario', 'Pedidos', 'Domicilios', 'Total'])
    dh.font = { bold: true }
    byDriverRows.forEach(([name, v]) => {
      const r = rs.addRow([name, v.count, v.fees, v.total])
      r.getCell(3).numFmt = '"$"#,##0'; r.getCell(4).numFmt = '"$"#,##0'
    })
    rs.addRow([])

    const byPayRows = Object.entries(
      filtered.reduce((acc, o) => {
        const k = o.payment || 'Sin especificar'
        acc[k] = acc[k] || { count: 0, total: 0 }
        acc[k].count++; acc[k].total += (o.totalPrice || 0)
        return acc
      }, {})
    )
    const ph = rs.addRow(['Por método de pago', 'Pedidos', 'Total'])
    ph.font = { bold: true }
    byPayRows.forEach(([name, v]) => {
      const r = rs.addRow([name, v.count, v.total])
      r.getCell(3).numFmt = '"$"#,##0'
    })
    rs.getColumn(1).width = 26
    rs.getColumn(2).width = 12
    rs.getColumn(3).width = 14
    rs.getColumn(4).width = 14

    // Descargar
    const buf = await wb.xlsx.writeBuffer()
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `delistars-reporte-${sede?.name ? sede.name.replace(/\s+/g, '-') + '-' : ''}${format(new Date(), 'yyyy-MM-dd')}.xlsx`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex flex-col gap-4 animate-fade-in">
      {/* Range selector */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {[
          { v: 'today',  l: 'Hoy' },
          { v: 'week',   l: 'Esta semana' },
          { v: 'month',  l: 'Este mes' },
          { v: 'custom', l: 'Personalizado' },
        ].map(r => (
          <button key={r.v} onClick={() => setRange(r.v)}
            className={`px-4 py-2 rounded-full text-xs font-semibold font-body uppercase tracking-wider whitespace-nowrap transition-all ${
              range === r.v ? 'bg-cherry text-cream' : 'bg-smoked text-coal/60 hover:bg-smoked/80'
            }`}>
            {r.l}
          </button>
        ))}
      </div>

      {range === 'custom' && (
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="label-field">Desde</label>
            <input type="date" className="input-field py-2 text-sm"
              value={customStart} onChange={e => setCustomStart(e.target.value)}
              max={format(new Date(), 'yyyy-MM-dd')} />
          </div>
          <div className="flex-1">
            <label className="label-field">Hasta</label>
            <input type="date" className="input-field py-2 text-sm"
              value={customEnd} onChange={e => setCustomEnd(e.target.value)}
              max={format(new Date(), 'yyyy-MM-dd')} />
          </div>
        </div>
      )}

      {/* Filtros del reporte */}
      <div className="card">
        <div className="flex items-center justify-between mb-2">
          <p className="section-title flex items-center gap-1.5">
            <Search size={14} /> Filtros
            {activeFilterCount > 0 && (
              <span className="bg-cherry text-cream text-[10px] font-bold rounded-full px-1.5 py-0.5">{activeFilterCount}</span>
            )}
          </p>
          {activeFilterCount > 0 && (
            <button onClick={clearFilters}
              className="text-xs font-body text-cherry hover:underline flex items-center gap-1">
              <X size={12} /> Limpiar
            </button>
          )}
        </div>

        <input type="text" className="input-field py-2 text-sm mb-2"
          placeholder="Buscar por número, cliente, dirección, domiciliario o cajero…"
          value={fSearch} onChange={e => setFSearch(e.target.value)} />

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="label-field">Estado</label>
            <select className="input-field py-2 text-sm" value={fStatus} onChange={e => setFStatus(e.target.value)}>
              <option value="all">Todos</option>
              {statusOptions.map(s => <option key={s} value={s}>{STATUS_MAP[s]?.label || s}</option>)}
            </select>
          </div>
          <div>
            <label className="label-field">Método de pago</label>
            <select className="input-field py-2 text-sm" value={fPayment} onChange={e => setFPayment(e.target.value)}>
              <option value="all">Todos</option>
              {paymentOptions.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label className="label-field">Domiciliario</label>
            <select className="input-field py-2 text-sm" value={fDriver} onChange={e => setFDriver(e.target.value)}>
              <option value="all">Todos</option>
              {driverOptions.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div>
            <label className="label-field">Cajero</label>
            <select className="input-field py-2 text-sm" value={fCashier} onChange={e => setFCashier(e.target.value)}>
              <option value="all">Todos</option>
              {cashierOptions.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Revenue summary card */}
      <div className="card bg-coal text-cream">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="font-display text-3xl tracking-wide">{fmt2(totalRevenue)}</p>
            <p className="font-body text-sm opacity-60">Total recaudado · {sede?.name}</p>
          </div>
          <button onClick={exportExcel}
            className="flex items-center gap-1.5 bg-cream/10 hover:bg-cream/20 px-3 py-2 rounded-xl text-xs font-semibold font-body transition-colors">
            <Download size={14} /> Excel
          </button>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="bg-cream/10 rounded-xl p-2">
            <p className="font-display text-xl">{completed.length}</p>
            <p className="font-body text-[10px] opacity-60 uppercase tracking-wider">Pedidos</p>
          </div>
          <div className="bg-cream/10 rounded-xl p-2">
            <p className="font-display text-xl text-mustard">{fmt2(totalFees)}</p>
            <p className="font-body text-[10px] opacity-60 uppercase tracking-wider">Domicilios</p>
          </div>
          <div className="bg-cream/10 rounded-xl p-2">
            <p className="font-display text-xl text-mint">
              {completed.length > 0 ? fmt2(Math.round(totalRevenue / completed.length)) : '$0'}
            </p>
            <p className="font-body text-[10px] opacity-60 uppercase tracking-wider">Promedio</p>
          </div>
        </div>
      </div>

      {/* By payment method */}
      <div>
        <p className="section-title mb-2">Por método de pago</p>
        {Object.keys(byPayment).length === 0 ? (
          <p className="font-body text-sm text-coal/40">Sin datos en este período</p>
        ) : (
          <div className="flex flex-col gap-2">
            {Object.entries(byPayment)
              .sort(([, a], [, b]) => b.total - a.total)
              .map(([method, { count, total }]) => (
                <div key={method} className="card flex items-center justify-between gap-3">
                  <div>
                    <p className="font-body font-semibold text-sm">{method}</p>
                    <p className="font-body text-xs text-coal/50">{count} pedido{count !== 1 ? 's' : ''}</p>
                  </div>
                  <p className="font-display text-base text-cherry">{fmt2(total)}</p>
                </div>
              ))}
            <div className="flex gap-2 text-center">
              <div className="flex-1 bg-mustard/10 border border-mustard/20 rounded-xl p-2">
                <p className="font-display text-base text-mustard">{cashOrders.length}</p>
                <p className="font-body text-[10px] text-coal/50 uppercase tracking-wider">Efectivo</p>
              </div>
              <div className="flex-1 bg-mint/10 border border-mint/20 rounded-xl p-2">
                <p className="font-display text-base text-mint">{digitalOrders.length}</p>
                <p className="font-body text-[10px] text-coal/50 uppercase tracking-wider">Digital</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* By driver */}
      <div>
        <p className="section-title mb-2">Por domiciliario</p>
        {Object.keys(byDriver).length === 0 ? (
          <p className="font-body text-sm text-coal/40">Sin datos en este período</p>
        ) : (
          <div className="flex flex-col gap-2">
            {Object.entries(byDriver)
              .sort(([, a], [, b]) => b.count - a.count)
              .map(([name, stats]) => (
                <div key={name} className="card">
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="font-display text-base tracking-wide">{name}</p>
                    <span className="font-display text-xl text-cherry">{stats.count}</span>
                  </div>
                  <div className="flex gap-3 text-xs font-body text-coal/60">
                    <span className="text-mint">🛵 {fmt2(stats.fees)} domicilios</span>
                    <span className="text-coal/40">· {fmt2(stats.total)} total</span>
                  </div>
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Admin manual ─────────────────────────────────────────────────────────────
const ADMIN_MANUAL_SECTIONS = [
  {
    id: 'overview', emoji: '🏢', title: 'Visión general', color: 'text-cherry',
    content: [
      { type: 'p', text: 'El administrador tiene acceso completo a la plataforma DeliStars: gestión de usuarios, visualización de todos los pedidos, reportes por domiciliario, y control de la plataforma.' },
      { type: 'table', rows: [
        ['Dashboard',  'Resumen de pedidos activos en tiempo real'],
        ['Usuarios',   'Agregar o eliminar cajeros y domiciliarios'],
        ['Pedidos',    'Historial completo de pedidos con filtros'],
        ['Reportes',   'Estadísticas agrupadas por domiciliario'],
        ['Manual',     'Esta guía de uso'],
      ]},
    ],
  },
  {
    id: 'plataforma', emoji: '⚡', title: 'Control de plataforma', color: 'text-mint',
    content: [
      { type: 'p', text: 'El botón de encendido en el encabezado activa o desactiva la plataforma para los clientes.' },
      { type: 'table', rows: [
        ['Verde parpadeando', 'ACTIVA — clientes pueden hacer pedidos'],
        ['Gris apagado',      'APAGADA — clientes ven pantalla cerrada'],
      ]},
      { type: 'tip', text: 'El cajero también puede controlar este interruptor desde su panel.' },
    ],
  },
  {
    id: 'usuarios', emoji: '👥', title: 'Gestión de usuarios', color: 'text-coal',
    content: [
      { type: 'p', text: 'En la pestaña "Usuarios" puedes agregar cajeros y domiciliarios usando su correo de Google. Los usuarios fijos del sistema no se pueden eliminar.' },
      { type: 'steps', items: [
        'Escribe el correo de Google del usuario.',
        'Escribe el nombre (opcional — si no, se usa el correo).',
        'Selecciona el rol: Cajero o Domiciliario.',
        'Toca "Agregar". El usuario podrá ingresar en su próximo login.',
      ]},
    ],
  },
  {
    id: 'flujo', emoji: '📋', title: 'Flujo completo de un pedido', color: 'text-cherry',
    content: [
      { type: 'steps', items: [
        'Cliente hace el pedido → estado PENDIENTE.',
        'Cajero cotiza el precio → estado COTIZADO (cliente ve los precios).',
        'Cajero asigna domiciliario → estado ASIGNADO.',
        'Domiciliario acepta → ACEPTADO.',
        'Domiciliario sale → EN CAMINO.',
        'Domiciliario llega → LLEGÓ.',
        'Domiciliario entrega → si efectivo: PDTE. CUADRE; si digital: COMPLETADO.',
        'Cajero confirma el efectivo recibido del domiciliario → COMPLETADO.',
      ]},
    ],
  },
  {
    id: 'pedidos', emoji: '📦', title: 'Filtros de pedidos', color: 'text-coal',
    content: [
      { type: 'p', text: 'En la pestaña "Pedidos" usa los filtros para ver pedidos por estado. El filtro "Entregados" incluye un selector de fecha y muestra el resumen del día.' },
      { type: 'tip', text: 'Los pedidos se pueden eliminar desde la pestaña de Pedidos (ícono de basurero). Úsalo con cuidado.' },
    ],
  },
  {
    id: 'reportes', emoji: '📊', title: 'Reportes', color: 'text-tangelo',
    content: [
      { type: 'p', text: 'La pestaña "Reportes" muestra el total de pedidos de la sede, cuántos fueron completados, cuántos están pendientes de cuadre, y el desglose por cada domiciliario.' },
    ],
  },
]

function AdminManualSection({ section }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="card overflow-hidden p-0">
      <button onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between gap-3 px-4 py-4 text-left hover:bg-smoked/50 transition-colors">
        <div className="flex items-center gap-3">
          <span className="text-2xl">{section.emoji}</span>
          <span className={`font-display text-base tracking-wide ${section.color}`}>{section.title}</span>
        </div>
        {open ? <ChevronUp size={18} className="text-coal/40 flex-shrink-0" /> : <ChevronDown size={18} className="text-coal/40 flex-shrink-0" />}
      </button>
      {open && (
        <div className="px-4 pb-4 flex flex-col gap-3 border-t border-coal/10 pt-3 animate-fade-in">
          {section.content.map((block, i) => {
            if (block.type === 'p') return <p key={i} className="font-body text-sm text-coal/80 leading-relaxed">{block.text}</p>
            if (block.type === 'tip') return (
              <div key={i} className="flex items-start gap-2 bg-mustard/10 border border-mustard/20 rounded-xl px-3 py-2">
                <span className="text-mustard text-sm flex-shrink-0">💡</span>
                <p className="font-body text-xs text-coal/70">{block.text}</p>
              </div>
            )
            if (block.type === 'steps') return (
              <div key={i} className="flex flex-col gap-2">
                {block.items.map((step, j) => (
                  <div key={j} className="flex items-start gap-3">
                    <span className="w-6 h-6 rounded-full bg-cherry text-cream text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">{j+1}</span>
                    <p className="font-body text-sm text-coal/80 leading-relaxed">{step}</p>
                  </div>
                ))}
              </div>
            )
            if (block.type === 'table') return (
              <div key={i} className="flex flex-col divide-y divide-coal/10 rounded-xl overflow-hidden border border-coal/10">
                {block.rows.map(([col1, col2], j) => (
                  <div key={j} className={`flex gap-3 px-3 py-2 ${j % 2 === 0 ? 'bg-smoked/40' : 'bg-cream'}`}>
                    <span className="font-body text-xs font-semibold text-coal w-32 flex-shrink-0">{col1}</span>
                    <span className="font-body text-xs text-coal/60">{col2}</span>
                  </div>
                ))}
              </div>
            )
            return null
          })}
        </div>
      )}
    </div>
  )
}

// ─── Clientes frecuentes ──────────────────────────────────────────────────────
function ClientsTab() {
  const [customers, setCustomers] = useState([])
  const [search,    setSearch]    = useState('')

  useEffect(() => {
    return onSnapshot(collection(db, 'customers'), snap => {
      const docs = snap.docs.map(d => d.data())
      docs.sort((a, b) => (b.lastOrderAt?.seconds || 0) - (a.lastOrderAt?.seconds || 0))
      setCustomers(docs)
    })
  }, [])

  const filtered = customers.filter(c => {
    if (!search) return true
    const q = search.toLowerCase()
    return c.name?.toLowerCase().includes(q) || c.phone?.includes(q)
  })

  return (
    <div className="flex flex-col gap-3 animate-fade-in">
      <div className="flex items-center gap-2">
        <Search size={16} className="text-coal/40 flex-shrink-0" />
        <input
          className="input-field"
          placeholder="Buscar por nombre o teléfono…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      <p className="font-body text-xs text-coal/40">
        {filtered.length} cliente{filtered.length !== 1 ? 's' : ''} registrados
      </p>

      {filtered.length === 0 ? (
        <p className="font-body text-sm text-coal/40 py-8 text-center">
          {search ? 'Sin resultados' : 'No hay clientes registrados aún'}
        </p>
      ) : (
        filtered.map(c => (
          <div key={c.uid} className="card flex items-start gap-3">
            <div className="w-10 h-10 bg-cherry/10 rounded-full flex items-center justify-center flex-shrink-0 font-display text-base text-cherry">
              {(c.name || 'C').charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-body font-semibold text-sm">{c.name || 'Sin nombre'}</p>
              {c.phone ? (
                <a href={`tel:${c.phone}`} className="flex items-center gap-1 font-body text-xs text-cherry mt-0.5">
                  <Phone size={11} /> {c.phone}
                </a>
              ) : (
                <p className="font-body text-xs text-coal/40">Sin teléfono</p>
              )}
              {c.addresses?.length > 0 && (
                <p className="font-body text-xs text-coal/40 mt-0.5 truncate">
                  📍 {[...c.addresses].reverse()[0]}
                </p>
              )}
              {c.orderCount > 0 && (
                <p className="font-body text-xs text-tangelo mt-0.5">
                  {c.orderCount} pedido{c.orderCount !== 1 ? 's' : ''}
                </p>
              )}
            </div>
          </div>
        ))
      )}
    </div>
  )
}

function AdminManualTab() {
  return (
    <div className="flex flex-col gap-3 pb-8 animate-fade-in">
      <div className="flex items-center gap-3 mb-1">
        <div className="w-10 h-10 rounded-full bg-cherry/10 flex items-center justify-center flex-shrink-0">
          <HelpCircle size={20} className="text-cherry" />
        </div>
        <div>
          <p className="font-display text-xl text-coal tracking-wide">Manual del administrador</p>
          <p className="font-body text-xs text-coal/50">Toca cada sección para ver los detalles</p>
        </div>
      </div>
      {ADMIN_MANUAL_SECTIONS.map(s => <AdminManualSection key={s.id} section={s} />)}
      <div className="mt-2 text-center">
        <p className="font-body text-xs text-coal/30">DeliStars · Plataforma de Domicilios · v2.0</p>
      </div>
    </div>
  )
}
