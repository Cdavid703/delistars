/**
 * fix-driver.cjs — Diagnóstico y limpieza de datos del domiciliario
 *
 * Uso:
 *   node scripts/fix-driver.cjs
 *
 * Qué hace:
 *   1. Lista todos los docs de roles_drivers
 *   2. Busca pedidos con variantes del email de José Manuel
 *   3. Muestra diagnóstico exacto
 *   4. Con confirmación: corrige driverEmail y elimina duplicados
 */

// Desactivar verificación SSL (solo para scripts locales de admin)
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

const readline = require('readline')
const { Agent } = require('https')
const agent = new Agent({ rejectUnauthorized: false })

// ─── Config del proyecto ───────────────────────────────────────────────────
const API_KEY  = 'AIzaSyCLB7z7lDPeNDa0qEYFVWXyCLlzNsJzrww'
const PROJECT  = 'delistars-domicilios'
const BASE_URL = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`
const TARGET   = 'josemanuellondonorivillas@gmail.com'

// ─── REST helpers ─────────────────────────────────────────────────────────
async function firestoreReq(method, path, body) {
  const url  = `${BASE_URL}${path}?key=${API_KEY}`
  const opts = { method, dispatcher: undefined }
  // Node 22 fetch no soporta agent directamente, usamos el env var ya seteado
  const res  = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  return res.json()
}

// Paginación: Firestore REST devuelve hasta 300 docs por request
async function getAllDocs(col) {
  const docs = []
  let pageToken = null
  do {
    const url = `${BASE_URL}/${col}?key=${API_KEY}${pageToken ? `&pageToken=${pageToken}` : ''}`
    const res  = await fetch(url)
    const json = await res.json()
    if (json.documents) docs.push(...json.documents)
    pageToken = json.nextPageToken || null
  } while (pageToken)
  return docs
}

const delDoc   = (col, id) => firestoreReq('DELETE', `/${col}/${encodeURIComponent(id)}`)
const patchDoc = (col, id, fields) => firestoreReq('PATCH', `/${col}/${encodeURIComponent(id)}`, { fields })

// Convierte campo Firestore REST → valor JS
const fVal = v => {
  if (v?.stringValue  !== undefined) return v.stringValue
  if (v?.integerValue !== undefined) return String(v.integerValue)
  if (v?.booleanValue !== undefined) return v.booleanValue
  return ''
}
const toObj = doc => doc?.fields
  ? Object.fromEntries(Object.entries(doc.fields).map(([k, v]) => [k, fVal(v)]))
  : {}
const docId = doc => doc?.name?.split('/').pop() || ''

// ─── UI helpers ───────────────────────────────────────────────────────────
const SEP = '─'.repeat(62)
const ask = q => new Promise(resolve => {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  rl.question(q, ans => { rl.close(); resolve(ans.trim().toLowerCase()) })
})

// ─── Main ─────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n' + SEP)
  console.log('  🔧  DeliStars — Diagnóstico domiciliario')
  console.log('  👤  ' + TARGET)
  console.log(SEP + '\n')

  // ── 1. roles_drivers ──────────────────────────────────────────────────
  console.log('📋  [1/4] Colección roles_drivers:\n')
  const driverDocs = await getAllDocs('roles_drivers')

  if (driverDocs.length === 0) {
    console.log('   (vacía — driver definido solo en código)\n')
  } else {
    driverDocs.forEach(d => {
      const id   = docId(d)
      const data = toObj(d)
      const flag = (id.toLowerCase().includes('josemanu') || id.toLowerCase().includes('londono'))
        ? '  ← JOSE MANUEL?' : ''
      console.log(`  • "${id}"${flag}`)
      if (data.name)  console.log(`    name:  ${data.name}`)
      if (data.email) console.log(`    email: ${data.email}`)
      console.log()
    })
  }

  // ── 2. Pedidos relacionados ────────────────────────────────────────────
  console.log('📦  [2/4] Leyendo todos los pedidos (puede tardar)...\n')
  const allOrders = await getAllDocs('orders')
  console.log(`   Total pedidos en Firestore: ${allOrders.length}\n`)

  const related = allOrders.filter(d => {
    const e = (toObj(d).driverEmail || '').toLowerCase()
    return e.includes('josemanu') || e.includes('londono') || e === TARGET
  })

  if (related.length === 0) {
    console.log('  ⚠️  Ningún pedido encontrado con ese domiciliario.\n')
    console.log('  El cajero puede estar seleccionando un nombre diferente en el dropdown.\n')
  } else {
    const grouped = {}
    related.forEach(d => {
      const e = toObj(d).driverEmail || '(vacío)'
      grouped[e] = grouped[e] || []
      grouped[e].push(d)
    })
    console.log('  Emails de driverEmail encontrados en pedidos:\n')
    Object.entries(grouped).forEach(([email, docs]) => {
      const ok = email === TARGET
      console.log(`  "${email}"`)
      console.log(`  ${ok ? '✅ CORRECTO' : '❌ INCORRECTO'}  (${docs.length} pedido(s))`)
      docs.slice(0, 5).forEach(d => {
        const o = toObj(d)
        console.log(`    → #${o.orderNumber || '?'}  estado: ${o.status}  id: ${docId(d)}`)
      })
      if (docs.length > 5) console.log(`    ... y ${docs.length - 5} más`)
      console.log()
    })
  }

  // ── 3. Diagnóstico ─────────────────────────────────────────────────────
  console.log('🔍  [3/4] Diagnóstico:\n')

  const badDriverDocs = driverDocs.filter(d => {
    const id = docId(d).toLowerCase()
    return (id.includes('josemanu') || id.includes('londono')) && docId(d) !== TARGET
  })
  const badOrders = related.filter(d => toObj(d).driverEmail !== TARGET)

  if (badDriverDocs.length === 0 && badOrders.length === 0) {
    console.log('  ✅  Los datos en Firestore están correctos.')
    console.log('  El problema puede ser otro. Revisa:\n')
    console.log('  1. Firebase Console → Firestore → Índices')
    console.log('     Debe haber un índice simple en: orders / driverEmail (Ascending)')
    console.log('  2. Firebase Console → Firestore → Reglas')
    console.log('     Los drivers deben poder leer orders donde driverEmail == su email\n')
    process.exit(0)
  }

  if (badDriverDocs.length > 0) {
    console.log('  ❌  Entradas incorrectas en roles_drivers:')
    badDriverDocs.forEach(d => console.log(`     • "${docId(d)}"`))
    console.log()
  }
  if (badOrders.length > 0) {
    console.log(`  ❌  ${badOrders.length} pedido(s) con driverEmail incorrecto`)
    console.log()
  }

  // ── 4. Corrección ──────────────────────────────────────────────────────
  console.log('🛠   [4/4] Corrección:\n')
  const ans = await ask('  ¿Aplicar corrección automática? (s/n): ')
  if (ans !== 's') { console.log('\n  Cancelado.\n'); process.exit(0) }

  let fixed = 0

  for (const d of badDriverDocs) {
    const id = docId(d)
    console.log(`  🗑   Eliminando roles_drivers/"${id}"`)
    await delDoc('roles_drivers', id)
    fixed++
  }

  for (const d of badOrders) {
    const id   = docId(d)
    const prev = toObj(d).driverEmail
    console.log(`  ✏️   Pedido ${id}  "${prev}" → "${TARGET}"`)
    await patchDoc('orders', id, { driverEmail: { stringValue: TARGET } })
    fixed++
  }

  console.log(`\n  ✅  ${fixed} correcciones aplicadas.`)
  console.log('  José Manuel verá sus pedidos la próxima vez que entre.\n')
  console.log(SEP + '\n')
}

main().catch(err => {
  console.error('\n❌ Error:', err.message || err)
  process.exit(1)
})
