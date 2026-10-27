// Armado de la dirección estructurada (nomenclatura de Medellín).
//
// Hay DOS textos distintos a propósito:
//   • buildFormatted → lo que leen la caja y el domiciliario, y lo que Waze
//     recibe cuando no hay pin. La letra va separada del número.
//   • geocodeQuery   → lo que se le manda a Photon/OpenStreetMap, que tiene las
//     vías con la letra pegada ("Calle 44B"); separada devuelve otra vía en
//     otro barrio y el pin sale mal.
// Módulo puro (sin React) para poder probarlo con node --test.

// Letras de la nomenclatura: simples y DOBLES (AA, AB, BB…), comunes en Medellín.
export const LETRAS = [
  '', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H',
  'AA', 'AB', 'AC', 'AD', 'AE', 'BA', 'BB', 'BC', 'BD', 'CA', 'CB', 'CC', 'DD',
]

// "Calle 44 B Sur #70 A-23"
export function buildFormatted(p) {
  const via   = [p.tipoVia, p.viaNum, p.viaLetra, p.viaOrient].filter(Boolean).join(' ')
  const cruce = [p.cruceNum, p.cruceLetra].filter(Boolean).join(' ')
  return `${via} #${cruce}-${p.placa || ''}`.trim()
}

// "Calle 44B Sur #70A-23"
export function geocodeQuery(p) {
  const via   = [p.tipoVia, `${p.viaNum || ''}${p.viaLetra || ''}`, p.viaOrient].filter(Boolean).join(' ')
  const cruce = `${p.cruceNum || ''}${p.cruceLetra || ''}`
  return `${via} #${cruce}-${p.placa || ''}`.trim()
}

// La dirección tal como la escribió el cliente (desde el 24 oct 2026 se pide
// en un solo campo y Google la ubica). Las guardadas antes traen la
// nomenclatura por partes: se arman como siempre. Las muy viejas solo tienen
// `formatted`.
export function textoDireccion(p) {
  const texto = (p?.texto || '').trim()
  if (texto) return texto
  if (p?.viaNum || p?.cruceNum) return buildFormatted(p)
  return (p?.formatted || '').trim()
}

// Dirección + complemento: el texto completo que viaja en el pedido.
export function fullAddressOf(p) {
  return [textoDireccion(p), p.complemento?.trim()].filter(Boolean).join(', ')
}

// Barrio que trae la dirección formateada de Google ("Cl. 44B #70a-23, San
// Javier, Medellín, Antioquia"): la segunda parte, si no es la ciudad ni un número.
export function barrioDeGoogle(direccion) {
  const partes = String(direccion || '').split(',').map(x => x.trim()).filter(Boolean)
  if (partes.length < 3) return ''
  const b = partes[1]
  if (/\d/.test(b) || /medell[ií]n|antioquia|colombia|bello|itag[uü][ií]|envigado/i.test(b)) return ''
  return b
}

// ── Dirección favorita (§7.1; 26 oct 2026, igual que la app) ──
// Una sola por cliente, en customers/{uid}.savedPlaces[].favorita. Sale primero
// y se elige sola al empezar un pedido. La primera dirección que se guarda
// queda como favorita.

/** Una sola favorita: marca esta y desmarca las demás. */
export const marcarFavorita = (lista, id) => lista.map((x) => ({ ...x, favorita: x.id === id }))

/** La favorita primero; el resto en el orden en que se guardó. */
export const ordenarLugares = (lista) => [...lista].sort((a, b) => Number(!!b.favorita) - Number(!!a.favorita))
