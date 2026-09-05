// Ubicaciones que llegan por WhatsApp y mensajes para pedirlas.
//
// El problema real: la dirección escrita casi nunca sirve para navegar. La
// nomenclatura de Medellín ("Calle 44 B #70 A-23") no la entiende el buscador
// de Waze, así que el domiciliario termina en otra cuadra. La única forma
// confiable de llegar es un PIN (lat/lng).
//
// Cuando el cliente manda su ubicación por WhatsApp, el domiciliario copia ese
// mensaje y lo pega en el pedido: de ahí sacamos el pin exacto.
// Módulo puro (sin React) para poder probarlo con node --test.

// Medellín y alrededores. Sirve para descartar un pin pegado por error
// (una ubicación de otra ciudad, o lat/lng invertidas).
export const MEDELLIN = { lat: 6.2442, lng: -75.5812 }
const RANGO = { latMin: 5.9, latMax: 6.6, lngMin: -75.9, lngMax: -75.2 }

export const dentroDeMedellin = ({ lat, lng }) =>
  lat >= RANGO.latMin && lat <= RANGO.latMax && lng >= RANGO.lngMin && lng <= RANGO.lngMax

// Enlaces cortos que NO se pueden resolver desde el navegador (CORS): hay que
// abrirlos para que se expandan. Se detectan para poder avisarle al domiciliario
// en vez de fallar en silencio.
const CORTOS = /(maps\.app\.goo\.gl|goo\.gl\/maps|g\.co\/kgs)/i

export const esEnlaceCorto = (texto) => CORTOS.test(String(texto || ''))

// Un par lat,lng suelto: "6.2442, -75.5812"
const PAR = /(-?\d{1,3}\.\d{3,})[,\s]+(-?\d{1,3}\.\d{3,})/

/**
 * Saca { lat, lng } de lo que sea que el domiciliario pegue: el enlace que
 * manda WhatsApp, uno de Google Maps, de Apple Maps, un geo: o las coordenadas
 * sueltas. Devuelve null si no encuentra nada usable.
 *
 * Formatos cubiertos:
 *   https://maps.google.com/?q=6.24,-75.58            (ubicación de WhatsApp)
 *   https://www.google.com/maps/search/?api=1&query=6.24,-75.58
 *   https://www.google.com/maps/@6.24,-75.58,17z
 *   https://www.google.com/maps/place/Algo/@6.24,-75.58,17z
 *   https://maps.apple.com/?ll=6.24,-75.58
 *   https://waze.com/ul?ll=6.24,-75.58
 *   geo:6.24,-75.58
 *   6.2442, -75.5812
 */
export function parseUbicacion(texto) {
  const t = String(texto || '').trim()
  if (!t) return null

  // 1) Parámetros de consulta típicos (q, query, ll, sll, daddr, destination).
  //    Se mira primero porque son los que trae el mensaje de WhatsApp.
  const params = t.match(/[?&](?:q|query|ll|sll|daddr|destination)=([^&\s]+)/i)
  if (params) {
    const valor = decodeURIComponent(params[1])
    const m = valor.match(PAR)
    if (m) {
      const c = { lat: parseFloat(m[1]), lng: parseFloat(m[2]) }
      if (coordsValidas(c)) return c
    }
  }

  // 2) Coordenadas dentro de la ruta: /@6.24,-75.58,17z
  const arroba = t.match(/@(-?\d{1,3}\.\d{3,}),(-?\d{1,3}\.\d{3,})/)
  if (arroba) {
    const c = { lat: parseFloat(arroba[1]), lng: parseFloat(arroba[2]) }
    if (coordsValidas(c)) return c
  }

  // 3) geo:6.24,-75.58
  const geo = t.match(/geo:(-?\d{1,3}\.\d{3,}),(-?\d{1,3}\.\d{3,})/i)
  if (geo) {
    const c = { lat: parseFloat(geo[1]), lng: parseFloat(geo[2]) }
    if (coordsValidas(c)) return c
  }

  // 4) Un par suelto en cualquier parte del texto pegado.
  const suelto = t.match(PAR)
  if (suelto) {
    const c = { lat: parseFloat(suelto[1]), lng: parseFloat(suelto[2]) }
    if (coordsValidas(c)) return c
  }

  return null
}

const coordsValidas = ({ lat, lng }) =>
  Number.isFinite(lat) && Number.isFinite(lng) &&
  Math.abs(lat) <= 90 && Math.abs(lng) <= 180 &&
  !(lat === 0 && lng === 0)

/**
 * Revisa un pin pegado y dice si se puede usar tal cual, si hay que avisar algo
 * o si no sirve. `nivel`: 'ok' | 'aviso' | 'error'.
 */
export function revisarUbicacion(texto) {
  const coords = parseUbicacion(texto)
  if (!coords) {
    if (esEnlaceCorto(texto)) {
      return {
        nivel: 'error',
        coords: null,
        mensaje: 'Ese enlace es corto y no trae las coordenadas. Ábrelo, y cuando cargue el mapa copia el enlace de la barra de direcciones y pégalo aquí.',
      }
    }
    return {
      nivel: 'error',
      coords: null,
      mensaje: 'No encontré coordenadas ahí. Pega el enlace de la ubicación que te mandó el cliente por WhatsApp.',
    }
  }
  if (!dentroDeMedellin(coords)) {
    return {
      nivel: 'aviso',
      coords,
      mensaje: 'Ojo: ese punto queda fuera de Medellín y alrededores. Revisa que sea la ubicación correcta antes de guardarla.',
    }
  }
  return { nivel: 'ok', coords, mensaje: 'Ubicación lista para navegar.' }
}

/** Solo el primer nombre, para que el saludo suene natural. */
const primerNombre = (nombre) => {
  const n = String(nombre || '').trim().split(/\s+/)[0] || ''
  if (!n) return ''
  return n.charAt(0).toUpperCase() + n.slice(1).toLowerCase()
}

/**
 * Mensaje de WhatsApp para pedirle la ubicación al cliente. Le dice quién
 * escribe (importante: el cliente no tiene guardado el número del domiciliario)
 * y le explica cómo mandar la ubicación, que es donde más se traba la gente.
 */
export function mensajePedirUbicacion({ cliente, domiciliario, pedido } = {}) {
  const hola  = primerNombre(cliente) ? `¡Hola ${primerNombre(cliente)}!` : '¡Hola!'
  // Neutro a propósito: en el equipo de domicilios hay hombres y mujeres, y
  // "domiciliario" a secas suena mal cuando entrega una de ellas.
  const quien = primerNombre(domiciliario)
    ? `Soy ${primerNombre(domiciliario)}, del equipo de domicilios de DeliStars.`
    : 'Te escribo del equipo de domicilios de DeliStars.'
  const cual  = pedido ? ` #${pedido}` : ''
  return [
    `${hola} 👋 ${quien}`,
    ``,
    `Tengo tu pedido${cual} listo para entregártelo.`,
    ``,
    `Para llegar exacto y no hacerte esperar, ¿me compartes tu ubicación por aquí? 📍`,
    `Tocas el clip 📎 → *Ubicación* → *Enviar tu ubicación actual*.`,
    ``,
    `¡Gracias!`,
  ].join('\n')
}

/** Número colombiano en el formato que espera wa.me (57 + 10 dígitos). */
export function waNumero(telefono) {
  const d = String(telefono || '').replace(/\D/g, '')
  if (!d) return ''
  if (d.startsWith('57') && d.length >= 12) return d
  return d.length >= 10 ? `57${d.slice(-10)}` : d
}

/** Enlace de WhatsApp con el mensaje ya escrito. */
export function linkPedirUbicacion({ telefono, cliente, domiciliario, pedido } = {}) {
  const numero = waNumero(telefono)
  const texto  = encodeURIComponent(mensajePedirUbicacion({ cliente, domiciliario, pedido }))
  return `https://wa.me/${numero}?text=${texto}`
}
