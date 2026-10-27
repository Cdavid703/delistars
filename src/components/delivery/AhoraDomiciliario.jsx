import { useState } from 'react'
import { Phone, CheckCircle, ChevronRight } from 'lucide-react'
import { LogoGoogleMaps, LogoWaze, LogoWhatsApp } from '../common/LogosApps'
import { SEDES } from '../../services/roles'
import { ErrorApi } from '../../services/pedidosApi'
import { geoDelPedido } from '../../utils/cercania'
import {
  cobroDe, estadoCocina, porCobrarTotal, kmDe, minutosParaLlegar, fmt, urlNavegacion, puedeReportar, MAX_EN_REPARTO,
} from '../../utils/reparto'
import useAccionesReparto, { salirConPedido } from './useAccionesReparto'
import { HojaNoEntrega, EstadoNoEntrega } from './NoEntrega'

// Pantallas del domiciliario elegidas por David en la app (26 oct 2026, lienzo
// «F1 · Día crema» y «F · Noche»): antes de salir, los domicilios que le
// esperan con cómo van en la cocina y lo que hay por cobrar; en reparto, la
// parada actual en grande con Google Maps, Waze, Llamar y WhatsApp (íconos a
// todo color) y «Luego» con la siguiente. Los colores salen de las variables
// --d-* que pone el panel según el modo del celular (día o noche).

const C = {
  fondo: 'bg-[var(--d-fondo)]', texto: 'text-[var(--d-texto)]', fuerte: 'text-[var(--d-fuerte)]', sec: 'text-[var(--d-sec)]',
  tarjeta: 'bg-[var(--d-tarjeta)] shadow-[var(--d-sombra)]', borde: 'border-[var(--d-borde)]', ok: 'text-[var(--d-ok)]', warn: 'text-[var(--d-warn)]',
}
const PIE = 'sticky z-30 -mx-4 px-4 pt-3 pb-3 flex flex-col gap-2 bg-[var(--d-fondo)]'
const PIE_ABAJO = { bottom: 'calc(68px + env(safe-area-inset-bottom))' }

function BotonGrande({ texto, onClick, ocupado = false, deshabilitado = false }) {
  return (
    <button onClick={onClick} disabled={ocupado || deshabilitado}
      className="h-16 rounded-2xl bg-[var(--d-cta)] text-[var(--d-cta-texto)] text-[21px] font-black disabled:opacity-50">
      {ocupado ? 'Un momento…' : texto}
    </button>
  )
}

/** Lo que se cobra en la fila de la lista: el monto, «Pagado» o «Por definir». */
function MontoFila({ order }) {
  const c = cobroDe(order)
  if (c.porDefinir) return <span className={`text-sm ${C.sec}`}>Por definir</span>
  if (!c.efectivo) return <span className={`text-base font-extrabold ${C.ok}`}>{c.pendiente ? 'Por verificar' : 'Pagado'}</span>
  return <span className="text-lg font-extrabold tabular-nums">{fmt(c.monto)}</span>
}

const lugarDe = (o) => `${o.barrio || o.fullAddress || 'Sin dirección'}${kmDe(o) ? ` · ${kmDe(o)}` : ''}`
const clienteDe = (o) => o.destinatario?.nombre ? `Para ${o.destinatario.nombre}` : (o.name || 'Cliente')

// ─────────────────────────────────────────────────────────────────────────────

/** Antes de salir: los domicilios que le esperan en la sede (pestaña «Por recoger»). */
export function AntesDeSalir({ pedidos, enReparto, sede, geoCache, onAbrir, alSalir }) {
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState('')
  const listos = pedidos.filter((p) => estadoCocina(p).listo)
  const cupo = Math.max(0, MAX_EN_REPARTO - enReparto)
  const nombreSede = (sede && sede.id !== 'all' && sede.name) || SEDES[pedidos[0]?.sedeId]?.name || 'la sede'

  const salir = async (lista) => {
    setError(''); setOcupado(true)
    const llevar = lista.filter((p) => p.status !== 'assigned').slice(0, cupo)
    try {
      for (const p of llevar) await salirConPedido(p, geoDelPedido(p, geoCache))
      if (llevar.length < lista.length) {
        setError(`Solo caben ${MAX_EN_REPARTO} en reparto: saliste con ${llevar.length}. Entrega uno para llevar los demás.`)
      }
      if (llevar.length) alSalir?.()
    } catch (err) {
      setError(err instanceof ErrorApi ? err.message : 'No se pudo salir con los pedidos. Revisa tu conexión e intenta de nuevo.')
    } finally { setOcupado(false) }
  }
  const salirConTodos = () => {
    if (window.confirm(`Salir con los ${pedidos.length}\n\nAlgunos todavía no están listos en la cocina. ¿Ya te los entregaron?`)) salir(pedidos)
  }

  return (
    <div className="px-4 flex flex-col gap-3">
      <section className="pt-3 flex flex-col gap-1">
        <p className={`text-[15px] font-bold ${C.sec}`}>Te esperan en {nombreSede}</p>
        <p className="flex items-baseline gap-2.5">
          <span className={`text-[64px] leading-none font-black tabular-nums ${C.fuerte}`}>{pedidos.length}</span>
          <span className="text-[22px] font-extrabold">{pedidos.length === 1 ? 'domicilio' : 'domicilios'}</span>
        </p>
        <p className={`text-[17px] ${C.sec}`}>Por cobrar <b className={`tabular-nums ${C.fuerte}`}>{fmt(porCobrarTotal(pedidos))}</b></p>
      </section>

      <div className="flex flex-col gap-2.5 pt-1">
        {pedidos.map((p) => {
          const e = estadoCocina(p)
          return (
            <button key={p.id} onClick={() => onAbrir(p)} aria-label={`Pedido ${p.orderNumber ?? ''}, ${e.texto}`}
              className={`text-left rounded-2xl px-4 py-3.5 min-h-[84px] flex items-center gap-3.5 ${
                e.listo ? C.tarjeta : `border-[1.5px] border-dashed ${C.borde}`}`}>
              <span className={`w-3 self-stretch rounded-md flex-shrink-0 ${e.listo ? 'bg-[#189386]' : 'bg-[#E88F00]'}`} aria-hidden="true" />
              <span className="flex-1 min-w-0 flex flex-col gap-0.5">
                <span className={`text-lg font-extrabold truncate ${C.fuerte}`}>{lugarDe(p)}</span>
                <span className={`text-sm truncate ${C.sec}`}>#{p.orderNumber ?? '—'} · {clienteDe(p)}</span>
                <span className={`text-sm font-bold ${e.listo ? C.ok : C.warn}`}>{e.texto}</span>
              </span>
              <MontoFila order={p} />
            </button>
          )
        })}
        <p className={`text-[13px] flex items-center gap-2 px-1 ${C.sec}`}>
          <span className="w-2.5 h-2.5 rounded-full bg-[#189386]" aria-hidden="true" />listo
          <span className="w-2.5 h-2.5 rounded-full bg-[#E88F00] ml-2" aria-hidden="true" />en cocina
        </p>
      </div>

      {error && <p role="alert" className="rounded-xl bg-cherry/10 border border-cherry/30 px-3 py-2 text-sm font-semibold text-[var(--d-texto)]">{error}</p>}

      <div className={PIE} style={PIE_ABAJO}>
        {listos.length > 0 ? (
          <BotonGrande texto={listos.length === 1 ? 'Salir con el listo' : `Salir con los ${listos.length} listos`}
            onClick={() => salir(listos)} ocupado={ocupado} deshabilitado={cupo === 0} />
        ) : (
          <p className={`text-center text-sm font-bold py-2 ${C.sec}`}>Esperando a la cocina: aún no hay pedidos listos.</p>
        )}
        {cupo === 0 && <p className={`text-center text-xs font-semibold ${C.sec}`}>Ya llevas {MAX_EN_REPARTO}: entrega uno para salir con más.</p>}
        {pedidos.length > listos.length && (
          <button onClick={salirConTodos} disabled={ocupado || cupo === 0}
            className={`h-12 rounded-xl border-[1.5px] ${C.borde} text-base font-bold disabled:opacity-50`}>
            {listos.length > 0 ? `Esperar y llevar los ${pedidos.length}` : `Salir igual con los ${pedidos.length}`}
          </button>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

/** En reparto: la parada actual en grande y «Luego» con la siguiente (pestaña «En reparto»). */
export function EnReparto({ pedidos, porRecoger, geoCache, onAbrir, alListo, irARecoger }) {
  const actual = pedidos[0]
  const siguiente = pedidos[1]
  const coords = actual ? geoDelPedido(actual, geoCache) : null
  const { loading, siguiente: principal } = useAccionesReparto(actual || {}, { navCoords: coords, alListo })
  const [noEntrega, setNoEntrega] = useState(false)
  if (!actual) return null

  const llego = actual.status === 'arrived'
  const min = minutosParaLlegar(actual)
  const c = cobroDe(actual)
  // Para otra persona (§7.3): se llama a quien recibe; a quien pidió, desde el detalle.
  const recibe = actual.destinatario?.nombre ? actual.destinatario : null
  const digitos = String((recibe ? recibe.telefono : actual.phone) || '').replace(/\D/g, '')
  const tel = digitos.length >= 10 ? digitos.slice(-10) : ''
  const quien = recibe ? recibe.nombre.split(' ')[0] : (actual.name || 'el cliente')
  const enExcepcion = ['no_entregado', 'regreso_declarado'].includes(actual.excepcion)
  const linea = [recibe ? `Recibe ${recibe.nombre}` : actual.name, actual.barrio, actual.reference].filter(Boolean).join(' · ')
  const botonApp = 'h-14 rounded-xl bg-[var(--d-boton)] text-white text-base font-extrabold flex items-center justify-center gap-2'
  const botonContorno = `h-[52px] rounded-xl border-[1.5px] ${C.borde} text-base font-bold flex items-center justify-center gap-2`
  const cobroSig = siguiente ? cobroDe(siguiente) : null

  return (
    <div className="px-4 flex flex-col gap-3">
      <p className={`pt-2 text-sm font-bold ${C.sec}`}>Parada 1 de {pedidos.length} · #{actual.orderNumber ?? '—'}</p>

      <section className="flex flex-col gap-1.5">
        <p className="flex items-baseline gap-2.5 flex-wrap">
          <span className={`text-[60px] leading-[64px] font-black tabular-nums ${C.fuerte}`}>
            {llego ? 'Llegaste' : min != null ? `${min} min` : 'En camino'}
          </span>
          {!llego && kmDe(actual) && <span className={`text-xl font-bold ${C.sec}`}>· {kmDe(actual)}</span>}
        </p>
        <p className={`text-[25px] leading-[30px] font-extrabold ${C.fuerte}`}>{actual.fullAddress || 'Sin dirección'}</p>
        {linea && <p className={`text-[17px] ${C.sec}`}>{linea}</p>}
      </section>

      {enExcepcion && (
        <section className={`rounded-2xl p-4 ${C.tarjeta}`}>
          <EstadoNoEntrega order={actual} onHablarCaja={() => onAbrir(actual, { notas: true })} />
        </section>
      )}

      <section className={`rounded-2xl p-4 flex flex-col gap-3.5 ${C.tarjeta}`}>
        {c.porDefinir ? (
          <p className="text-base font-bold">El cliente todavía no eligió cómo paga ({fmt(c.monto)}).</p>
        ) : c.efectivo ? (
          <div className="flex items-center justify-between gap-3">
            <div className="flex flex-col">
              <span className={`text-[13px] font-extrabold tracking-wide ${C.warn}`}>COBRAR{c.mixto ? ' (MIXTO)' : ''}</span>
              <span className={`text-[38px] leading-[42px] font-black tabular-nums ${C.fuerte}`}>{fmt(c.monto)}</span>
            </div>
            {c.exacto ? (
              <span className={`text-lg font-extrabold ${C.fuerte}`}>Exacto</span>
            ) : (
              <div className="flex flex-col items-end">
                <span className={`text-[13px] tabular-nums ${C.sec}`}>Paga con {fmt(c.billete)}</span>
                <span className={`text-lg font-extrabold tabular-nums ${C.fuerte}`}>{c.cambio ? `Cambio ${fmt(c.cambio)}` : 'Exacto'}</span>
              </div>
            )}
          </div>
        ) : (
          <p className={`flex items-center gap-2 text-lg font-bold ${c.pendiente ? C.warn : C.ok}`}>
            <CheckCircle size={22} aria-hidden="true" />
            {c.pendiente ? 'Transferencia por verificar: no entregues aún' : 'Ya pagó · no cobres'}
          </p>
        )}

        {(coords || actual.fullAddress) && (
          <div className="grid grid-cols-2 gap-2.5">
            <button onClick={() => window.open(urlNavegacion('maps', coords, actual.fullAddress), '_blank')} className={botonApp}
              aria-label="Navegar con Google Maps"><LogoGoogleMaps size={26} /> Google Maps</button>
            <button onClick={() => window.open(urlNavegacion('waze', coords, actual.fullAddress), '_blank')} className={botonApp}
              aria-label="Navegar con Waze"><LogoWaze size={26} /> Waze</button>
          </div>
        )}
        {tel && (
          <div className="grid grid-cols-2 gap-2.5">
            <a href={`tel:+57${tel}`} className={botonContorno} aria-label={`Llamar a ${quien}`}>
              <Phone size={20} aria-hidden="true" /> Llamar
            </a>
            <a href={`https://wa.me/57${tel}`} target="_blank" rel="noreferrer" className={botonContorno} aria-label={`WhatsApp a ${quien}`}>
              <LogoWhatsApp size={24} /> WhatsApp
            </a>
          </div>
        )}
        <button onClick={() => onAbrir(actual)} className="self-start min-h-[44px] flex items-center gap-1 text-base font-bold">
          Ver el pedido y el chat <ChevronRight size={18} aria-hidden="true" />
        </button>
      </section>

      {(siguiente || porRecoger > 0) && (
        <button onClick={() => (siguiente ? onAbrir(siguiente) : irARecoger?.())}
          className={`text-left rounded-2xl border-[1.5px] border-dashed ${C.borde} px-3.5 py-3 flex items-center gap-3`}>
          <span className={`text-[13px] font-extrabold ${C.sec}`}>LUEGO</span>
          <span className="flex-1 min-w-0 flex flex-col">
            {siguiente ? (
              <>
                <span className={`text-[15px] font-bold truncate ${C.fuerte}`}>{siguiente.fullAddress || 'Sin dirección'}</span>
                <span className={`text-[13px] tabular-nums ${cobroSig.efectivo || cobroSig.porDefinir ? '' : C.ok}`}>
                  {cobroSig.efectivo || cobroSig.porDefinir ? `Cobrar ${fmt(cobroSig.monto)}` : 'Ya pagó · no cobres'}
                </span>
              </>
            ) : (
              <span className={`text-[15px] font-bold ${C.fuerte}`}>
                {porRecoger === 1 ? '1 pedido por recoger en la sede' : `${porRecoger} pedidos por recoger en la sede`}
              </span>
            )}
          </span>
        </button>
      )}

      <div className={PIE} style={PIE_ABAJO}>
        {principal && principal.texto !== 'Aceptar pedido' && (
          <BotonGrande texto={principal.texto} onClick={principal.accion} ocupado={loading} deshabilitado={principal.bloqueado} />
        )}
        {puedeReportar(actual) && (
          <button onClick={() => setNoEntrega(true)} className={`min-h-[44px] text-[15px] font-semibold underline ${C.sec}`}>
            No se pudo entregar
          </button>
        )}
      </div>

      {noEntrega && <HojaNoEntrega order={actual} onCerrar={() => setNoEntrega(false)} alAvisar={alListo} />}
    </div>
  )
}
