const fs = require('fs')
const src = 'dist-vacantes/vacantes.html'
const dst = 'dist-vacantes/index.html'
if (fs.existsSync(src)) {
  fs.renameSync(src, dst)
  console.log(`Renamed ${src} → ${dst}`)
}
