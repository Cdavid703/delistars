// Genera src/oscuro.css: el modo oscuro de la pantalla del cliente.
// Corre con: node scripts/generar-oscuro.mjs   (después de cambiar colores en
// las pantallas del cliente, para que las clases nuevas también tengan su oscuro).
//
// Solo aplica con <html class="oscuro">, que pone ClientPanel según «Modo
// oscuro» en «Más»; la caja y el domiciliario nunca lo tienen.
//   texto carbón → crema · fondos crema, humo y blanco → cafés oscuros ·
//   bordes y tintes carbón → crema transparente · rojos de texto más claros.
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const CARPETAS = ['src/components/client', 'src/components/common', 'src/pages']
const ARCHIVOS = ['src/App.jsx']

function listar(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    return statSync(p).isDirectory() ? listar(p) : /\.(jsx?|tsx?)$/.test(n) ? [p] : []
  })
}
const fuentes = [...CARPETAS.flatMap(listar), ...ARCHIVOS].map((f) => readFileSync(f, 'utf8')).join('\n')

const CREMA = '244 231 208'      // texto y bordes en oscuro
const FONDO = '21 17 13'         // bg-cream
const HUMO = '43 36 30'          // bg-smoked
const TARJETA = '33 27 22'       // bg-white
const re = /(?<![\w-])((?:hover|focus|placeholder):)?(text|bg|border|divide)-(coal|cream|smoked|white|cherry|pepper)(?:\/(\d{1,3}))?(?![\w/-])/g

const reglas = new Map()
const esc = (s) => s.replace(/[:/.]/g, (c) => `\\${c}`)
for (const m of fuentes.matchAll(re)) {
  const [clase, variante = '', tipo, color, alfaTxt] = m
  const a = alfaTxt != null ? Number(alfaTxt) / 100 : null
  let decl = null
  if (tipo === 'text' && color === 'coal') decl = `color: rgb(${CREMA} / ${a == null ? 1 : Math.min(1, a + 0.12).toFixed(2)})`
  else if (tipo === 'text' && color === 'cherry' && a == null) decl = 'color: #FF6B5E'
  else if (tipo === 'text' && color === 'pepper' && a == null) decl = 'color: #FF7A5C'
  // Crema o blanco casi transparentes son reflejos sobre el rojo del encabezado: se quedan igual.
  else if (tipo === 'bg' && (color === 'cream' || color === 'white') && a != null && a < 0.5) continue
  else if (tipo === 'bg' && color === 'cream') decl = `background-color: rgb(${FONDO} / ${a ?? 1})`
  else if (tipo === 'bg' && color === 'smoked') decl = `background-color: rgb(${HUMO} / ${a ?? 1})`
  else if (tipo === 'bg' && color === 'white') decl = `background-color: rgb(${TARJETA} / ${a ?? 1})`
  else if (tipo === 'bg' && color === 'coal' && a != null && a <= 0.2) decl = `background-color: rgb(${CREMA} / ${a})`
  else if ((tipo === 'border' || tipo === 'divide') && color === 'coal') decl = `border-color: rgb(${CREMA} / ${a ?? 0.3})`
  else if ((tipo === 'border' || tipo === 'divide') && (color === 'smoked' || color === 'white')) decl = `border-color: rgb(${CREMA} / 0.12)`
  if (!decl) continue
  const nombre = esc(clase)
  let sel = `html.oscuro .${nombre}`
  if (variante === 'hover:') sel += ':hover'
  else if (variante === 'focus:') sel += ':focus'
  else if (variante === 'placeholder:') sel += '::placeholder'
  if (tipo === 'divide') sel += ' > :not([hidden]) ~ :not([hidden])'
  reglas.set(sel, decl)
}

const base = `/* GENERADO por scripts/generar-oscuro.mjs: no editar a mano. */
/* Modo oscuro del cliente (<html class="oscuro">). */
html.oscuro { color-scheme: dark; }
html.oscuro body { background-color: rgb(${FONDO}); color: rgb(${CREMA}); }
html.oscuro .bg-gradient-soft, html.oscuro .bg-gradient-warm { background-image: linear-gradient(180deg, rgb(${FONDO}), rgb(26 21 17)); }
html.oscuro .card, html.oscuro .card-quiet { background-color: rgb(${TARJETA}); }
html.oscuro .card { box-shadow: 0 8px 24px -12px rgba(0,0,0,0.6); }
html.oscuro .card-quiet { border-color: rgb(${CREMA} / 0.12); }
html.oscuro .input-field, html.oscuro .textarea-field { background-color: rgb(${HUMO}); border-color: rgb(${CREMA} / 0.22); color: rgb(${CREMA}); }
html.oscuro .input-field::placeholder, html.oscuro .textarea-field::placeholder { color: rgb(${CREMA} / 0.5); }
html.oscuro select.input-field option { background-color: rgb(${HUMO}); color: rgb(${CREMA}); }
html.oscuro .label-field { color: rgb(${CREMA} / 0.72); }
html.oscuro .btn-secondary { background-color: rgb(${HUMO}); color: rgb(${CREMA}); border-color: rgb(${CREMA} / 0.14); }
html.oscuro .btn-ghost { color: #FF6B5E; border-color: rgb(255 107 94 / 0.4); }
html.oscuro .btn-icon { color: rgb(${CREMA} / 0.72); }
html.oscuro .btn-mustard { color: #15110D; }
html.oscuro .page-header { background-color: rgb(${FONDO} / 0.95); border-color: rgb(${CREMA} / 0.12); }
html.oscuro .section-title { color: rgb(${CREMA}); }
html.oscuro .badge-completed { background-color: rgb(${HUMO}); color: rgb(${CREMA} / 0.7); }
html.oscuro .badge-cash { color: rgb(${CREMA}); }
html.oscuro ::selection { color: rgb(${CREMA}); }
`
const cuerpo = [...reglas.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([s, d]) => `${s} { ${d}; }`).join('\n')
writeFileSync('src/oscuro.css', `${base}\n${cuerpo}\n`)
console.log(`src/oscuro.css: ${reglas.size} clases con su versión oscura`)
