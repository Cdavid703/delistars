import { useState, useEffect } from 'react'
import {
  collection, addDoc, onSnapshot, serverTimestamp, query, orderBy
} from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth'
import { db, storage, auth, provider } from '../services/firebase'
import { ADMIN_EMAILS } from '../services/roles'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import {
  MapPin, Phone, Mail, FileText, Upload, CheckCircle,
  Users, Download, LogIn, LogOut, X, AlertCircle,
  Star, Clock, Bike, DollarSign, ChevronDown, ChevronUp
} from 'lucide-react'

// ─── Job content ──────────────────────────────────────────────────────────────
const JOB_TITLE = 'Domiciliario / Mensajero Motorizado Autónomo'
const JOB_SUBTITLE = 'Pago Diario Garantizado + 100% Propinas'
const JOB_ZONE = 'Zona Santa Lucía / La América / Santa Teresita – Medellín'

const JOB_DESCRIPTION = `En DELISTARS estamos buscando personas proactivas, responsables y con excelente conocimiento de la zona occidental de Medellín (Santa Lucía, Santa Teresita, La América y alrededores) para unirse a nuestra operación como Domiciliarios Autónomos.

Si vives cerca de la zona, buscas un ingreso diario estable, manejar tu propio tiempo y cuentas con moto propia, ¡esta oportunidad es para ti!`

const OFFER_ITEMS = [
  { emoji: '📄', label: 'Contrato', value: 'Civil por Prestación de Servicios (Independiente).' },
  { emoji: '💵', label: 'Ingreso mínimo garantizado', value: '$60.000 COP por jornada. Cubre disponibilidad y auxilio de rodamiento / combustible.' },
  { emoji: '🛵', label: 'Esquema de ganancia', value: '$4.000 COP base por domicilio + recargos por distancia. Si el total supera el mínimo, ¡te llevas el excedente real!' },
  { emoji: '🤝', label: 'Propinas', value: 'El 100% de las propinas son tuyas. DELISTARS no retiene ni descuenta nada.' },
  { emoji: '💰', label: 'Frecuencia de pago', value: 'Liquidación y pago en efectivo al finalizar cada jornada.' },
  { emoji: '⏰', label: 'Horario', value: 'Flexibilidad dentro del turno de 5:00 PM a 11:30 PM.' },
]

const REQUIREMENTS = [
  'Motocicleta propia en óptimas condiciones mecánicas.',
  'Licencia de conducción A2 vigente.',
  'Documentos del vehículo al día (SOAT y Revisión Tecno-mecánica vigentes).',
  'Afiliado y activo en Seguridad Social (Salud + ARL Riesgo IV — presentar soporte al inicio).',
  'RUT actualizado (actividad económica de mensajería / transporte).',
  'Excelente actitud de servicio al cliente, puntualidad y honestidad.',
]

const ACCEPTED_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]

// ─── Main page ────────────────────────────────────────────────────────────────
export default function VacantesPage() {
  const [currentUser, setCurrentUser] = useState(undefined) // undefined = loading
  const [tab,         setTab]         = useState('vacante')  // 'vacante' | 'postulantes'
  const [showForm,    setShowForm]    = useState(false)
  const [loginError,  setLoginError]  = useState('')

  // Listen to Firebase auth state independently (no AuthContext dependency)
  useEffect(() => {
    return onAuthStateChanged(auth, u => setCurrentUser(u))
  }, [])

  const isAdmin = ADMIN_EMAILS.map(e => e.toLowerCase()).includes(
    currentUser?.email?.toLowerCase() ?? ''
  )

  const handleAdminLogin = async () => {
    setLoginError('')
    try {
      await signInWithPopup(auth, provider)
    } catch {
      setLoginError('Error al iniciar sesión')
    }
  }

  const handleLogout = async () => {
    await signOut(auth)
    setTab('vacante')
  }

  return (
    <div className="min-h-screen bg-gradient-soft flex flex-col">
      {/* Header */}
      <header className="bg-cream/95 backdrop-blur-sm border-b border-coal/10 sticky top-0 z-40">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/logo_sello.png" alt="DeliStars" className="h-9 w-9 object-contain" />
            <div>
              <p className="font-display text-base text-coal tracking-wide leading-tight">DeliStars</p>
              <p className="font-body text-[10px] text-coal/40 uppercase tracking-widest">Trabaja con nosotros</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {currentUser === undefined ? null : currentUser ? (
              <div className="flex items-center gap-2">
                <p className="font-body text-xs text-coal/50 hidden sm:block">
                  {currentUser.displayName?.split(' ')[0]}
                </p>
                <button onClick={handleLogout} className="btn-icon text-coal/50 hover:text-pepper" title="Cerrar sesión">
                  <LogOut size={18} />
                </button>
              </div>
            ) : (
              <button onClick={handleAdminLogin}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold font-body text-coal/50 hover:text-cherry hover:bg-cherry/5 transition-colors">
                <LogIn size={14} />
                Admin
              </button>
            )}
          </div>
        </div>
      </header>

      {loginError && (
        <div className="max-w-3xl mx-auto px-4 mt-2">
          <p className="text-xs text-pepper font-body">{loginError}</p>
        </div>
      )}

      {/* Hero */}
      <div className="bg-gradient-to-br from-cherry via-tangelo to-mustard px-4 py-12 relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          {[...Array(3)].map((_, i) => (
            <Star key={i} className="absolute text-cream"
              style={{ width: 60 + i * 30, height: 60 + i * 30, top: `${i * 30}%`, right: `${i * 20}%`, transform: `rotate(${i * 45}deg)` }} />
          ))}
        </div>
        <div className="max-w-3xl mx-auto relative z-10">
          <span className="inline-block font-body text-xs font-semibold text-cream/70 uppercase tracking-widest bg-cream/10 px-3 py-1 rounded-full mb-3">
            Oportunidad laboral
          </span>
          <h1 className="font-display text-3xl sm:text-4xl text-cream tracking-wide leading-tight mb-2">
            {JOB_TITLE}
          </h1>
          <p className="font-body text-cream/80 text-base font-semibold mb-1">{JOB_SUBTITLE}</p>
          <div className="flex items-center gap-2 mt-3">
            <MapPin size={14} className="text-cream/60 flex-shrink-0" />
            <p className="font-body text-sm text-cream/70">{JOB_ZONE}</p>
          </div>
        </div>
      </div>

      {/* Tabs (only show Postulantes to admin) */}
      {isAdmin && (
        <div className="max-w-3xl mx-auto w-full px-4 mt-4">
          <div className="flex border-b border-coal/10 bg-cream/80 rounded-t-2xl overflow-hidden">
            {[
              { id: 'vacante',      label: '📋 Vacante' },
              { id: 'postulantes',  label: `👥 Postulantes` },
            ].map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`flex-1 py-3 text-sm font-semibold font-body transition-all ${
                  tab === t.id
                    ? 'text-cherry border-b-2 border-cherry bg-cherry/5'
                    : 'text-coal/50 hover:text-coal/80'
                }`}>
                {t.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Content */}
      <div className="max-w-3xl mx-auto w-full px-4 pb-16 mt-4 flex flex-col gap-4">
        {tab === 'vacante' && (
          <JobContent onApply={() => setShowForm(true)} />
        )}
        {tab === 'postulantes' && isAdmin && (
          <PostulantesGrid />
        )}
      </div>

      {/* Application modal */}
      {showForm && (
        <ApplicationModal onClose={() => setShowForm(false)} />
      )}
    </div>
  )
}

// ─── Job content ──────────────────────────────────────────────────────────────
function JobContent({ onApply }) {
  return (
    <>
      {/* Description */}
      <div className="card">
        <p className="font-display text-xl text-coal tracking-wide mb-3">Descripción del cargo</p>
        {JOB_DESCRIPTION.split('\n\n').map((p, i) => (
          <p key={i} className="font-body text-sm text-coal/80 leading-relaxed mb-3 last:mb-0">{p}</p>
        ))}
      </div>

      {/* What we offer */}
      <div className="card border-l-4 border-cherry">
        <p className="font-display text-xl text-cherry tracking-wide mb-4">¿Qué ofrecemos?</p>
        <div className="flex flex-col gap-3">
          {OFFER_ITEMS.map((item, i) => (
            <div key={i} className="flex items-start gap-3">
              <span className="text-2xl flex-shrink-0 leading-none mt-0.5">{item.emoji}</span>
              <div>
                <p className="font-body text-xs font-semibold text-coal/50 uppercase tracking-wider">{item.label}</p>
                <p className="font-body text-sm text-coal/90 leading-relaxed">{item.value}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Requirements */}
      <div className="card border-l-4 border-mustard">
        <p className="font-display text-xl text-coal tracking-wide mb-4">Requisitos obligatorios</p>
        <div className="flex flex-col gap-2">
          {REQUIREMENTS.map((req, i) => (
            <div key={i} className="flex items-start gap-3">
              <CheckCircle size={16} className="text-mint flex-shrink-0 mt-0.5" />
              <p className="font-body text-sm text-coal/80 leading-relaxed">{req}</p>
            </div>
          ))}
        </div>
      </div>

      {/* How to apply */}
      <div className="card bg-cherry/5 border border-cherry/20">
        <p className="font-display text-xl text-cherry tracking-wide mb-3">¿Cómo postularse?</p>
        <p className="font-body text-sm text-coal/70 leading-relaxed mb-4">
          Es muy fácil. Haz clic en el botón de abajo y completa el formulario básico con tus datos: nombre, teléfono, correo y tu hoja de vida en PDF o Word.
          <strong className="text-coal"> ¡Te contactaremos de inmediato para agendar tu entrevista!</strong>
        </p>
        <button onClick={onApply}
          className="w-full flex items-center justify-center gap-2 bg-cherry text-cream font-display text-lg tracking-wide py-4 rounded-2xl shadow-glow hover:bg-cherry/90 active:scale-95 transition-all">
          <Upload size={20} />
          Subir hoja de vida y postularme
        </button>
      </div>

      {/* Footer info */}
      <div className="text-center py-4">
        <p className="font-body text-xs text-coal/30">DeliStars · Plataforma de Domicilios · Medellín, Colombia</p>
      </div>
    </>
  )
}

// ─── Application modal ────────────────────────────────────────────────────────
function ApplicationModal({ onClose }) {
  const [form, setForm]       = useState({ name: '', phone: '', email: '' })
  const [cvFile, setCvFile]   = useState(null)
  const [errors, setErrors]   = useState([])
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleFile = (e) => {
    const file = e.target.files[0]
    if (!file) return
    if (!ACCEPTED_TYPES.includes(file.type)) {
      setErrors(['El archivo debe ser PDF o Word (.doc / .docx)'])
      return
    }
    if (file.size > 8 * 1024 * 1024) {
      setErrors(['El archivo no puede superar los 8 MB'])
      return
    }
    setCvFile(file)
    setErrors([])
  }

  const handleSubmit = async () => {
    const errs = []
    if (!form.name.trim())  errs.push('El nombre completo es obligatorio')
    if (!form.phone.trim()) errs.push('El teléfono / WhatsApp es obligatorio')
    if (!form.email.trim() || !form.email.includes('@')) errs.push('El correo electrónico no es válido')
    if (!cvFile)            errs.push('Debes adjuntar tu hoja de vida')
    if (errs.length) { setErrors(errs); return }

    setLoading(true)
    setErrors([])
    try {
      // Upload CV to Firebase Storage
      const ext = cvFile.name.split('.').pop()
      const fileName = `cvs/${Date.now()}_${form.name.replace(/\s+/g, '_').slice(0, 30)}.${ext}`
      const storageRef = ref(storage, fileName)
      await uploadBytes(storageRef, cvFile)
      const cvUrl = await getDownloadURL(storageRef)

      // Save applicant data to Firestore
      await addDoc(collection(db, 'vacantes_postulantes'), {
        name:      form.name.trim(),
        phone:     form.phone.trim(),
        email:     form.email.trim().toLowerCase(),
        cvUrl,
        cvName:    cvFile.name,
        submittedAt: serverTimestamp(),
        status:    'nueva',
      })

      setSuccess(true)
    } catch (err) {
      console.error(err)
      setErrors(['Ocurrió un error al enviar. Por favor intenta de nuevo o escríbenos por WhatsApp.'])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-coal/50 backdrop-blur-sm animate-fade-in"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-cream w-full max-w-lg rounded-t-3xl sm:rounded-3xl max-h-[92dvh] overflow-y-auto scroll-custom animate-slide-in-right">

        {/* Header */}
        <div className="sticky top-0 bg-gradient-to-r from-cherry to-tangelo px-5 py-4 rounded-t-3xl flex items-center justify-between">
          <p className="font-display text-xl text-cream tracking-wide">Tu postulación</p>
          <button onClick={onClose} className="text-cream/70 hover:text-cream">
            <X size={22} />
          </button>
        </div>

        <div className="p-5 flex flex-col gap-4">
          {success ? (
            /* ─── Success ─── */
            <div className="flex flex-col items-center gap-4 py-8 text-center">
              <div className="w-20 h-20 rounded-full bg-mint/10 flex items-center justify-center">
                <CheckCircle size={40} className="text-mint" />
              </div>
              <p className="font-display text-2xl text-coal tracking-wide">¡Postulación enviada!</p>
              <p className="font-body text-sm text-coal/60 max-w-xs leading-relaxed">
                Recibimos tu hoja de vida. El equipo de DeliStars se comunicará contigo muy pronto para agendar la entrevista.
              </p>
              <button onClick={onClose} className="btn-primary mt-2">
                Volver a la oferta
              </button>
            </div>
          ) : (
            /* ─── Form ─── */
            <>
              <p className="font-body text-sm text-coal/60 leading-relaxed">
                Completa el formulario y adjunta tu hoja de vida. <strong>No necesitas crear cuenta.</strong>
              </p>

              {errors.length > 0 && (
                <div className="bg-pepper/10 border border-pepper/30 rounded-xl p-3 flex flex-col gap-1">
                  {errors.map(e => (
                    <p key={e} className="flex items-center gap-2 text-sm text-pepper font-body">
                      <AlertCircle size={14} className="flex-shrink-0" /> {e}
                    </p>
                  ))}
                </div>
              )}

              <div>
                <label className="label-field">Nombre completo *</label>
                <input className="input-field" value={form.name}
                  onChange={e => set('name', e.target.value)}
                  placeholder="Tu nombre completo" />
              </div>

              <div>
                <label className="label-field">Teléfono / WhatsApp *</label>
                <input className="input-field" value={form.phone}
                  onChange={e => set('phone', e.target.value)}
                  placeholder="3001234567" type="tel" />
              </div>

              <div>
                <label className="label-field">Correo electrónico *</label>
                <input className="input-field" value={form.email}
                  onChange={e => set('email', e.target.value)}
                  placeholder="tu@correo.com" type="email" />
              </div>

              <div>
                <label className="label-field">Hoja de vida *</label>
                <label className={`flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-2xl p-6 cursor-pointer transition-colors ${
                  cvFile ? 'border-mint bg-mint/5' : 'border-coal/20 hover:border-cherry/40 hover:bg-cherry/5'
                }`}>
                  {cvFile ? (
                    <>
                      <CheckCircle size={28} className="text-mint" />
                      <p className="font-body text-sm font-semibold text-mint">{cvFile.name}</p>
                      <p className="font-body text-xs text-coal/40">{(cvFile.size / 1024).toFixed(0)} KB · Toca para cambiar</p>
                    </>
                  ) : (
                    <>
                      <Upload size={28} className="text-coal/30" />
                      <p className="font-body text-sm font-semibold text-coal/60">Toca para seleccionar tu hoja de vida</p>
                      <p className="font-body text-xs text-coal/40">PDF, DOC o DOCX · máximo 8 MB</p>
                    </>
                  )}
                  <input type="file" accept=".pdf,.doc,.docx" className="hidden" onChange={handleFile} />
                </label>
              </div>

              <div className="flex gap-3 pb-4">
                <button onClick={onClose} className="btn-secondary flex-1">Cancelar</button>
                <button onClick={handleSubmit} disabled={loading} className="btn-primary flex-1">
                  {loading ? (
                    <span className="flex items-center gap-2">
                      <span className="w-4 h-4 border-2 border-cream/30 border-t-cream rounded-full animate-spin" />
                      Enviando…
                    </span>
                  ) : (
                    <><Upload size={16} /> Enviar postulación</>
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Admin: applicants grid ───────────────────────────────────────────────────
function PostulantesGrid() {
  const [postulantes, setPostulantes] = useState([])
  const [loading,     setLoading]     = useState(true)

  useEffect(() => {
    const q = query(
      collection(db, 'vacantes_postulantes'),
      orderBy('submittedAt', 'desc')
    )
    return onSnapshot(q, snap => {
      setPostulantes(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      setLoading(false)
    })
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-8 h-8 border-2 border-cherry/30 border-t-cherry rounded-full animate-spin" />
      </div>
    )
  }

  if (postulantes.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <p className="text-4xl">📭</p>
        <p className="font-body text-coal/40">Aún no hay postulantes</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Summary */}
      <div className="card bg-coal text-cream flex items-center gap-4">
        <div className="w-12 h-12 bg-cherry rounded-full flex items-center justify-center flex-shrink-0">
          <Users size={22} className="text-cream" />
        </div>
        <div>
          <p className="font-display text-2xl tracking-wide">{postulantes.length}</p>
          <p className="font-body text-xs opacity-50">
            Postulante{postulantes.length !== 1 ? 's' : ''} recibido{postulantes.length !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      {/* List */}
      {postulantes.map((p, i) => (
        <div key={p.id} className="card flex flex-col gap-3">
          {/* Header row */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-cherry/10 flex items-center justify-center flex-shrink-0">
                <span className="font-display text-base text-cherry">{i + 1}</span>
              </div>
              <div>
                <p className="font-body font-semibold text-sm text-coal">{p.name}</p>
                <p className="font-body text-xs text-coal/40">
                  {p.submittedAt?.toDate
                    ? format(p.submittedAt.toDate(), "dd/MM/yyyy 'a las' HH:mm", { locale: es })
                    : 'Fecha desconocida'}
                </p>
              </div>
            </div>
          </div>

          {/* Contact info */}
          <div className="flex flex-col gap-1.5 bg-smoked/40 rounded-xl p-3">
            <a href={`tel:${p.phone}`}
              className="flex items-center gap-2 font-body text-sm text-cherry font-semibold">
              <Phone size={14} className="flex-shrink-0" /> {p.phone}
            </a>
            <a href={`mailto:${p.email}`}
              className="flex items-center gap-2 font-body text-sm text-coal/70">
              <Mail size={14} className="flex-shrink-0" /> {p.email}
            </a>
          </div>

          {/* CV download */}
          {p.cvUrl && (
            <a href={p.cvUrl} target="_blank" rel="noreferrer"
              className="flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-mint/10 border border-mint/30 text-mint font-semibold font-body text-sm hover:bg-mint/20 transition-colors">
              <Download size={16} />
              Descargar hoja de vida
              {p.cvName && <span className="text-xs font-normal text-mint/60 ml-1">({p.cvName})</span>}
            </a>
          )}
        </div>
      ))}
    </div>
  )
}
