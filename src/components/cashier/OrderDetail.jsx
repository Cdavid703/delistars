import { useState, useEffect } from 'react'
import { doc, updateDoc, serverTimestamp, arrayUnion } from 'firebase/firestore'
import {
  db, getNextOrderNumber, restoreLoyaltyRedemption,
  acreditarSaldoDevolucion, saldoVerificado, crearSaldoSobrante, restaurarSaldo, actualizarPedido,
} from '../../services/firebase'
import { devolucionInicial, aplicarSaldo } from '../../utils/devolucion'
import ClientChat from './ClientChat'
import ChatDomiciliario from '../common/ChatDomiciliario'
import CodigoPrivado from './CodigoPrivado'
import CashChangeNotice from '../common/CashChangeNotice'
import { useAuth } from '../../contexts/AuthContext'
import { SEDES, ROLES } from '../../services/roles'
import { precioDomicilio, maxKm, RECORRIDO, LINEA_RECTA } from '../../utils/tarifaDomicilio'
import { medirRecorrido, ubicarDireccion } from '../../services/recorrido'
import { cambioParaTotal } from '../../utils/payments'
import { etapaDe, ETAPAS, EXCEPCIONES } from '../../utils/etapas'
import { conApi, llamarPedidos, ErrorApi } from '../../services/pedidosApi'
import { format, formatDistanceToNowStrict } from 'date-fns'
import { es } from 'date-fns/locale'
import {
  X, MapPin, Phone, User,
  CreditCard, Bike, Navigation, ExternalLink,
  AlertTriangle, XCircle, CheckCircle2, BellOff,
  Hash, DollarSign, MessageSquare, Clock,
  Send, FileCheck, CheckCircle, Search, Pencil, Receipt, Check,
  CircleCheck, CircleX, Store, Banknote, MessageCircle
} from 'lucide-react'
import ComandaPedido from './ComandaPedido'

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.asin(Math.sqrt(a))
}

const fmt    = v => (v !== undefined && v !== null && v !== '') ? `$${Number(v).toLocaleString('es-CO')}` : '—'
// Solo dígitos: el cajero escribe el precio directo (sin flechitas de subir/bajar).
const onlyDigits = v => (v || '').toString().replace(/[^\d]/g, '')

const fmtTime = (ts) => {
  if (!ts?.toDate) return null
  return format(ts.toDate(), "dd MMM HH:mm", { locale: es })
}

export default function OrderDetail({ order, onClose, drivers = [], alarmActive = false, onDismissAlarm, onReassign, unreadClientMsgs = 0 }) {
  const { user, role } = useAuth()
  const esAdmin = role === ROLES.ADMIN
  const [loading,          setLoading]          = useState(false)
  const [rejecting,        setRejecting]        = useState(false)
  const [rejectReason,     setRejectReason]     = useState('')
  const [distanceKm,       setDistanceKm]       = useState(null)
  // Cómo se midió distanceKm: por calle (Google) o en línea recta (respaldo).
  const [distanceMedida,   setDistanceMedida]   = useState(LINEA_RECTA)
  const [commentText,      setCommentText]      = useState('')
  const [sendingComment,   setSendingComment]   = useState(false)
  const [validatingTransfer, setValidatingTransfer] = useState(false)
  const [editingPrice,      setEditingPrice]      = useState(false)
  const [editQuotedPrice,   setEditQuotedPrice]   = useState(String(order.quotedPrice   ?? ''))
  const [editDeliveryPrice, setEditDeliveryPrice] = useState(String(order.deliveryPrice ?? ''))

  // Quote form state (for pending orders)
  const [localOrderNumber,   setLocalOrderNumber]   = useState(order.orderNumber   || '')
  const [localQuotedPrice,   setLocalQuotedPrice]   = useState(String(order.quotedPrice   ?? ''))
  const [localDeliveryPrice, setLocalDeliveryPrice] = useState(String(order.deliveryPrice ?? ''))
  const [localCashierNotes,  setLocalCashierNotes]  = useState(order.cashierNotes  || '')

  // Order number inline editing (any non-final status)
  const [editingOrderNum, setEditingOrderNum] = useState(false)
  const [editOrderNum,    setEditOrderNum]    = useState(order.orderNumber || '')
  const [savingOrderNum,  setSavingOrderNum]  = useState(false)
  const [quoteErrors,        setQuoteErrors]         = useState([])
  // Pedido con pago adelantado: la caja solo acepta. Si algún valor está mal,
  // abre el formulario de cotización de siempre para corregirlo.
  const [ajustarValores,     setAjustarValores]      = useState(false)

  // Método de pago editable desde la caja. Hace falta porque al cliente se le
  // cierra la sesión por inactividad y se queda sin poder elegir cómo paga;
  // antes la caja no tenía forma de registrarlo por él.
  const [editingPay,   setEditingPay]   = useState(false)
  const [payMethod,    setPayMethod]    = useState(order.payment || '')
  const [payMixtoEf,   setPayMixtoEf]   = useState(String(order.mixtoEfectivo ?? ''))
  const [payMixtoTr,   setPayMixtoTr]   = useState(String(order.mixtoTransferencia ?? ''))
  const [payError,     setPayError]     = useState('')
  const [savingPay,    setSavingPay]    = useState(false)

  // Facturado: ingresado al sistema de facturación. Aplica a todo pedido, sin
  // importar el medio de pago; cualquier cajero lo prende o apaga.
  const toggleFacturado = async () => {
    const nuevo = !order.facturado
    try {
      await updateDoc(doc(db, 'orders', order.id), {
        facturado:   nuevo,
        facturadoBy: nuevo ? (user?.email || 'caja') : null,
        facturadoAt: nuevo ? serverTimestamp() : null,
        updatedAt:   serverTimestamp(),
      })
    } catch (e) {
      console.error('No se pudo actualizar facturado', e)
    }
  }

  // Address editing
  const [editingAddr,    setEditingAddr]    = useState(false)
  const [addrDraft,      setAddrDraft]      = useState('')
  const [addrSuggestions, setAddrSuggestions] = useState([])
  const [searchingAddr,  setSearchingAddr]  = useState(false)
  const [addrSearched,   setAddrSearched]   = useState(false)
  const [savingAddr,     setSavingAddr]     = useState(false)

  const orderSede = SEDES[order.sedeId]
  const pickup    = order.deliveryMode === 'pickup'

  useEffect(() => {
    if (!order.fullAddress || !orderSede) { setDistanceKm(-1); return }
    setDistanceMedida(LINEA_RECTA)
    // Si el pedido ya trae el recorrido que midió la app del cliente, se usa
    // ese: es con el que se le cobró.
    if (order.deliveryKmMedida === RECORRIDO && order.deliveryKm != null) {
      setDistanceKm(Number(order.deliveryKm))
      setDistanceMedida(RECORRIDO)
      return
    }
    // Si el pedido trae el pin exacto (el cliente ubicó su dirección, o el
    // domiciliario pegó la ubicación de WhatsApp), se mide contra ESE punto.
    // Antes se geocodificaba siempre el texto —y recortado, sin el "#45-10"—
    // así que teniendo el punto exacto se calculaba sobre una aproximación de
    // la calle. De esa distancia depende ahora el precio del domicilio.
    if (order.addrLat != null && order.addrLng != null) {
      setDistanceKm(haversineKm(orderSede.coords.lat, orderSede.coords.lng,
        Number(order.addrLat), Number(order.addrLng)))
      // Con pin se pide el recorrido por calle; mientras tanto (o si falla)
      // queda la línea recta.
      let vigente = true
      medirRecorrido(orderSede.coords, { lat: order.addrLat, lng: order.addrLng }).then(km => {
        if (!vigente || km === null) return
        setDistanceKm(km)
        setDistanceMedida(RECORRIDO)
      })
      return () => { vigente = false }
    }
    // Sin pin: se ubica el texto. Primero Google (entiende el "#45-10");
    // si no responde, Photon con la calle principal, como antes.
    let vigente = true
    const medirDesde = (lat, lng) => {
      setDistanceKm(haversineKm(orderSede.coords.lat, orderSede.coords.lng, lat, lng))
      medirRecorrido(orderSede.coords, { lat, lng }).then(km => {
        if (!vigente || km === null) return
        setDistanceKm(km)
        setDistanceMedida(RECORRIDO)
      })
    }
    const porPhoton = () => {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 8000)
      // Las direcciones colombianas tipo "Carrera 85 C, número 34 a 27" o "Cra 50 #45-10"
      // confunden a Photon con los números secundarios. Se extrae solo la calle principal.
      const street = order.fullAddress
        .replace(/\bnum[eé]ro\b.*/i, '')  // quita "número X a Y"
        .replace(/#[^\s,]*/g, '')          // quita "#45-10"
        .split(',')[0]
        .trim()
      const barrio = order.barrio ? `, ${order.barrio}` : ''
      const q = encodeURIComponent(`${street}${barrio}, Medellín, Colombia`)
      const url = `https://photon.komoot.io/api/?q=${q}&limit=1&lat=6.2442&lon=-75.5812`
      fetch(url, { signal: controller.signal })
        .then(r => { if (!r.ok) throw new Error(r.status); return r.json() })
        .then(data => {
          clearTimeout(timer)
          const feature = data.features?.[0]
          if (feature) {
            const [lon, lat] = feature.geometry.coordinates
            if (vigente) setDistanceKm(haversineKm(orderSede.coords.lat, orderSede.coords.lng, lat, lon))
          } else {
            setDistanceKm(-1)
          }
        })
        .catch(() => setDistanceKm(-1))
    }
    const barrioTxt = order.barrio ? `, ${order.barrio}` : ''
    ubicarDireccion(`${order.fullAddress}${barrioTxt}`).then(google => {
      if (!vigente) return
      if (google?.length) { medirDesde(google[0].lat, google[0].lng); return }
      if (google) { setDistanceKm(-1); return } // Google respondió: no existe
      porPhoton()
    })
    return () => { vigente = false }
  }, [order.fullAddress, order.addrLat, order.addrLng, order.deliveryKm, order.deliveryKmMedida, orderSede])


  const time = order.createdAt?.toDate
    ? format(order.createdAt.toDate(), "dd MMM yyyy 'a las' HH:mm", { locale: es })
    : '--'

  const lqp   = parseFloat(localQuotedPrice)   || 0
  const ldp   = parseFloat(localDeliveryPrice) || 0

  // Precio que le corresponde por distancia. Sirve para dos cosas: sugerirle el
  // valor al cajero cuando el cliente pidió revisión (o cuando no hubo pin), y
  // avisar si el precio que trae el pedido NO cuadra con la distancia — el
  // precio automático lo calcula el navegador del cliente, así que este es el
  // único punto donde se verifica del lado de la caja.
  const sugerido = (distanceKm !== null && distanceKm >= 0)
    ? precioDomicilio(distanceKm, distanceMedida)
    : null
  const topeKm = maxKm(distanceMedida)
  const porCalle = distanceMedida === RECORRIDO ? ' por calle' : ''
  const desajuste = !!sugerido && sugerido.estado === 'ok' &&
    order.deliveryPriceAuto && Number(order.deliveryPrice) !== sugerido.precio
  const localTotal = lqp + ldp

  const searchAddr = async () => {
    if (!addrDraft.trim()) return
    setSearchingAddr(true)
    setAddrSuggestions([])
    setAddrSearched(false)
    // Google primero: entiende el "#45-10" y devuelve la dirección completa.
    const google = await ubicarDireccion(addrDraft.trim())
    if (google) {
      setAddrSuggestions(google.map(l => l.direccion))
      setAddrSearched(true)
      setSearchingAddr(false)
      return
    }
    try {
      const cleaned = addrDraft.replace(/#[^\s,]*/g, '').split(',')[0].trim()
      const q = encodeURIComponent(cleaned + ', Medellín, Colombia')
      const res = await fetch(`https://photon.komoot.io/api/?q=${q}&limit=4&lat=6.2442&lon=-75.5812`)
      if (res.ok) {
        const data = await res.json()
        setAddrSuggestions((data.features || []).map(f => {
          const p = f.properties
          const num = p.housenumber ? ` #${p.housenumber}` : ''
          const street = p.street ? `${p.street}${num}` : (p.name || '')
          const locality = p.district || p.suburb || p.city || ''
          return [street, locality].filter(Boolean).join(', ')
        }).filter(Boolean))
      }
    } catch (_) {}
    setAddrSearched(true)
    setSearchingAddr(false)
  }

  const saveAddr = async () => {
    if (!addrDraft.trim()) return
    setSavingAddr(true)
    try {
      await updateDoc(doc(db, 'orders', order.id), {
        fullAddress: addrDraft.trim(),
        updatedAt:   serverTimestamp(),
      })
      setEditingAddr(false)
      setAddrSuggestions([])
      setAddrSearched(false)
    } finally { setSavingAddr(false) }
  }

  const saveOrderNumber = async () => {
    const num = editOrderNum.trim()
    if (!num) return
    setSavingOrderNum(true)
    try {
      await updateDoc(doc(db, 'orders', order.id), {
        orderNumber: num,
        updatedAt:   serverTimestamp(),
      })
      setEditingOrderNum(false)
    } finally { setSavingOrderNum(false) }
  }

  const sendQuote = async () => {
    setLoading(true)
    try {
      // Auto-asignar número si el cajero no escribió uno
      let orderNum = localOrderNumber.trim()
      if (!orderNum) {
        try {
          orderNum = String(await getNextOrderNumber(order.sedeId))
          setLocalOrderNumber(orderNum)
        } catch (_) {
          setQuoteErrors(['No se pudo asignar número automáticamente. Escríbelo manualmente.'])
          setLoading(false)
          return
        }
      }
      // Por la API (el servidor verifica el saldo y deja el sobrante); si no
      // responde, el camino de siempre.
      await conApi(`${order.id}/cotizar`, {
        quotedPrice: lqp, deliveryPrice: ldp, cashierNotes: localCashierNotes.trim(),
        orderNumber: orderNum, version: order.version ?? 0,
      }, () => cotizarDirecto(orderNum))
      onClose()
    } catch (err) {
      if (err instanceof ErrorApi) setQuoteErrors([err.message])
      else throw err
    } finally { setLoading(false) }
  }

  // Camino directo (respaldo si el servidor no responde): lo de siempre.
  const cotizarDirecto = async (orderNum) => {
      // Saldo a favor: se verifica contra los saldos reales (no contra lo que
      // dice el pedido) y lo que sobre vuelve a la cuenta del cliente.
      let saldo = null
      if (order.saldoAplicado?.ids?.length) {
        const disponible = await saldoVerificado(order)
        saldo = { ...aplicarSaldo(localTotal, disponible), disponible }
        if (saldo.sobrante > 0) {
          await crearSaldoSobrante(order, saldo.sobrante, user?.email)
        }
      }
      const totalACobrar = saldo ? saldo.aPagar : localTotal
      await actualizarPedido(order, {
        status:        'quoted',
        orderNumber:   orderNum,
        quotedPrice:   lqp,
        deliveryPrice: ldp,
        totalPrice:    totalACobrar,
        // El saldo cubrió todo: no hay nada que cobrar ni medio de pago que elegir.
        ...(totalACobrar === 0 && saldo && !order.payment
          ? { payment: 'Saldo a favor', cashOnDelivery: false } : {}),
        ...(saldo ? {
          'saldoAplicado.monto':    saldo.disponible,
          'saldoAplicado.usado':    saldo.usado,
          'saldoAplicado.sobrante': saldo.sobrante,
        } : {}),
        cashierNotes:  localCashierNotes.trim(),
        quotedAt:      serverTimestamp(),
        // Pago adelantado en efectivo: si la caja corrigió el total, el cambio
        // se recalcula; si el billete ya no alcanza, se borra para que el
        // domiciliario no salga con un cambio equivocado.
        ...(order.pagoAdelantado && order.payment === 'Efectivo' && order.cashBillAmount != null
          ? (Number(order.cashBillAmount) >= totalACobrar
              ? { cashChange: Number(order.cashBillAmount) - totalACobrar }
              : { cashBillAmount: null, cashChange: null })
          : {}),
        needsRequote:  false, // el aviso de "el cliente agregó productos" ya quedó atendido
        updatedAt:     serverTimestamp(),
      }, { rol: 'caja' })
  }

  // Guarda el método de pago que la caja registra por el cliente. Escribe los
  // MISMOS campos que escribiría el cliente, para que el cuadre, el domiciliario
  // y el aviso de cambio no noten diferencia.
  const savePayment = async () => {
    if (!payMethod) { setPayError('Selecciona cómo va a pagar'); return }
    const esMixto = payMethod === 'Mixto'
    if (esMixto && (!payMixtoEf || !payMixtoTr)) {
      setPayError('Indica cuánto va en efectivo y cuánto en transferencia'); return
    }
    setPayError('')
    setSavingPay(true)
    try {
      const llevaEfectivo = payMethod === 'Efectivo' || esMixto
      await updateDoc(doc(db, 'orders', order.id), {
        payment:        payMethod,
        cashOnDelivery: llevaEfectivo,
        // Si deja de ser Mixto se limpia el desglose: si no, queda un
        // mixtoEfectivo viejo ensuciando los reportes.
        mixtoEfectivo:      esMixto ? payMixtoEf : null,
        mixtoTransferencia: esMixto ? payMixtoTr : null,
        // Sin efectivo no hay billete ni cambio que anunciar.
        ...(llevaEfectivo ? {} : { cashBillAmount: null, cashChange: null }),
        // Queda el rastro de que lo registró la caja, no el cliente.
        paymentSetBy: user?.email || 'caja',
        paymentSetAt: serverTimestamp(),
        updatedAt:    serverTimestamp(),
      })
      setEditingPay(false)
    } catch (_) {
      setPayError('No se pudo guardar. Revisa la conexión e intenta de nuevo.')
    } finally { setSavingPay(false) }
  }

  const rejectOrder = async () => {
    if (!rejectReason.trim()) return
    setLoading(true)
    try {
      const motivo = rejectReason.trim()
      // Por la API (devuelve premio y saldo y deja la devolución si ya pagó).
      await conApi(`${order.id}/transiciones`, { a: 'excepcion:rechazado', motivo, version: order.version ?? 0 },
        () => rechazarDirecto(motivo))
      onClose()
    } catch (err) {
      if (err instanceof ErrorApi) alert(err.message)
      else throw err
    } finally { setLoading(false) }
  }

  const rechazarDirecto = async (motivo) => {
      const quien  = user?.displayName || user?.email || 'Cajero'
      // Si ya había pagado por transferencia, queda la devolución pendiente y
      // se le pregunta al cliente cómo la quiere.
      const devolucion = devolucionInicial(order)
      const ahora = Date.now()
      await actualizarPedido(order, {
        status:          'rejected',
        rejectionReason: motivo,
        // El motivo queda también en los comentarios del pedido (historial).
        comments: arrayUnion({ role: 'cashier', name: quien, text: `Pedido rechazado. Motivo: ${motivo}`, ts: ahora }),
        ...(devolucion ? {
          devolucion,
          clientMessages: arrayUnion({
            role: 'cashier', name: quien, ts: ahora + 1,
            text: `Lo sentimos, tu pedido fue rechazado. Motivo: ${motivo}. ` +
              `Como ya pagaste $${devolucion.monto.toLocaleString('es-CO')} por transferencia, te los devolvemos: ` +
              `entra a tu pedido y elige si los quieres de vuelta por transferencia` +
              (order.clientEmail ? ' o como saldo a favor para tu próximo pedido.' : '.'),
          }),
        } : {}),
        updatedAt:       serverTimestamp(),
      }, { rol: 'caja' })
      restoreLoyaltyRedemption(order) // si tenía un premio canjeado, se devuelve
      if (order.saldoAplicado?.ids?.length) restaurarSaldo(order, { comoCaja: true }).catch(() => {})
  }

  // Cambio de etapa por la API (con respaldo directo). Los 4xx se muestran.
  const moverEtapa = async (a, directo, despues) => {
    setLoading(true)
    try {
      await conApi(`${order.id}/transiciones`, { a, version: order.version ?? 0 }, directo)
      despues?.()
    } catch (err) {
      if (err instanceof ErrorApi) alert(err.message)
      else throw err
    } finally { setLoading(false) }
  }

  // Solicitud de cancelación del cliente (Fase 4): la caja la aprueba (cancela,
  // devuelve premios y saldo y deja la devolución si ya pagó) o sigue con el
  // pedido. Solo por la API: un respaldo directo saltaría esas devoluciones.
  const resolverCancelacion = async (aprobar) => {
    const motivo = order.excepcionMotivo ? `Lo pidió el cliente: ${order.excepcionMotivo}` : 'Lo pidió el cliente'
    if (!window.confirm(aprobar
      ? '¿Cancelar este pedido como pidió el cliente?'
      : '¿Seguir con el pedido? Escríbele al cliente por el chat para contarle por qué.')) return
    setLoading(true)
    try {
      await llamarPedidos(`${order.id}/transiciones`, aprobar
        ? { a: 'excepcion:cancelado', motivo, version: order.version ?? 0 }
        : { a: 'seguir', version: order.version ?? 0 })
      if (aprobar) onClose()
    } catch (err) {
      alert(err instanceof ErrorApi ? err.message : 'No se pudo guardar. Revisa la conexión e intenta de nuevo.')
    } finally { setLoading(false) }
  }

  // Cambio propuesto al cliente (Fase 7, §9.2): solo antes de preparar y sin
  // otro trámite pendiente. El servidor calcula el total y guarda la propuesta.
  const etapaActualDetalle = etapaDe(order)
  const enReparto = ['en_camino', 'llego'].includes(etapaActualDetalle.etapa)
  const puedeProponer = ['enviado', 'confirmado'].includes(etapaActualDetalle.etapa) && !etapaActualDetalle.excepcion
  const [proponiendo, setProponiendo] = useState(false)
  const [propItems, setPropItems] = useState(order.items || '')
  const [propQp, setPropQp] = useState(String(order.quotedPrice ?? ''))
  const [propDp, setPropDp] = useState(String(order.deliveryPrice ?? ''))
  const [propMotivo, setPropMotivo] = useState('')
  const [propError, setPropError] = useState('')
  const enviarPropuesta = async () => {
    setPropError(''); setLoading(true)
    try {
      await llamarPedidos(`${order.id}/cambio`, {
        items: propItems, quotedPrice: Number(propQp) || 0,
        ...(order.deliveryMode !== 'pickup' ? { deliveryPrice: Number(propDp) || 0 } : {}),
        motivo: propMotivo, version: order.version ?? 0,
      })
      setProponiendo(false); setPropMotivo('')
    } catch (err) {
      setPropError(err instanceof ErrorApi ? err.message : 'No se pudo enviar. Revisa la conexión e intenta de nuevo.')
    } finally { setLoading(false) }
  }
  const retirarCambio = async () => {
    if (!window.confirm('¿Retirar la propuesta? El pedido sigue como estaba.')) return
    setLoading(true)
    try { await llamarPedidos(`${order.id}/transiciones`, { a: 'seguir', version: order.version ?? 0 }) }
    catch (err) { alert(err instanceof ErrorApi ? err.message : 'No se pudo retirar. Revisa la conexión.') }
    finally { setLoading(false) }
  }

  const markPreparing = () => moverEtapa('en_preparacion', () => actualizarPedido(order, {
    status:      'preparing',
    preparingAt: serverTimestamp(),
    updatedAt:   serverTimestamp(),
  }, { rol: 'caja' }))

  // Etapa nueva "Listo" (Fase 2): la caja la marca cuando cocina termina. El
  // status viejo sigue en 'preparing' para no mover el pedido de pestaña.
  const markListo = () => moverEtapa('listo',
    () => actualizarPedido(order, { etapa: 'listo', listoAt: serverTimestamp() }, { rol: 'caja' }))

  // Recoger en sede: entregar. Domicilio en efectivo: recibir la plata (cuadre).
  const markCashReceived = async () => {
    const directo = () => actualizarPedido(order, {
      status:          'completed',
      completedAt:     serverTimestamp(),
      updatedAt:       serverTimestamp(),
    }, { rol: 'caja' })
    if (order.status !== 'pending_cuadre') return moverEtapa('entregado', directo, onClose)
    setLoading(true)
    try {
      await conApi(`${order.id}/cuadre`, { version: order.version ?? 0 }, directo)
      onClose()
    } catch (err) {
      if (err instanceof ErrorApi) alert(err.message)
      else throw err
    } finally { setLoading(false) }
  }

  const openDirections = () => {
    const dest = encodeURIComponent(order.fullAddress + ', Medellín, Colombia')
    if (orderSede) {
      // Preferimos la dirección textual completa de la sede (cadena Google Maps).
      // Si por alguna razón no existe, caemos a lat/lng como fallback.
      const originStr = orderSede.mapsAddress || orderSede.address
      const origin = originStr
        ? encodeURIComponent(originStr)
        : `${orderSede.coords.lat},${orderSede.coords.lng}`
      window.open(`https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${dest}`, '_blank')
    } else {
      window.open(`https://www.google.com/maps/search/?api=1&query=${dest}`, '_blank')
    }
  }

  const openWaze = () => {
    window.open(`https://waze.com/ul?q=${encodeURIComponent(order.fullAddress)}`, '_blank')
  }

  const openDriverTracking = () => {
    if (order.driverLat && order.driverLng) {
      window.open(`https://www.google.com/maps/search/?api=1&query=${order.driverLat},${order.driverLng}`, '_blank')
    }
  }


  const sendComment = async () => {
    if (!commentText.trim()) return
    setSendingComment(true)
    try {
      await updateDoc(doc(db, 'orders', order.id), {
        comments: arrayUnion({
          role: 'cashier',
          name: user?.displayName || user?.email || 'Cajero',
          text: commentText.trim(),
          ts:   Date.now(),
        }),
        updatedAt: serverTimestamp(),
      })
      setCommentText('')
    } finally { setSendingComment(false) }
  }

  const validateTransfer = async () => {
    setValidatingTransfer(true)
    try {
      await updateDoc(doc(db, 'orders', order.id), {
        transferValidated: true,
        updatedAt: serverTimestamp(),
      })
    } finally { setValidatingTransfer(false) }
  }

  const saveEditedPrice = async () => {
    const qp = parseFloat(editQuotedPrice)  || 0
    const dp = parseFloat(editDeliveryPrice) || 0
    setLoading(true)
    try {
      const totalPrice = Math.max(0, qp + dp - (Number(order.saldoAplicado?.usado) || 0))
      await updateDoc(doc(db, 'orders', order.id), {
        quotedPrice:   qp,
        deliveryPrice: dp,
        totalPrice,
        // Con el total nuevo cambia el cambio que lleva el domiciliario.
        ...cambioParaTotal(order, totalPrice),
        updatedAt:     serverTimestamp(),
      })
      setEditingPrice(false)
    } finally { setLoading(false) }
  }


  const distColor = distanceKm === null ? 'text-coal/40'
    : distanceKm < 0 ? 'text-coal/30'
    : distanceKm > topeKm ? 'text-pepper'
    : distanceKm > 3 ? 'text-mustard'
    : 'text-mint'
  const distLabel = distanceKm === null ? 'Calculando distancia…'
    : distanceKm < 0 ? 'Distancia no disponible'
    : `~${distanceKm.toFixed(1)} km${porCalle} de la sede`

  // Timestamps
  const timestamps = [
    { label: 'Recibido',          ts: order.createdAt },
    { label: 'Cotizado',          ts: order.quotedAt },
    { label: 'Asignado',          ts: order.assignedAt },
    { label: 'Aceptado',          ts: order.acceptedAt },
    { label: 'En camino',         ts: order.inTransitAt },
    { label: 'Llegó al destino',  ts: order.arrivedAt },
    { label: 'Entregado',         ts: order.deliveredAt },
    { label: 'Completado',        ts: order.completedAt },
  ].filter(t => t.ts)

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-coal/50 backdrop-blur-sm animate-fade-in"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-cream w-full max-w-lg xl:max-w-6xl rounded-t-3xl sm:rounded-3xl max-h-[90dvh] overflow-y-auto scroll-custom animate-sheet-up sm:animate-scale-in">

        {/* Header */}
        <div className="sticky top-0 bg-cream/95 backdrop-blur-sm flex items-center justify-between px-5 py-4 border-b border-coal/10">
          <div className="flex items-center gap-2">
            {!editingOrderNum ? (
              <div className="flex items-center gap-2">
                <span className="font-display text-2xl text-cherry">
                  {order.orderNumber ? `#${order.orderNumber}` : '# —'}
                </span>
                {!['completed','rejected','cancelled'].includes(order.status) && (
                  <button
                    onClick={() => { setEditOrderNum(order.orderNumber || ''); setEditingOrderNum(true) }}
                    className="text-[10px] font-body font-semibold text-tangelo underline underline-offset-2"
                    title="Editar número de pedido"
                  >
                    <Pencil size={13} aria-hidden="true" />
                  </button>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="font-body text-sm text-coal/50">#</span>
                <input
                  className="input-field py-1 px-2 text-lg font-display text-cherry w-24"
                  value={editOrderNum}
                  onChange={e => setEditOrderNum(e.target.value)}
                  autoFocus
                  onKeyDown={e => { if (e.key === 'Enter') saveOrderNumber(); if (e.key === 'Escape') setEditingOrderNum(false) }}
                />
                <button onClick={saveOrderNumber} disabled={savingOrderNum || !editOrderNum.trim()}
                  className="text-xs font-body font-semibold text-mint bg-mint/10 px-2 py-1 rounded-lg hover:bg-mint/20">
                  {savingOrderNum ? '…' : <Check size={14} aria-hidden="true" />}
                </button>
                <button onClick={() => setEditingOrderNum(false)}
                  className="text-xs font-body text-coal/40 hover:text-coal/60">
                  <X size={14} aria-hidden="true" />
                </button>
              </div>
            )}
            {(() => {
              // Etapa real (no el status viejo) y, si hay, la excepción.
              const { etapa, excepcion } = etapaDe(order)
              const lista = order.deliveryMode === 'pickup' ? ETAPAS.recoger : ETAPAS.domicilio
              const texto = excepcion ? EXCEPCIONES[excepcion]?.texto : lista.find(e => e.id === etapa)?.texto
              const tono = excepcion ? 'bg-pepper/10 text-pepper' : etapa === 'entregado' ? 'bg-mint/15 text-mint' : etapa === 'enviado' ? 'bg-cherry/10 text-cherry' : 'bg-coal/10 text-coal/70'
              return texto ? <span className={`rounded-full px-2.5 py-1 font-body text-xs font-semibold ${tono}`}>{texto}</span> : null
            })()}
            <span className="hidden xl:inline font-body text-sm font-semibold text-coal ml-2 truncate max-w-[280px]">{order.name || order.clientName}</span>
            {(order.totalPrice || order.quotedPrice) ? (
              <span className="hidden xl:inline font-display text-xl text-coal tabular ml-2">${Number(order.totalPrice || order.quotedPrice).toLocaleString('es-CO')}</span>
            ) : null}
          </div>
          <div className="flex items-center gap-1">
            {alarmActive && onDismissAlarm && (
              <button
                onClick={onDismissAlarm}
                title="Silenciar alarma"
                className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-cherry/10 border border-cherry/30 text-cherry text-xs font-semibold font-body hover:bg-cherry/20 transition-colors"
              >
                <BellOff size={14} /> Silenciar
              </button>
            )}
            <button onClick={onClose} className="btn-icon"><X size={20} /></button>
          </div>
        </div>

        <div className="p-5 flex flex-col gap-4 xl:grid xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] xl:gap-6 xl:items-start">
          {/* En computador, dos columnas: a la izquierda lo que ES el pedido;
              a la derecha lo que la caja HACE (la acción de la etapa arriba). */}
          <div className="flex flex-col gap-4 min-w-0">
            <p className="font-body text-xs text-coal/40">{time}</p>
            {/* Client info */}
            <Section title="Cliente">
              <Row icon={User}  label="Nombre"   value={order.name || order.clientName} />
              <Row icon={Phone} label="Teléfono" value={order.phone} />
              {order.phone && (() => {
                const digits  = order.phone.replace(/\D/g, '')
                const waPhone = digits.length >= 10 ? `57${digits.slice(-10)}` : digits
                return (
                  <a href={`https://wa.me/${waPhone}`} target="_blank" rel="noreferrer"
                    className="inline-flex items-center gap-1.5 mt-1 px-3 py-1.5 rounded-xl bg-[#25D366]/10 border border-[#25D366]/30 text-[#25D366] font-body text-xs font-semibold hover:bg-[#25D366]/20 transition-colors w-fit">
                    <MessageCircle size={14} aria-hidden="true" /> WhatsApp cliente
                  </a>
                )
              })()}
            </Section>
            {/* Recoger en sede — sin dirección de entrega */}
            {pickup && (
              <Section title="Entrega">
                <div className="bg-mint/10 border border-mint/30 rounded-xl px-4 py-3 flex items-start gap-2">
                  <MapPin size={16} className="text-mint flex-shrink-0 mt-0.5" />
                  <p className="font-body text-sm text-coal/80">
                    <strong>Recoge en sede</strong>{orderSede?.name ? ` — ${orderSede.name}` : (order.sedeName ? ` — ${order.sedeName}` : '')}
                  </p>
                </div>
              </Section>
            )}
            {/* Address + distance */}
            {!pickup && (
            <Section title="Dirección de entrega">
              {!editingAddr ? (
                <>
                  <Row icon={MapPin} label="Dirección"  value={order.fullAddress} />
                  {order.barrio    && <Row icon={MapPin} label="Barrio"     value={order.barrio} />}
                  {order.reference && <Row icon={MapPin} label="Referencia" value={order.reference} />}

                  {order.fullAddress && (
                    <div className={`flex items-center gap-1.5 mt-1 ${distColor}`}>
                      {distanceKm !== null && distanceKm > 0 && distanceKm > topeKm && <AlertTriangle size={14} />}
                      <span className="font-body text-xs font-semibold">{distLabel}</span>
                      {distanceKm !== null && distanceKm > 0 && distanceKm > topeKm && (
                        <span className="font-body text-xs text-pepper">(fuera de cobertura recomendada)</span>
                      )}
                    </div>
                  )}

                  <div className="flex gap-2 mt-3">
                    <button onClick={openDirections} className="btn-secondary btn-sm flex-1">
                      <Navigation size={14} /> Ver ruta
                    </button>
                    <button onClick={openWaze} className="btn-secondary btn-sm flex-1">
                      <ExternalLink size={14} /> Waze
                    </button>
                  </div>

                  {!['rejected','cancelled','completed'].includes(order.status) && (
                    <button
                      onClick={() => { setAddrDraft(order.fullAddress || ''); setEditingAddr(true); setAddrSuggestions([]); setAddrSearched(false) }}
                      className="text-xs font-body font-semibold text-tangelo underline underline-offset-2 mt-2 inline-flex items-center gap-1"
                    >
                      <Pencil size={13} aria-hidden="true" /> Editar dirección
                    </button>
                  )}
                </>
              ) : (
                <div className="flex flex-col gap-2">
                  <div className="flex gap-2">
                    <input
                      className="input-field flex-1 text-sm"
                      value={addrDraft}
                      onChange={e => { setAddrDraft(e.target.value); setAddrSuggestions([]); setAddrSearched(false) }}
                      placeholder="Calle, número, barrio…"
                      autoComplete="off"
                    />
                    <button
                      onClick={searchAddr}
                      disabled={searchingAddr || !addrDraft.trim()}
                      className="btn-secondary btn-sm px-3 flex-shrink-0"
                      title="Buscar dirección"
                    >
                      {searchingAddr ? <span className="font-body text-xs">…</span> : <Search size={15} />}
                    </button>
                  </div>

                  {addrSuggestions.length > 0 && (
                    <div className="flex flex-col gap-1">
                      <p className="font-body text-[10px] text-coal/40 uppercase tracking-wider">Sugerencias</p>
                      {addrSuggestions.map((s, i) => (
                        <button key={i} type="button"
                          onClick={() => { setAddrDraft(s); setAddrSuggestions([]) }}
                          className="text-left text-xs font-body text-cherry/80 bg-cherry/5 rounded-lg px-3 py-1.5 border border-cherry/10 hover:bg-cherry/10 transition-colors">
                          {s}
                        </button>
                      ))}
                    </div>
                  )}

                  {addrSearched && addrSuggestions.length === 0 && (
                    <p className="font-body text-xs text-coal/40">
                      Sin sugerencias — edita la dirección manualmente.
                    </p>
                  )}

                  <div className="flex gap-2 mt-1">
                    <button onClick={() => { setEditingAddr(false); setAddrSuggestions([]); setAddrSearched(false) }} className="btn-secondary flex-1 btn-sm">
                      Cancelar
                    </button>
                    <button onClick={saveAddr} disabled={savingAddr || !addrDraft.trim()} className="btn-primary flex-1 btn-sm">
                      {savingAddr ? 'Guardando…' : 'Guardar'}
                    </button>
                  </div>
                </div>
              )}
            </Section>
            )}
            {/* Premio de fidelización canjeado — bloque MUY visible para que la caja
                no se confunda al ver productos que no aparecen en el precio. */}
            {order.loyaltyRedemption?.count > 0 && (
              <div className="bg-mint rounded-2xl p-5 shadow-lg">
                <p className="font-display text-xl tracking-wide text-cream">
                  EL CLIENTE USA SU PREMIO DE FIDELIZACIÓN
                </p>
                <div className="bg-cream/15 rounded-xl px-4 py-3 mt-2">
                  <p className="font-body text-xs uppercase tracking-wider text-cream/80 font-bold">
                    Agregar al pedido, GRATIS{order.loyaltyRedemption.count > 1 ? ` (x${order.loyaltyRedemption.count})` : ''}:
                  </p>
                  <p className="font-body text-base font-bold text-cream mt-1">
                    {order.loyaltyRedemption.count}x Hamburguesa Especial
                  </p>
                  <p className="font-body text-base font-bold text-cream">
                    {order.loyaltyRedemption.count}x Perro Grande con tocineta
                  </p>
                </div>
                <p className="font-body text-sm text-cream/95 mt-2 leading-relaxed">
                  <strong>NO lo cobres</strong> (no está en el total). Avísale a cocina que los incluya.
                  Lo ganó por 10 domicilios entregados en esta sede.
                </p>
              </div>
            )}
            {/* Order items */}
            <Section title="Pedido">
              {/* El cliente sumó algo después de mandar el pedido: las líneas que
                  empiezan con "+" son las nuevas y hay que volver a cotizar. */}
              {order.needsRequote && (
                <div className="bg-mustard/20 border border-mustard/50 rounded-xl p-3 mb-2">
                  <p className="font-body text-sm text-coal font-semibold flex items-start gap-2">
                    <AlertTriangle size={15} className="text-mustard flex-shrink-0 mt-0.5" aria-hidden="true" />
                    <span>El cliente agregó productos (líneas con “+”). Recalcula el valor y vuelve a cotizar.</span>
                  </p>
                </div>
              )}
              <div className="bg-smoked/60 rounded-xl p-3">
                <p className="font-body text-sm text-coal whitespace-pre-wrap">{order.items}</p>
              </div>
              {order.notes && (
                <div className="bg-mustard/10 border border-mustard/20 rounded-xl p-3 mt-2">
                  <p className="font-body text-xs text-coal/70 uppercase tracking-wider mb-1">Indicaciones</p>
                  <p className="font-body text-sm text-coal">{order.notes}</p>
                </div>
              )}
            </Section>
            {/* Payment — editable por la caja: al cliente se le cierra la sesión
                por inactividad y a veces no alcanza a elegir cómo paga. */}
            <Section title="Pago">
              {!editingPay ? (
                <>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <Row icon={CreditCard} label="Forma de pago"
                        value={order.payment || 'Sin definir — el cliente no lo eligió'} />
                    </div>
                    <button
                      onClick={() => {
                        setPayMethod(order.payment || '')
                        setPayMixtoEf(String(order.mixtoEfectivo ?? ''))
                        setPayMixtoTr(String(order.mixtoTransferencia ?? ''))
                        setPayError('')
                        setEditingPay(true)
                      }}
                      className="flex-shrink-0 btn-secondary btn-sm">
                      <Pencil size={13} /> {order.payment ? 'Cambiar' : 'Registrar'}
                    </button>
                  </div>

                  {!order.payment && (
                    <p className="font-body text-xs text-mustard mt-2 leading-relaxed flex items-start gap-1.5">
                      <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" aria-hidden="true" />
                      Este pedido no tiene forma de pago. Pregúntale al cliente y regístrala
                      aquí — si se le cerró la sesión, él no puede hacerlo.
                    </p>
                  )}
                  {order.paymentSetBy && (
                    <p className="font-body text-[11px] text-coal/40 mt-1">
                      Registrado por la caja ({order.paymentSetBy})
                    </p>
                  )}

                  {order.payment === 'Mixto' && (
                    <div className="mt-2 bg-smoked/50 rounded-xl p-3 flex flex-col gap-1">
                      {order.mixtoEfectivo > 0 && (
                        <div className="flex justify-between text-sm font-body">
                          <span className="text-coal/60">Efectivo:</span>
                          <span className="font-semibold text-coal">{fmt(order.mixtoEfectivo)}</span>
                        </div>
                      )}
                      {order.mixtoTransferencia > 0 && (
                        <div className="flex justify-between text-sm font-body">
                          <span className="text-coal/60">Transferencia:</span>
                          <span className="font-semibold text-coal">{fmt(order.mixtoTransferencia)}</span>
                        </div>
                      )}
                    </div>
                  )}
                </>
              ) : (
                <div className="bg-smoked/40 rounded-2xl p-3 flex flex-col gap-3">
                  <select className="input-field" value={payMethod}
                    onChange={e => setPayMethod(e.target.value)}>
                    <option value="" disabled>— ¿Cómo va a pagar? —</option>
                    <option>Efectivo</option>
                    <option>Transferencia</option>
                    <option>Nequi</option>
                    <option value="Mixto">Mixto (Efectivo + Transferencia)</option>
                  </select>

                  {payMethod === 'Mixto' && (
                    <>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="label-field">En efectivo</label>
                          <input className="input-field" inputMode="numeric" value={payMixtoEf}
                            onChange={e => setPayMixtoEf(onlyDigits(e.target.value))} placeholder="0" />
                        </div>
                        <div>
                          <label className="label-field">En transferencia</label>
                          <input className="input-field" inputMode="numeric" value={payMixtoTr}
                            onChange={e => setPayMixtoTr(onlyDigits(e.target.value))} placeholder="0" />
                        </div>
                      </div>
                      {/* Aviso, no bloqueo: puede haber abonos o vueltas. */}
                      {order.totalPrice > 0 && (Number(payMixtoEf) || 0) + (Number(payMixtoTr) || 0) !== order.totalPrice && (
                        <p className="font-body text-xs text-mustard">
                          Las dos partes suman {fmt((Number(payMixtoEf) || 0) + (Number(payMixtoTr) || 0))} y
                          el total es {fmt(order.totalPrice)}.
                        </p>
                      )}
                    </>
                  )}

                  {payError && <p className="font-body text-xs text-pepper">{payError}</p>}
                  <div className="flex gap-2">
                    <button onClick={() => { setEditingPay(false); setPayError('') }}
                      className="btn-secondary btn-sm flex-1">Cancelar</button>
                    <button onClick={savePayment} disabled={savingPay}
                      className="btn-primary btn-sm flex-1">
                      {savingPay ? 'Guardando…' : 'Guardar'}
                    </button>
                  </div>
                </div>
              )}
            </Section>
            {/* Billete y cambio — bloque propio y destacado (antes iba dentro de
                la sección de pago y solo si el cliente había indicado billete). */}
            <CashChangeNotice order={order} />
            {/* Transfer receipt */}
            {['Transferencia', 'Nequi', 'Mixto'].includes(order.payment) && order.transferReceiptUrl && (
              <div className={`card border flex flex-col gap-3 ${order.transferValidated ? 'border-mint/30 bg-mint/5' : 'border-mustard/30 bg-mustard/5'}`}>
                <div className="flex items-center gap-2">
                  <FileCheck size={16} className={order.transferValidated ? 'text-mint' : 'text-mustard'} />
                  <p className="font-display text-sm tracking-wide text-coal">Comprobante de transferencia</p>
                  {order.transferValidated && (
                    <span className="ml-auto text-[10px] font-bold uppercase tracking-wider text-mint bg-mint/10 px-2 py-0.5 rounded-full">Validado</span>
                  )}
                </div>
                <a href={order.transferReceiptUrl} target="_blank" rel="noreferrer"
                  className="flex items-center gap-2 text-sm font-body font-semibold text-cherry underline underline-offset-2">
                  <ExternalLink size={14} /> Ver comprobante
                </a>
                {!order.transferValidated && (
                  <button onClick={validateTransfer} disabled={validatingTransfer}
                    className="btn-mint btn-sm w-full">
                    <CheckCircle size={14} />
                    {validatingTransfer ? 'Validando…' : <><Check size={15} aria-hidden="true" /> Confirmar pago recibido</>}
                  </button>
                )}
              </div>
            )}
            {/* Quoted prices (if already set) */}
            {order.totalPrice > 0 && (
              <div className="card bg-tangelo/5 border border-tangelo/20">
                <div className="flex items-center justify-between mb-3">
                  <p className="font-display text-base tracking-wide">
                    {order.pagoAdelantado ? 'Valor del pedido (el cliente ya lo vio)' : order.status === 'pending' ? 'Valores del pedido' : 'Cotización enviada'}
                  </p>
                  {!['rejected','cancelled','completed'].includes(order.status) && !editingPrice && (
                    <button
                      onClick={() => { setEditQuotedPrice(String(order.quotedPrice ?? '')); setEditDeliveryPrice(String(order.deliveryPrice ?? '')); setEditingPrice(true) }}
                      className="text-xs font-body font-semibold text-tangelo underline underline-offset-2"
                    >
                      <Pencil size={13} aria-hidden="true" /> Editar precio
                    </button>
                  )}
                </div>
                {editingPrice ? (
                  <div className="flex flex-col gap-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="label-field">Valor pedido</label>
                        <input className="input-field" value={editQuotedPrice} inputMode="numeric"
                          onChange={e => setEditQuotedPrice(onlyDigits(e.target.value))} placeholder="$0" />
                      </div>
                      <div>
                        <label className="label-field">Domicilio</label>
                        <input className="input-field" value={editDeliveryPrice} inputMode="numeric"
                          onChange={e => setEditDeliveryPrice(onlyDigits(e.target.value))} placeholder="$0" />
                      </div>
                    </div>
                    <div className="bg-cherry/5 border border-cherry/20 rounded-xl px-4 py-2 flex items-center justify-between">
                      <span className="font-body text-sm font-semibold">TOTAL</span>
                      <span className="font-display text-lg text-cherry">{fmt((parseFloat(editQuotedPrice)||0) + (parseFloat(editDeliveryPrice)||0))}</span>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => setEditingPrice(false)} className="btn-secondary flex-1 btn-sm">Cancelar</button>
                      <button onClick={saveEditedPrice} disabled={loading} className="btn-primary flex-1 btn-sm">
                        {loading ? 'Guardando…' : 'Guardar precio'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    <div className="flex justify-between font-body text-sm">
                      <span className="text-coal/60">Valor pedido:</span>
                      <span className="font-semibold">{fmt(order.quotedPrice)}</span>
                    </div>
                    <div className="flex justify-between font-body text-sm">
                      <span className="text-coal/60">Domicilio:</span>
                      <span className="font-semibold">{fmt(order.deliveryPrice)}</span>
                    </div>
                    <div className="border-t border-tangelo/20 pt-2 flex justify-between">
                      <span className="font-body font-bold text-coal">TOTAL:</span>
                      <span className="font-display text-xl text-tangelo">{fmt(order.totalPrice)}</span>
                    </div>
                  </div>
                )}
                {order.cashierNotes && !editingPrice && (
                  <div className="mt-3 bg-mustard/10 rounded-xl p-3">
                    <p className="font-body text-xs text-coal/50 uppercase tracking-wider mb-1">Nota al cliente</p>
                    <p className="font-body text-sm text-coal">{order.cashierNotes}</p>
                  </div>
                )}
              </div>
            )}
            {/* Driver info */}
            {order.driverName && (
              <Section title="Domiciliario">
                <Row icon={Bike} label="Asignado a" value={order.driverName} />
                {order.driverNotes && <Row icon={MessageSquare} label="Notas" value={order.driverNotes} />}
                {['in_transit','arrived'].includes(order.status) && order.driverLat && (
                  <button onClick={openDriverTracking} className="btn-primary btn-sm w-full mt-2">
                    <Navigation size={14} /> Ver ubicación en tiempo real
                  </button>
                )}
              </Section>
            )}
            {/* Rejection info */}
            {order.status === 'rejected' && order.rejectionReason && (
              <div className="bg-pepper/10 border border-pepper/30 rounded-2xl p-4">
                <p className="font-display text-base text-pepper tracking-wide mb-1 flex items-center gap-2"><CircleX size={17} aria-hidden="true" /> Pedido rechazado</p>
                <p className="font-body text-sm text-coal/80">Motivo: {order.rejectionReason}</p>
              </div>
            )}
            {/* Timestamps */}
            {timestamps.length > 0 && (
              <div className="card">
                <div className="flex items-center gap-2 mb-3">
                  <Clock size={16} className="text-coal/40" />
                  <p className="font-display text-sm tracking-wide text-coal/60">Registro de tiempos</p>
                </div>
                <div className="flex flex-col gap-2">
                  {timestamps.map(t => (
                    <div key={t.label} className="flex items-center justify-between">
                      <span className="font-body text-xs text-coal/50">{t.label}</span>
                      <span className="font-body text-xs font-semibold text-coal">{fmtTime(t.ts)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="flex flex-col gap-4 min-w-0">
            {etapaDe(order).excepcion === 'cancelacion_solicitada' && (
              <div className="bg-pepper/10 border-2 border-pepper rounded-2xl p-4 flex flex-col gap-3">
                <div>
                  <p className="font-display text-lg tracking-wide text-pepper flex items-center gap-2">
                    <AlertTriangle size={18} /> El cliente pidió cancelar
                  </p>
                  <p className="font-body text-sm text-coal/80 mt-1">
                    {order.excepcionMotivo ? <>Motivo: «{order.excepcionMotivo}»</> : 'No dejó motivo.'}
                  </p>
                  <p className="font-body text-[11px] text-coal/55 mt-1">
                    {enReparto
                      ? 'El pedido ya va en camino: lo decide administración (§9.1). Ya le avisamos; mientras tanto, coordina con el domiciliario.'
                      : 'No se puede pasar a preparación hasta resolverlo.'}
                  </p>
                </div>
                {(!enReparto || esAdmin) && (
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => resolverCancelacion(true)} disabled={loading}
                    className="py-2.5 rounded-xl bg-pepper text-cream font-body text-sm font-bold disabled:opacity-50">
                    Cancelar pedido
                  </button>
                  <button onClick={() => resolverCancelacion(false)} disabled={loading}
                    className="py-2.5 rounded-xl border-2 border-coal/20 bg-white text-coal font-body text-sm font-bold disabled:opacity-50">
                    Seguir con el pedido
                  </button>
                </div>
                )}
              </div>
            )}
            {/* Cambio propuesto al cliente (Fase 7, §9.2): esperando o rechazado */}
            {etapaDe(order).excepcion === 'cambio_pendiente' && order.cambioPropuesto?.estado === 'pendiente' && (
              <div className="bg-tangelo/10 border-2 border-tangelo rounded-2xl p-4 flex flex-col gap-2">
                <p className="font-display text-lg tracking-wide text-tangelo">⏳ Cambio propuesto, esperando al cliente</p>
                <p className="font-body text-sm text-coal/80">«{order.cambioPropuesto.motivo}» · nuevo total {fmt(order.cambioPropuesto.totalPrice)}</p>
                <p className="font-body text-[11px] text-coal/55">
                  Propuesto {order.cambioPropuesto.propuestoAt?.toDate ? formatDistanceToNowStrict(order.cambioPropuesto.propuestoAt.toDate(), { addSuffix: true, locale: es }) : 'ahora'}.
                  No se puede preparar hasta que responda. Si no responde, llámalo o escríbele.
                </p>
                <button onClick={retirarCambio} disabled={loading}
                  className="py-2 rounded-xl border-2 border-coal/20 bg-white text-coal font-body text-sm font-semibold disabled:opacity-50">
                  Retirar la propuesta (queda el pedido original)
                </button>
              </div>
            )}
            {!etapaDe(order).excepcion && order.cambioPropuesto?.estado === 'rechazado' && (
              <div className="bg-pepper/10 border border-pepper/40 rounded-2xl p-4 flex flex-col gap-2">
                <p className="font-display text-base tracking-wide text-pepper flex items-center gap-2"><CircleX size={17} aria-hidden="true" /> El cliente rechazó el cambio</p>
                <p className="font-body text-xs text-coal/70">Queda el pedido original. Revisa si lo puedes preparar así; si no, cancélalo con motivo.</p>
                <button onClick={() => updateDoc(doc(db, 'orders', order.id), { 'cambioPropuesto.estado': 'rechazado_visto' }).catch(() => {})}
                  className="font-body text-xs text-coal/60 underline underline-offset-2 self-start">Entendido</button>
              </div>
            )}
            {/* ── PEDIDO COMPLETO: el cliente ya pagó o eligió pago al enviar ── */}
            {order.status === 'pending' && !rejecting && order.pagoAdelantado && !ajustarValores && (
              <div className="bg-mint/10 border-2 border-mint/40 rounded-2xl p-4 flex flex-col gap-3">
                <p className="font-display text-lg text-coal tracking-wide flex items-center gap-2"><CircleCheck size={19} className="text-mint" aria-hidden="true" /> Pedido completo — listo para aceptar</p>
                <p className="font-body text-xs text-coal/70 leading-relaxed">
                  El cliente vio el total y ya eligió cómo paga
                  {order.payment === 'Efectivo' && order.cashBillAmount != null && (
                    order.cashChange > 0
                      ? <> — paga con <strong>{fmt(order.cashBillAmount)}</strong>, lleva <strong>{fmt(order.cashChange)}</strong> de cambio</>
                      : <> — paga <strong>exacto</strong></>
                  )}
                  {['Transferencia', 'Nequi', 'Mixto'].includes(order.payment) && <> — el comprobante está arriba</>}.
                  Al aceptar queda confirmado para el cliente.
                </p>
                <div className="bg-cream rounded-xl px-4 py-3 flex flex-col gap-1">
                  <div className="flex justify-between font-body text-sm">
                    <span className="text-coal/60">Productos:</span><span className="font-semibold">{fmt(order.quotedPrice)}</span>
                  </div>
                  {!pickup && (
                    <div className="flex justify-between font-body text-sm">
                      <span className="text-coal/60">Domicilio{order.deliveryKm != null ? ` (${order.deliveryKm} km)` : ''}:</span>
                      <span className="font-semibold">{fmt(order.deliveryPrice)}</span>
                    </div>
                  )}
                  {order.saldoAplicado?.ids?.length > 0 && (
                    <div className="flex justify-between font-body text-sm text-mint font-semibold">
                      <span>Saldo a favor del cliente:</span>
                      <span>−{fmt(order.saldoAplicado.usado ?? order.saldoAplicado.monto)}</span>
                    </div>
                  )}
                  <div className="border-t border-coal/10 pt-1.5 flex justify-between">
                    <span className="font-body font-bold text-coal">TOTAL · {order.payment}</span>
                    <span className="font-display text-xl text-cherry">{fmt(order.totalPrice)}</span>
                  </div>
                </div>
                {desajuste && (
                  <div className="bg-mustard/10 border border-mustard/40 rounded-xl p-3 flex items-start gap-2">
                    <AlertTriangle size={14} className="text-[#8a5a00] flex-shrink-0 mt-0.5" />
                    <p className="text-xs font-body text-coal/75">
                      El domicilio no cuadra con la distancia: por {distanceKm.toFixed(1)} km{porCalle} corresponde{' '}
                      <strong>{fmt(sugerido.precio)}</strong> y el pedido trae {fmt(order.deliveryPrice)}. Revísalo antes de aceptar.
                    </p>
                  </div>
                )}
                {['Transferencia', 'Nequi', 'Mixto'].includes(order.payment) && !order.transferValidated && (
                  <p className="font-body text-[11px] text-[#8a5a00] flex items-start gap-1.5">
                    <AlertTriangle size={12} className="flex-shrink-0 mt-0.5" aria-hidden="true" />
                    La transferencia aún no está marcada como recibida. Revisa el comprobante y confírmala arriba.
                  </p>
                )}
                <div className="flex gap-2">
                  <button
                    onClick={() => setRejecting(true)}
                    className="flex items-center justify-center gap-2 px-4 py-2 rounded-xl border-2 border-pepper/40 text-pepper font-semibold text-sm hover:bg-pepper/10 transition-colors"
                  >
                    <XCircle size={16} /> Rechazar
                  </button>
                  <button onClick={sendQuote} disabled={loading} className="btn-mint flex-1">
                    <CheckCircle2 size={16} />
                    {loading ? 'Aceptando…' : 'Aceptar pedido'}
                  </button>
                </div>
                <button type="button" onClick={() => setAjustarValores(true)}
                  className="self-start font-body text-[11px] font-semibold text-tangelo underline underline-offset-2">
                  Algún valor está mal — corregir antes de aceptar
                </button>
              </div>
            )}
            {/* ── COTIZACIÓN FORM (only for pending orders) ── */}
            {order.status === 'pending' && !rejecting && (!order.pagoAdelantado || ajustarValores) && (
              <div className="bg-mustard/10 border border-mustard/30 rounded-2xl p-4 flex flex-col gap-3">
                {/* En "Recoger en sede" no hay domicilio que cotizar: el pedido
                    solo se confirma para preparación. */}
                <p className="font-display text-lg text-coal tracking-wide">
                  {pickup ? 'Confirmar pedido para preparación' : 'Cotizar pedido al cliente'}
                </p>
                {pickup && (
                  <p className="font-body text-xs text-coal/60">
                    El cliente <strong>recoge en sede</strong>: no se cotiza domicilio. Confirma el valor del pedido y pasa a preparación.
                  </p>
                )}

                {!pickup && distanceKm !== null && distanceKm > 0 && distanceKm > topeKm && (
                  <div className="flex items-center gap-2 bg-pepper/10 border border-pepper/30 rounded-xl px-3 py-2">
                    <AlertTriangle size={14} className="text-pepper flex-shrink-0" />
                    <p className="font-body text-xs text-pepper">
                      {distanceKm.toFixed(1)} km{porCalle} de la sede — verifica antes de confirmar.
                    </p>
                  </div>
                )}

                {/* De dónde salió el valor del domicilio: calculado por distancia,
                    o el cliente pidió que la caja lo revise. Sin esto el cajero no
                    sabe si ya está cobrado o si le toca cotizarlo. */}
                {order.deliveryPriceReview ? (
                  <div className="bg-mustard/10 border border-mustard/40 rounded-xl p-3 flex items-start gap-2">
                    <AlertTriangle size={14} className="text-[#8a5a00] flex-shrink-0 mt-0.5" />
                    <p className="text-xs font-body text-coal/75">
                      <strong>El cliente pidió revisar el domicilio.</strong> Le pareció caro
                      o cree que la dirección quedó mal. Cotízalo tú
                      {order.deliveryKm != null && <> — el sistema lo midió a {order.deliveryKm} km</>}.
                    </p>
                  </div>
                ) : order.deliveryPriceAuto ? (
                  <div className="bg-mint/10 border border-mint/30 rounded-xl p-3 flex items-start gap-2">
                    <CheckCircle size={14} className="text-mint flex-shrink-0 mt-0.5" />
                    <p className="text-xs font-body text-coal/75">
                      <strong>Domicilio cobrado automáticamente.</strong> El cliente ya vio
                      ${Number(order.deliveryPrice || 0).toLocaleString('es-CO')}
                      {order.deliveryKm != null && <> ({order.deliveryKm} km)</>}. Cámbialo
                      solo si está mal.
                    </p>
                  </div>
                ) : null}

                {quoteErrors.length > 0 && (
                  <div className="bg-pepper/10 border border-pepper/20 rounded-xl p-3">
                    {quoteErrors.map(e => (
                      <p key={e} className="text-xs text-pepper font-body flex items-center gap-1">
                        <AlertTriangle size={12} /> {e}
                      </p>
                    ))}
                  </div>
                )}

                {/* Order number */}
                <div>
                  <label className="label-field">Número de orden *</label>
                  <div className="relative">
                    <Hash size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-coal/40" />
                    <input className="input-field pl-9" value={localOrderNumber}
                      onChange={e => setLocalOrderNumber(e.target.value)} placeholder="Ej: 001" />
                  </div>
                </div>

                {/* Prices */}
                <div className={pickup ? '' : 'grid grid-cols-2 gap-3'}>
                  <div>
                    <label className="label-field">Valor pedido</label>
                    <input className="input-field" value={localQuotedPrice} inputMode="numeric"
                      onChange={e => setLocalQuotedPrice(onlyDigits(e.target.value))} placeholder="$0" />
                  </div>
                  {!pickup && (
                    <div>
                      <label className="label-field">Domicilio</label>
                      <input className="input-field" value={localDeliveryPrice} inputMode="numeric"
                        onChange={e => setLocalDeliveryPrice(onlyDigits(e.target.value))} placeholder="$0" />
                    </div>
                  )}
                </div>

                {/* Sugerencia por distancia: el cajero no tiene que calcular ni
                    acordarse de la tabla. Un toque y queda puesto. */}
                {!pickup && sugerido && (
                  <div className={`rounded-xl border px-4 py-3 ${
                    desajuste ? 'bg-mustard/10 border-mustard/40' : 'bg-mint/10 border-mint/30'}`}>
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div className="min-w-0">
                        <p className="font-body text-xs font-bold text-coal">
                          {sugerido.estado === 'fuera_de_rango'
                            ? `Fuera de cobertura — ${distanceKm.toFixed(1)} km`
                            : `Sugerido por distancia: ${fmt(sugerido.precio)}`}
                        </p>
                        <p className="font-body text-[11px] text-coal/55 mt-0.5">
                          {sugerido.estado === 'fuera_de_rango'
                            ? `Solo se despacha hasta ${topeKm} km${porCalle}. Ofrécele recoger en sede.`
                            : <>
                                {distanceKm.toFixed(1)} km{porCalle} desde {orderSede?.name}
                                {order.addrLat != null ? ' (punto exacto)' : ' (dirección aproximada)'}
                              </>}
                        </p>
                        {desajuste && (
                          <p className="font-body text-[11px] font-semibold text-[#8a5a00] mt-1 flex items-start gap-1.5">
                            <AlertTriangle size={12} className="flex-shrink-0 mt-0.5" aria-hidden="true" />
                            No cuadra con lo que trae el pedido ({fmt(order.deliveryPrice)}). Revísalo antes de cerrar.
                          </p>
                        )}
                      </div>
                      {sugerido.estado === 'ok' && (
                        <button
                          type="button"
                          onClick={() => setLocalDeliveryPrice(String(sugerido.precio))}
                          className="btn-secondary btn-sm flex-shrink-0"
                        >
                          Usar {fmt(sugerido.precio)}
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {order.saldoAplicado?.ids?.length > 0 && (
                  <div className="bg-mint/10 border border-mint/40 rounded-xl px-4 py-2.5">
                    <p className="font-body text-xs text-coal/80">
                      El cliente usa <strong>{fmt(order.saldoAplicado.monto)}</strong> de saldo a favor.
                      Se descuenta solo al enviar: cobrará{' '}
                      <strong>{fmt(aplicarSaldo(localTotal, order.saldoAplicado.monto).aPagar)}</strong>.
                    </p>
                  </div>
                )}

                {/* Total */}
                {(lqp > 0 || ldp > 0) && (
                  <div className="bg-cherry/5 border border-cherry/20 rounded-xl px-4 py-3 flex items-center justify-between">
                    <span className="font-body font-semibold text-sm text-coal">TOTAL</span>
                    <span className="font-display text-xl text-cherry">{fmt(localTotal)}</span>
                  </div>
                )}

                {/* Cashier note to client */}
                <div>
                  <label className="label-field">
                    <MessageSquare size={12} className="inline mr-1" />
                    Comentario para el cliente
                  </label>
                  <textarea className="textarea-field h-16 scroll-custom" value={localCashierNotes}
                    onChange={e => setLocalCashierNotes(e.target.value)}
                    placeholder="Ej: Tu pedido estará listo en 30 min, espera la confirmación de pago…" />
                </div>

                {/* Buttons */}
                <div className="flex flex-col gap-2">
                  <button onClick={sendQuote} disabled={loading || !localOrderNumber.trim()} className="btn-primary w-full">
                    <CheckCircle2 size={16} aria-hidden="true" />
                    {loading ? 'Enviando…'
                      : order.pagoAdelantado ? 'Guardar y aceptar pedido'
                      : pickup ? 'Confirmar pedido' : 'Enviar cotización al cliente'}
                  </button>
                  <button
                    onClick={() => setRejecting(true)}
                    className="btn btn-sm w-full justify-center border border-pepper/40 text-pepper [@media(hover:hover)]:hover:bg-pepper/10"
                  >
                    <XCircle size={15} aria-hidden="true" /> Rechazar
                  </button>
                </div>
                {order.pagoAdelantado && (
                  <p className="font-body text-[11px] text-[#8a5a00] leading-relaxed flex items-start gap-1.5">
                    <AlertTriangle size={12} className="flex-shrink-0 mt-0.5" aria-hidden="true" />
                    El cliente ya pagó o eligió pago con el valor anterior ({fmt(order.totalPrice)}).
                    Si cambias el total, avísale por el chat
                    {['Transferencia', 'Nequi', 'Mixto'].includes(order.payment) ? ' para cobrar o devolver la diferencia' : ''}.
                  </p>
                )}
              </div>
            )}
            {/* Rejection form */}
            {order.status === 'pending' && rejecting && (
              <div className="bg-pepper/10 border border-pepper/30 rounded-2xl p-4 flex flex-col gap-3">
                <p className="font-display text-lg text-pepper tracking-wide flex items-center gap-2"><CircleX size={19} aria-hidden="true" /> Rechazar pedido</p>
                <p className="font-body text-xs text-coal/60">Escribe el motivo del rechazo. El cliente lo verá en su panel.</p>
                <div className="flex flex-col gap-1">
                  <button onClick={() => setRejectReason('Fuera del área de cobertura (más de 5 km de la sede)')}
                    className="btn btn-sm justify-start border border-coal/15 text-coal/70 [@media(hover:hover)]:hover:border-pepper/40">
                    Fuera de cobertura (&gt;5 km)
                  </button>
                  <button onClick={() => setRejectReason('No tenemos disponibilidad en este momento')}
                    className="btn btn-sm justify-start border border-coal/15 text-coal/70 [@media(hover:hover)]:hover:border-pepper/40">
                    Sin disponibilidad
                  </button>
                  <button onClick={() => setRejectReason('Dirección incompleta o no encontrada')}
                    className="btn btn-sm justify-start border border-coal/15 text-coal/70 [@media(hover:hover)]:hover:border-pepper/40">
                    Dirección no encontrada
                  </button>
                </div>
                <textarea className="textarea-field h-20 scroll-custom" placeholder="Motivo del rechazo…"
                  value={rejectReason} onChange={e => setRejectReason(e.target.value)} />
                <div className="flex flex-col gap-2">
                  <button onClick={rejectOrder} disabled={loading || !rejectReason.trim()} className="btn-danger w-full">
                    {loading ? 'Rechazando…' : 'Confirmar rechazo'}
                  </button>
                  <button onClick={() => setRejecting(false)} className="btn-ghost w-full">Cancelar</button>
                </div>
              </div>
            )}
            {/* Gestión del pedido a domicilio: el cajero marca preparación y/o asigna domiciliario */}
            {!pickup && ['quoted','assigned','accepted','preparing'].includes(order.status) && (
              <div className="bg-mustard/10 border border-mustard/30 rounded-2xl p-4 flex flex-col gap-3">
                <p className="font-display text-lg text-coal tracking-wide">Gestión del pedido</p>
                <p className="font-body text-sm text-coal/70">
                  Configura el avance del domicilio. El cliente lo verá al instante.
                </p>
                {order.status === 'preparing'
                  ? (etapaDe(order).etapa === 'listo'
                      ? <p className="font-body text-sm text-mint font-semibold">Listo: esperando al domiciliario</p>
                      : (
                        <button onClick={markListo} disabled={loading} className="btn-primary w-full">
                          {loading ? 'Procesando…' : 'Marcar listo'}
                        </button>
                      ))
                  : (
                    <button onClick={markPreparing} disabled={loading} className="btn-mustard w-full">
                      {loading ? 'Procesando…' : 'Marcar en preparación'}
                    </button>
                  )}
                {['quoted','preparing'].includes(order.status) && onReassign && (
                  <button onClick={() => { onClose(); onReassign(order) }} className="btn-primary w-full">
                    <Bike size={16} /> Asignar domiciliario
                  </button>
                )}
              </div>
            )}
            {/* Recoger en sede — entregar y cobrar (no hay domiciliario) */}
            {pickup && ['quoted', 'preparing'].includes(order.status) && (
              <div className="bg-mint/10 border border-mint/30 rounded-2xl p-4 flex flex-col gap-3">
                <p className="font-display text-lg text-coal tracking-wide flex items-center gap-2"><Store size={18} aria-hidden="true" /> Recoge en sede</p>
                <p className="font-body text-sm text-coal/70">
                  Cuando el cliente recoja su pedido y pague, márcalo como entregado.
                </p>
                {order.status === 'quoted' && (
                  <button onClick={markPreparing} disabled={loading} className="btn-mustard w-full">
                    {loading ? 'Procesando…' : 'Marcar en preparación'}
                  </button>
                )}
                {order.status === 'preparing' && (etapaDe(order).etapa === 'listo'
                  ? <p className="font-body text-sm text-mint font-semibold">Listo para recoger: el cliente ya fue avisado</p>
                  : (
                    <button onClick={markListo} disabled={loading} className="btn-mustard w-full">
                      {loading ? 'Procesando…' : 'Marcar listo para recoger'}
                    </button>
                  ))}
                {order.totalPrice > 0 && (
                  <div className="flex justify-between font-body text-sm">
                    <span className="text-coal/60">Total a cobrar:</span>
                    <span className="font-display text-lg text-mint">{fmt(order.totalPrice)}</span>
                  </div>
                )}
                <button onClick={markCashReceived} disabled={loading} className="btn-primary w-full">
                  {loading ? 'Procesando…' : 'Entregado y pagado'}
                </button>
              </div>
            )}
            {/* Cash cuadre action */}
            {order.status === 'pending_cuadre' && (
              <div className="bg-mustard/10 border border-mustard/30 rounded-2xl p-4 flex flex-col gap-3">
                <p className="font-display text-lg text-coal tracking-wide flex items-center gap-2"><Banknote size={18} aria-hidden="true" /> Cuadre de caja</p>
                <p className="font-body text-sm text-coal/70">
                  El domiciliario ya entregó el pedido. Marca como recibido cuando te entregue el dinero.
                </p>
                {order.totalPrice > 0 && (
                  <div className="flex justify-between font-body text-sm">
                    <span className="text-coal/60">Total que debe entregar:</span>
                    <span className="font-bold text-mustard">{fmt(order.totalPrice)}</span>
                  </div>
                )}
                <button onClick={markCashReceived} disabled={loading} className="btn-mustard w-full">
                  <DollarSign size={16} />
                  {loading ? 'Procesando…' : <><Check size={15} aria-hidden="true" /> Dinero recibido</>}
                </button>
              </div>
            )}
            {/* Reasignar domiciliario — mientras no haya salido (Fase 5: ya no hay
                "aceptar"). Nunca en "recoger en sede": ahí no hay domiciliario. */}
            {!pickup && ['assigned', 'accepted', 'preparing'].includes(order.status) && order.driverEmail && onReassign && (
              <div className="bg-tangelo/10 border border-tangelo/30 rounded-2xl p-4 flex flex-col gap-3">
                <p className="font-display text-base tracking-wide text-tangelo flex items-center gap-2"><Bike size={17} aria-hidden="true" /> Reasignar domiciliario</p>
                <p className="font-body text-xs text-coal/60">
                  {order.status === 'assigned'
                    ? 'El domiciliario aún no ha aceptado. Avísale por WhatsApp o cámbialo.'
                    : `Lo tiene ${order.driverName || order.driverEmail}. Antes de que salga puedes pasárselo a otro (con motivo; se les avisa a los dos).`}
                </p>
                {/* WhatsApp notify */}
                {(() => {
                  const driver  = drivers.find(d => d.id === order.driverEmail)
                  const rawPhone = driver?.phone || ''
                  const digits   = rawPhone.replace(/\D/g, '')
                  const waPhone  = digits.length >= 10 ? `57${digits.slice(-10)}` : ''
                  const msg = encodeURIComponent(
                    `Hola ${order.driverName || 'domiciliario'}, tienes un pedido${order.orderNumber ? ` #${order.orderNumber}` : ''} asignado en DeliStars. Ábrelo en la app. ¡Gracias! `
                  )
                  const waUrl = waPhone
                    ? `https://wa.me/${waPhone}?text=${msg}`
                    : `https://wa.me/?text=${msg}`
                  return (
                    <a href={waUrl} target="_blank" rel="noreferrer"
                      className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl border-2 border-[#25D366]/50 text-[#25D366] bg-[#25D366]/5 font-semibold text-sm font-body hover:bg-[#25D366]/15 transition-colors">
                      <MessageCircle size={14} aria-hidden="true" /> {waPhone ? 'Avisar por WhatsApp' : 'Enviar WhatsApp (elige contacto)'}
                    </a>
                  )
                })()}
                <button
                  onClick={() => { onClose(); onReassign(order) }}
                  className="btn-primary w-full"
                >
                  <Bike size={16} /> Cambiar domiciliario
                </button>
              </div>
            )}
            <BloqueDevolucion order={order} user={user} />
            {/* Proponer un cambio al cliente (Fase 7, §9.2): solo antes de preparar */}
            {puedeProponer && (
              <div className="bg-white border-2 border-coal/10 rounded-2xl p-4 flex flex-col gap-3">
                {!proponiendo ? (
                  <button onClick={() => setProponiendo(true)} className="w-full py-2.5 rounded-xl border border-tangelo/50 text-tangelo font-body text-sm font-semibold hover:bg-tangelo/5 flex items-center justify-center gap-1.5">
                    <Pencil size={15} /> Proponer un cambio al cliente
                  </button>
                ) : (
                  <>
                    <p className="font-display text-base tracking-wide text-coal flex items-center gap-2"><Pencil size={16} aria-hidden="true" /> Proponer un cambio</p>
                    <p className="font-body text-xs text-coal/60">
                      El cliente ve su pedido original y cómo quedaría, y acepta o rechaza. Hasta que responda no se puede preparar.
                    </p>
                    <div>
                      <label className="label-field">Productos como quedarían</label>
                      <textarea className="textarea-field h-28 scroll-custom text-sm" value={propItems} onChange={e => setPropItems(e.target.value)} />
                    </div>
                    <div className={`grid gap-2 ${pickup ? 'grid-cols-1' : 'grid-cols-2'}`}>
                      <div>
                        <label className="label-field">Precio productos</label>
                        <input className="input-field" inputMode="numeric" value={propQp} onChange={e => setPropQp(e.target.value.replace(/[^\d]/g, ''))} />
                      </div>
                      {!pickup && (
                        <div>
                          <label className="label-field">Domicilio</label>
                          <input className="input-field" inputMode="numeric" value={propDp} onChange={e => setPropDp(e.target.value.replace(/[^\d]/g, ''))} />
                        </div>
                      )}
                    </div>
                    <div>
                      <label className="label-field">Motivo (lo ve el cliente) *</label>
                      <input className="input-field" placeholder="Ej: Se nos acabó la tocineta; va con queso" value={propMotivo} onChange={e => setPropMotivo(e.target.value)} />
                    </div>
                    <p className="font-body text-sm text-coal">
                      Nuevo total: <strong className="text-cherry">{fmt((Number(propQp) || 0) + (pickup ? 0 : Number(propDp) || 0))}</strong>
                    </p>
                    {(order.pagoAdelantado || Number(order.saldoAplicado?.monto) > 0) && (
                      <p className="font-body text-xs text-tangelo">
                        {order.pagoAdelantado ? 'Este pedido ya está pagado' : 'Este pedido usa saldo a favor'}: el total no puede cambiar. Si no lo puedes preparar igual, cancélalo con motivo.
                      </p>
                    )}
                    {propError && <p className="font-body text-xs text-pepper">{propError}</p>}
                    <div className="flex gap-2">
                      <button onClick={() => { setProponiendo(false); setPropError('') }} className="btn-secondary flex-1">Cancelar</button>
                      <button onClick={enviarPropuesta} disabled={loading} className="btn-primary flex-1">{loading ? 'Enviando…' : 'Enviar propuesta'}</button>
                    </div>
                  </>
                )}
              </div>
            )}
            {/* Comanda de cocina (Fase 7, §19): la imprime el aparato marcado como impresora */}
            {!['cancelled', 'rejected'].includes(order.status) && <ComandaPedido order={order} />}
            {/* Facturación — botón grande y claro, en todos los pedidos */}
            <button
              onClick={toggleFacturado}
              className={`w-full flex items-center gap-3 rounded-2xl border-2 px-4 py-3 transition-colors ${
                order.facturado
                  ? 'bg-mint/15 border-mint hover:bg-mint/25'
                  : 'bg-white border-coal/15 hover:border-coal/30 hover:bg-smoked/40'
              }`}
            >
              <span className={`flex items-center justify-center w-7 h-7 rounded-lg border-2 flex-shrink-0 transition-colors ${
                order.facturado ? 'bg-mint border-mint text-cream' : 'bg-white border-coal/25 text-transparent'
              }`}>
                <Check size={18} strokeWidth={3.5} />
              </span>
              <Receipt size={18} className={order.facturado ? 'text-mint' : 'text-coal/40'} />
              <div className="text-left">
                <p className={`font-body text-sm font-bold ${order.facturado ? 'text-mint' : 'text-coal/70'}`}>
                  {order.facturado ? 'Facturado' : 'Sin facturar'}
                </p>
                <p className="font-body text-[11px] text-coal/40">
                  {order.facturado
                    ? `Ingresado al sistema${order.facturadoBy ? ` · ${order.facturadoBy.split('@')[0]}` : ''}`
                    : 'Toca para marcarlo como ingresado al sistema de facturación'}
                </p>
              </div>
            </button>
            {/* Chat con el cliente — disponible DESDE que entra el pedido (pending),
                justo debajo de sus datos para que el cajero pueda escribirle sin
                tener que cotizar primero ni bajar hasta el fondo del detalle. */}
            <ClientChat order={order} unreadCount={unreadClientMsgs} />
            {/* El chat cliente ↔ domiciliario (§8.3) no es de la caja; administración
                lo puede leer para resolver reclamos. */}
            {esAdmin && order.driverEmail && order.deliveryMode !== 'pickup' && (
              <ChatDomiciliario order={order} rol="admin" soloLectura />
            )}
            {/* Pedido de caja sin cuenta: código privado para que el cliente lo siga */}
            <CodigoPrivado order={order} />
            {/* Comments */}
            <div className="card border border-coal/10 flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <MessageSquare size={15} className="text-tangelo" />
                <p className="font-display text-sm tracking-wide text-coal">Comentarios del pedido</p>
              </div>

              {(order.comments?.length > 0) ? (
                <div className="flex flex-col gap-2">
                  {[...order.comments].sort((a,b) => a.ts - b.ts).map((c, i) => (
                    <div key={i} className={`rounded-xl px-3 py-2 ${c.role === 'cashier' ? 'bg-tangelo/10 border border-tangelo/20' : 'bg-mint/10 border border-mint/20'}`}>
                      <p className={`font-body text-[10px] font-bold uppercase tracking-wider mb-0.5 ${c.role === 'cashier' ? 'text-tangelo' : 'text-mint'}`}>
                        {c.role === 'cashier' ? 'Cajero' : 'Domiciliario'} · {c.name}
                      </p>
                      <p className="font-body text-sm text-coal">{c.text}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="font-body text-xs text-coal/40">Sin comentarios aún</p>
              )}

              <div className="flex gap-2">
                <textarea
                  className="textarea-field flex-1 h-14 scroll-custom text-sm"
                  placeholder="Comentario para el domiciliario (ej: tocar timbre 3B, llamar al llegar…)"
                  value={commentText}
                  onChange={e => setCommentText(e.target.value)}
                />
                <button onClick={sendComment} disabled={sendingComment || !commentText.trim()}
                  className="btn-primary px-3 self-end">
                  <Send size={16} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function Section({ title, children }) {
  return (
    <div>
      <p className="label-field mb-2">{title}</p>
      <div className="flex flex-col gap-1.5">{children}</div>
    </div>
  )
}

function Row({ icon: Icon, label, value }) {
  if (!value) return null
  return (
    <div className="flex items-start gap-2">
      <Icon size={14} className="text-coal/40 flex-shrink-0 mt-0.5" />
      <div>
        <span className="font-body text-xs text-coal/50">{label}: </span>
        <span className="font-body text-sm text-coal">{value}</span>
      </div>
    </div>
  )
}

// ─── Devolución y saldo a favor (lado caja) ─────────────────────────────────
// Qué eligió el cliente y qué le toca hacer a la caja: transferirle de vuelta
// o acreditarle el saldo. También devolver el saldo que había usado en un
// pedido que no siguió.
function BloqueDevolucion({ order, user }) {
  const [busy, setBusy]   = useState(false)
  const [error, setError] = useState('')
  const dev = order.devolucion
  const saldoPorDevolver = order.saldoAplicado?.porDevolver
  if (!dev && !saldoPorDevolver) return null

  const correr = async (fn) => {
    setBusy(true); setError('')
    try { await fn() } catch (_) { setError('No se pudo guardar. Revisa la conexión e intenta de nuevo.') }
    finally { setBusy(false) }
  }
  const marcarTransferida = () => correr(() => updateDoc(doc(db, 'orders', order.id), {
    'devolucion.estado':      'transferida',
    'devolucion.resueltaAt':  serverTimestamp(),
    'devolucion.resueltaPor': user?.email || 'caja',
    clientMessages: arrayUnion({
      role: 'cashier', name: user?.displayName || 'Cajero', ts: Date.now(),
      text: `Ya te transferimos $${Number(dev.monto).toLocaleString('es-CO')} a ${dev.datos?.medio || 'tu cuenta'}.`,
    }),
    updatedAt: serverTimestamp(),
  }))
  const acreditar = () => correr(() => acreditarSaldoDevolucion(order, user?.email))
  const devolverSaldo = () => correr(() => restaurarSaldo(order, { comoCaja: true }))

  const pendiente = dev && ['transferencia_solicitada', 'saldo_solicitado'].includes(dev.estado)
  return (
    <div className={`rounded-2xl p-4 flex flex-col gap-2 border-2 ${pendiente || saldoPorDevolver ? 'bg-cherry/10 border-cherry' : 'bg-mint/10 border-mint/40'}`}>
      {dev && (
        <>
          <p className="font-display text-lg tracking-wide text-coal">
            <Banknote size={17} className="inline-block mr-1.5 -mt-0.5" aria-hidden="true" />Devolución de {fmt(dev.monto)}
          </p>
          {dev.estado === 'por_elegir' && (
            <p className="font-body text-sm text-coal/75">
              El cliente pagó por transferencia. <strong>Esperando que elija</strong> cómo quiere la devolución
              {order.clientEmail ? ' (transferencia o saldo a favor)' : ' (transferencia)'}. Ya se le escribió por el chat.
            </p>
          )}
          {dev.estado === 'transferencia_solicitada' && (
            <>
              <p className="font-body text-sm text-coal/80"><strong>Pidió transferencia.</strong> Hazla a:</p>
              <div className="bg-cream rounded-xl px-4 py-3 font-body text-sm flex flex-col gap-0.5">
                <p><span className="text-coal/55">Medio:</span> <strong>{dev.datos?.medio}</strong></p>
                <p><span className="text-coal/55">Número:</span> <strong className="select-all">{dev.datos?.numero}</strong></p>
                <p><span className="text-coal/55">Titular:</span> <strong>{dev.datos?.titular}</strong></p>
                {dev.datos?.documento && <p><span className="text-coal/55">Documento:</span> <strong>{dev.datos.documento}</strong></p>}
              </div>
              <button onClick={marcarTransferida} disabled={busy} className="btn-primary w-full">
                {busy ? 'Guardando…' : `Ya le transferí ${fmt(dev.monto)}`}
              </button>
            </>
          )}
          {dev.estado === 'saldo_solicitado' && (
            <>
              <p className="font-body text-sm text-coal/80">
                <strong>Pidió saldo a favor</strong> para su próximo pedido en {order.sedeName || 'esta sede'}.
                Confirma que la transferencia sí llegó y acredítalo.
              </p>
              <button onClick={acreditar} disabled={busy} className="btn-primary w-full">
                {busy ? 'Acreditando…' : `Acreditar ${fmt(dev.monto)} a su cuenta`}
              </button>
            </>
          )}
          {dev.estado === 'transferida' && (
            <p className="font-body text-sm text-mint font-semibold">Devuelto por transferencia{dev.resueltaPor ? ` · ${dev.resueltaPor}` : ''}</p>
          )}
          {dev.estado === 'acreditada' && (
            <p className="font-body text-sm text-mint font-semibold">Acreditado como saldo a favor{dev.resueltaPor ? ` · ${dev.resueltaPor}` : ''}</p>
          )}
        </>
      )}
      {saldoPorDevolver && (
        <>
          <p className="font-body text-sm text-coal/80">
            <strong>El cliente había usado {fmt(order.saldoAplicado.usado ?? order.saldoAplicado.monto)} de saldo a favor</strong> y
            el pedido no siguió. Devuélveselo a su cuenta.
          </p>
          <button onClick={devolverSaldo} disabled={busy} className="btn-secondary w-full">
            {busy ? 'Devolviendo…' : 'Devolver el saldo a su cuenta'}
          </button>
        </>
      )}
      {error && <p className="font-body text-xs text-pepper">{error}</p>}
    </div>
  )
}
