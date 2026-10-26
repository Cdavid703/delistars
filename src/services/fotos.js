// Subir fotos de chats y reclamos (§8.3, §14). La foto se reduce en el aparato
// (lado mayor 1600 px, JPEG) para que suba rápido con datos móviles, y queda en
// Storage en fotos/{orderId}/. Al servidor solo va { url, path }.
import { ref as storageRef, uploadBytesResumable, getDownloadURL } from 'firebase/storage'
import { storage } from './firebase'
import { rutaFoto, LADO_MAX, MAX_BYTES } from '../utils/fotos'

/** Reduce la imagen a JPEG. Si el navegador no puede (formato raro), devuelve el archivo tal cual. */
export async function reducirFoto(file) {
  if (!file?.type?.startsWith('image/')) throw new Error('Elige una foto (imagen)')
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
    const escala = Math.min(1, LADO_MAX / Math.max(bitmap.width, bitmap.height))
    const lienzo = document.createElement('canvas')
    lienzo.width = Math.round(bitmap.width * escala)
    lienzo.height = Math.round(bitmap.height * escala)
    lienzo.getContext('2d').drawImage(bitmap, 0, 0, lienzo.width, lienzo.height)
    bitmap.close?.()
    const blob = await new Promise((r) => lienzo.toBlob(r, 'image/jpeg', 0.82))
    if (blob) return blob
  } catch { /* se sube la original */ }
  return file
}

/** Sube la foto del pedido y devuelve { url, path }. `onProgreso(0..100)` opcional. */
export async function subirFoto(orderId, file, onProgreso) {
  const blob = await reducirFoto(file)
  if (blob.size > MAX_BYTES) throw new Error('La foto es muy pesada (máximo 8 MB)')
  const tipo = ['image/jpeg', 'image/png', 'image/webp'].includes(blob.type) ? blob.type : 'image/jpeg'
  const ext = tipo === 'image/png' ? 'png' : tipo === 'image/webp' ? 'webp' : 'jpg'
  const nombre = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
  const path = rutaFoto(orderId, nombre)
  return new Promise((resolve, reject) => {
    const task = uploadBytesResumable(storageRef(storage, path), blob, { contentType: tipo })
    task.on('state_changed',
      (s) => onProgreso?.(Math.round((s.bytesTransferred / s.totalBytes) * 100)),
      (e) => reject(e?.code === 'storage/unauthorized' ? new Error('No tienes permiso para subir fotos a este pedido') : e),
      () => getDownloadURL(task.snapshot.ref).then((url) => resolve({ url, path }), reject))
  })
}
