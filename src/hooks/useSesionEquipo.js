import { useEffect } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { signOut } from 'firebase/auth'
import { auth, db } from '../services/firebase'
import { llamarApi, ErrorApi } from '../services/pedidosApi'
import { sesionGuardada, guardarSesion, olvidarSesion, idNuevo, infoAparato } from '../services/sesionEquipo'
import { ROLES } from '../services/roles'

// Registra la sesión de este aparato del equipo («Mis sesiones», §6.3), avisa
// cada 5 min que sigue en uso y sale si la cierran desde otro aparato.
const CADA_MS = 5 * 60 * 1000
const ROL_SESION = { [ROLES.CASHIER]: 'caja', [ROLES.DRIVER]: 'domiciliario', [ROLES.ADMIN]: 'admin' }

function salirPorCierre(uid) {
  // Si este aparato ya la olvidó, la cerró él mismo (salir o cambiar de empleado): sin aviso.
  if (auth.currentUser?.uid !== uid || !sesionGuardada(uid)) return
  olvidarSesion(uid)
  window.alert('Cerraron tu sesión en este aparato desde otro lugar. Si eres tú, vuelve a entrar.')
  signOut(auth).catch(() => {})
}

export default function useSesionEquipo({ user, role, sede, rolVisto }) {
  const uid = user?.uid
  const esEquipo = !!uid && !user.isAnonymous && !!ROL_SESION[role]
  const rol = ROL_SESION[rolVisto] || ROL_SESION[role] || null
  const sedeId = sede?.id || null

  // Registro y «sigo en uso» (al entrar, al cambiar de sede o rol y cada 5 min).
  // Ya registrada, se escucha: si la cierran desde otro aparato, este sale al instante.
  useEffect(() => {
    if (!esEquipo) return undefined
    let vigente = true
    let quitarEscucha = null
    let s = sesionGuardada(uid)
    if (!s?.id) { s = { id: idNuevo() }; guardarSesion(uid, s) }
    const escuchar = () => {
      if (quitarEscucha || !vigente) return
      quitarEscucha = onSnapshot(doc(db, 'sesiones_equipo', s.id), (snap) => {
        if (snap.exists() && snap.data().activa === false) salirPorCierre(uid)
      }, () => { /* sin permiso: lo sigue revisando el servidor en cada llamada */ })
    }
    const reportar = async () => {
      try {
        const r = await llamarApi('POST', 'equipo/sesiones', { sesionId: s.id, ...infoAparato(), sedeId, rol })
        if (vigente && r.clave) { s = { id: s.id, clave: r.clave }; guardarSesion(uid, s) }
        escuchar()
      } catch (e) {
        if (e instanceof ErrorApi && e.codigo === 'sesion_cerrada') salirPorCierre(uid)
      }
    }
    reportar()
    const t = setInterval(reportar, CADA_MS)
    return () => { vigente = false; clearInterval(t); quitarEscucha?.() }
  }, [esEquipo, uid, sedeId, rol])
}
