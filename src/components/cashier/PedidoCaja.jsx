import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, Plus, Minus, Trash2, Pencil, Store, Bike, Check, Copy, MapPin } from 'lucide-react'
import { llamarPedidos, nuevaClave, ErrorApi } from '../../services/pedidosApi'
import { ubicarDireccion, medirRecorrido } from '../../services/recorrido'
import { precioDomicilio, RECORRIDO } from '../../utils/tarifaDomicilio'
import { SEDES } from '../../services/roles'
import useAgotados from '../../hooks/useAgotados'
import { opcionesCatalogo, vendibles, seleccionInicial, precioUnidad, faltantes, itemApi, resumenItem } from '../../utils/catalogoCaja'
import { LogoPago, LogoWhatsApp } from '../common/LogosApps'

// Pedido de la caja desde el catálogo (especificación §10.1). Presencial, por
// teléfono o por WhatsApp, sin cuenta del comprador. Los productos se arman con
// las mismas opciones que el menú del cliente y el servidor los cobra con los
// precios del menú; aquí solo se muestra el total estimado.

const pesos = (n) => `$${Math.round(Number(n) || 0).toLocaleString('es-CO')}`
const soloDigitos = (v) => String(v || '').replace(/[^\d]/g, '')
const CANALES = [{ id: 'presencial', texto: 'En la sede' }, { id: 'telefono', texto: 'Teléfono' }, { id: 'whatsapp', texto: 'WhatsApp' }]
const METODOS = ['Efectivo', 'Transferencia', 'Nequi', 'Mixto']

function Chip({ activo, onClick, children, disabled }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      className={`rounded-full px-3 py-1.5 font-body text-xs font-semibold transition-colors disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cherry/40 ${
        activo ? 'bg-coal text-cream' : 'bg-coal/5 text-coal/70 hover:bg-coal/10'}`}>
      {children}
    </button>
  )
}

const alternar = (lista, id) => (lista.includes(id) ? lista.filter((x) => x !== id) : [...lista, id])

// Ficha para armar un producto: las opciones que dice el servidor (reglas.ficha).
function FichaCaja({ p, selInicial, opciones, onListo, onCancelar }) {
  const [sel, setSel] = useState(selInicial)
  const ficha = p.reglas?.ficha || {}
  const promo = p.reglas?.promo
  const falta = faltantes(p, sel)
  const set = (k, v) => setSel((s) => ({ ...s, [k]: v }))
  const setUnidad = (i, k, v) => setSel((s) => ({ ...s, unidades: s.unidades.map((u, j) => (j === i ? { ...u, [k]: v } : u)) }))
  const precio = precioUnidad(p, sel, opciones.adiciones)
  return (
    <div className="rounded-2xl border-2 border-cherry/30 bg-white p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <p className="font-display text-lg tracking-wide text-coal leading-tight">{p.nombre_producto}</p>
        <span className="font-display text-lg text-cherry tabular">{pesos(precio * sel.cantidad)}</span>
      </div>
      {p.presentations?.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {p.presentations.map((x) => (
            <Chip key={x.id_presentacion} activo={sel.idPresentacion === x.id_presentacion} onClick={() => set('idPresentacion', x.id_presentacion)}>
              {[x.sabor, x.tamano].filter(Boolean).join(' ')} · {pesos(x.precio_venta)}
            </Chip>
          ))}
        </div>
      )}
      {ficha.opcion && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-body text-xs text-coal/60">{ficha.opcion.titulo || 'Opción'}:</span>
          {ficha.opcion.items.map((o) => <Chip key={o} activo={sel.opcion === o} onClick={() => set('opcion', o)}>{o}</Chip>)}
        </div>
      )}
      {ficha.bebidaCombo && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-body text-xs text-coal/60">Bebida:</span>
          {ficha.bebidaCombo.map((b) => <Chip key={b} activo={sel.bebida === b} onClick={() => set('bebida', b)}>{b}</Chip>)}
        </div>
      )}
      {promo && sel.unidades.map((u, i) => (
        <div key={i} className="rounded-xl bg-coal/5 p-2.5 flex flex-col gap-1.5">
          <p className="font-body text-xs font-semibold text-coal/70">{promo.unidad} {i + 1}</p>
          <div className="flex flex-wrap gap-1.5">{promo.bebidas.map((b) => <Chip key={b} activo={u.bebida === b} onClick={() => setUnidad(i, 'bebida', b)}>{b}</Chip>)}</div>
          <div className="flex flex-wrap gap-1.5">
            {opciones.salsas.map((s) => <Chip key={s.id_producto} activo={u.salsas.includes(s.id_producto)} onClick={() => setUnidad(i, 'salsas', alternar(u.salsas, s.id_producto))}>{s.nombre_producto}</Chip>)}
            {opciones.cebollas.map((c) => <Chip key={c.id_producto} activo={u.cebollas.includes(c.id_producto)} onClick={() => setUnidad(i, 'cebollas', alternar(u.cebollas, c.id_producto))}>{c.nombre_producto}</Chip>)}
          </div>
        </div>
      ))}
      {ficha.admiteAdiciones && opciones.adiciones.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="font-body text-xs text-coal/60">Adiciones:</span>
          {opciones.adiciones.map((a) => {
            const n = sel.adiciones[a.id_producto] || 0
            return (
              <div key={a.id_producto} className="flex items-center gap-2">
                <span className="flex-1 font-body text-sm text-coal/80">{a.nombre_producto} <span className="text-coal/45">+{pesos(a.precio_venta)}</span></span>
                <button type="button" className="btn-icon h-8 w-8 min-w-8" disabled={!n} onClick={() => set('adiciones', { ...sel.adiciones, [a.id_producto]: n - 1 })} aria-label="Quitar"><Minus size={14} /></button>
                <span className="w-5 text-center font-body text-sm tabular">{n}</span>
                <button type="button" className="btn-icon h-8 w-8 min-w-8" disabled={n >= 5} onClick={() => set('adiciones', { ...sel.adiciones, [a.id_producto]: n + 1 })} aria-label="Agregar"><Plus size={14} /></button>
              </div>
            )
          })}
        </div>
      )}
      {!promo && ficha.admiteSalsas && (opciones.salsas.length + opciones.cebollas.length) > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-body text-xs text-coal/60">Salsas y cebolla:</span>
          {opciones.salsas.map((s) => <Chip key={s.id_producto} activo={sel.salsas.includes(s.id_producto)} onClick={() => set('salsas', alternar(sel.salsas, s.id_producto))}>{s.nombre_producto}</Chip>)}
          {opciones.cebollas.map((c) => <Chip key={c.id_producto} activo={sel.cebollas.includes(c.id_producto)} onClick={() => set('cebollas', alternar(sel.cebollas, c.id_producto))}>{c.nombre_producto}</Chip>)}
        </div>
      )}
      <input className="input-field text-sm" value={sel.nota} maxLength={250} onChange={(e) => set('nota', e.target.value)} placeholder="Comentario para la cocina (opcional)" />
      <div className="flex items-center gap-2">
        <button type="button" className="btn-icon" disabled={sel.cantidad <= 1} onClick={() => set('cantidad', sel.cantidad - 1)} aria-label="Menos"><Minus size={16} /></button>
        <span className="w-6 text-center font-display text-lg tabular">{sel.cantidad}</span>
        <button type="button" className="btn-icon" disabled={sel.cantidad >= 20} onClick={() => set('cantidad', sel.cantidad + 1)} aria-label="Más"><Plus size={16} /></button>
        <button type="button" onClick={onCancelar} className="btn-secondary btn-sm ml-auto">Cancelar</button>
        <button type="button" onClick={() => onListo(sel)} disabled={falta.length > 0} className="btn-primary btn-sm" title={falta.join('. ')}>
          <Check size={15} aria-hidden="true" /> Listo
        </button>
      </div>
      {falta.length > 0 && <p className="font-body text-xs text-pepper">{falta.join('. ')}</p>}
    </div>
  )
}

export default function PedidoCaja({ sede, onCancel, onCreado }) {
  // Administración con «ambas sedes» elige aquí la sede del pedido.
  const sedeFija = !!SEDES[sede?.id]
  const [sedeId, setSedeId] = useState(sedeFija ? sede.id : 'santa_lucia')
  const sedeInfo = SEDES[sedeId] || null
  const { ids: agotados } = useAgotados(sedeId)
  const [productos, setProductos] = useState(null)
  const [busca, setBusca] = useState('')
  const [lineas, setLineas] = useState([])          // [{ key, p, sel }]
  const [editando, setEditando] = useState(null)    // { p, sel, idx }
  const [cliente, setCliente] = useState({ nombre: '', telefono: '' })
  const [canal, setCanal] = useState('presencial')
  const [modo, setModo] = useState('pickup')
  const [dir, setDir] = useState({ texto: '', barrio: '', referencia: '' })
  const [lugares, setLugares] = useState([])
  const [punto, setPunto] = useState(null)
  const [tarifa, setTarifa] = useState(null)        // { estado, precio, km }
  const [domicilio, setDomicilio] = useState('')    // lo que escribe la caja
  const [buscandoDir, setBuscandoDir] = useState(false)
  const [notas, setNotas] = useState('')
  const [pago, setPago] = useState({ metodo: 'Efectivo', billete: '', mixtoEfectivo: '', mixtoTransferencia: '' })
  const [errores, setErrores] = useState([])
  const [enviando, setEnviando] = useState(false)
  const [creado, setCreado] = useState(null)
  const clave = useRef(nuevaClave())                // un reintento no crea el pedido dos veces

  useEffect(() => {
    let vivo = true
    fetch('/api/v1/products').then((r) => r.json())
      .then((d) => { if (vivo) setProductos(d?.data || d || []) })
      .catch(() => { if (vivo) setErrores(['No se pudo cargar el menú. Revisa la conexión.']) })
    return () => { vivo = false }
  }, [])

  const opciones = useMemo(() => opcionesCatalogo(productos, agotados), [productos, agotados])
  const nombres = useMemo(() => Object.fromEntries((productos || []).map((p) => [p.id_producto, p.nombre_producto])), [productos])
  const lista = useMemo(() => {
    const t = busca.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    return vendibles(productos, sedeId).filter((p) => !t || p.nombre_producto.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').includes(t))
  }, [productos, busca, sedeId])

  const subtotal = lineas.reduce((t, l) => t + precioUnidad(l.p, l.sel, opciones.adiciones) * l.sel.cantidad, 0)
  const valorDomicilio = modo === 'delivery' ? (domicilio !== '' ? Number(domicilio) : (tarifa?.estado === 'ok' ? tarifa.precio : null)) : 0
  const total = valorDomicilio == null ? null : subtotal + valorDomicilio
  const parteEfectivo = pago.metodo === 'Efectivo' ? total : Number(pago.mixtoEfectivo) || 0
  const cambio = pago.billete !== '' && total != null ? Number(pago.billete) - parteEfectivo : null

  const buscarDireccion = async () => {
    if (!dir.texto.trim()) return
    setBuscandoDir(true); setLugares([])
    setLugares((await ubicarDireccion(dir.texto.trim())) || [])
    setBuscandoDir(false)
  }
  const elegirLugar = async (l) => {
    setDir((d) => ({ ...d, texto: l.direccion })); setLugares([])
    const pt = { lat: l.lat, lng: l.lng }
    setPunto(pt); setTarifa({ estado: 'midiendo' })
    const km = sedeInfo?.coords ? await medirRecorrido(sedeInfo.coords, pt) : null
    setTarifa({ ...precioDomicilio(km, RECORRIDO), km })
  }

  const guardarLinea = (sel) => {
    setLineas((ls) => (editando.idx != null
      ? ls.map((l, i) => (i === editando.idx ? { ...l, sel } : l))
      : [...ls, { key: `${editando.p.id_producto}-${Date.now()}`, p: editando.p, sel }]))
    setEditando(null)
  }

  const crear = async () => {
    const errs = []
    if (!cliente.nombre.trim()) errs.push('Escribe el nombre del cliente')
    if (soloDigitos(cliente.telefono).replace(/^57/, '').length !== 10) errs.push('El teléfono debe tener 10 dígitos')
    if (!lineas.length) errs.push('Agrega al menos un producto')
    if (modo === 'delivery' && dir.texto.trim().length < 5) errs.push('Escribe la dirección de entrega')
    if (modo === 'delivery' && valorDomicilio == null) errs.push('Ubica la dirección en el buscador o escribe el valor del domicilio')
    if (pago.metodo === 'Mixto' && total != null && (Number(pago.mixtoEfectivo) || 0) + (Number(pago.mixtoTransferencia) || 0) !== total) {
      errs.push(`Efectivo + transferencia debe sumar ${pesos(total)}`)
    }
    if (cambio != null && cambio < 0) errs.push('El billete no alcanza')
    const agot = lineas.filter((l) => agotados.has(l.p.id_producto)).map((l) => l.p.nombre_producto)
    if (agot.length) errs.push(`Se agotó: ${agot.join(', ')}. Quítalo del pedido`)
    setErrores(errs)
    if (errs.length) return
    setEnviando(true)
    try {
      const r = await llamarPedidos('caja', {
        sedeId, canal, deliveryMode: modo,
        nombre: cliente.nombre.trim(), telefono: cliente.telefono.trim(),
        ...(modo === 'delivery' ? {
          direccion: dir.texto.trim(), barrio: dir.barrio.trim(), referencia: dir.referencia.trim(),
          ...(punto ? { coords: punto } : {}),
          ...(domicilio !== '' || !punto ? { deliveryPrice: Number(domicilio) || 0 } : {}),
        } : {}),
        items: lineas.map((l) => itemApi(l.p, l.sel)),
        notas: notas.trim(),
        pago: {
          metodo: pago.metodo,
          ...(pago.billete !== '' ? { billete: Number(pago.billete) } : {}),
          ...(pago.metodo === 'Mixto' ? { mixtoEfectivo: Number(pago.mixtoEfectivo), mixtoTransferencia: Number(pago.mixtoTransferencia) } : {}),
        },
      }, clave.current)
      setCreado(r)
      onCreado?.(r)
    } catch (err) {
      setErrores([err instanceof ErrorApi ? err.message : 'No se pudo crear el pedido. Revisa la conexión e intenta de nuevo.'])
    } finally { setEnviando(false) }
  }

  if (creado) {
    return (
      <div className="flex flex-col items-center gap-3 py-4 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-mint/15 text-mint"><Check size={28} aria-hidden="true" /></div>
        <p className="font-display text-2xl tracking-wide text-coal">Pedido #{creado.orderNumber} creado</p>
        <p className="font-body text-sm text-coal/70">
          Total {pesos(creado.total)} · {modo === 'pickup' ? 'Recoge en la sede' : creado.domiciliario ? `Lo lleva ${creado.domiciliario}` : 'Queda por asignar domiciliario'}
        </p>
        {creado.codigo && (
          <div className="w-full rounded-2xl bg-white border border-coal/10 p-4">
            <p className="font-body text-xs text-coal/60">Código para que el cliente siga su pedido</p>
            <p className="font-display text-3xl tracking-[0.2em] text-cherry select-all">{creado.codigo}</p>
            <button type="button" className="btn-secondary btn-sm mt-2" onClick={() => navigator.clipboard?.writeText(creado.codigo).catch(() => {})}>
              <Copy size={14} aria-hidden="true" /> Copiar
            </button>
          </div>
        )}
        <button type="button" onClick={onCancel} className="btn-primary w-full">Listo</button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      {/* 1. Cliente */}
      <section className="flex flex-col gap-2">
        {!sedeFija && (
          <div className="flex flex-wrap gap-1.5">
            {Object.values(SEDES).map((x) => <Chip key={x.id} activo={sedeId === x.id} onClick={() => { setSedeId(x.id); setTarifa(null); setPunto(null) }}>{x.name}</Chip>)}
          </div>
        )}
        <div className="flex flex-wrap gap-1.5">
          {CANALES.map((c) => <Chip key={c.id} activo={canal === c.id} onClick={() => setCanal(c.id)}><span className="inline-flex items-center gap-1.5">{c.id === 'whatsapp' && <LogoWhatsApp size={14} />}{c.texto}</span></Chip>)}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <input className="input-field text-sm" value={cliente.nombre} onChange={(e) => setCliente((c) => ({ ...c, nombre: e.target.value }))} placeholder="Nombre del cliente" />
          <input className="input-field text-sm" inputMode="tel" value={cliente.telefono} onChange={(e) => setCliente((c) => ({ ...c, telefono: e.target.value }))} placeholder="Celular (10 dígitos)" />
        </div>
      </section>

      {/* 2. Productos */}
      <section className="flex flex-col gap-2">
        <p className="label-field mb-0">Productos</p>
        {lineas.map((l, i) => (
          <div key={l.key} className={`rounded-xl border px-3 py-2 flex items-start gap-2 ${agotados.has(l.p.id_producto) ? 'border-pepper/40 bg-pepper/5' : 'border-coal/10 bg-white'}`}>
            <div className="flex-1 min-w-0">
              <p className="font-body text-sm font-semibold text-coal">{l.sel.cantidad}× {l.p.nombre_producto}</p>
              {resumenItem(l.p, l.sel, nombres) && <p className="font-body text-xs text-coal/60">{resumenItem(l.p, l.sel, nombres)}</p>}
              {agotados.has(l.p.id_producto) && <p className="font-body text-xs font-semibold text-pepper">Se agotó en esta sede</p>}
            </div>
            <span className="font-body text-sm text-coal tabular">{pesos(precioUnidad(l.p, l.sel, opciones.adiciones) * l.sel.cantidad)}</span>
            <button type="button" className="btn-icon h-8 w-8 min-w-8" onClick={() => setEditando({ p: l.p, sel: l.sel, idx: i })} aria-label="Editar"><Pencil size={14} /></button>
            <button type="button" className="btn-icon h-8 w-8 min-w-8 hover:text-pepper" onClick={() => setLineas((ls) => ls.filter((_, j) => j !== i))} aria-label="Quitar"><Trash2 size={14} /></button>
          </div>
        ))}
        {editando ? (
          <FichaCaja key={`${editando.p.id_producto}-${editando.idx}`} p={editando.p} selInicial={editando.sel} opciones={opciones}
            onListo={guardarLinea} onCancelar={() => setEditando(null)} />
        ) : (
          <div className="rounded-2xl border border-coal/10 bg-white">
            <label className="relative block border-b border-coal/10">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-coal/40" aria-hidden="true" />
              <input className="w-full bg-transparent py-2.5 pl-9 pr-3 font-body text-sm outline-none" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar en el menú" />
            </label>
            <ul className="max-h-56 overflow-y-auto scroll-custom divide-y divide-coal/5">
              {!productos && <li className="px-3 py-4 text-center font-body text-sm text-coal/50">Cargando el menú…</li>}
              {lista.map((p) => {
                const agotado = agotados.has(p.id_producto)
                const desde = p.presentations?.length ? Math.min(...p.presentations.map((x) => Number(x.precio_venta))) : Number(p.precio_venta)
                return (
                  <li key={p.id_producto}>
                    <button type="button" disabled={agotado} onClick={() => setEditando({ p, sel: seleccionInicial(p), idx: null })}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-coal/[0.03] disabled:opacity-50">
                      <span className="flex-1 font-body text-sm text-coal">{p.nombre_producto}</span>
                      {agotado ? <span className="font-body text-xs font-semibold text-pepper">Agotado</span>
                        : <span className="font-body text-xs text-coal/55 tabular">{p.presentations?.length ? 'desde ' : ''}{pesos(desde)}</span>}
                      {!agotado && <Plus size={15} className="text-cherry" aria-hidden="true" />}
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        )}
      </section>

      {/* 3. Entrega */}
      <section className="flex flex-col gap-2">
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => setModo('pickup')} className={`rounded-xl px-3 py-2.5 font-body text-sm font-semibold flex items-center justify-center gap-2 ${modo === 'pickup' ? 'bg-coal text-cream' : 'bg-coal/5 text-coal/70'}`}><Store size={16} aria-hidden="true" /> Recoge en la sede</button>
          <button type="button" onClick={() => setModo('delivery')} className={`rounded-xl px-3 py-2.5 font-body text-sm font-semibold flex items-center justify-center gap-2 ${modo === 'delivery' ? 'bg-coal text-cream' : 'bg-coal/5 text-coal/70'}`}><Bike size={16} aria-hidden="true" /> Domicilio</button>
        </div>
        {modo === 'delivery' && (
          <div className="flex flex-col gap-2">
            <div className="flex gap-2">
              <input className="input-field flex-1 text-sm" value={dir.texto} placeholder="Dirección (ej. Cl 35B #87A-20)"
                onChange={(e) => { setDir((d) => ({ ...d, texto: e.target.value })); setPunto(null); setTarifa(null) }}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); buscarDireccion() } }} />
              <button type="button" onClick={buscarDireccion} disabled={buscandoDir || !dir.texto.trim()} className="btn-secondary btn-sm px-3" aria-label="Buscar dirección">
                {buscandoDir ? '…' : <Search size={15} />}
              </button>
            </div>
            {lugares.map((l, i) => (
              <button key={i} type="button" onClick={() => elegirLugar(l)} className="text-left rounded-lg bg-cherry/5 border border-cherry/10 px-3 py-1.5 font-body text-xs text-cherry/80 hover:bg-cherry/10">
                <MapPin size={12} className="inline -mt-0.5 mr-1" aria-hidden="true" />{l.direccion}
              </button>
            ))}
            <div className="grid grid-cols-2 gap-2">
              <input className="input-field text-sm" value={dir.barrio} onChange={(e) => setDir((d) => ({ ...d, barrio: e.target.value }))} placeholder="Barrio" />
              <input className="input-field text-sm" value={dir.referencia} onChange={(e) => setDir((d) => ({ ...d, referencia: e.target.value }))} placeholder="Apto, torre, referencia" />
            </div>
            <div className="flex items-center gap-2">
              <span className="font-body text-sm text-coal/70 flex-1">
                {tarifa?.estado === 'midiendo' ? 'Calculando el domicilio…'
                  : tarifa?.estado === 'ok' ? `Domicilio por recorrido: ${pesos(tarifa.precio)} (${tarifa.km?.toFixed(1)} km)`
                    : tarifa?.estado === 'fuera_de_rango' ? 'Fuera de cobertura: escribe el valor si igual lo llevan'
                      : punto ? 'No se pudo calcular: escribe el valor' : 'Ubica la dirección o escribe el valor'}
              </span>
              <input className="input-field w-28 text-sm" inputMode="numeric" value={domicilio} onChange={(e) => setDomicilio(soloDigitos(e.target.value))}
                placeholder={tarifa?.estado === 'ok' ? String(tarifa.precio) : 'Valor'} aria-label="Valor del domicilio" />
            </div>
          </div>
        )}
      </section>

      {/* 4. Pago */}
      <section className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-1.5">
          {METODOS.map((m) => <Chip key={m} activo={pago.metodo === m} onClick={() => setPago((p) => ({ ...p, metodo: m }))}><span className="inline-flex items-center gap-1.5"><LogoPago medio={m} size={14} />{m}</span></Chip>)}
        </div>
        {pago.metodo === 'Mixto' && (
          <div className="grid grid-cols-2 gap-2">
            <input className="input-field text-sm" inputMode="numeric" value={pago.mixtoEfectivo} onChange={(e) => setPago((p) => ({ ...p, mixtoEfectivo: soloDigitos(e.target.value) }))} placeholder="Efectivo" />
            <input className="input-field text-sm" inputMode="numeric" value={pago.mixtoTransferencia} onChange={(e) => setPago((p) => ({ ...p, mixtoTransferencia: soloDigitos(e.target.value) }))} placeholder="Transferencia" />
          </div>
        )}
        {(pago.metodo === 'Efectivo' || pago.metodo === 'Mixto') && (
          <div className="flex items-center gap-2">
            <input className="input-field w-48 text-sm" inputMode="numeric" value={pago.billete} onChange={(e) => setPago((p) => ({ ...p, billete: soloDigitos(e.target.value) }))} placeholder="¿Con cuánto paga?" />
            {cambio != null && <span className={`font-body text-sm ${cambio < 0 ? 'text-pepper' : 'text-coal/70'}`}>{cambio < 0 ? 'No alcanza' : `Cambio: ${pesos(cambio)}`}</span>}
          </div>
        )}
        <input className="input-field text-sm" value={notas} maxLength={300} onChange={(e) => setNotas(e.target.value)} placeholder="Indicaciones del pedido (opcional)" />
      </section>

      {/* 5. Total */}
      <div className="rounded-2xl bg-cherry/10 border border-cherry/20 px-4 py-3 flex flex-col gap-0.5">
        <div className="flex justify-between font-body text-sm text-coal/70"><span>Productos</span><span className="tabular">{pesos(subtotal)}</span></div>
        {modo === 'delivery' && <div className="flex justify-between font-body text-sm text-coal/70"><span>Domicilio</span><span className="tabular">{valorDomicilio == null ? '—' : pesos(valorDomicilio)}</span></div>}
        <div className="flex justify-between font-display text-xl text-coal"><span>Total</span><span className="text-cherry tabular">{total == null ? '—' : pesos(total)}</span></div>
        <p className="font-body text-[11px] text-coal/50">El servidor confirma los precios del menú al crear el pedido.</p>
      </div>

      {errores.length > 0 && (
        <div className="rounded-xl bg-pepper/10 border border-pepper/30 p-3 flex flex-col gap-1">
          {errores.map((e) => <p key={e} className="font-body text-xs text-pepper">{e}</p>)}
        </div>
      )}
      <div className="flex gap-2">
        <button type="button" onClick={onCancel} className="btn-secondary flex-1">Cancelar</button>
        <button type="button" onClick={crear} disabled={enviando || !!editando} className="btn-primary flex-1">{enviando ? 'Creando…' : 'Crear pedido'}</button>
      </div>
    </div>
  )
}
