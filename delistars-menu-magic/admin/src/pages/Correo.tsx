import { Mail, ExternalLink, Copy, Check, Smartphone, Info } from 'lucide-react'
import { useState } from 'react'

// El correo corporativo vive en Hostinger. NO se puede incrustar en un iframe:
// el webmail responde con X-Frame-Options: SAMEORIGIN (y una CSP estricta), una
// protección estándar contra clickjacking que todos los proveedores aplican.
// Por eso esta pestaña abre el webmail en una pestaña nueva y deja a mano los
// datos de configuración para clientes de correo (Outlook, Gmail, celular).
const CORREO = 'andres.arango@delistars.com'
const WEBMAIL = 'https://mail.hostinger.com/'
const WEBMAIL_TITAN = 'https://mail.titan.email/'

const IMAP = [
  ['Servidor entrante (IMAP)', 'imap.hostinger.com'],
  ['Puerto IMAP', '993 (SSL/TLS)'],
  ['Servidor saliente (SMTP)', 'smtp.hostinger.com'],
  ['Puerto SMTP', '465 (SSL/TLS)'],
  ['Usuario', CORREO],
  ['Contraseña', 'La de tu cuenta de correo'],
]

export default function Correo() {
  const [copied, setCopied] = useState<string | null>(null)

  const copy = (value: string, key: string) => {
    navigator.clipboard?.writeText(value).then(() => {
      setCopied(key)
      setTimeout(() => setCopied(null), 1500)
    }).catch(() => {})
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-4xl font-display font-bold text-coal">Correo</h1>
        <p className="text-muted-fg mt-1">Correo corporativo de DeliStars (Hostinger)</p>
      </div>

      {/* Acceso principal */}
      <div className="bg-white border border-gray-200 rounded-lg p-6 mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center gap-5">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
            <Mail className="w-7 h-7 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-display text-xl text-coal">Abrir mi correo</p>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-sm text-muted-fg truncate">{CORREO}</span>
              <button
                onClick={() => copy(CORREO, 'mail')}
                className="text-xs text-primary hover:underline inline-flex items-center gap-1 shrink-0"
                title="Copiar dirección"
              >
                {copied === 'mail' ? <><Check className="w-3 h-3" /> Copiado</> : <><Copy className="w-3 h-3" /> Copiar</>}
              </button>
            </div>
          </div>
          <a href={WEBMAIL} target="_blank" rel="noopener noreferrer" className="shrink-0">
            <button className="w-full sm:w-auto bg-primary text-white font-semibold rounded-lg px-5 py-3 hover:opacity-90 transition-opacity inline-flex items-center justify-center gap-2">
              <ExternalLink className="w-4 h-4" /> Entrar al correo
            </button>
          </a>
        </div>

        <div className="mt-5 flex items-start gap-2 bg-blue-50 border border-blue-200 rounded-lg p-3">
          <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
          <p className="text-xs text-blue-900 leading-relaxed">
            El correo se abre en una pestaña nueva porque Hostinger no permite mostrarlo dentro de otra
            página (es una protección de seguridad estándar). Si marcas <strong>"mantener sesión iniciada"</strong> en
            el webmail, las próximas veces entrarás directo sin volver a escribir la contraseña.
          </p>
        </div>

        <div className="mt-3">
          <a href={WEBMAIL_TITAN} target="_blank" rel="noopener noreferrer"
            className="text-xs text-muted-fg hover:text-primary inline-flex items-center gap-1">
            <ExternalLink className="w-3 h-3" />
            ¿El correo es de Titan? Entra por aquí
          </a>
        </div>
      </div>

      {/* Configuración para apps de correo */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <div className="flex items-center gap-2 mb-1">
          <Smartphone className="w-5 h-5 text-primary" />
          <p className="font-display text-lg text-coal">Configurarlo en tu celular o en Outlook</p>
        </div>
        <p className="text-sm text-muted-fg mb-4">
          Para recibir los correos en tu teléfono o en una app de escritorio, usa estos datos:
        </p>
        <div className="grid sm:grid-cols-2 gap-3">
          {IMAP.map(([label, value]) => (
            <div key={label} className="flex items-center justify-between gap-3 bg-gray-50 border border-gray-200 rounded-lg px-4 py-2.5">
              <div className="min-w-0">
                <p className="text-[11px] uppercase tracking-wide text-muted-fg">{label}</p>
                <p className="text-sm font-medium text-coal truncate">{value}</p>
              </div>
              {!label.includes('Contraseña') && (
                <button onClick={() => copy(value, label)} className="text-muted-fg hover:text-primary shrink-0" title="Copiar">
                  {copied === label ? <Check className="w-4 h-4 text-mint" /> : <Copy className="w-4 h-4" />}
                </button>
              )}
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-fg mt-4">
          ¿No sabes la contraseña? Se restablece desde el panel de Hostinger → Correos → Cuentas de correo.
        </p>
      </div>
    </div>
  )
}
