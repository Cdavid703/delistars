// Guardarrail de sincronización de ADMIN_EMAILS.
// Las 3 apps (domicilios, admin, menú) tienen su propia copia de la lista de
// administradores porque son builds Vite separados. FUENTE DE VERDAD:
// delistars-menu-magic/admin/src/lib/team.ts — las otras dos deben coincidir.
// Este script falla (exit 1) si alguna lista difiere. Correr: npm run check:emails
const fs = require('fs')
const path = require('path')

const SOURCE_OF_TRUTH = 'delistars-menu-magic/admin/src/lib/team.ts'
const FILES = [
  SOURCE_OF_TRUTH,
  'src/services/roles.js',
  'delistars-menu-magic/front/src/lib/staff.ts',
]

// Extrae los emails del bloque `ADMIN_EMAILS = [ ... ]` de un archivo.
function extractAdminEmails(file) {
  const content = fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8')
  const block = content.match(/ADMIN_EMAILS\s*=\s*\[([\s\S]*?)\]/)
  if (!block) throw new Error(`No se encontró ADMIN_EMAILS en ${file}`)
  const emails = block[1].match(/['"]([^'"]+@[^'"]+)['"]/g) || []
  return emails.map(e => e.replace(/['"]/g, '').toLowerCase()).sort()
}

const reference = extractAdminEmails(SOURCE_OF_TRUTH)
let ok = true

for (const file of FILES) {
  const emails = extractAdminEmails(file)
  const same = emails.length === reference.length && emails.every((e, i) => e === reference[i])
  if (same) {
    console.log(`✅ ${file} (${emails.length} admins)`)
  } else {
    ok = false
    const missing = reference.filter(e => !emails.includes(e))
    const extra = emails.filter(e => !reference.includes(e))
    console.error(`❌ ${file} DIFIERE de ${SOURCE_OF_TRUTH}`)
    if (missing.length) console.error(`   faltan:  ${missing.join(', ')}`)
    if (extra.length) console.error(`   sobran:  ${extra.join(', ')}`)
  }
}

if (!ok) {
  console.error('\n⚠️  Las listas ADMIN_EMAILS no están sincronizadas.')
  console.error('   Recuerda también revisar ADMIN_EMAILS del backend (.env del VPS).')
  process.exit(1)
}
console.log('\n✅ Todas las listas ADMIN_EMAILS están sincronizadas.')
