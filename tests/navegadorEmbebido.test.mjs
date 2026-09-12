// Pruebas del detector de navegadores embebidos.
// Los user agents de aquí son reales: de eso depende que a un empleado le
// aparezca la instrucción en vez del error de Google.
// Corre con: npm test  (node --test, sin dependencias)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  navegadorEmbebido, bloqueaLogin, esAndroid, enlaceChromeAndroid,
} from '../src/utils/navegadorEmbebido.js'

const UA = {
  whatsappIOS: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 WhatsApp/2.24.10.78',
  whatsappAndroid: 'Mozilla/5.0 (Linux; Android 13; SM-A536E Build/TP1A) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0.0.0 Mobile Safari/537.36 WhatsApp/2.24.9.78',
  instagram: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Instagram 322.0.0.31.112',
  facebook: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 [FBAN/FBIOS;FBAV/456.0.0.32.108]',
  // Navegadores de verdad: NO deben marcarse
  safariIOS: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  chromeIOS: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 CriOS/125.0.6422.80 Mobile/15E148 Safari/604.1',
  chromeAndroid: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36',
  chromeEscritorio: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  androidWebView: 'Mozilla/5.0 (Linux; Android 12; SM-G991B Build/SP1A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/119.0.0.0 Mobile Safari/537.36',
}

test('reconoce el navegador de WhatsApp, que es el caso reportado', () => {
  assert.equal(navegadorEmbebido(UA.whatsappIOS), 'WhatsApp')
  assert.equal(navegadorEmbebido(UA.whatsappAndroid), 'WhatsApp')
})

test('reconoce las otras apps que abren enlaces adentro', () => {
  assert.equal(navegadorEmbebido(UA.instagram), 'Instagram')
  assert.equal(navegadorEmbebido(UA.facebook), 'Facebook')
})

test('NO molesta en los navegadores de verdad', () => {
  // Este es el riesgo de un detector así: que le salga el aviso a quien sí
  // puede entrar normal.
  for (const k of ['safariIOS', 'chromeIOS', 'chromeAndroid', 'chromeEscritorio']) {
    assert.equal(navegadorEmbebido(UA[k]), null, `${k} no debería marcarse`)
    assert.equal(bloqueaLogin(UA[k]), false)
  }
})

test('detecta una ventana embebida aunque la app no se identifique', () => {
  // iOS sin "Safari" en el UA = WKWebView dentro de otra app.
  const wkGenerico = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148'
  assert.equal(navegadorEmbebido(wkGenerico), 'el navegador de otra app')
  // Android marca los WebView con "wv".
  assert.equal(navegadorEmbebido(UA.androidWebView), 'el navegador de otra app')
})

test('sin user agent no rompe ni marca', () => {
  for (const v of ['', null, undefined]) {
    assert.equal(navegadorEmbebido(v), null)
    assert.equal(bloqueaLogin(v), false)
  }
})

test('distingue Android para ofrecer abrir en Chrome', () => {
  assert.equal(esAndroid(UA.whatsappAndroid), true)
  assert.equal(esAndroid(UA.whatsappIOS), false)
})

test('el enlace de Chrome en Android sale bien formado', () => {
  const u = enlaceChromeAndroid('https://delistars.com/turnos/')
  assert.equal(u, 'intent://delistars.com/turnos/#Intent;scheme=https;package=com.android.chrome;end')
  // sin el esquema tampoco se rompe
  assert.match(enlaceChromeAndroid('delistars.com/turnos/'), /^intent:\/\/delistars\.com/)
})
