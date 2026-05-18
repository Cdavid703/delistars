import { useState, useEffect } from 'react'
import {
  collection, addDoc, onSnapshot, query, where,
  orderBy, serverTimestamp, doc, setDoc, getDoc, getDocs
} from 'firebase/firestore'
import { db } from '../../services/firebase'
import { useAuth } from '../../contexts/AuthContext'
import { DEFAULT_DRIVERS } from '../../services/roles'
import Logo from '../common/Logo'
import OrderCard from './OrderCard'
import OrderForm from './OrderForm'
import OrderDetail from './OrderDetail'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { Plus, LogOut, Users, MapPin, ChevronRight } from 'lucide-react'

const TABS = [
  { id: 'active',    label: 'Activos' },
  { id: 'cuadre',   label: 'Cuadre' },
  { id: 'completed', label: 'Entregados' },
]

const ACTIVE_STATUSES   = ['pending','assigned','accepted','in_transit','arrived','delivered_paid','delivered_cash']
const CUADRE_STATUSES   = ['pending_cuadre']
const COMPLETE_STATUSES = ['completed']

export default function CashierPanel() {
  const { user, sede, logout, selectSede } = useAuth()
  const [tab,         setTab]         = useState('active')
  const [orders,      setOrders]      = useState([])
  const [drivers,     setDrivers]     = useState([])
  const [showForm,    setShowForm]    = useState(false)
  const [selected,    setSelected]    = useState(null)
  const [addDriver,   setAddDriver]   = useState(false)
  const [newDriverEmail, setNewDriverEmail] = useState('')
  const [newDriverName,  setNewDriverName]  = useState('')
  const [driverMsg,   setDriverMsg]   = useState('')

  const today = format(new Date(), "EEEE dd 'de' MMMM yyyy", { locale: es })

  // Listen orders for this sede
  useEffect(() => {
    if (!sede) return
    const q = query(
      collection(db, 'orders'),
      where('sedeId', '==', sede.id),
      orderBy('createdAt', 'desc')
    )
    return onSnapshot(q, snap => {
      setOrders(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    })
  }, [sede])

  // Load drivers (hardcoded + Firestore)
  useEffect(() => {
    const loadDrivers = async () => {
      const snap = await getDocs(collection(db, 'roles_drivers'))
      const firestoreDrivers = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      const firestoreIds = firestoreDrivers.map(d => d.id)
      const defaultDriverObjs = DEFAULT_DRIVERS
        .filter(email => !firestoreIds.includes(email))
        .map(email => ({ id: email, name: email }))
      setDrivers([...defaultDriverObjs, ...firestoreDrivers])
    }
    loadDrivers()
  }, [])

  const filteredOrders = orders.filter(o => {
    if (tab === 'active')    return ACTIVE_STATUSES.includes(o.status)
    if (tab === 'cuadre')    return CUADRE_STATUSES.includes(o.status)
    if (tab === 'completed') return COMPLETE_STATUSES.includes(o.status)
    return false
  })

  const cuadreCount = orders.filter(o => CUADRE_STATUSES.includes(o.status)).length

  const handleCreateOrder = async (data) => {
    const driver = drivers.find(d => d.id === data.driverId)
    await addDoc(collection(db, 'orders'), {
      ...data,
      sedeId:      sede.id,
      sedeName:    sede.name,
      status:      'assigned',
      cashierId:   user.uid,
      cashierName: user.displayName,
      driverEmail: driver?.id || '',
      driverName:  driver?.name || driver?.id || '',
      createdAt:   serverTimestamp(),
      updatedAt:   serverTimestamp(),
    })
    setShowForm(false)
  }

  const handleAddDriver = async () => {
    if (!newDriverEmail.trim()) return
    const email = newDriverEmail.trim().toLowerCase()
    try {
      await setDoc(doc(db, 'roles_drivers', email), {
        email,
        name:     newDriverName.trim() || email,
        addedBy:  user.email,
        addedAt:  serverTimestamp(),
      })
      setDriverMsg(`✅ ${email} agregado como domiciliario`)
      setNewDriverEmail(''); setNewDriverName('')
      // Refresh drivers
      const snap = await getDocs(collection(db, 'roles_drivers'))
      const firestoreDrivers = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      const firestoreIds = firestoreDrivers.map(d => d.id)
      const defaultDriverObjs = DEFAULT_DRIVERS
        .filter(e => !firestoreIds.includes(e))
        .map(e => ({ id: e, name: e }))
      setDrivers([...defaultDriverObjs, ...firestoreDrivers])
    } catch (err) {
      setDriverMsg('❌ Error al agregar domiciliario')
    }
  }

  return (
    <div className="min-h-screen-safe flex flex-col bg-gradient-soft">
      {/* Header */}
      <header className="page-header">
        <div className="flex items-center gap-3">
          <Logo variant="light" size="sm" />
          <div>
            <p className="font-display text-base text-coal tracking-wide leading-tight">{sede?.name}</p>
            <p className="font-body text-xs text-coal/50 capitalize">{today}</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setAddDriver(v => !v)} className="btn-icon relative" title="Gestionar domiciliarios">
            <Users size={20} />
          </button>
          <button onClick={() => selectSede(null)} className="btn-icon" title="Cambiar sede">
            <MapPin size={20} />
          </button>
          <button onClick={logout} className="btn-icon" title="Cerrar sesión">
            <LogOut size={20} />
          </button>
        </div>
      </header>

      {/* Add driver panel */}
      {addDriver && (
        <div className="mx-4 mt-3 card border border-mint/30 animate-fade-in">
          <p className="font-display text-base tracking-wide text-coal mb-3">Agregar domiciliario</p>
          <div className="flex flex-col gap-2">
            <input className="input-field" placeholder="Correo de Google del domiciliario *"
              value={newDriverEmail} onChange={e => setNewDriverEmail(e.target.value)} />
            <input className="input-field" placeholder="Nombre (opcional)"
              value={newDriverName} onChange={e => setNewDriverName(e.target.value)} />
            <button onClick={handleAddDriver} className="btn-mint btn-sm">Agregar</button>
            {driverMsg && <p className="font-body text-sm">{driverMsg}</p>}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-coal/10 bg-cream/80 px-4 mt-2">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={tab === t.id ? 'tab-btn-active' : 'tab-btn-inactive'}>
            {t.label}
            {t.id === 'cuadre' && cuadreCount > 0 && (
              <span className="ml-1 bg-mustard text-coal text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                {cuadreCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Orders list */}
      <main className="flex-1 overflow-y-auto scroll-custom p-4 flex flex-col gap-3">
        {filteredOrders.length === 0 && !showForm && (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <p className="font-display text-4xl">🍔</p>
            <p className="font-body text-coal/40">
              {tab === 'active' ? 'No hay pedidos activos' : tab === 'cuadre' ? 'No hay cuadres pendientes' : 'No hay pedidos completados hoy'}
            </p>
          </div>
        )}

        {filteredOrders.map(order => (
          <OrderCard key={order.id} order={order} onClick={() => setSelected(order)} />
        ))}
      </main>

      {/* FAB: new order */}
      {!showForm && (
        <div className="fixed bottom-6 right-4 z-30">
          <button onClick={() => setShowForm(true)} className="btn-primary shadow-glow gap-2 pr-5">
            <Plus size={20} />
            Nuevo pedido
          </button>
        </div>
      )}

      {/* Order form modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-coal/50 backdrop-blur-sm">
          <div className="bg-cream w-full max-w-lg rounded-t-3xl sm:rounded-3xl max-h-[92dvh] overflow-y-auto scroll-custom animate-slide-in-right">
            <div className="sticky top-0 bg-cream/95 backdrop-blur-sm px-5 py-4 border-b border-coal/10 flex items-center justify-between">
              <p className="font-display text-xl text-coal tracking-wide">Nuevo domicilio</p>
              <button onClick={() => setShowForm(false)} className="btn-icon"><Plus size={20} className="rotate-45" /></button>
            </div>
            <div className="p-5">
              <OrderForm
                drivers={drivers}
                onSubmit={handleCreateOrder}
                onCancel={() => setShowForm(false)}
              />
            </div>
          </div>
        </div>
      )}

      {/* Order detail modal */}
      {selected && <OrderDetail order={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}
