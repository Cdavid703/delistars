import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { db, auth, loginAnon } from "@/services/firebase";
import { apiService, type Product } from "@/services/api";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { optimizeImage } from "@/lib/utils";
import {
  Star, Clock, MapPin, FileText, CreditCard, Headset, CalendarClock,
  Download, Send, CheckCircle2, Building2, PartyPopper, Presentation, RefreshCw, ShoppingBag,
  Banknote, Smartphone, Landmark, Globe, MonitorSmartphone, Gift, IdCard,
  Utensils, ShieldCheck, Users, Timer,
} from "lucide-react";

const BROCHURE_URL = "/brochure-delistars-empresas.pdf";
const WA_EMPRESAS = "573122275039";
const WA_TEXT = encodeURIComponent("Hola DeliStars 👋 Quiero cotizar un pedido para mi empresa.");

const NUMEROS = [
  { icon: CalendarClock, big: "2016", small: "Operando desde" },
  { icon: MapPin, big: "2", small: "Sedes en Medellín" },
  { icon: Star, big: "4.5★", small: "Calificación" },
  { icon: Clock, big: "~40 min", small: "Entrega típica" },
  { icon: Building2, big: "3", small: "Comunas cubiertas" },
];

const DIFERENCIALES = [
  { icon: Star, title: "Frescura y sabor", desc: "Ingredientes frescos y salsas de la casa en cada pedido — la misma calidad que nos dio 4.5★." },
  { icon: Clock, title: "Puntualidad", desc: "Entregas coordinadas para tu hora exacta, con seguimiento en vivo del domiciliario." },
  { icon: FileText, title: "Factura electrónica", desc: "Facturamos electrónicamente a tu empresa, con NIT y todos los soportes." },
  { icon: CreditCard, title: "Todas las formas de pago", desc: "Efectivo, tarjeta débito y crédito, transferencia, Nequi y demás pagos digitales." },
  { icon: Headset, title: "Atención dedicada", desc: "Un canal directo para empresas: cotizamos y coordinamos contigo cada pedido." },
  { icon: MapPin, title: "Cobertura amplia", desc: "Comunas 11 (Laureles), 12 (La América) y 13 (San Javier) y alrededores." },
];

const SOLUCIONES = [
  { icon: ShoppingBag, title: "Almuerzos de oficina", desc: "El almuerzo del equipo resuelto: combos completos, entregados calientes y a tiempo.", color: "text-cherry" },
  { icon: PartyPopper, title: "Eventos y celebraciones", desc: "Cumpleaños, integraciones y fin de año con comida que a todos les encanta.", color: "text-tangelo" },
  { icon: Presentation, title: "Reuniones y capacitaciones", desc: "Snacks y almuerzos para tus jornadas de trabajo, sin que nadie tenga que salir.", color: "text-mustard" },
  { icon: RefreshCw, title: "Pedidos recurrentes", desc: "¿Piden seguido? Coordinamos un plan a la medida de tu empresa.", color: "text-mint" },
];

const PAGOS = [
  { icon: Banknote, label: "Efectivo" },
  { icon: CreditCard, label: "Tarjeta débito y crédito" },
  { icon: Landmark, label: "Transferencia bancaria" },
  { icon: Smartphone, label: "Nequi y pagos digitales" },
];

const WEB_VENTAJAS = [
  { icon: MonitorSmartphone, title: "Pide en línea", desc: "Menú completo con fotos y precios en www.delistars.com — sin llamadas ni esperas." },
  { icon: MapPin, title: "Seguimiento en vivo", desc: "Tu equipo ve el estado del pedido y la ubicación del domiciliario en tiempo real." },
  { icon: RefreshCw, title: "Volver a pedir", desc: "Historial de pedidos y repetición con un toque — ideal para pedidos frecuentes." },
  { icon: Gift, title: "Fidelización", desc: "Cada 10 domicilios entregados, una Hamburguesa Especial gratis. Tus empleados acumulan al pedir." },
];

const PAQUETES = [
  { emoji: "🍔", title: "Almuerzo ejecutivo", desc: "Hamburguesa o perro + papas + bebida. Ideal para el almuerzo diario del equipo." },
  { emoji: "🎉", title: "Paquete evento", desc: "Variedad de perros, hamburguesas y salchipapas para compartir, con bebidas. Para integraciones y celebraciones." },
  { emoji: "🥤", title: "Snack de reunión", desc: "Salchipapas, chuzos y bebidas para picar durante jornadas y capacitaciones." },
];

const GARANTIAS = [
  { icon: ShieldCheck, title: "Calidad e higiene", desc: "Preparamos cada pedido al momento, con ingredientes frescos y buenas prácticas de manipulación de alimentos." },
  { icon: Users, title: "Grupos de cualquier tamaño", desc: "Desde equipos pequeños hasta eventos grandes — cuéntanos cuántos son y lo coordinamos." },
  { icon: Timer, title: "Respuesta rápida", desc: "Te contactamos para afinar tu cotización y confirmar disponibilidad para tu fecha." },
];

const PASOS = [
  ["1", "Cotiza", "Escríbenos con tu fecha, número de personas y lo que necesitas (mínimo 4 días de anticipación)."],
  ["2", "Confirmamos", "Armamos contigo el menú y la logística, y te enviamos la cotización a la medida."],
  ["3", "Entregamos", "Llevamos tu pedido caliente y puntual a la hora acordada, con seguimiento en vivo."],
  ["4", "Facturamos", "Recibes tu factura electrónica con todos los soportes para tu empresa."],
];

const FEATURED = [
  "Hamburguesa Super", "Super Perro con tocineta", "Salchipapa Especial", "Papastars",
  "Combo Hamburguesa Super", "Perra Grande", "Chuzo de Pollo", "Hamburguesa Especial de Pollo",
];

export default function Empresas() {
  const { data: products = [] } = useQuery({ queryKey: ["products"], queryFn: () => apiService.getProducts() });
  const featured = FEATURED
    .map((n) => products.find((p) => p.nombre_producto === n))
    .filter(Boolean) as Product[];

  const [form, setForm] = useState({
    empresa: "", nombre: "", cargo: "", telefono: "", correo: "",
    personas: "", fecha: "", tipo: "Almuerzos de oficina", mensaje: "",
  });
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.empresa.trim() || !form.nombre.trim() || !form.telefono.trim()) {
      setError("Completa al menos empresa, nombre y teléfono.");
      return;
    }
    setError("");
    setSending(true);
    try {
      if (!auth.currentUser) await loginAnon();
      await addDoc(collection(db, "corporate_leads"), {
        ...form,
        uid: auth.currentUser!.uid,
        estado: "nuevo",
        origen: "web /empresas",
        createdAt: serverTimestamp(),
      });
      setSent(true);
    } catch (err) {
      setError("No se pudo enviar. Intenta de nuevo o escríbenos por WhatsApp.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Barra superior simple */}
      <header className="sticky top-0 z-40 bg-background/90 backdrop-blur-md border-b border-border">
        <div className="container flex items-center justify-between py-3 px-4 sm:px-6">
          <a href="/" className="flex items-center gap-2 hover-scale">
            <img src="/logo.svg" alt="DeliStars" className="w-10 h-10 object-contain" onError={(ev) => ((ev.target as HTMLImageElement).style.display = "none")} />
            <span className="font-display text-base tracking-widest text-foreground">DELISTARS</span>
          </a>
          <div className="flex items-center gap-2">
            <a href="/" className="hidden sm:inline text-sm font-medium text-foreground/70 hover:text-primary transition-smooth">Ver el menú</a>
            <a href={`https://wa.me/${WA_EMPRESAS}?text=${WA_TEXT}`} target="_blank" rel="noreferrer">
              <Button size="sm" className="bg-gradient-hero text-primary-foreground border-0">Cotizar</Button>
            </a>
          </div>
        </div>
      </header>

      {/* HERO */}
      <section className="relative overflow-hidden bg-gradient-to-br from-cherry to-tangelo text-cream">
        <div className="container px-4 sm:px-6 py-16 md:py-24 grid md:grid-cols-2 gap-10 items-center">
          <div className="space-y-5">
            <p className="font-display tracking-widest text-cream/80 text-sm">·Tasty & Cool · Para Empresas·</p>
            <h1 className="font-display text-4xl md:text-6xl leading-tight">Alimenta a tu equipo con sabor que brilla</h1>
            <p className="text-cream/90 text-lg max-w-md">
              Comida rápida artesanal para almuerzos de oficina, eventos, reuniones y pedidos recurrentes — en Medellín, con factura electrónica.
            </p>
            <div className="flex flex-wrap gap-3 pt-2">
              <a href="#cotizar"><Button size="lg" className="bg-cream text-cherry hover:bg-cream/90 border-0 shadow-soft font-semibold"><Send className="w-4 h-4" /> Solicitar cotización</Button></a>
              <a href={BROCHURE_URL} download><Button size="lg" variant="outline" className="border-cream text-cream hover:bg-cream/10"><Download className="w-4 h-4" /> Descargar brochure</Button></a>
            </div>
          </div>
          <div className="hidden md:block">
            <img src={optimizeImage("https://res.cloudinary.com/dfx530yml/image/upload/v1778946280/delistars/COMBO_HAMBURGUESA_SUPER_DE_CARNE_shgnsm.jpg", 700, 520, "g_auto")}
              alt="Combo DeliStars" className="rounded-3xl shadow-glow w-full object-cover" />
          </div>
        </div>
      </section>

      {/* NÚMEROS */}
      <section className="container px-4 sm:px-6 py-12">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {NUMEROS.map((n) => (
            <div key={n.small} className="bg-cream/60 rounded-2xl p-5 text-center shadow-card">
              <n.icon className="w-6 h-6 mx-auto text-cherry mb-2" />
              <p className="font-display text-2xl text-coal">{n.big}</p>
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mt-1">{n.small}</p>
            </div>
          ))}
        </div>
      </section>

      {/* DIFERENCIALES */}
      <section className="container px-4 sm:px-6 py-12">
        <h2 className="font-display text-3xl md:text-4xl text-center text-coal mb-3">¿Por qué DeliStars para tu empresa?</h2>
        <div className="w-20 h-1 bg-gradient-hero rounded-full mx-auto mb-10" />
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {DIFERENCIALES.map((d) => (
            <div key={d.title} className="bg-card border border-border rounded-2xl p-6 shadow-card hover:shadow-glow transition-smooth">
              <d.icon className="w-8 h-8 text-primary mb-3" />
              <h3 className="font-display text-xl text-coal mb-1.5">{d.title}</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">{d.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* SOLUCIONES */}
      <section className="bg-cream/40 py-14">
        <div className="container px-4 sm:px-6">
          <h2 className="font-display text-3xl md:text-4xl text-center text-coal mb-3">Soluciones corporativas</h2>
          <p className="text-center text-muted-foreground mb-10 max-w-xl mx-auto">
            Nos adaptamos a lo que tu equipo necesita — desde el almuerzo del día a día hasta la celebración de fin de año.
          </p>
          <div className="grid sm:grid-cols-2 gap-6">
            {SOLUCIONES.map((s) => (
              <div key={s.title} className="bg-card rounded-2xl p-6 shadow-card flex gap-4 items-start">
                <s.icon className={`w-9 h-9 shrink-0 ${s.color}`} />
                <div>
                  <h3 className="font-display text-xl text-coal mb-1">{s.title}</h3>
                  <p className="text-muted-foreground text-sm leading-relaxed">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-8 bg-cherry text-cream rounded-2xl p-5 text-center">
            <p className="font-display text-lg">Pedidos corporativos con mínimo 4 días de anticipación</p>
            <p className="text-cream/90 text-sm mt-1">Aceptamos todas las formas de pago · Factura electrónica · Cotización a la medida</p>
          </div>
        </div>
      </section>

      {/* BENEFICIO PARA EMPLEADOS */}
      <section className="container px-4 sm:px-6 py-14">
        <div className="rounded-3xl bg-gradient-to-br from-mint to-[#0f6f65] text-cream p-8 md:p-12 shadow-glow">
          <div className="grid md:grid-cols-[1.2fr_1fr] gap-8 items-center">
            <div>
              <p className="inline-flex items-center gap-2 bg-cream/20 rounded-full px-3 py-1 text-sm font-semibold mb-4">
                <IdCard className="w-4 h-4" /> Convenio empresarial
              </p>
              <h2 className="font-display text-3xl md:text-4xl mb-3">Un beneficio delicioso para tus empleados</h2>
              <p className="text-cream/90 leading-relaxed">
                Vincula a tu empresa con DeliStars y tu equipo obtiene descuentos permanentes presentando el
                <strong> carnet de la empresa</strong>. Un beneficio de bienestar que no te cuesta nada y tus colaboradores agradecen.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-cream/15 rounded-2xl p-5 text-center">
                <p className="font-display text-5xl">15%</p>
                <p className="text-sm mt-1 text-cream/90">de descuento<br/>para el empleado</p>
              </div>
              <div className="bg-cream/15 rounded-2xl p-5 text-center">
                <p className="font-display text-5xl">7.5%</p>
                <p className="text-sm mt-1 text-cream/90">para su acompañante<br/>familiar</p>
              </div>
            </div>
          </div>
          <p className="text-cream/70 text-xs mt-6">
            * Descuentos aplicables presentando el carnet de la empresa vinculada, para el empleado y un acompañante familiar en el momento de la compra.
          </p>
        </div>
      </section>

      {/* PLATAFORMA WEB */}
      <section className="container px-4 sm:px-6 py-8 pb-14">
        <div className="text-center mb-10">
          <Globe className="w-8 h-8 text-cherry mx-auto mb-2" />
          <h2 className="font-display text-3xl md:text-4xl text-coal mb-2">Todo desde delistars.com</h2>
          <p className="text-muted-foreground max-w-xl mx-auto">Nuestra plataforma propia hace que pedir para tu empresa sea rápido y transparente.</p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {WEB_VENTAJAS.map((w) => (
            <div key={w.title} className="bg-card border border-border rounded-2xl p-6 shadow-card text-center">
              <w.icon className="w-8 h-8 text-primary mx-auto mb-3" />
              <h3 className="font-display text-lg text-coal mb-1.5">{w.title}</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">{w.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* MENÚ */}
      {featured.length > 0 && (
        <section className="container px-4 sm:px-6 py-14">
          <h2 className="font-display text-3xl md:text-4xl text-center text-coal mb-3">Nuestro menú</h2>
          <p className="text-center text-muted-foreground mb-10">Una muestra de lo que llevamos a tu empresa. Armamos el menú del evento contigo.</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
            {featured.map((p) => (
              <div key={p.id_producto} className="bg-card rounded-2xl overflow-hidden shadow-card hover:shadow-glow transition-smooth">
                <img src={optimizeImage(p.image_url1 || "", 400, 400, "g_auto")} alt={p.nombre_producto} className="w-full aspect-square object-cover" />
                <p className="font-display text-sm text-coal text-center p-3">{p.nombre_producto}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* PAQUETES DE EJEMPLO */}
      <section className="bg-cream/40 py-14">
        <div className="container px-4 sm:px-6">
          <div className="text-center mb-10">
            <Utensils className="w-8 h-8 text-cherry mx-auto mb-2" />
            <h2 className="font-display text-3xl md:text-4xl text-coal mb-2">Paquetes de ejemplo</h2>
            <p className="text-muted-foreground max-w-xl mx-auto">
              Un punto de partida — armamos el menú exacto contigo según tu presupuesto y el gusto de tu equipo.
            </p>
          </div>
          <div className="grid sm:grid-cols-3 gap-6">
            {PAQUETES.map((pk) => (
              <div key={pk.title} className="bg-card rounded-2xl p-6 shadow-card border border-border">
                <p className="text-3xl mb-2">{pk.emoji}</p>
                <h3 className="font-display text-xl text-coal mb-1.5">{pk.title}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">{pk.desc}</p>
              </div>
            ))}
          </div>
          <p className="text-center text-muted-foreground text-sm mt-6">
            Cotización a la medida · Sin precios fijos: se ajusta al número de personas y al menú elegido.
          </p>
        </div>
      </section>

      {/* CÓMO FUNCIONA */}
      <section className="bg-coal text-cream py-14">
        <div className="container px-4 sm:px-6">
          <h2 className="font-display text-3xl md:text-4xl text-center mb-10">Cómo funciona</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {PASOS.map(([n, h, d]) => (
              <div key={n} className="text-center">
                <div className="w-12 h-12 rounded-full bg-cherry flex items-center justify-center font-display text-xl mx-auto mb-3">{n}</div>
                <h3 className="font-display text-lg mb-1">{h}</h3>
                <p className="text-cream/70 text-sm leading-relaxed">{d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* COBERTURA */}
      <section className="container px-4 sm:px-6 py-14">
        <h2 className="font-display text-3xl md:text-4xl text-center text-coal mb-10">Cobertura y sedes</h2>
        <div className="grid sm:grid-cols-2 gap-6 max-w-3xl mx-auto">
          {[
            ["Sede Santa Lucía", "Cra. 87 #48E-3, Santa Rosa de Lima, Medellín", "313 506 5720"],
            ["Sede Santa Teresita", "Cl. 35B #87A-165, La América, Medellín", "315 063 4084"],
          ].map(([n, dir, wa]) => (
            <div key={n} className="bg-cream/60 rounded-2xl p-6 shadow-card">
              <p className="font-display text-xl text-cherry flex items-center gap-2"><MapPin className="w-5 h-5" /> {n}</p>
              <p className="text-muted-foreground text-sm mt-2">{dir}</p>
              <p className="text-coal font-semibold text-sm mt-1">WhatsApp: {wa}</p>
            </div>
          ))}
        </div>
        <p className="text-center text-muted-foreground text-sm mt-6 max-w-2xl mx-auto">
          Cobertura en Comuna 12 (La América), Comuna 13 (San Javier), Comuna 11 (Laureles) y alrededores.
          Para pedidos corporativos coordinamos la entrega según tu ubicación y horario.
        </p>

        {/* Formas de pago */}
        <div className="mt-10 max-w-3xl mx-auto text-center">
          <h3 className="font-display text-xl text-coal mb-4">Aceptamos todas las formas de pago</h3>
          <div className="flex flex-wrap justify-center gap-3">
            {PAGOS.map((pg) => (
              <span key={pg.label} className="inline-flex items-center gap-2 bg-cream/70 rounded-full px-4 py-2 text-sm font-medium text-coal shadow-card">
                <pg.icon className="w-4 h-4 text-cherry" /> {pg.label}
              </span>
            ))}
            <span className="inline-flex items-center gap-2 bg-cream/70 rounded-full px-4 py-2 text-sm font-medium text-coal shadow-card">
              <FileText className="w-4 h-4 text-cherry" /> Factura electrónica
            </span>
          </div>
        </div>
      </section>

      {/* GARANTÍAS */}
      <section className="container px-4 sm:px-6 pb-14">
        <div className="grid sm:grid-cols-3 gap-6">
          {GARANTIAS.map((g) => (
            <div key={g.title} className="bg-card border border-border rounded-2xl p-6 shadow-card text-center">
              <g.icon className="w-8 h-8 text-mint mx-auto mb-3" />
              <h3 className="font-display text-lg text-coal mb-1.5">{g.title}</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">{g.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* FORMULARIO DE COTIZACIÓN */}
      <section id="cotizar" className="bg-gradient-to-br from-cherry to-tangelo py-16">
        <div className="container px-4 sm:px-6 max-w-2xl">
          <h2 className="font-display text-3xl md:text-4xl text-center text-cream mb-2">Solicita tu cotización</h2>
          <p className="text-center text-cream/90 mb-8">Cuéntanos qué necesitas y te contactamos con una propuesta a la medida.</p>

          {sent ? (
            <div className="bg-cream rounded-3xl p-8 text-center shadow-glow">
              <CheckCircle2 className="w-14 h-14 text-mint mx-auto mb-3" />
              <h3 className="font-display text-2xl text-coal mb-2">¡Solicitud enviada! 🎉</h3>
              <p className="text-muted-foreground mb-5">Te contactaremos muy pronto. Si es urgente, escríbenos por WhatsApp.</p>
              <a href={`https://wa.me/${WA_EMPRESAS}?text=${WA_TEXT}`} target="_blank" rel="noreferrer">
                <Button className="bg-[#25D366] hover:bg-[#1eb658] text-white border-0">Escribir por WhatsApp</Button>
              </a>
            </div>
          ) : (
            <form onSubmit={submit} className="bg-cream rounded-3xl p-6 sm:p-8 shadow-glow space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="Empresa *" value={form.empresa} onChange={(v) => set("empresa", v)} placeholder="Nombre de tu empresa" />
                <Field label="Tu nombre *" value={form.nombre} onChange={(v) => set("nombre", v)} placeholder="Nombre y apellido" />
                <Field label="Cargo" value={form.cargo} onChange={(v) => set("cargo", v)} placeholder="Ej. Gestión humana" />
                <Field label="Teléfono / WhatsApp *" value={form.telefono} onChange={(v) => set("telefono", v)} placeholder="3001234567" type="tel" />
                <Field label="Correo" value={form.correo} onChange={(v) => set("correo", v)} placeholder="tu@empresa.com" type="email" />
                <Field label="N.º de personas" value={form.personas} onChange={(v) => set("personas", v)} placeholder="Ej. 25" />
                <Field label="Fecha del pedido" value={form.fecha} onChange={(v) => set("fecha", v)} type="date" />
                <div>
                  <label className="block text-sm font-medium text-coal mb-1">Tipo de pedido</label>
                  <select value={form.tipo} onChange={(e) => set("tipo", e.target.value)}
                    className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-cherry/40">
                    {["Almuerzos de oficina", "Evento / celebración", "Reunión / capacitación", "Pedido recurrente", "Otro"].map((o) => <option key={o}>{o}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-coal mb-1">Mensaje</label>
                <textarea value={form.mensaje} onChange={(e) => set("mensaje", e.target.value)} rows={3}
                  placeholder="Cuéntanos más sobre lo que necesitas…"
                  className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-cherry/40" />
              </div>
              {error && <p className="text-sm text-cherry font-medium">{error}</p>}
              <div className="flex flex-col sm:flex-row gap-3 pt-1">
                <Button type="submit" disabled={sending} size="lg" className="flex-1 bg-gradient-hero text-primary-foreground border-0">
                  <Send className="w-4 h-4" /> {sending ? "Enviando…" : "Enviar solicitud"}
                </Button>
                <a href={BROCHURE_URL} download className="flex-1">
                  <Button type="button" variant="outline" size="lg" className="w-full border-cherry text-cherry hover:bg-cherry/5">
                    <Download className="w-4 h-4" /> Descargar brochure
                  </Button>
                </a>
              </div>
              <p className="text-xs text-muted-foreground text-center pt-1">
                Pedidos corporativos con mínimo 4 días de anticipación · Factura electrónica · Todas las formas de pago
              </p>
            </form>
          )}
        </div>
      </section>

      <Footer />
    </div>
  );
}

function Field({ label, value, onChange, placeholder, type = "text" }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-coal mb-1">{label}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-cherry/40" />
    </div>
  );
}
