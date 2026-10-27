import { useState, useEffect, lazy, Suspense } from 'react'
import { doc, getDoc, setDoc, updateDoc, arrayRemove, serverTimestamp } from 'firebase/firestore'
import { db } from '../../services/firebase'
import { MapPin, Plus, Check, X, Trash2, Pencil, House, Briefcase, Heart, Users, AlertCircle, Search, Star } from 'lucide-react'
import { geocodeQuery, fullAddressOf, textoDireccion, barrioDeGoogle, marcarFavorita, ordenarLugares } from '../../utils/address'
import useBackClose from '../../hooks/useBackClose'
import { ubicarDireccion } from '../../services/recorrido'
import { kmLineaRecta } from '../../utils/tarifaDomicilio'

// Mapa diferido: solo se descarga Leaflet cuando el cliente abre "ajustar pin".
const MapPicker = lazy(() => import('./MapPicker'))

// El emoji se sigue guardando con la dirección (las que ya existen lo traen),
// pero en pantalla se dibuja el icono: así la lista no depende de cómo pinte
// los emojis cada teléfono.
const LABEL_PRESETS = [
  { label: 'Casa',    emoji: '🏠', icon: House },
  { label: 'Trabajo', emoji: '💼', icon: Briefcase },
  { label: 'Pareja',  emoji: '❤️', icon: Heart },
  { label: 'Familia', emoji: '👨‍👩‍👧', icon: Users },
  { label: 'Otra',    emoji: '📍', icon: MapPin },
]

const iconoDeEtiqueta = (etiqueta) =>
  LABEL_PRESETS.find(x => x.label === etiqueta)?.icon || MapPin

const EMPTY = {
  id: '', label: 'Casa', emoji: '🏠',
  texto: '',
  tipoVia: '', viaNum: '', viaLetra: '', viaOrient: '',
  cruceNum: '', cruceLetra: '', placa: '',
  complemento: '', barrio: '', referencia: '',
  lat: null, lng: null, formatted: '',
  // De dónde salió el pin: 'mapa' (el cliente lo puso), 'google' o 'photon'.
  pinFuente: null, pinPrecision: null,
}

// Precisiones de Google que ya dan la casa (o el conjunto por su nombre).
const PRECISAS = ['ROOFTOP', 'RANGE_INTERPOLATED', 'LUGAR']

// Respaldo gratuito cuando el servidor (Google) no responde: devuelve la forma
// de `ubicarDireccion` con precisión desconocida, así el cliente afina el pin.
async function buscarEnPhoton(q, centro) {
  try {
    const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(`${q}, Medellín`)}&limit=3&lat=${centro.lat}&lon=${centro.lng}&lang=es`
    const res = await fetch(url)
    if (!res.ok) return null
    const data = await res.json()
    return (data.features || []).slice(0, 3).map(f => ({
      lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0],
      direccion: [f.properties?.name, f.properties?.street && f.properties?.housenumber ? `${f.properties.street} ${f.properties.housenumber}` : f.properties?.street, f.properties?.district, f.properties?.city]
        .filter(Boolean).filter((x, i, a) => a.indexOf(x) === i).join(', '),
      precision: 'APPROXIMATE',
    }))
  } catch { return null }
}

// ─── Formulario (agregar/editar una dirección) ────────────────────────────────
// Un solo campo: el cliente escribe su dirección como la dice, Google la ubica
// y el pin se afina en el mapa. Antes se pedían calle, carrera, letra, cruce,
// placa y barrio por separado (24 oct 2026: demasiado para pedir una comida).
const PRECISION_TEXTO = { ROOFTOP: 'Casa exacta', RANGE_INTERPOLATED: 'Sobre la cuadra', LUGAR: 'Lugar encontrado por la referencia' }

function AddressBuilder({ sede, initial, onSave, onCancel, aviso = null, onDejarComoEstaba = null }) {
  useBackClose(true, onCancel) // "atrás" cierra el formulario, no sale de la app
  const [p, setP] = useState(() => initial ? { ...EMPTY, ...initial, texto: textoDireccion(initial) } : EMPTY)
  const [customLabel, setCustom] = useState(
    initial && !LABEL_PRESETS.some(l => l.label === initial.label) ? initial.label : '',
  )
  const [errors, setErrors]     = useState([])
  const [saving, setSaving]     = useState(false)
  const [buscando, setBuscando] = useState(false)
  const [opciones, setOpciones] = useState(null)   // null = sin buscar; [] = Google no la encontró
  // Revisión de un pin viejo (o edición de una que ya tiene pin): el mapa abre de una.
  const [showMap, setShowMap]   = useState(!!aviso || (initial?.lat != null))
  const [yaAviseImpreciso, setYaAviseImpreciso] = useState(false)

  const set = (k, v) => setP(f => ({ ...f, [k]: v }))
  // Cambiar la dirección invalida el pin anterior: hay que volver a buscar.
  const setTexto = (v) => {
    setP(f => ({ ...f, texto: v, lat: null, lng: null, pinFuente: null, pinPrecision: null }))
    setOpciones(null)
    setShowMap(false)
  }
  const centroSede = { lat: sede?.coords?.lat ?? 6.2447, lng: sede?.coords?.lng ?? -75.5916 }

  const elegir = (l) => {
    setP(f => ({ ...f, lat: l.lat, lng: l.lng, pinFuente: 'google', pinPrecision: l.precision,
      barrio: f.barrio || barrioDeGoogle(l.direccion) }))
    setOpciones(null)
    setShowMap(true)
    setErrors([])
  }

  // Google busca la dirección escrita (y la referencia, si la hay: en conjuntos
  // y lomas suele dar mejor el nombre que la nomenclatura). Si el servidor no
  // responde, OpenStreetMap (Photon) da al menos la cuadra, como respaldo.
  const buscar = async () => {
    const q = p.texto.trim()
    if (q.length < 5) { setErrors(['Escribe tu dirección, por ejemplo: Calle 44B #70A-23']); return null }
    setErrors([])
    setBuscando(true)
    let lugares = await ubicarDireccion(q, p.referencia?.trim())
    if (lugares === null) lugares = await buscarEnPhoton(q, centroSede)
    lugares = lugares || []
    setBuscando(false)
    const lista = lugares.slice(0, 4)
    if (lista.length === 0) {
      setOpciones([])
      // Sin resultado no se bloquea: el pin arranca en la sede y el cliente lo lleva a su casa.
      setP(f => ({ ...f, lat: f.lat ?? centroSede.lat, lng: f.lng ?? centroSede.lng, pinFuente: f.lat != null ? f.pinFuente : null, pinPrecision: null }))
      setShowMap(true)
      return []
    }
    if (lista.length === 1 || PRECISAS.includes(lista[0].precision)) { elegir(lista[0]); return lista }
    setOpciones(lista)
    return lista
  }

  // Sin Google, o Google no la encontró: el cliente la pone a mano.
  const ubicarAMano = () => {
    setP(f => ({ ...f, lat: f.lat ?? centroSede.lat, lng: f.lng ?? centroSede.lng, pinFuente: f.lat != null ? f.pinFuente : null, pinPrecision: null }))
    setOpciones(null)
    setShowMap(true)
  }

  const pickLabel = (preset) => {
    if (preset.label === 'Otra') { set('emoji', preset.emoji); set('label', customLabel || 'Otra') }
    else { setCustom(''); setP(f => ({ ...f, label: preset.label, emoji: preset.emoji })) }
  }
  const isOtra = !LABEL_PRESETS.slice(0, 4).some(l => l.label === p.label)
  const pinListo = p.lat != null && p.lng != null && (p.pinFuente === 'mapa' || p.pinFuente === 'google' || p.pinFuente === 'photon')

  const handleSave = async () => {
    const errs = []
    if (!p.label.trim())          errs.push('Ponle un nombre a la dirección (Casa, Trabajo…)')
    if (p.texto.trim().length < 5) errs.push('Escribe tu dirección, por ejemplo: Calle 44B #70A-23')
    if (errs.length) { setErrors(errs); return }
    setErrors([])
    // Todavía no se ha ubicado: se busca aquí mismo y se sigue si Google la dio exacta.
    if (!pinListo) {
      setSaving(true)
      const lista = await buscar()
      setSaving(false)
      const l = lista?.[0]
      if (!(lista?.length === 1 || (l && PRECISAS.includes(l.precision)))) {
        setErrors([lista?.length ? 'Elige cuál de estas es tu dirección.' : 'No encontramos esa dirección. Lleva el pin del mapa hasta tu casa y guarda.'])
        return
      }
      // Dio exacta: se guarda con ese pin (elegir() ya lo puso en el estado).
      return onSave(armar({ ...p, lat: l.lat, lng: l.lng, pinFuente: 'google', pinPrecision: l.precision, barrio: p.barrio || barrioDeGoogle(l.direccion) }))
    }
    // Pin de Google aproximado (la cuadra o el barrio) y el cliente no lo movió:
    // se le pide una vez que lo ponga en su puerta. De ahí sale el precio del domicilio.
    if (p.pinFuente === 'google' && !PRECISAS.includes(p.pinPrecision) && !yaAviseImpreciso) {
      setYaAviseImpreciso(true)
      setShowMap(true)
      setErrors(['Encontramos la zona pero no la casa exacta. Mueve el pin hasta tu puerta y vuelve a guardar.'])
      return
    }
    onSave(armar(p))
  }

  const armar = (q) => ({
    ...q,
    id:        q.id || `pl_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    label:     (isOtra ? (customLabel || q.label) : q.label).trim(),
    texto:     q.texto.trim(),
    formatted: q.texto.trim(),
    // La dirección ahora es el texto: la nomenclatura por partes deja de mandar.
    tipoVia: '', viaNum: '', viaLetra: '', viaOrient: '', cruceNum: '', cruceLetra: '', placa: '',
    lat: q.lat ?? null, lng: q.lng ?? null,
    pinFuente: q.pinFuente ?? null, pinPrecision: q.pinPrecision ?? null,
  })

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-coal/50 backdrop-blur-sm animate-fade-in"
      onClick={e => { if (e.target === e.currentTarget) onCancel() }}>
      <div className="bg-cream w-full max-w-lg rounded-t-3xl sm:rounded-3xl max-h-[92dvh] overflow-y-auto scroll-custom animate-sheet-up sm:animate-scale-in">
        <div className="sticky top-0 z-10 bg-cream/95 backdrop-blur-sm flex items-center justify-between px-5 py-4 border-b border-coal/10">
          <p className="font-display text-xl text-coal tracking-wide">{initial ? 'Editar dirección' : 'Nueva dirección'}</p>
          <button type="button" onClick={onCancel} className="btn-icon" aria-label="Cerrar"><X size={20} aria-hidden="true" /></button>
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
                    className={`btn btn-sm border ${active ? 'bg-cherry text-cream border-cherry' : 'bg-white text-coal/70 border-coal/15'}`}>
                    <preset.icon size={15} aria-hidden="true" /> {preset.label}
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

          {/* Dirección: un solo campo */}
          <div>
            <label className="label-field" htmlFor="dir-texto">Dirección</label>
            <div className="flex gap-2">
              <input id="dir-texto" className="input-field flex-1" value={p.texto} autoComplete="street-address" enterKeyHint="search"
                onChange={e => setTexto(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); buscar() } }}
                placeholder="Calle 44B #70A-23" />
              <button type="button" onClick={buscar} disabled={buscando || p.texto.trim().length < 5}
                className="btn-primary px-4 flex-shrink-0" aria-label="Buscar la dirección">
                {buscando ? <span className="font-body text-sm">…</span> : <Search size={18} aria-hidden="true" />}
              </button>
            </div>
            <p className="font-body text-[11px] text-coal/50 mt-1">Escríbela como la dices y la buscamos en el mapa.</p>
          </div>

          {/* Varias coincidencias: que elija */}
          {opciones && opciones.length > 1 && (
            <div className="flex flex-col gap-1.5">
              <p className="font-body text-xs font-semibold text-coal/70">¿Cuál es la tuya?</p>
              {opciones.map((l, i) => (
                <button key={i} type="button" onClick={() => elegir(l)}
                  className="text-left card-quiet py-2.5 px-3 flex items-start gap-2 [@media(hover:hover)]:hover:border-cherry/40">
                  <MapPin size={15} className="text-cherry flex-shrink-0 mt-0.5" aria-hidden="true" />
                  <span className="min-w-0">
                    <span className="block font-body text-sm text-coal">{l.nombre ? `${l.nombre} · ` : ''}{l.direccion}</span>
                    <span className="block font-body text-[11px] text-coal/50">{PRECISION_TEXTO[l.precision] || 'Aproximada'}</span>
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* Google no la encontró */}
          {opciones && opciones.length === 0 && (
            <p className="font-body text-xs text-coal/70 bg-mustard/10 border border-mustard/30 rounded-xl px-3 py-2">
              No encontramos esa dirección. No pasa nada: lleva el pin del mapa hasta tu casa.
            </p>
          )}

          {/* Mapa para afinar el pin */}
          {showMap ? (
            <div className="flex flex-col gap-1.5">
              <p className="font-body text-[11px] text-coal/55">Arrastra el pin (o toca el mapa) hasta tu puerta.</p>
              <Suspense fallback={<div className="h-[220px] rounded-xl bg-coal/5 flex items-center justify-center font-body text-xs text-coal/40">Cargando mapa…</div>}>
                <MapPicker key={`${p.lat}-${p.lng}-${p.pinFuente === 'mapa' ? 'm' : 'g'}`.replace(/\.\d{4,}/g, (x) => x.slice(0, 5))}
                  initialLat={p.lat} initialLng={p.lng}
                  onChange={(lat, lng) => setP(f => ({ ...f, lat, lng, pinFuente: 'mapa', pinPrecision: null }))} />
              </Suspense>
              <p className={`font-body text-[11px] flex items-center gap-1 ${p.pinFuente === 'mapa' || PRECISAS.includes(p.pinPrecision) ? 'text-mint' : 'text-coal/55'}`}>
                {p.pinFuente === 'mapa'
                  ? <><Check size={12} aria-hidden="true" /> Pin puesto por ti: el domiciliario llega justo aquí.</>
                  : PRECISAS.includes(p.pinPrecision)
                    ? <><Check size={12} aria-hidden="true" /> {PRECISION_TEXTO[p.pinPrecision] || 'Ubicada'}. Si no es tu puerta, mueve el pin.</>
                    : 'Pin aproximado: muévelo hasta tu casa.'}
              </p>
            </div>
          ) : (
            <button type="button" onClick={ubicarAMano} className="btn-link text-xs self-start">
              <MapPin size={13} aria-hidden="true" /> Prefiero ubicarla yo en el mapa
            </button>
          )}

          {/* Lo que sí ayuda al domiciliario, opcional y corto */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="label-field" htmlFor="dir-compl">Apto, torre, casa <span className="text-[10px] text-coal/40 normal-case font-normal">(opcional)</span></label>
              <input id="dir-compl" className="input-field" value={p.complemento}
                onChange={e => set('complemento', e.target.value)} placeholder="Apto 502, Torre 3" autoComplete="off" />
            </div>
            <div>
              <label className="label-field" htmlFor="dir-ref">Indicaciones <span className="text-[10px] text-coal/40 normal-case font-normal">(opcional)</span></label>
              <input id="dir-ref" className="input-field" value={p.referencia}
                onChange={e => set('referencia', e.target.value)} placeholder="Portón verde, timbre 2B" autoComplete="off" />
            </div>
          </div>

          {/* Vista previa */}
          {p.texto.trim() && (
            <div className="bg-mint/10 border border-mint/30 rounded-xl px-4 py-3">
              <p className="font-body text-[10px] text-coal/40 uppercase tracking-wider mb-0.5">Así queda tu dirección</p>
              <p className="font-body text-sm font-semibold text-coal">
                {p.texto.trim()}{p.complemento?.trim() ? `, ${p.complemento.trim()}` : ''}
              </p>
              {p.barrio && <p className="font-body text-xs text-coal/50">{p.barrio}</p>}
            </div>
          )}

          {aviso && (
            <div className="bg-mustard/10 border border-mustard/40 rounded-xl px-3 py-2.5">
              <p className="font-body text-xs text-coal/80 leading-relaxed">{aviso}</p>
              {onDejarComoEstaba && (
                <button type="button" onClick={onDejarComoEstaba} className="btn-link text-xs">
                  El pin anterior estaba bien, déjalo así
                </button>
              )}
            </div>
          )}

          {errors.length > 0 && (
            <div className="bg-pepper/10 border border-pepper/30 rounded-xl p-3 flex flex-col gap-1.5">
              {errors.map(e => (
                <p key={e} className="font-body text-xs text-pepper flex items-start gap-1.5">
                  <AlertCircle size={13} className="flex-shrink-0 mt-0.5" aria-hidden="true" /> {e}
                </p>
              ))}
            </div>
          )}

          <div className="flex flex-col gap-2 pt-1">
            <button type="button" onClick={handleSave} disabled={saving || buscando} className="btn-primary w-full btn-lg">
              {saving ? 'Ubicando…' : <><Check size={18} aria-hidden="true" /> Guardar dirección</>}
            </button>
            <button type="button" onClick={onCancel} className="btn-ghost w-full">Cancelar</button>
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
// `elegirFavorita`: al empezar un pedido sin dirección, se elige sola la favorita
// (26 oct 2026, igual que la app).
export default function AddressBook({ user, sede, currentAddress, onSelect, elegirFavorita = false }) {
  const [places,   setPlaces]   = useState([])
  const [loaded,   setLoaded]   = useState(false)
  const [builder,  setBuilder]  = useState(null) // { mode:'new'|'edit', place, revisar? }
  const [revisando, setRevisando] = useState(null) // id de la dirección que se está verificando

  const uid   = user?.uid
  const canSave = !!uid   // el login anónimo también tiene uid → guarda igual

  const seleccionar = (p) => {
    onSelect({
      fullAddress: fullAddressOf(p),
      barrio:      p.barrio || '',
      reference:   p.referencia || '',
      lat:         p.lat ?? null,
      lng:         p.lng ?? null,
      pinFuente:   p.pinFuente ?? null,
    })
  }

  useEffect(() => {
    if (!uid) { setLoaded(true); return }
    getDoc(doc(db, 'customers', uid)).then(snap => {
      const list = snap.exists() ? (snap.data().savedPlaces || []) : []
      const lugares = Array.isArray(list) ? list : []
      setPlaces(lugares)
      // Sin dirección todavía: la favorita (si ya está verificada en el mapa).
      const fav = lugares.find(x => x.favorita)
      if (elegirFavorita && !currentAddress && fav && fav.lat != null && fav.pinFuente) seleccionar(fav)
    }).catch(() => {}).finally(() => setLoaded(true))
  }, [uid]) // eslint-disable-line react-hooks/exhaustive-deps -- solo al cargar las direcciones

  const persist = async (next) => {
    setPlaces(next)
    if (!canSave) return
    try {
      await setDoc(doc(db, 'customers', uid), { savedPlaces: next, updatedAt: serverTimestamp() }, { merge: true })
    } catch (_) {}
  }

  const reemplazar = (place) => persist(places.some(x => x.id === place.id)
    ? places.map(x => x.id === place.id ? place : x)
    : [...places, place])

  // Direcciones guardadas antes del 2026-10-09 no dicen de dónde salió su pin
  // (muchos los puso Photon en la mitad de la calle; la auditoría encontró 179
  // de 398 a más de 200 m). Al elegirla se vuelve a ubicar con Google: si
  // queda cerca se marca como verificada sin molestar; si no, se le muestra el
  // mapa con el punto nuevo para que el cliente confirme. Nunca se cambia sola.
  const selectPlace = async (p) => {
    // Las muy viejas (sin calle/número por separado) no se pueden armar ni
    // editar con el formulario: se usan como están.
    if (p.pinFuente || revisando || !textoDireccion(p)) { seleccionar(p); return }
    setRevisando(p.id)
    const base = p.viaNum ? geocodeQuery(p) : textoDireccion(p)
    const q = `${base}, ${p.barrio ? p.barrio + ', ' : ''}Medellín, Colombia`
    const google = await ubicarDireccion(q, p.referencia?.trim())
    setRevisando(null)
    const g = google?.[0]
    if (!g || !PRECISAS.includes(g.precision)) { seleccionar(p); return }
    const tienePin = p.lat != null && p.lng != null
    const metros = tienePin ? Math.round(kmLineaRecta({ lat: Number(p.lat), lng: Number(p.lng) }, g) * 1000) : null
    if (tienePin && metros <= 200) {
      const verificada = { ...p, pinFuente: 'google', pinPrecision: g.precision }
      reemplazar(verificada)
      seleccionar(verificada)
      return
    }
    setBuilder({
      mode: 'edit',
      place: { ...p, lat: g.lat, lng: g.lng, pinFuente: 'google', pinPrecision: g.precision },
      revisar: { anterior: p, metros },
    })
  }

  const handleSaved = async (place) => {
    // La primera dirección que se guarda queda como favorita (igual que la app).
    if (!places.length) place = { ...place, favorita: true }
    await reemplazar(place)
    setBuilder(null)
    seleccionar(place)   // seleccionar automáticamente la recién guardada
  }

  // El cliente dice que el pin viejo estaba bien: se respeta y no se vuelve a preguntar.
  const dejarComoEstaba = async () => {
    const anterior = { ...builder.revisar.anterior, pinFuente: 'mapa' }
    await reemplazar(anterior)
    setBuilder(null)
    seleccionar(anterior)
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
  const hacerFavorita = (p, e) => { e.stopPropagation(); persist(marcarFavorita(places, p.id)) }

  return (
    <div className="flex flex-col gap-2">
      <label className="label-field">Dirección de entrega *</label>

      {loaded && places.length === 0 && (
        <p className="font-body text-xs text-coal/45">
          Aún no tienes direcciones guardadas. Escribe la tuya y la ubicamos en el mapa.
        </p>
      )}

      {ordenarLugares(places).map(p => (
        <button key={p.id} type="button" onClick={() => selectPlace(p)}
          className={`text-left rounded-2xl px-4 py-3 border transition-colors flex items-start gap-3 ${isSelected(p) ? 'border-cherry bg-cherry/5' : 'border-coal/12 bg-white hover:border-cherry/40'}`}>
          {(() => { const IconoEtiqueta = iconoDeEtiqueta(p.label)
            return <IconoEtiqueta size={18} className="text-cherry flex-shrink-0 mt-0.5" aria-hidden="true" /> })()}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="font-body font-semibold text-sm text-coal">{p.label}</p>
              {p.favorita && (
                <span className="inline-flex items-center gap-1 rounded-full bg-mint/15 px-2 py-0.5 font-body text-[10px] font-bold text-[#12766B]">
                  <Star size={10} fill="currentColor" aria-hidden="true" /> Favorita
                </span>
              )}
              {isSelected(p) && <Check size={14} className="text-cherry" />}
            </div>
            <p className="font-body text-xs text-coal/60 truncate">{fullAddressOf(p)}</p>
            {p.barrio && <p className="font-body text-[11px] text-coal/40">{p.barrio}{p.lat != null ? ' · ubicada en el mapa' : ''}</p>}
            {revisando === p.id && <p className="font-body text-[11px] text-tangelo">Verificando la ubicación…</p>}
          </div>
          <span className="flex items-center gap-1 flex-shrink-0">
            {!p.favorita && (
              <span onClick={e => hacerFavorita(p, e)} role="button" aria-label={`Marcar ${p.label} como favorita`}
                className="p-1.5 rounded-lg text-coal/40 hover:text-[#12766B] hover:bg-mint/10" title="Marcar como favorita">
                <Star size={14} />
              </span>
            )}
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
          aviso={builder.revisar
            ? (builder.revisar.metros === null
                ? 'Ubicamos tu dirección en el mapa. Revisa que el pin esté en tu casa (muévelo si hace falta) y guarda.'
                : `Mejoramos nuestro mapa y tu dirección quedó a ${builder.revisar.metros >= 1000 ? (builder.revisar.metros / 1000).toFixed(1) + ' km' : builder.revisar.metros + ' m'} de donde la tenías. ¿Tu casa está aquí? Mueve el pin si hace falta y guarda.`)
            : null}
          onDejarComoEstaba={builder.revisar?.anterior?.lat != null ? dejarComoEstaba : null}
        />
      )}
    </div>
  )
}
