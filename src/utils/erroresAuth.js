// Mensajes en español para los errores de Firebase Auth que ve el cliente al
// entrar o crear su cuenta. Módulo puro para probarlo con node --test.

const MENSAJES = {
  'auth/invalid-email': 'Ese correo no es válido. Revísalo.',
  'auth/missing-email': 'Escribe tu correo.',
  'auth/missing-password': 'Escribe tu contraseña.',
  'auth/weak-password': 'La contraseña debe tener al menos 6 caracteres.',
  'auth/email-already-in-use': 'Ese correo ya tiene cuenta. Entra con tu contraseña o usa «Olvidé mi contraseña».',
  'auth/credential-already-in-use': 'Esa cuenta ya es otra cuenta de DeliStars: no se pueden unir. Entra con ella si es la tuya.',
  'auth/invalid-credential': 'El correo o la contraseña no coinciden.',
  'auth/wrong-password': 'El correo o la contraseña no coinciden.',
  'auth/user-not-found': 'El correo o la contraseña no coinciden.',
  'auth/user-disabled': 'Esta cuenta está desactivada. Escríbenos por WhatsApp.',
  'auth/too-many-requests': 'Demasiados intentos. Espera unos minutos e intenta de nuevo.',
  'auth/network-request-failed': 'Sin conexión. Revisa tu internet e intenta de nuevo.',
  'auth/account-exists-with-different-credential':
    'Ese correo ya tiene cuenta con otro método (Google, Microsoft o contraseña). Entra con ese método.',
  'auth/popup-blocked': 'El navegador bloqueó la ventana. Permite las ventanas emergentes e intenta de nuevo.',
  'auth/provider-already-linked': 'Esa forma de entrar ya está en tu cuenta.',
  'auth/ultimo-metodo': 'Necesitas al menos una forma de entrar: agrega otra antes de quitar esta.',
  'auth/requires-recent-login': 'Por seguridad, confirma que eres tú otra vez.',
  'auth/user-mismatch': 'Entraste con otra cuenta. Usa la misma con la que estás ahora.',
  'auth/no-such-provider': 'Esa forma de entrar ya no estaba en tu cuenta.',
}

/** Errores que no hay que mostrar (la persona cerró la ventana a propósito). */
export const esCancelacion = (err) =>
  ['auth/popup-closed-by-user', 'auth/cancelled-popup-request', 'auth/user-cancelled'].includes(err?.code)

/** Texto para el cliente; si el código no es conocido, uno genérico. */
export function mensajeAuth(err) {
  return MENSAJES[err?.code] || 'No se pudo completar. Intenta de nuevo.'
}

/** Validación del formulario de crear cuenta (spec §6.1: nombre, teléfono, correo y contraseña). */
export function erroresRegistro({ nombre, telefono, email, password }) {
  const e = []
  if (!nombre || nombre.trim().length < 3) e.push('Escribe tu nombre completo.')
  if (String(telefono || '').replace(/\D/g, '').length < 10) e.push('El teléfono debe tener 10 dígitos.')
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((email || '').trim())) e.push('Ese correo no es válido.')
  if (!password || password.length < 6) e.push('La contraseña debe tener al menos 6 caracteres.')
  return e
}

/** ¿La cuenta entró con correo y contraseña y aún no confirmó el correo? */
export const faltaVerificarCorreo = (user) =>
  !!user && !user.isAnonymous && !user.emailVerified &&
  (user.providerData || []).some((p) => p?.providerId === 'password')
