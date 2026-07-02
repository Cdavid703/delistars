import { useEffect, useState } from 'react'
import { collection, deleteDoc, doc, getDocs, serverTimestamp, updateDoc } from 'firebase/firestore'
import { db } from '@/services/firebase'
import { DEFAULT_DRIVERS } from '@/lib/team'
import { type Order, ALL_STATUSES, PAYMENT_OPTIONS, fmtCOP, fmtDateTime, statusInfo, statusLabel } from '@/lib/orders'
import { toast } from 'sonner'
import { Pencil, Trash2, X } from 'lucide-react'

interface DriverOption { email: string; name: string }

// Formulario de edición: strings para poder escribir libre en los numéricos.
interface EditForm {
  orderNumber: string
  name: string
  phone: string
  fullAddress: string
  barrio: string
  items: string
  notes: string
  payment: string
  status: string
  quotedPrice: string
  deliveryPrice: string
  driverEmail: string
}

const toForm = (o: Order): EditForm => ({
  orderNumber:   o.orderNumber || '',
  name:          o.name || o.clientName || '',
  phone:         o.phone || '',
  fullAddress:   o.fullAddress || '',
  barrio:        o.barrio || '',
  items:         o.items || '',
  notes:         o.notes || '',
  payment:       o.payment || '',
  status:        o.status,
  quotedPrice:   o.quotedPrice != null ? String(o.quotedPrice) : '',
  deliveryPrice: o.deliveryPrice != null ? String(o.deliveryPrice) : '',
  driverEmail:   (o.driverEmail || '').toLowerCase(),
})

export function OrderDetailModal({ order, onClose }: { order: Order; onClose: () => void }) {
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<EditForm>(() => toForm(order))
  const [drivers, setDrivers] = useState<DriverOption[]>([])
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const set = (k: keyof EditForm, v: string) => setForm((f) => ({ ...f, [k]: v }))

  // Domiciliarios disponibles (fijos + dinámicos de Firestore) para reasignar.
  useEffect(() => {
    getDocs(collection(db, 'roles_drivers'))
      .then((snap) => {
        const dynamic = snap.docs.map((d) => ({
          email: d.id.toLowerCase(),
          name: (d.data() as { name?: string }).name || d.id,
        }))
        const fixed = Object.entries(DEFAULT_DRIVERS)
          .filter(([email]) => !dynamic.some((x) => x.email === email.toLowerCase()))
          .map(([email, name]) => ({ email: email.toLowerCase(), name }))
        setDrivers([...fixed, ...dynamic].sort((a, b) => a.name.localeCompare(b.name)))
      })
      .catch(() => setDrivers([]))
  }, [])

  const quoted = Number(form.quotedPrice) || 0
  const delivery = Number(form.deliveryPrice) || 0
  const total = quoted + delivery

  const save = async () => {
    if (!form.name.trim()) { toast.error('El nombre del cliente no puede quedar vacío'); return }
    if (Number.isNaN(Number(form.quotedPrice)) || Number.isNaN(Number(form.deliveryPrice)) || quoted < 0 || delivery < 0) {
      toast.error('Los precios deben ser números válidos (0 o más)'); return
    }
    setSaving(true)
    try {
      const driver = drivers.find((d) => d.email === form.driverEmail)
      await updateDoc(doc(db, 'orders', order.id), {
        orderNumber:   form.orderNumber.trim(),
        name:          form.name.trim(),
        phone:         form.phone.trim(),
        fullAddress:   form.fullAddress.trim(),
        barrio:        form.barrio.trim(),
        items:         form.items,
        notes:         form.notes.trim(),
        payment:       form.payment,
        status:        form.status,
        quotedPrice:   quoted,
        deliveryPrice: delivery,
        totalPrice:    total,
        driverEmail:   form.driverEmail,
        driverName:    driver?.name || (form.driverEmail ? order.driverName || '' : ''),
        // Mismo criterio que la caja: efectivo/mixto implican cobro contra entrega.
        cashOnDelivery: form.payment === 'Efectivo' || form.payment === 'Mixto',
        updatedAt:     serverTimestamp(),
        editedByAdmin: true,
      })
      toast.success('Pedido actualizado')
      onClose()
    } catch (err) {
      console.error('Error al actualizar pedido:', err)
      toast.error('No se pudo guardar. Verifica los permisos.')
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    setSaving(true)
    try {
      await deleteDoc(doc(db, 'orders', order.id))
      toast.success('Pedido eliminado')
      onClose()
    } catch (err) {
      console.error('Error al eliminar pedido:', err)
      toast.error('No se pudo eliminar. Verifica los permisos.')
      setSaving(false)
    }
  }

  const s = statusInfo(order.status)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <p className="font-display text-xl font-bold text-coal">
              {order.orderNumber ? `#${order.orderNumber}` : 'Pedido'}
            </p>
            <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${s.cls}`}>{s.label}</span>
          </div>
          <div className="flex items-center gap-1">
            {!editing && (
              <button
                onClick={() => { setForm(toForm(order)); setEditing(true) }}
                className="flex items-center gap-1.5 text-xs font-semibold text-primary border border-primary/30 rounded px-3 py-1.5 hover:bg-primary/5"
              >
                <Pencil className="w-3.5 h-3.5" /> Editar
              </button>
            )}
            <button onClick={onClose} className="p-1.5 rounded hover:bg-gray-100 text-coal/60"><X className="w-5 h-5" /></button>
          </div>
        </div>

        <div className="p-5 flex flex-col gap-4">
          {order.loyaltyRedemption && (order.loyaltyRedemption.count || 0) > 0 && (
            <div className="bg-mint/15 border border-mint/40 rounded-lg px-3 py-2 text-sm text-coal">
              🎁 Incluye {order.loyaltyRedemption.count}x Hamburguesa Especial GRATIS (premio fidelización — no se cobra)
            </div>
          )}

          {!editing ? (
            <>
              <Section title="Cliente">
                <Row label="Nombre" value={order.name || order.clientName} />
                <Row label="Teléfono" value={order.phone} />
              </Section>
              <Section title="Entrega">
                <Row label="Modalidad" value={order.deliveryMode === 'pickup' ? 'Recoge en sede' : 'Domicilio'} />
                {order.deliveryMode !== 'pickup' && <Row label="Dirección" value={order.fullAddress} />}
                {order.barrio && <Row label="Barrio" value={order.barrio} />}
                {order.reference && <Row label="Referencia" value={order.reference} />}
                <Row label="Sede" value={order.sedeName} />
                <Row label="Domiciliario" value={order.driverName} />
                <Row label="Cajero" value={order.cashierName} />
              </Section>
              <Section title="Pedido">
                <p className="text-sm text-coal whitespace-pre-wrap bg-gray-50 rounded-lg p-3">{order.items || '—'}</p>
                {order.notes && <Row label="Indicaciones" value={order.notes} />}
                {order.cashierNotes && <Row label="Nota del cajero" value={order.cashierNotes} />}
                {order.rejectionReason && <Row label="Motivo de rechazo" value={order.rejectionReason} />}
              </Section>
              <Section title="Pago">
                <Row label="Método" value={order.payment || 'Sin definir'} />
                <Row label="Valor pedido" value={fmtCOP(order.quotedPrice)} />
                <Row label="Domicilio" value={fmtCOP(order.deliveryPrice)} />
                <Row label="Total" value={fmtCOP(order.totalPrice)} bold />
              </Section>
              <p className="text-xs text-muted-fg">Creado: {fmtDateTime(order.createdAt)}</p>

              {/* Eliminar */}
              <div className="border-t border-gray-100 pt-4">
                {confirmDelete ? (
                  <div className="flex items-center justify-between gap-3 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5">
                    <p className="text-sm text-red-700 font-medium">¿Eliminar este pedido definitivamente?</p>
                    <div className="flex gap-2 shrink-0">
                      <button onClick={() => setConfirmDelete(false)} className="text-xs font-semibold px-3 py-1.5 rounded border text-coal">Cancelar</button>
                      <button onClick={remove} disabled={saving} className="text-xs font-semibold px-3 py-1.5 rounded bg-red-600 text-white disabled:opacity-50">
                        {saving ? 'Eliminando…' : 'Sí, eliminar'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => setConfirmDelete(true)} className="flex items-center gap-1.5 text-xs font-semibold text-red-600 border border-red-200 rounded px-3 py-1.5 hover:bg-red-50">
                    <Trash2 className="w-3.5 h-3.5" /> Eliminar pedido
                  </button>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Número de pedido">
                  <input className="input" value={form.orderNumber} onChange={(e) => set('orderNumber', e.target.value)} />
                </Field>
                <Field label="Estado">
                  <select className="input" value={form.status} onChange={(e) => set('status', e.target.value)}>
                    {ALL_STATUSES.map((st) => <option key={st} value={st}>{statusLabel(st)}</option>)}
                  </select>
                </Field>
                <Field label="Cliente *">
                  <input className="input" value={form.name} onChange={(e) => set('name', e.target.value)} />
                </Field>
                <Field label="Teléfono">
                  <input className="input" value={form.phone} onChange={(e) => set('phone', e.target.value)} />
                </Field>
                <Field label="Dirección" full>
                  <input className="input" value={form.fullAddress} onChange={(e) => set('fullAddress', e.target.value)} />
                </Field>
                <Field label="Barrio">
                  <input className="input" value={form.barrio} onChange={(e) => set('barrio', e.target.value)} />
                </Field>
                <Field label="Domiciliario">
                  <select className="input" value={form.driverEmail} onChange={(e) => set('driverEmail', e.target.value)}>
                    <option value="">Sin asignar</option>
                    {drivers.map((d) => <option key={d.email} value={d.email}>{d.name}</option>)}
                  </select>
                </Field>
                <Field label="Productos" full>
                  <textarea className="input h-28" value={form.items} onChange={(e) => set('items', e.target.value)} />
                </Field>
                <Field label="Indicaciones" full>
                  <input className="input" value={form.notes} onChange={(e) => set('notes', e.target.value)} />
                </Field>
                <Field label="Método de pago">
                  <select className="input" value={form.payment} onChange={(e) => set('payment', e.target.value)}>
                    <option value="">Sin definir</option>
                    {PAYMENT_OPTIONS.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                </Field>
                <Field label="Valor pedido">
                  <input className="input" type="number" min={0} value={form.quotedPrice} onChange={(e) => set('quotedPrice', e.target.value)} />
                </Field>
                <Field label="Domicilio">
                  <input className="input" type="number" min={0} value={form.deliveryPrice} onChange={(e) => set('deliveryPrice', e.target.value)} />
                </Field>
                <Field label="Total (automático)">
                  <p className="input bg-gray-50 font-semibold">{fmtCOP(total)}</p>
                </Field>
              </div>

              <div className="flex gap-2 border-t border-gray-100 pt-4">
                <button onClick={() => setEditing(false)} disabled={saving} className="flex-1 text-sm font-semibold px-4 py-2 rounded border text-coal">
                  Cancelar
                </button>
                <button onClick={save} disabled={saving} className="flex-1 text-sm font-semibold px-4 py-2 rounded bg-primary text-white disabled:opacity-50">
                  {saving ? 'Guardando…' : 'Guardar cambios'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-wider text-muted-fg mb-1.5">{title}</p>
      <div className="flex flex-col gap-1">{children}</div>
    </div>
  )
}

function Row({ label, value, bold }: { label: string; value?: string | null; bold?: boolean }) {
  return (
    <div className="flex justify-between gap-3 text-sm">
      <span className="text-muted-fg shrink-0">{label}</span>
      <span className={`text-coal text-right ${bold ? 'font-bold' : ''}`}>{value || '—'}</span>
    </div>
  )
}

function Field({ label, full, children }: { label: string; full?: boolean; children: React.ReactNode }) {
  return (
    <label className={`flex flex-col gap-1 ${full ? 'col-span-2' : ''}`}>
      <span className="text-xs font-semibold text-muted-fg">{label}</span>
      {children}
    </label>
  )
}
