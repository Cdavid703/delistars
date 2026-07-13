import { useState, useEffect } from 'react'
import { doc, getDoc, setDoc, updateDoc, arrayRemove, serverTimestamp } from 'firebase/firestore'
import { db } from '../../services/firebase'
import { MapPin, Plus, Check, X, Trash2, Pencil } from 'lucide-react'

// ─── Nomenclatura oficial colombiana (menús cerrados = sin typos) ──────────────
const VIA_TIPOS = [
  'Calle', 'Carrera', 'Diagonal', 'Transversal',
  'Avenida', 'Avenida Calle', 'Avenida Carrera', 'Circular', 'Autopista',
]
const LETRAS        = ['', 'A', 'B', 'C', 'D', 'E', 'F', 'G']
const ORIENTACIONES = ['', 'Sur', 'Este']

const LABEL_PRESETS = [
  { label: 'Casa',    emoji: '🏠' },
  { label: 'Trabajo', emoji: '💼' },
  { label: 'Pareja',  emoji: '❤️' },
  { label: 'Familia', emoji: '👨‍👩‍👧' },
  { label: 'Otra',    emoji: '📍' },
]

const EMPTY = {
  id: '', label: 'Casa', emoji: '🏠',
  tipoVia: 'Calle', viaNum: '', viaLetra: '', viaOrient: '',
  cruceNum: '', cruceLetra: '', placa: '',
  complemento: '', barrio: '', referencia: '',
  lat: null, lng: null, formatted: '',
}

const onlyDigits = v => (v || '').toString().replace(/[^\d]/g, '')

// "Calle 44B Sur #70A-23"
function buildFormatted(p) {
  const via   = [p.tipoVia, `${p.viaNum}${p.viaLetra || ''}`, p.viaOrient].filter(Boolean).join(' ')
  const cruce = `${p.cruceNum || ''}${p.cruceLetra || ''}`
  return `${via} #${cruce}-${p.placa || ''}`.trim()
}

// Texto que ve la caja / el domiciliario (dirección + complemento)
function fullAddressOf(p) {
  return [buildFormatted(p), p.complemento?.trim()].filter(Boolean).join(', ')
}

// Geocodifica la dirección armada para obtener el pin exacto (best-effort).
async function geocode(p, sede) {
  try {
    const q = `${buildFormatted(p)}, ${p.barrio ? p.barrio + ', ' : ''}Medellín, Colombia`
    const lat = sede?.coords?.lat ?? 6.24, lon = sede?.coords?.lng ?? -75.58
    const res = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=1&lat=${lat}&lon=${lon}`)
    if (!res.ok) return null
    const data = await res.json()
    const c = data.features?.[0]?.geometry?.coordinates
    return c ? { lat: c[1], lng: c[0] } : null
  } catch { return null }
}

// ─── Formulario estructurado (agregar/editar una dirección) ────────────────────
function AddressBuilder({ sede, initial, onSave, onCancel }) {
  const [p, setP]           = useState(initial || EMPTY)
  const [customLabel, setCustom] = useState(
    initial && !LABEL_PRESETS.some(l => l.label === initial.label) ? initial.label : '',
  )
  const [errors, setErrors] = useState([])
  const [saving, setSaving] = useState(false)

  const set = (k, v) => setP(f => ({ ...f, [k]: v }))
  const preview = buildFormatted(p)

  const pickLabel = (preset) => {
    if (preset.label === 'Otra') { set('emoji', preset.emoji); set('label', customLabel || 'Otra') }
    else { setCustom(''); setP(f => ({ ...f, label: preset.label, emoji: preset.emoji })) }
  }
  const isOtra = !LABEL_PRESETS.slice(0, 4).some(l => l.label === p.label)

  const handleSave = async () => {
    const errs = []
    if (!p.label.trim())    errs.push('Ponle un nombre a la dirección (Casa, Trabajo…)')
    if (!p.viaNum.trim())   errs.push('Falta el número de la vía (ej: Calle 44)')
    if (!p.cruceNum.trim()) errs.push('Falta el número después del # (ej: #70)')
    if (!p.placa.trim())    errs.push('Falta el número de la placa (ej: -23)')
    if (errs.length) { setErrors(errs); return }
    setErrors([])
    setSaving(true)
    const coords = await geocode(p, sede)
    const place = {
      ...p,
      id:        p.id || `pl_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      label:     (isOtra ? (customLabel || p.label) : p.label).trim(),
      lat:       coords?.lat ?? null,
      lng:       coords?.lng ?? null,
      formatted: buildFormatted(p),
    }
    setSaving(false)
    onSave(place)
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-coal/50 backdrop-blur-sm animate-fade-in"
      onClick={e => { if (e.target === e.currentTarget) onCancel() }}>
      <div className="bg-cream w-full max-w-lg rounded-t-3xl sm:rounded-3xl max-h-[92dvh] overflow-y-auto scroll-custom">
        <div className="sticky top-0 bg-cream/95 backdrop-blur-sm px-5 py-4 border-b border-coal/10 flex items-center justify-between">
          <p className="font-display text-lg text-coal tracking-wide">{initial ? 'Editar dirección' : 'Nueva dirección'}</p>
          <button onClick={onCancel} className="text-coal/40 hover:text-coal/70"><X size={20} /></button>
        </div>

        <div className="p-5 flex flex-col gap-4">
          {/* Etiqueta */}
          <div>
            <label className="label-field">¿Cómo la llamas?</label>
            <div className="flex flex-wrap gap-2">
              {LABEL_PRESETS.map(preset => {
                const active = preset.label === 'Otra' ? isOtra : (p.label === preset.label && !isOtra)
                return (
                  <button key={preset.label} type="button" onClick={() => pickLabel(preset)}
                    className={`px-3 py-1.5 rounded-xl font-body text-sm border transition-colors ${active ? 'bg-cherry text-cream border-cherry' : 'bg-white text-coal/70 border-coal/15 hover:border-cherry/40'}`}>
                    {preset.emoji} {preset.label}
                  </button>
                )
              })}
            </div>
            {isOtra && (
              <input className="input-field mt-2" value={customLabel}
                onChange={e => { setCustom(e.target.value); set('label', e.target.value) }}
                placeholder="Nombre (ej: Casa de mamá)" autoComplete="off" />
            )}
          </div>

          {/* Vía principal */}
          <div>
            <label className="label-field">Vía</label>
            <div className="grid grid-cols-[1.4fr_1fr_0.9fr_1fr] gap-2">
              <select className="input-field" value={p.tipoVia} onChange={e => set('tipoVia', e.target.value)}>
                {VIA_TIPOS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <input className="input-field" inputMode="numeric" value={p.viaNum}
                onChange={e => set('viaNum', onlyDigits(e.target.value))} placeholder="44" />
              <select className="input-field" value={p.viaLetra} onChange={e => set('viaLetra', e.target.value)}>
                {LETRAS.map(l => <option key={l} value={l}>{l || '–'}</option>)}
              </select>
              <select className="input-field" value={p.viaOrient} onChange={e => set('viaOrient', e.target.value)}>
                {ORIENTACIONES.map(o => <option key={o} value={o}>{o || '–'}</option>)}
              </select>
            </div>
            <div className="flex gap-1 mt-1 px-1">
              <span className="text-[10px] text-coal/35 font-body w-[1.4fr] flex-[1.4]">tipo</span>
              <span className="text-[10px] text-coal/35 font-body flex-1">número</span>
              <span className="text-[10px] text-coal/35 font-body flex-[0.9]">letra</span>
              <span className="text-[10px] text-coal/35 font-body flex-1">orient.</span>
            </div>
          </div>

          {/* Cruce + placa */}
          <div>
            <label className="label-field">Número (cruce y placa)</label>
            <div className="flex items-center gap-2">
              <span className="font-display text-lg text-coal/40">#</span>
              <input className="input-field flex-1" inputMode="numeric" value={p.cruceNum}
                onChange={e => set('cruceNum', onlyDigits(e.target.value))} placeholder="70" />
              <select className="input-field w-16" value={p.cruceLetra} onChange={e => set('cruceLetra', e.target.value)}>
                {LETRAS.map(l => <option key={l} value={l}>{l || '–'}</option>)}
              </select>
              <span className="font-display text-lg text-coal/40">–</span>
              <input className="input-field flex-1" inputMode="numeric" value={p.placa}
                onChange={e => set('placa', onlyDigits(e.target.value))} placeholder="23" />
            </div>
          </div>

          {/* Barrio */}
          <div>
            <label className="label-field">Barrio</label>
            <input className="input-field" list="ds-barrios-builder" value={p.barrio}
              onChange={e => set('barrio', e.target.value)} placeholder="Barrio" autoComplete="off" />
            <datalist id="ds-barrios-builder">
              {(sede?.barrios || []).map(b => <option key={b} value={b} />)}
            </datalist>
          </div>

          {/* Complemento + referencia */}
          <div>
            <label className="label-field">Complemento <span className="text-[10px] text-coal/40 normal-case font-normal">(apto, torre, interior…)</span></label>
            <input className="input-field" value={p.complemento}
              onChange={e => set('complemento', e.target.value)} placeholder="Apto 502, Torre 3" autoComplete="off" />
          </div>
          <div>
            <label className="label-field">Indicaciones para el domiciliario</label>
            <input className="input-field" value={p.referencia}
              onChange={e => set('referencia', e.target.value)} placeholder="Portón verde, al lado de la tienda" autoComplete="off" />
          </div>

          {/* Vista previa */}
          {preview && preview !== '#-' && (
            <div className="bg-mint/10 border border-mint/30 rounded-xl px-4 py-3">
              <p className="font-body text-[10px] text-coal/40 uppercase tracking-wider mb-0.5">Así queda tu dirección</p>
              <p className="font-body text-sm font-semibold text-coal">
                {p.emoji} {preview}{p.complemento?.trim() ? `, ${p.complemento.trim()}` : ''}
              </p>
              {p.barrio && <p className="font-body text-xs text-coal/50">📍 {p.barrio}</p>}
            </div>
          )}

          {errors.length > 0 && (
            <div className="bg-red-50 border border-red-300 rounded-xl p-3 flex flex-col gap-1">
              {errors.map(e => <p key={e} className="font-body text-xs text-red-600">• {e}</p>)}
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onCancel} className="btn-secondary flex-1">Cancelar</button>
            <button type="button" onClick={handleSave} disabled={saving} className="btn-primary flex-1">
              {saving ? 'Guardando…' : '✓ Guardar dirección'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Selector de direcciones (lista + agregar) ─────────────────────────────────
// Muestra las direcciones guardadas del cliente (customers/{uid}.savedPlaces) y
// permite agregar/editar/borrar. Al elegir una, avisa al formulario con
// onSelect({ fullAddress, barrio, reference, lat, lng }).
export default function AddressBook({ user, sede, currentAddress, onSelect }) {
  const [places,   setPlaces]   = useState([])
  const [loaded,   setLoaded]   = useState(false)
  const [builder,  setBuilder]  = useState(null) // { mode:'new'|'edit', place }

  const uid   = user?.uid
  const canSave = !!uid   // el login anónimo también tiene uid → guarda igual

  useEffect(() => {
    if (!uid) { setLoaded(true); return }
    getDoc(doc(db, 'customers', uid)).then(snap => {
      const list = snap.exists() ? (snap.data().savedPlaces || []) : []
      setPlaces(Array.isArray(list) ? list : [])
    }).catch(() => {}).finally(() => setLoaded(true))
  }, [uid])

  const persist = async (next) => {
    setPlaces(next)
    if (!canSave) return
    try {
      await setDoc(doc(db, 'customers', uid), { savedPlaces: next, updatedAt: serverTimestamp() }, { merge: true })
    } catch (_) {}
  }

  const selectPlace = (p) => {
    onSelect({
      fullAddress: fullAddressOf(p),
      barrio:      p.barrio || '',
      reference:   p.referencia || '',
      lat:         p.lat ?? null,
      lng:         p.lng ?? null,
    })
  }

  const handleSaved = async (place) => {
    const next = places.some(x => x.id === place.id)
      ? places.map(x => x.id === place.id ? place : x)
      : [...places, place]
    await persist(next)
    setBuilder(null)
    selectPlace(place)   // seleccionar automáticamente la recién guardada
  }

  const removePlace = async (place, e) => {
    e.stopPropagation()
    const next = places.filter(x => x.id !== place.id)
    setPlaces(next)
    if (canSave) {
      try { await updateDoc(doc(db, 'customers', uid), { savedPlaces: arrayRemove(place) }) } catch (_) {}
    }
  }

  const isSelected = (p) => currentAddress && fullAddressOf(p) === currentAddress

  return (
    <div className="flex flex-col gap-2">
      <label className="label-field">Dirección de entrega *</label>

      {loaded && places.length === 0 && (
        <p className="font-body text-xs text-coal/45">
          Aún no tienes direcciones guardadas. Agrega una con los datos exactos (calle, carrera, número…) para que el domiciliario llegue sin perderse.
        </p>
      )}

      {places.map(p => (
        <button key={p.id} type="button" onClick={() => selectPlace(p)}
          className={`text-left rounded-2xl px-4 py-3 border transition-colors flex items-start gap-3 ${isSelected(p) ? 'border-cherry bg-cherry/5' : 'border-coal/12 bg-white hover:border-cherry/40'}`}>
          <span className="text-xl leading-none mt-0.5">{p.emoji || '📍'}</span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="font-body font-semibold text-sm text-coal">{p.label}</p>
              {isSelected(p) && <Check size={14} className="text-cherry" />}
            </div>
            <p className="font-body text-xs text-coal/60 truncate">{fullAddressOf(p)}</p>
            {p.barrio && <p className="font-body text-[11px] text-coal/40">📍 {p.barrio}{p.lat != null ? ' · ubicada en el mapa' : ''}</p>}
          </div>
          <span className="flex items-center gap-1 flex-shrink-0">
            <span onClick={e => { e.stopPropagation(); setBuilder({ mode: 'edit', place: p }) }}
              className="p-1.5 rounded-lg text-coal/40 hover:text-tangelo hover:bg-tangelo/10" title="Editar">
              <Pencil size={14} />
            </span>
            <span onClick={e => removePlace(p, e)}
              className="p-1.5 rounded-lg text-coal/40 hover:text-red-500 hover:bg-red-50" title="Borrar">
              <Trash2 size={14} />
            </span>
          </span>
        </button>
      ))}

      <button type="button" onClick={() => setBuilder({ mode: 'new' })}
        className="flex items-center justify-center gap-2 rounded-2xl px-4 py-3 border-2 border-dashed border-cherry/30 text-cherry font-body text-sm font-semibold hover:bg-cherry/5 transition-colors">
        <Plus size={16} /> Agregar dirección
      </button>

      {!canSave && (
        <p className="font-body text-[11px] text-coal/45 flex items-start gap-1.5">
          <MapPin size={12} className="flex-shrink-0 mt-0.5" />
          Inicia sesión con Google para guardar tus direcciones y reutilizarlas en el próximo pedido.
        </p>
      )}

      {builder && (
        <AddressBuilder
          sede={sede}
          initial={builder.mode === 'edit' ? builder.place : null}
          onSave={handleSaved}
          onCancel={() => setBuilder(null)}
        />
      )}
    </div>
  )
}
