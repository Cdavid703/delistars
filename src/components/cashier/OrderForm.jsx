import { useState, useEffect } from 'react'
import { AlertCircle } from 'lucide-react'

export default function OrderForm({ drivers, onSubmit, onCancel }) {
  const [form, setForm] = useState({
    orderNumber:        '',
    name:               '',
    phone:              '',
    fullAddress:        '',
    barrio:             '',
    reference:          '',
    items:              '',
    notes:              '',
    payment:            'Efectivo',
    quotedPrice:        '',
    deliveryPrice:      '',
    mixtoEfectivo:      '',
    mixtoTransferencia: '',
  })
  const [driverId, setDriverId] = useState(() => drivers[0]?.id || '')
  const [errors,   setErrors]   = useState([])
  const [loading,  setLoading]  = useState(false)

  useEffect(() => {
    setDriverId(id => id || drivers[0]?.id || '')
  }, [drivers])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const qp    = parseFloat(form.quotedPrice)   || 0
  const dp    = parseFloat(form.deliveryPrice) || 0
  const total = qp + dp

  const fmt = v => v > 0 ? `$${v.toLocaleString('es-CO')}` : '—'

  const handleSubmit = async () => {
    // ── Validación ──────────────────────────────────────────────────────────
    const errs = []
    if (!form.name.trim())        errs.push('Falta el nombre del cliente')
    if (!form.phone.trim())       errs.push('Falta el teléfono')
    if (!form.fullAddress.trim()) errs.push('Falta la dirección')
    if (!form.items.trim())       errs.push('Falta el detalle del pedido')
    if (!driverId)                errs.push('Selecciona un domiciliario')

    // En pago mixto, efectivo + transferencia deben sumar el total a cobrar.
    if (form.payment === 'Mixto') {
      const me = parseFloat(form.mixtoEfectivo)      || 0
      const mt = parseFloat(form.mixtoTransferencia) || 0
      if (total <= 0) {
        errs.push('Define el valor del pedido/domicilio para un pago mixto')
      } else if (me + mt !== total) {
        const peso = n => `$${n.toLocaleString('es-CO')}`
        errs.push(`El pago mixto (efectivo ${peso(me)} + transferencia ${peso(mt)}) debe sumar el total ${peso(total)}`)
      }
    }

    if (errs.length) {
      setErrors(errs)
      return
    }

    // ── Envío ────────────────────────────────────────────────────────────────
    setErrors([])
    setLoading(true)
    try {
      await onSubmit({
        ...form,
        driverId,
        quotedPrice:   qp,
        deliveryPrice: dp,
        totalPrice:    total,
      })
    } catch (err) {
      console.error('[OrderForm] onSubmit ERROR:', err)
      const msg = err?.code === 'permission-denied'
        ? 'Sin permisos para guardar. Verifica tu sesión.'
        : `Error al guardar: ${err?.message || 'intenta de nuevo'}`
      setErrors([msg])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col gap-4 animate-fade-in">

      {/* Identificación */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="of-orderNumber" className="label-field">
            N° de pedido <span className="text-[10px] text-coal/40 normal-case font-normal">(auto · editable)</span>
          </label>
          <input id="of-orderNumber" name="orderNumber" className="input-field"
            value={form.orderNumber} onChange={e => set('orderNumber', e.target.value)}
            placeholder="Se asigna al guardar" autoComplete="off" />
        </div>
        <div>
          <label htmlFor="of-phone" className="label-field">Teléfono / WhatsApp *</label>
          <input id="of-phone" name="phone" className="input-field"
            value={form.phone} type="tel" onChange={e => set('phone', e.target.value)}
            placeholder="3001234567" autoComplete="tel" />
        </div>
      </div>

      <div>
        <label htmlFor="of-name" className="label-field">Nombre del cliente *</label>
        <input id="of-name" name="name" className="input-field"
          value={form.name} onChange={e => set('name', e.target.value)}
          placeholder="Nombre completo" autoComplete="name" />
      </div>

      {/* Dirección */}
      <div>
        <label htmlFor="of-address" className="label-field">Dirección completa *</label>
        <input id="of-address" name="fullAddress" className="input-field"
          value={form.fullAddress} onChange={e => set('fullAddress', e.target.value)}
          placeholder="Calle, número…" autoComplete="street-address" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="of-barrio" className="label-field">Barrio</label>
          <input id="of-barrio" name="barrio" className="input-field"
            value={form.barrio} onChange={e => set('barrio', e.target.value)}
            placeholder="Barrio" autoComplete="off" />
        </div>
        <div>
          <label htmlFor="of-reference" className="label-field">Referencia</label>
          <input id="of-reference" name="reference" className="input-field"
            value={form.reference} onChange={e => set('reference', e.target.value)}
            placeholder="Punto de referencia" autoComplete="off" />
        </div>
      </div>

      {/* Pedido */}
      <div>
        <label htmlFor="of-items" className="label-field">Productos / Pedido *</label>
        <textarea id="of-items" name="items" className="textarea-field h-24 scroll-custom"
          value={form.items} onChange={e => set('items', e.target.value)}
          placeholder="1 hamburguesa clásica, 1 papas medianas…" />
      </div>

      <div>
        <label htmlFor="of-notes" className="label-field">Indicaciones adicionales</label>
        <textarea id="of-notes" name="notes" className="textarea-field h-16 scroll-custom"
          value={form.notes} onChange={e => set('notes', e.target.value)}
          placeholder="Sin cebolla, instrucciones especiales…" />
      </div>

      {/* Precios */}
      <div className="bg-smoked/50 rounded-2xl p-4 flex flex-col gap-3">
        <p className="font-display text-sm tracking-wide text-coal">💰 Precios</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="of-quotedPrice" className="label-field">Valor pedido</label>
            <input id="of-quotedPrice" name="quotedPrice" className="input-field"
              value={form.quotedPrice} type="number" min="0"
              onChange={e => set('quotedPrice', e.target.value)} placeholder="0" />
          </div>
          <div>
            <label htmlFor="of-deliveryPrice" className="label-field">Valor domicilio</label>
            <input id="of-deliveryPrice" name="deliveryPrice" className="input-field"
              value={form.deliveryPrice} type="number" min="0"
              onChange={e => set('deliveryPrice', e.target.value)} placeholder="0" />
          </div>
        </div>
        {total > 0 && (
          <div className="flex items-center justify-between border-t border-coal/10 pt-2">
            <span className="font-body text-sm text-coal/60">Total a cobrar:</span>
            <span className="font-display text-xl text-tangelo">{fmt(total)}</span>
          </div>
        )}
      </div>

      {/* Pago */}
      <div>
        <label htmlFor="of-payment" className="label-field">Forma de pago</label>
        <select id="of-payment" name="payment" value={form.payment}
          onChange={e => set('payment', e.target.value)} className="input-field">
          <option value="Efectivo">Efectivo</option>
          <option value="Transferencia">Transferencia</option>
          <option value="Nequi">Nequi</option>
          <option value="Mixto">Mixto (Efectivo + Transferencia)</option>
        </select>

        {form.payment === 'Mixto' && (
          <div className="mt-3 bg-smoked/50 rounded-2xl p-4 flex flex-col gap-3">
            <p className="font-body text-xs text-coal/60 font-semibold">Indica cuánto paga en cada forma:</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label-field">Efectivo</label>
                <input className="input-field" type="number" min="0"
                  value={form.mixtoEfectivo}
                  onChange={e => set('mixtoEfectivo', e.target.value)}
                  placeholder="$0" />
              </div>
              <div>
                <label className="label-field">Transferencia</label>
                <input className="input-field" type="number" min="0"
                  value={form.mixtoTransferencia}
                  onChange={e => set('mixtoTransferencia', e.target.value)}
                  placeholder="$0" />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Domiciliario */}
      <div>
        <label htmlFor="of-driver" className="label-field">🚴 Domiciliario *</label>
        <select id="of-driver" name="driverId" value={driverId}
          onChange={e => setDriverId(e.target.value)} className="input-field">
          <option value="">— Selecciona domiciliario —</option>
          {drivers.map(d => (
            <option key={d.id} value={d.id}>{d.name || d.id}</option>
          ))}
        </select>
      </div>

      {/* Botones */}
      <div className="flex gap-3 pt-2">
        <button type="button" onClick={onCancel} className="btn-secondary flex-1">
          Cancelar
        </button>
        <button type="button" onClick={handleSubmit} disabled={loading} className="btn-primary flex-1">
          {loading ? 'Enviando…' : '🚀 Enviar pedido'}
        </button>
      </div>

      {/* Errores — debajo del botón, siempre visibles */}
      {errors.length > 0 && (
        <div className="bg-red-50 border border-red-300 rounded-xl p-3 flex flex-col gap-1.5">
          {errors.map(e => (
            <p key={e} className="flex items-center gap-2 text-sm text-red-600 font-body">
              <AlertCircle size={14} className="flex-shrink-0" /> {e}
            </p>
          ))}
        </div>
      )}

    </div>
  )
}
