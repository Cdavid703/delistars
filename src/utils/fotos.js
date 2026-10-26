// Fotos en los chats y en los reclamos (especificación §8.3 y §14).
//
// El navegador (o la app) reduce la foto y la sube a Storage en
// fotos/{orderId}/{archivo}; después manda al servidor solo { url, path } y el
// servidor revisa que la foto sea de la carpeta de ESE pedido y de este
// proyecto (nadie puede colgar un enlace de afuera en el chat).
// Las reglas de Storage dejan subir y ver esas fotos solo a quien participa del
// pedido: el cliente, el domiciliario asignado y el equipo.
//
// Este archivo es compartido (misma lógica en la web y en el servidor):
//   - src/utils/fotos.js                              (web)
//   - delistars-menu-magic/back/src/shared/fotos.js   (servidor)
// Si cambias uno, copia el otro: tests/etapas.test.mjs comprueba que sean iguales.

export const CARPETA_FOTOS = 'fotos'
/** Fotos que puede llevar un reclamo al crearlo. */
export const MAX_FOTOS_RECLAMO = 3
/** Lado mayor de la foto ya reducida (px) y peso máximo que aceptan las reglas. */
export const LADO_MAX = 1600
export const MAX_BYTES = 8 * 1024 * 1024

/** Ruta en Storage para una foto nueva de este pedido. */
export function rutaFoto(orderId, nombre) {
  return `${CARPETA_FOTOS}/${orderId}/${nombre}`
}

/**
 * Revisa una foto { url, path } que manda el cliente o el equipo.
 * Devuelve { foto: { url, path } } o { error: 'foto' }.
 */
export function revisarFoto(foto, orderId, bucket) {
  if (!foto || typeof foto !== 'object') return { error: 'foto' }
  const path = typeof foto.path === 'string' ? foto.path : ''
  const url = typeof foto.url === 'string' ? foto.url : ''
  const carpeta = `${CARPETA_FOTOS}/${orderId}/`
  if (!orderId || !bucket || !path.startsWith(carpeta) || path.includes('..') || path.length > 300) return { error: 'foto' }
  const nombre = path.slice(carpeta.length)
  if (!/^[A-Za-z0-9._-]{1,120}$/.test(nombre)) return { error: 'foto' }
  const prefijo = `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(path)}?`
  if (!url.startsWith(prefijo) || url.length > 1000) return { error: 'foto' }
  return { foto: { url, path } }
}

/** Varias fotos (reclamo): hasta `max`, todas válidas. */
export function revisarFotos(lista, orderId, bucket, max = MAX_FOTOS_RECLAMO) {
  if (lista == null) return { fotos: [] }
  if (!Array.isArray(lista)) return { error: 'foto' }
  if (lista.length > max) return { error: 'muchas_fotos' }
  const fotos = []
  for (const f of lista) {
    const r = revisarFoto(f, orderId, bucket)
    if (r.error) return r
    fotos.push(r.foto)
  }
  return { fotos }
}

/** Texto para avisos y vistas previas de un mensaje que puede ser solo una foto. */
export const textoDeMensaje = (m) => {
  const t = String(m?.text ?? '').trim()
  if (m?.foto) return t ? `📷 ${t}` : '📷 Foto'
  return t
}
