/**
 * Extrae datos estructurados del mensaje de WhatsApp de DeliStars.
 * El teléfono es OBLIGATORIO; sin él retorna null en ese campo.
 */
export function parseWhatsAppMessage(text) {
  if (!text || !text.trim()) return null

  const clean = text.replace(/\r\n/g, '\n')

  const get = (pattern, flags = 'i') => {
    const m = clean.match(new RegExp(pattern, flags))
    return m ? m[1].trim() : ''
  }

  // Número de pedido (si aparece en el mensaje)
  const orderNumMatch = clean.match(/(?:pedido|#|n[uú]mero)[:\s#]*(\d+)/i)
  const orderNumber = orderNumMatch ? orderNumMatch[1] : ''

  // Nombre
  const name = get('👤\\s*Nombre\\s*:?\\s*(.+)')
    || get('Nombre\\s*:?\\s*(.+)')

  // Teléfono — OBLIGATORIO
  const phone = get('📱\\s*(?:N[uú]mero de celular|Tel[eé]fono|Celular)\\s*:?\\s*([\\d\\s\\-+()]+)')
    || get('(?:N[uú]mero de celular|Tel[eé]fono|Celular)\\s*:?\\s*([\\d\\s\\-+()]+)')

  // Dirección completa
  const fullAddress = get('📍\\s*Direcci[oó]n(?:\\s+completa)?\\s*:?\\s*(.+)')
    || get('Direcci[oó]n(?:\\s+completa)?\\s*:?\\s*(.+)')

  // Extraer barrio y referencia de la dirección
  const barrio = extractBarrio(fullAddress)
  const reference = extractReference(fullAddress)

  // Pedido / productos
  const orderMatch = clean.match(
    /🛒\s*Tu pedido\s*:?\s*\n(?:[\s\S]*?Ejemplo[\s\S]*?\n)?([\s\S]+?)(?=📝|💳|$)/i
  ) || clean.match(/Tu pedido\s*:?\s*\n([\s\S]+?)(?=📝|💳|Indicaciones|$)/i)
  const items = orderMatch
    ? orderMatch[1].replace(/Ejemplo:?.+\n?/i, '').trim()
    : ''

  // Indicaciones adicionales
  const notes = get('📝\\s*Indicaciones adicionales\\s*:?\\s*\\n([\\s\\S]+?)(?=💳|$)')
    || get('Indicaciones adicionales\\s*:?\\s*\\n([\\s\\S]+?)(?=💳|$)')

  // Forma de pago
  const payment = get('💳\\s*Forma de pago\\s*:?\\s*(.+)')
    || get('Forma de pago\\s*:?\\s*(.+)')

  return {
    orderNumber,
    name,
    phone:       phone.replace(/\s/g, ''),
    fullAddress,
    barrio,
    reference,
    items,
    notes,
    payment,
    rawMessage: text,
  }
}

function extractBarrio(address) {
  if (!address) return ''
  // Buscar patrón "barrio X" o "en X" al final de la dirección
  const m = address.match(/(?:barrio|brio\.?)\s+([^,]+)/i)
  if (m) return m[1].trim()
  // Buscar después de la dirección de calle (coma)
  const parts = address.split(',')
  if (parts.length > 1) return parts.slice(1).join(',').trim()
  return ''
}

function extractReference(address) {
  if (!address) return ''
  // Buscar palabras clave de referencia
  const m = address.match(/(?:referencia|ref\.?|cerca|frente a|al lado)\s*:?\s*(.+)/i)
  if (m) return m[1].trim()
  // Buscar paréntesis
  const p = address.match(/\((.+)\)/)
  if (p) return p[1].trim()
  return ''
}

/** Valida que los campos obligatorios estén presentes */
export function validateOrder(parsed) {
  const errors = []
  if (!parsed.phone) errors.push('Número de teléfono/WhatsApp es obligatorio')
  if (!parsed.name)  errors.push('Nombre del cliente es obligatorio')
  if (!parsed.fullAddress) errors.push('Dirección es obligatoria')
  if (!parsed.items) errors.push('Detalle del pedido es obligatorio')
  return errors
}
