import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { collection, query, orderBy, limit, onSnapshot, doc, updateDoc, serverTimestamp, writeBatch } from 'firebase/firestore'
import { Bell, X } from 'lucide-react'
import { formatDistanceToNowStrict } from 'date-fns'
import { es } from 'date-fns/locale'
import { db, auth } from '../../services/firebase'

// Centro de avisos (Fase 6, especificación §18): campana con contador, avisos
// leídos y pendientes y enlace al pedido. Los avisos los escribe el servidor
// en avisos/{destino}/items; aquí solo se leen y se marcan como leídos.
// `destinos`: uid del cliente, correo del equipo y/o caja_<sede> (compartido).
// `boton({ abrir, pendientes })`: otro botón en lugar de la campana (el atajo de «Más»).
export default function CampanaAvisos({ destinos = [], onAbrirPedido, oscuro = false, boton }) {
  const [porDestino, setPorDestino] = useState({})
  const [abierto, setAbierto] = useState(false)
  const clave = destinos.filter(Boolean).join('|')

  useEffect(() => {
    const lista = clave ? clave.split('|') : []
    setPorDestino({})
    const quitar = lista.map((d) => onSnapshot(
      query(collection(db, 'avisos', d, 'items'), orderBy('creadoAt', 'desc'), limit(30)),
      (snap) => setPorDestino((p) => ({ ...p, [d]: snap.docs.map((x) => ({ id: x.id, destino: d, ...x.data() })) })),
      () => setPorDestino((p) => ({ ...p, [d]: [] })),
    ))
    return () => quitar.forEach((q) => q())
  }, [clave])

  const avisos = Object.values(porDestino).flat()
    .sort((a, b) => (b.creadoAt?.toMillis?.() ?? Date.now()) - (a.creadoAt?.toMillis?.() ?? Date.now()))
    .slice(0, 40)
  const pendientes = avisos.filter((a) => !a.leido)

  const marcar = (a) => updateDoc(doc(db, 'avisos', a.destino, 'items', a.id),
    { leido: true, leidoAt: serverTimestamp(), leidoPor: auth.currentUser?.email || auth.currentUser?.uid || null }).catch(() => {})
  const marcarTodos = async () => {
    const batch = writeBatch(db)
    pendientes.forEach((a) => batch.update(doc(db, 'avisos', a.destino, 'items', a.id),
      { leido: true, leidoAt: serverTimestamp(), leidoPor: auth.currentUser?.email || auth.currentUser?.uid || null }))
    await batch.commit().catch(() => {})
  }
  const abrir = (a) => {
    if (!a.leido) marcar(a)
    if (a.pedidoId && onAbrirPedido) { setAbierto(false); onAbrirPedido(a.pedidoId) }
  }

  return (
    <>
      {boton ? boton({ abrir: () => setAbierto(true), pendientes: pendientes.length }) : (
        <button onClick={() => setAbierto(true)} aria-label={`Avisos${pendientes.length ? `: ${pendientes.length} sin leer` : ''}`}
          className={`btn-icon relative ${oscuro ? 'text-cream hover:bg-cream/10' : ''}`}>
          <Bell size={20} />
          {pendientes.length > 0 && <span className="notif-badge">{pendientes.length > 9 ? '9+' : pendientes.length}</span>}
        </button>
      )}
      {abierto && createPortal(
        <div className="fixed inset-0 z-[130] bg-coal/40 backdrop-blur-sm flex justify-end" onClick={(e) => { if (e.target === e.currentTarget) setAbierto(false) }}>
          <div className="bg-cream w-full max-w-sm h-full flex flex-col shadow-2xl animate-slide-in-right">
            <div className="flex items-center justify-between px-5 py-4 border-b border-coal/10">
              <p className="font-display text-xl tracking-wide text-coal">Avisos</p>
              <div className="flex items-center gap-2">
                {pendientes.length > 0 && (
                  <button onClick={marcarTodos} className="font-body text-xs text-cherry underline underline-offset-2">Marcar todo como leído</button>
                )}
                <button onClick={() => setAbierto(false)} className="btn-icon" aria-label="Cerrar"><X size={20} /></button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto scroll-custom">
              {avisos.length === 0 && (
                <p className="font-body text-sm text-coal/50 text-center mt-16 px-6">No tienes avisos todavía.</p>
              )}
              {avisos.map((a) => (
                <button key={`${a.destino}/${a.id}`} onClick={() => abrir(a)}
                  className={`w-full text-left px-5 py-3.5 border-b border-coal/5 flex gap-3 ${a.leido ? 'bg-transparent' : 'bg-cherry/5'}`}>
                  <span className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${a.leido ? 'bg-transparent' : 'bg-cherry'}`} />
                  <span className="min-w-0 flex-1">
                    <span className={`block font-body text-sm ${a.leido ? 'text-coal/70' : 'text-coal font-semibold'}`}>{a.titulo}</span>
                    {a.cuerpo && <span className="block font-body text-xs text-coal/60 mt-0.5 leading-snug">{a.cuerpo}</span>}
                    <span className="block font-body text-[11px] text-coal/40 mt-1">
                      {a.creadoAt?.toDate ? formatDistanceToNowStrict(a.creadoAt.toDate(), { addSuffix: true, locale: es }) : 'ahora'}
                      {a.destino.startsWith('caja_') && a.leido && a.leidoPor ? ` · visto por ${String(a.leidoPor).split('@')[0]}` : ''}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}
