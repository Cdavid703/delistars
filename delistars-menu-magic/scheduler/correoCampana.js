// Arma el correo de una campaña de Mercadeo para un cliente: HTML (con logo,
// imagen, mensaje y botón) y texto plano. Incluye el enlace para darse de baja
// y la cabecera List-Unsubscribe (baja de un clic en Gmail/Outlook).
const { createHmac } = require('crypto')

const REMITENTE = process.env.SMTP_FROM || 'DeliStars <marketing@delistars.com>'
const BASE_BAJA = 'https://delistars.com/api/v1/mercadeo/baja'
const LOGO = 'https://delistars.com/domicilios/logo_sello.png'

/** Misma firma que valida el backend (modulo_mercadeo/services/bajas.service.ts). */
const firmar = (uid, clave) => createHmac('sha256', clave).update(uid).digest('base64url').slice(0, 22)
const enlaceBaja = (uid, clave) => `${BASE_BAJA}?u=${encodeURIComponent(uid)}&t=${firmar(uid, clave)}`

const escapar = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const primerNombre = (nombre) => String(nombre || '').trim().split(/\s+/)[0] || ''

/** {nombre} → primer nombre del cliente (o nada si no lo tenemos). */
function personalizar(texto, cliente) {
  const n = primerNombre(cliente?.name)
  return String(texto || '')
    .replace(/,?\s*\{nombre\}/g, (m) => (n ? m.replace('{nombre}', n) : ''))
}

function armarCorreo(campana, cliente, clave) {
  const mensaje = personalizar(campana.mensaje, cliente)
  const asunto = personalizar(campana.asunto, cliente)
  const baja = enlaceBaja(cliente.uid, clave)
  const parrafos = escapar(mensaje).split(/\n{2,}/).map((p) => p.replace(/\n/g, '<br>'))
  const imagen = /^https:\/\//.test(campana.imagenUrl || '') ? campana.imagenUrl : ''
  const boton = campana.botonTexto && /^https:\/\//.test(campana.botonUrl || '')
    ? { texto: campana.botonTexto, url: campana.botonUrl } : null

  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapar(asunto)}</title></head>
<body style="margin:0;padding:0;background:#f4f1ec;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f1ec;"><tr><td align="center" style="padding:16px 8px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden;font-family:Arial,Helvetica,sans-serif;color:#2b2b2b;">
<tr><td align="center" style="background:#1f1f1f;padding:18px;"><img src="${LOGO}" alt="DeliStars" height="56" style="display:block;height:56px;border:0;"></td></tr>
${imagen ? `<tr><td><img src="${escapar(imagen)}" alt="" width="560" style="display:block;width:100%;height:auto;border:0;"></td></tr>` : ''}
<tr><td style="padding:24px 24px 8px;font-size:15px;line-height:1.55;">
${parrafos.map((p) => `<p style="margin:0 0 14px;">${p}</p>`).join('\n')}
</td></tr>
${boton ? `<tr><td align="center" style="padding:6px 24px 28px;">
<a href="${escapar(boton.url)}" style="display:inline-block;background:#e85d04;color:#ffffff;text-decoration:none;font-weight:bold;font-size:16px;padding:14px 28px;border-radius:10px;">${escapar(boton.texto)}</a>
</td></tr>` : ''}
<tr><td style="padding:16px 24px;border-top:1px solid #eeeeee;font-size:11px;line-height:1.5;color:#8a8a8a;text-align:center;">
Recibes este correo porque aceptaste recibir promociones de DeliStars.<br>
DeliStars · Medellín, Colombia · <a href="https://delistars.com/" style="color:#8a8a8a;">delistars.com</a><br>
<a href="${baja}" style="color:#8a8a8a;">Darme de baja</a>
</td></tr></table></td></tr></table></body></html>`

  const text = [
    mensaje,
    boton ? `\n${boton.texto}: ${boton.url}` : '',
    '\n—\nRecibes este correo porque aceptaste recibir promociones de DeliStars.',
    `Darme de baja: ${baja}`,
  ].join('\n')

  return {
    from: REMITENTE,
    to: cliente.email,
    subject: asunto,
    html,
    text,
    headers: {
      'List-Unsubscribe': `<${baja}>, <mailto:marketing@delistars.com?subject=baja>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
  }
}

module.exports = { armarCorreo, enlaceBaja, firmar, personalizar }
