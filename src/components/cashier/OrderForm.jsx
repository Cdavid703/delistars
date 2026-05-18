import { useState, useRef } from 'react'
import { parseWhatsAppMessage, validateOrder } from '../../utils/orderParser'
import { ClipboardPaste, X, AlertCircle, CheckCircle, Edit2 } from 'lucide-react'

export default function OrderForm({ drivers, onSubmit, onCancel }) {
  const [raw,     setRaw]     = useState('')
  const [parsed,  setParsed]  = useState(null)
  const [errors,  setErrors]  = useState([])
  const [editing, setEditing] = useState({})
  const [driverId, setDriverId] = useState('')
  const [loading,  setLoading]  = useState(false)
  const textRef = useRef()

  const handlePaste = () => {
    const result = parseWhatsAppMessage(raw)
    if (!result) return
    setParsed(result)
    const errs = validateOrder(result)
    setErrors(errs)
  }

  const handleClear = () => { setRaw(''); setParsed(null); setErrors([]); setEditing({}) }

  const field = (key) => editing[key] ?? parsed?.[key] ?? ''
  const setField = (key, val) => setEditing(e => ({ ...e, [key]: val }))

  const handleSubmit = async () => {
    if (!parsed) return
    const data = { ...parsed, ...editing }
    const errs = validateOrder(data)
    if (errs.length) { setErrors(errs); return }
    if (!driverId) { setErrors(['Debes asignar un domiciliario']); return }
    setLoading(true)
    try {
      await onSubmit({ ...data, driverId })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col gap-5 animate-fade-in">
      {/* Step 1: paste message */}
      <div>
        <label className="label-field">
          📋 Pega el mensaje de WhatsApp aquí
        </label>
        <textarea
          ref={textRef}
          value={raw}
          onChange={e => { setRaw(e.target.value); setParsed(null); setErrors([]) }}
          className="textarea-field h-36 scroll-custom"
          placeholder="Pega el mensaje completo recibido por WhatsApp…"
        />
        <div className="flex gap-2 mt-2">
          <button onClick={handlePaste} disabled={!raw.trim()} className="btn-primary btn-sm flex-1">
            <ClipboardPaste size={16} />
            Extraer datos
          </button>
          {raw && (
            <button onClick={handleClear} className="btn-ghost btn-sm">
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Errors */}
      {errors.length > 0 && (
        <div className="bg-pepper/10 border border-pepper/30 rounded-xl p-3 flex flex-col gap-1">
          {errors.map(e => (
            <p key={e} className="flex items-center gap-2 text-sm text-pepper font-body">
              <AlertCircle size={14} /> {e}
            </p>
          ))}
        </div>
      )}

      {/* Step 2: review parsed data */}
      {parsed && (
        <div className="flex flex-col gap-4 animate-fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle size={18} className="text-mint" />
            <p className="font-body font-semibold text-sm text-mint">Datos extraídos — revisa y ajusta si es necesario</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <EditableField label="Número de pedido" value={field('orderNumber')}
              onChange={v => setField('orderNumber', v)} placeholder="Ej: 001 (ingresa si no viene)" />
            <EditableField label="Teléfono / WhatsApp *" value={field('phone')}
              onChange={v => setField('phone', v)} placeholder="Ej: 3001234567" required />
          </div>

          <EditableField label="Nombre del cliente *" value={field('name')}
            onChange={v => setField('name', v)} placeholder="Nombre completo" required />

          <EditableField label="Dirección completa *" value={field('fullAddress')}
            onChange={v => setField('fullAddress', v)} placeholder="Calle, número, barrio" required />

          <div className="grid grid-cols-2 gap-3">
            <EditableField label="Barrio" value={field('barrio')}
              onChange={v => setField('barrio', v)} placeholder="Barrio" />
            <EditableField label="Referencia" value={field('reference')}
              onChange={v => setField('reference', v)} placeholder="Referencia del lugar" />
          </div>

          <EditableField label="Productos / Pedido *" value={field('items')}
            onChange={v => setField('items', v)} placeholder="Detalle del pedido" multiline required />

          <EditableField label="Indicaciones adicionales" value={field('notes')}
            onChange={v => setField('notes', v)} placeholder="Sin cebolla, instrucciones especiales…" multiline />

          <EditableField label="Forma de pago" value={field('payment')}
            onChange={v => setField('payment', v)} placeholder="Transferencia / Efectivo" />

          {/* Assign driver */}
          <div>
            <label className="label-field">🚴 Asignar domiciliario *</label>
            <select
              value={driverId}
              onChange={e => setDriverId(e.target.value)}
              className="input-field"
            >
              <option value="">— Selecciona domiciliario —</option>
              {drivers.map(d => (
                <option key={d.id} value={d.id}>{d.name || d.email}</option>
              ))}
            </select>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button onClick={onCancel} className="btn-secondary flex-1">Cancelar</button>
            <button onClick={handleSubmit} disabled={loading} className="btn-primary flex-1">
              {loading ? 'Enviando…' : '🚀 Enviar pedido'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function EditableField({ label, value, onChange, placeholder, multiline, required }) {
  const cls = multiline ? 'textarea-field h-20' : 'input-field'
  const Tag = multiline ? 'textarea' : 'input'
  return (
    <div>
      <label className="label-field">{label}{required && ' *'}</label>
      <Tag className={cls} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  )
}
