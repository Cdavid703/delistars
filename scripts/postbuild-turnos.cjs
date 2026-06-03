const fs = require('fs')
const src = 'dist-turnos/turnos.html'
const dst = 'dist-turnos/index.html'
if (fs.existsSync(src)) {
  fs.renameSync(src, dst)
  console.log(`Renamed ${src} → ${dst}`)
}
