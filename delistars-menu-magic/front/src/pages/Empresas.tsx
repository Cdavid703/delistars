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
  ShieldCheck, Moon, Trophy, Cake, ChevronDown, Quote, LayoutGrid, MessageCircle,
} from "lucide-react";

const BROCHURE_URL = "/brochure-delistars-empresas.pdf";
const WA_EMPRESAS = "573122275039";
const WA_TEXT = encodeURIComponent("Hola DeliStars 👋 Quiero cotizar un pedido para mi empresa.");
const CORREO = "andres.arango@delistars.com";

const COLLAGE = [
  { src: "https://res.cloudinary.com/dfx530yml/image/upload/q_auto/f_auto/v1778946281/delistars/Hamburguesa_especial_de_carne_pbv6de.jpg", alt: "Hamburguesa Especial" },
  { src: "https://res.cloudinary.com/dfx530yml/image/upload/q_auto/f_auto/v1778946284/delistars/super_perro_con_tocineta_cznenj.jpg", alt: "Súper Perro con tocineta" },
  { src: "https://res.cloudinary.com/dfx530yml/image/upload/q_auto/f_auto/v1778946283/delistars/PAPASTARS_hdou5s.jpg", alt: "Papastars" },
];

const NUMEROS = [
  { icon: CalendarClock, big: "2015", small: "Operando desde" },
  { icon: MapPin, big: "2", small: "Sedes con servicio a empresas" },
  { icon: Star, big: "4.5★", small: "Calificación de clientes" },
  { icon: Building2, big: "Área Metro", small: "Cobertura" },
];

const DIFERENCIALES = [
  {
    icon: Star, title: "Sabor que se recuerda",
    desc: "Queso derretido en cantidad generosa —de verdad, no un asomo—, nuestro guacamole de la casa que los clientes piden una y otra vez, y cebolla a elegir: cruda, sofrita o caramelizada. Ese es el sabor que hace que tu equipo pregunte cuándo se repite.",
  },
  { icon: Clock, title: "Puntualidad", desc: "Entregas coordinadas para tu hora exacta, con seguimiento en vivo del domiciliario." },
  { icon: FileText, title: "Factura electrónica", desc: "Facturamos electrónicamente a tu empresa, con NIT y todos los soportes." },
  { icon: CreditCard, title: "Todas las formas de pago", desc: "Efectivo, tarjeta débito y crédito, transferencia bancaria, Nequi y demás pagos digitales." },
  { icon: Headset, title: "Atención dedicada", desc: "Un canal directo para empresas: cotizamos y coordinamos contigo cada pedido." },
  { icon: MonitorSmartphone, title: "Plataforma propia", desc: "Pide y sigue tu pedido en delistars.com — sin llamadas, sin intermediarios, sin comisiones de terceros." },
];

const PAGOS = [
  { icon: Banknote, label: "Efectivo" },
  { icon: CreditCard, label: "Tarjeta débito y crédito" },
  { icon: Landmark, label: "Transferencia bancaria" },
  { icon: Smartphone, label: "Nequi y pagos digitales" },
  { icon: FileText, label: "Factura electrónica" },
];

const SOLUCIONES = [
  { icon: ShoppingBag, title: "Almuerzos de oficina", desc: "El almuerzo del equipo resuelto: combos completos, entregados calientes y a la hora acordada.", color: "text-cherry" },
  { icon: Moon, title: "Turnos nocturnos", desc: "Call centers, clínicas, vigilancia y producción: alimentamos al equipo cuando casi nadie más atiende.", color: "text-mint" },
  { icon: PartyPopper, title: "Eventos y celebraciones", desc: "Integraciones, cumpleaños y actividades de bienestar con comida que a todos les gusta.", color: "text-tangelo" },
  { icon: Presentation, title: "Reuniones y capacitaciones", desc: "Jornadas de trabajo alimentadas, sin que nadie tenga que salir de la oficina.", color: "text-mustard" },
  { icon: Gift, title: "Fin de año y novenas", desc: "Cenas de diciembre y novenas empresariales. Reserva con tiempo: es nuestra temporada más pedida.", color: "text-cherry" },
  { icon: Cake, title: "Cumpleaños del mes", desc: "Una celebración mensual para todos los cumpleañeros, con el mismo pedido cada vez.", color: "text-tangelo" },
  { icon: Trophy, title: "Celebración de metas", desc: "Premia al equipo comercial cuando cumple: cierre de mes, meta alcanzada, buen trimestre.", color: "text-mustard" },
  { icon: RefreshCw, title: "Pedidos recurrentes", desc: "¿Piden seguido? Armamos un plan a la medida con condiciones para tu empresa.", color: "text-mint" },
];

const PAQUETES = [
  { nombre: "Almuerzo ejecutivo", incluye: "Hamburguesa o perro + papas + bebida", ideal: "Equipos en jornada de trabajo" },
  { nombre: "Celebración", incluye: "Combos surtidos + bebidas + adiciones", ideal: "Cumpleaños e integraciones" },
  { nombre: "Turno nocturno", incluye: "Salchipapas o Papastars para compartir + bebidas", ideal: "Equipos de noche y horas extra" },
  { nombre: "A tu medida", incluye: "Armamos el menú contigo, con precio cerrado por persona", ideal: "Eventos con presupuesto definido" },
];

const WEB_VENTAJAS = [
  { icon: MonitorSmartphone, title: "Pide en línea", desc: "Menú completo con fotos y precios en delistars.com — sin llamadas ni esperas." },
  { icon: Building2, title: "Gestión para empresas", desc: "Tu empresa entra a la plataforma, cotiza, hace seguimiento y consulta el historial de sus pedidos en un solo lugar." },
  { icon: MapPin, title: "Seguimiento en vivo", desc: "Tu equipo ve el estado del pedido y la ubicación del domiciliario en tiempo real." },
  { icon: RefreshCw, title: "Volver a pedir", desc: "Historial y repetición del pedido con un toque, ideal para pedidos frecuentes." },
  { icon: MessageCircle, title: "Chat directo con la caja", desc: "Cualquier ajuste se resuelve escribiendo en la misma plataforma, sin llamadas." },
  { icon: Gift, title: "Fidelización", desc: "Cada 10 domicilios entregados, una Hamburguesa Especial gratis para quien pide." },
];

const PASOS = [
  ["1", "Cotiza", "Escríbenos con tu fecha, número de personas y lo que necesitas (mínimo 4 días de anticipación)."],
  ["2", "Confirmamos", "Armamos contigo el menú y la logística, y te enviamos la cotización a la medida."],
  ["3", "Entregamos", "Llevamos tu pedido caliente y puntual a la hora acordada, con seguimiento en vivo."],
  ["4", "Facturamos", "Recibes tu factura electrónica con todos los soportes para tu empresa."],
];

// Calificaciones reales de clientes registradas en la plataforma.
const TESTIMONIOS = [
  { nombre: "Jennifer Cabrera", texto: "Excelente servicio." },
  { nombre: "Jorge Humberto Henao", texto: "Todo muy bien" },
  { nombre: "Raul Herrera", texto: "Muchas gracias" },
];

// Colecciones del menú: el cliente despliega la que le interesa y ve TODOS los
// productos de esa colección (antes solo se mostraban 8 productos elegidos).
type Coleccion = { key: string; label: string; emoji: string; match: (p: Product) => boolean };
const esPerra = (p: Product) => /perra/i.test(p.nombre_producto);
const COLECCIONES: Coleccion[] = [
  { key: "hamburguesas", label: "Hamburguesas", emoji: "🍔", match: (p) => p.id_categoria === 1 },
  { key: "perros",       label: "Perros",       emoji: "🌭", match: (p) => p.id_categoria === 2 && !esPerra(p) },
  { key: "perras",       label: "Perras",       emoji: "🌯", match: (p) => p.id_categoria === 2 && esPerra(p) },
  { key: "salchipapas",  label: "Salchipapas y Papastars", emoji: "🍟", match: (p) => p.id_categoria === 3 },
  { key: "combos",       label: "Combos",       emoji: "📦", match: (p) => p.id_categoria === 4 },
  { key: "antojos",      label: "Chuzo de Pollo", emoji: "🍗", match: (p) => p.id_categoria === 6 },
  { key: "bebidas",      label: "Bebidas",      emoji: "🥤", match: (p) => p.id_categoria === 7 },
];

const TABS = [
  { key: "porque",     label: "Por qué DeliStars" },
  { key: "soluciones", label: "Soluciones" },
  { key: "menu",       label: "Menú" },
  { key: "beneficios", label: "Beneficios" },
  { key: "cobertura",  label: "Cobertura y pagos" },
  { key: "cotizar",    label: "Cotizar" },
];

export default function Empresas() {
  const { data: products = [] } = useQuery({ queryKey: ["products"], queryFn: () => apiService.getProducts() });
  const [tab, setTab] = useState("porque");
  const [openCol, setOpenCol] = useState<string | null>("hamburguesas");

  const irACotizar = () => {
    setTab("cotizar");
    setTimeout(() => document.getElementById("contenido")?.scrollIntoView({ behavior: "smooth" }), 50);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Barra superior */}
      <header className="sticky top-0 z-40 bg-background/95 backdrop-blur-md border-b border-border">
        <div className="container flex items-center justify-between py-3 px-4 sm:px-6">
          <a href="/" className="flex items-center gap-2 hover-scale">
            <span className="font-display text-base tracking-widest text-foreground">DELISTARS</span>
            <span className="hidden sm:inline text-xs text-muted-foreground">· Empresas</span>
          </a>
          <div className="flex items-center gap-2">
            <a href="/" className="hidden sm:inline text-sm font-medium text-foreground/70 hover:text-primary transition-smooth">Ver el menú</a>
            {/* Lleva al área de cotización (ahí se elige formulario o WhatsApp) */}
            <Button size="sm" onClick={irACotizar} className="bg-gradient-hero text-primary-foreground border-0">Cotizar</Button>
          </div>
        </div>
      </header>

      {/* HERO con collage de productos */}
      <section className="relative overflow-hidden bg-gradient-to-br from-cherry to-tangelo text-cream">
        <div className="container px-4 sm:px-6 py-14 md:py-20 grid md:grid-cols-2 gap-10 items-center">
          <div className="space-y-5">
            <p className="font-display tracking-widest text-cream/80 text-sm">·Tasty &amp; Cool · Para Empresas·</p>
            <h1 className="font-display text-4xl md:text-6xl leading-tight">Alimenta a tu equipo con sabor que brilla</h1>
            <p className="text-cream/90 text-lg max-w-md">
              Comida rápida artesanal para almuerzos, eventos, turnos nocturnos y pedidos recurrentes — en Medellín y el Área Metropolitana, con factura electrónica.
            </p>
            <div className="flex flex-wrap gap-3 pt-2">
              <Button size="lg" onClick={irACotizar} className="bg-cream text-cherry hover:bg-cream/90 border-0 shadow-soft font-semibold">
                <Send className="w-4 h-4" /> Solicitar cotización
              </Button>
              {/* Botón sólido: en outline el texto quedaba del mismo color que el fondo y no se leía */}
              <a href={BROCHURE_URL} download>
                <Button size="lg" className="bg-coal text-cream hover:bg-coal/90 border-0 shadow-soft font-semibold">
                  <Download className="w-4 h-4" /> Descargar brochure
                </Button>
              </a>
            </div>
          </div>

          {/* Collage: Hamburguesa Especial + Súper Perro con tocineta + Papastars */}
          <div className="grid grid-cols-2 gap-3 max-w-md mx-auto md:mx-0">
            <img src={optimizeImage(COLLAGE[0].src, 500, 620, "g_auto")} alt={COLLAGE[0].alt}
              className="row-span-2 h-full w-full object-cover rounded-3xl shadow-glow" />
            <img src={optimizeImage(COLLAGE[1].src, 400, 300, "g_auto")} alt={COLLAGE[1].alt}
              className="w-full h-[46%] min-h-[120px] object-cover rounded-2xl shadow-glow" />
            <img src={optimizeImage(COLLAGE[2].src, 400, 300, "g_auto")} alt={COLLAGE[2].alt}
              className="w-full h-[46%] min-h-[120px] object-cover rounded-2xl shadow-glow" />
          </div>
        </div>
      </section>

      {/* NÚMEROS */}
      <section className="container px-4 sm:px-6 py-10">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {NUMEROS.map((n) => (
            <div key={n.small} className="bg-cream/60 rounded-2xl p-5 text-center shadow-card">
              <n.icon className="w-6 h-6 mx-auto text-cherry mb-2" />
              <p className="font-display text-2xl text-coal">{n.big}</p>
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mt-1">{n.small}</p>
            </div>
          ))}
        </div>
      </section>

      {/* PESTAÑAS */}
      <div className="sticky top-[57px] z-30 bg-background/95 backdrop-blur-md border-y border-border">
        <div className="container px-2 sm:px-6">
          <div className="flex gap-1 overflow-x-auto scrollbar-none">
            {TABS.map((t) => (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={`px-4 py-3 text-sm font-display font-medium whitespace-nowrap border-b-2 transition-smooth ${
                  tab === t.key ? "border-primary text-primary" : "border-transparent text-foreground/60 hover:text-foreground"
                }`}>
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div id="contenido" className="container px-4 sm:px-6 py-12 min-h-[50vh]">

        {/* ── POR QUÉ DELISTARS ── */}
        {tab === "porque" && (
          <div className="animate-fade-in">
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

            {/* Testimonios reales de clientes */}
            <div className="mt-14">
              <h3 className="font-display text-2xl text-center text-coal mb-2">Lo que dicen nuestros clientes</h3>
              <p className="text-center text-muted-foreground text-sm mb-8">
                Calificaciones reales registradas en nuestra plataforma
              </p>
              <div className="flex flex-col lg:flex-row gap-6 items-stretch">
                <div className="bg-gradient-to-br from-mustard to-tangelo text-cream rounded-2xl p-6 flex flex-col items-center justify-center text-center lg:w-64 shrink-0 shadow-card">
                  <p className="font-display text-5xl">4.5★</p>
                  <p className="text-sm mt-2 text-cream/90">promedio en 34 calificaciones de clientes</p>
                </div>
                <div className="grid sm:grid-cols-3 gap-4 flex-1">
                  {TESTIMONIOS.map((t) => (
                    <div key={t.nombre} className="bg-card border border-border rounded-2xl p-5 shadow-card flex flex-col">
                      <Quote className="w-6 h-6 text-cherry/40 mb-2" />
                      <p className="text-coal text-sm leading-relaxed flex-1">"{t.texto}"</p>
                      <div className="mt-3 pt-3 border-t border-border">
                        <p className="text-xs font-semibold text-coal">{t.nombre}</p>
                        <p className="text-[11px] text-mustard">★★★★★</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── SOLUCIONES ── */}
        {tab === "soluciones" && (
          <div className="animate-fade-in">
            <h2 className="font-display text-3xl md:text-4xl text-center text-coal mb-3">Soluciones corporativas</h2>
            <p className="text-center text-muted-foreground mb-10 max-w-xl mx-auto">
              Nos adaptamos a lo que tu equipo necesita — del almuerzo del día a día a la cena de fin de año.
            </p>
            <div className="grid sm:grid-cols-2 gap-5">
              {SOLUCIONES.map((s) => (
                <div key={s.title} className="bg-card border border-border rounded-2xl p-6 shadow-card flex gap-4 items-start">
                  <s.icon className={`w-9 h-9 shrink-0 ${s.color}`} />
                  <div>
                    <h3 className="font-display text-xl text-coal mb-1">{s.title}</h3>
                    <p className="text-muted-foreground text-sm leading-relaxed">{s.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Paquetes de ejemplo */}
            <h3 className="font-display text-2xl text-center text-coal mt-14 mb-6">Paquetes de ejemplo</h3>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
              {PAQUETES.map((p) => (
                <div key={p.nombre} className="bg-cream/60 rounded-2xl p-5 shadow-card">
                  <p className="font-display text-lg text-cherry mb-2">{p.nombre}</p>
                  <p className="text-sm text-coal leading-relaxed">{p.incluye}</p>
                  <p className="text-xs text-muted-foreground mt-3 pt-3 border-t border-coal/10">Ideal para: {p.ideal}</p>
                </div>
              ))}
            </div>
            <p className="text-center text-muted-foreground text-sm mt-6">
              Los paquetes son referencias: armamos el menú y la cotización a la medida de tu empresa.
            </p>

            {/* Cómo funciona */}
            <div className="mt-14 bg-coal text-cream rounded-3xl p-8">
              <h3 className="font-display text-2xl text-center mb-8">Cómo funciona</h3>
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {PASOS.map(([n, h, d]) => (
                  <div key={n} className="text-center">
                    <div className="w-11 h-11 rounded-full bg-cherry flex items-center justify-center font-display text-lg mx-auto mb-3">{n}</div>
                    <h4 className="font-display text-lg mb-1">{h}</h4>
                    <p className="text-cream/70 text-sm leading-relaxed">{d}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── MENÚ POR COLECCIONES ── */}
        {tab === "menu" && (
          <div className="animate-fade-in">
            <div className="text-center mb-8">
              <LayoutGrid className="w-8 h-8 text-cherry mx-auto mb-2" />
              <h2 className="font-display text-3xl md:text-4xl text-coal mb-2">Nuestro menú completo</h2>
              <p className="text-muted-foreground">Despliega cada colección para ver todos los productos.</p>
            </div>
            <div className="space-y-3 max-w-4xl mx-auto">
              {COLECCIONES.map((col) => {
                const items = products.filter(col.match);
                if (items.length === 0) return null;
                const abierta = openCol === col.key;
                return (
                  <div key={col.key} className="border border-border rounded-2xl overflow-hidden bg-card">
                    <button onClick={() => setOpenCol(abierta ? null : col.key)}
                      className="w-full flex items-center gap-3 px-5 py-4 hover:bg-cream/40 transition-smooth text-left">
                      <span className="text-2xl">{col.emoji}</span>
                      <span className="font-display text-xl text-coal flex-1">{col.label}</span>
                      <span className="text-xs text-muted-foreground bg-cream/70 rounded-full px-2.5 py-1">{items.length}</span>
                      <ChevronDown className={`w-5 h-5 text-cherry transition-transform ${abierta ? "rotate-180" : ""}`} />
                    </button>
                    {abierta && (
                      <div className="px-5 pb-5 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 animate-fade-in">
                        {items.map((p) => (
                          <div key={p.id_producto} className="bg-background rounded-xl overflow-hidden border border-border">
                            {p.image_url1
                              ? <img src={optimizeImage(p.image_url1, 300, 300, "g_auto")} alt={p.nombre_producto} className="w-full aspect-square object-cover" />
                              : <div className="w-full aspect-square bg-cream/60 flex items-center justify-center text-3xl">{col.emoji}</div>}
                            <div className="p-2.5">
                              <p className="font-display text-xs text-coal leading-tight">{p.nombre_producto}</p>
                              {Number(p.precio_venta) > 0 && (
                                <p className="text-xs text-cherry font-semibold mt-1">
                                  ${Number(p.precio_venta).toLocaleString("es-CO")}
                                </p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <p className="text-center text-muted-foreground text-sm mt-6">
              Además: adiciones (queso, tocineta, carne, pollo) y salsas de la casa sin costo — guacamole, mayochipotle, BBQ, piña, tártara y más.
            </p>
          </div>
        )}

        {/* ── BENEFICIOS ── */}
        {tab === "beneficios" && (
          <div className="animate-fade-in space-y-14">
            {/* Convenio empleados */}
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
                    <p className="text-sm mt-1 text-cream/90">de descuento<br />para el empleado</p>
                  </div>
                  <div className="bg-cream/15 rounded-2xl p-5 text-center">
                    <p className="font-display text-5xl">7.5%</p>
                    <p className="text-sm mt-1 text-cream/90">para su acompañante<br />familiar</p>
                  </div>
                </div>
              </div>

              {/* Fidelización, además del descuento */}
              <div className="mt-8 bg-cream/15 rounded-2xl p-6">
                <p className="font-display text-2xl flex items-center gap-2 mb-2">🎁 Y encima, come gratis</p>
                <p className="text-cream/90 leading-relaxed">
                  El descuento no es el único premio. Cada empleado acumula sus domicilios en la plataforma y
                  <strong> al llegar a 10 entregados se gana una Hamburguesa Especial completamente gratis</strong> —
                  la misma que se lleva los aplausos: carne jugosa, queso derretido en cantidad y nuestro guacamole de la casa.
                  Se acumula solo, sin tarjetas de papel ni sellos que se pierden, y su premio queda visible en su cuenta.
                </p>
              </div>
              <p className="text-cream/70 text-xs mt-6">
                * Descuentos presentando el carnet de la empresa vinculada, para el empleado y un acompañante familiar en el momento de la compra.
                Fidelización: 10 domicilios entregados por sede, iniciando sesión con su cuenta.
              </p>
            </div>

            {/* Plataforma web */}
            <div>
              <div className="text-center mb-10">
                <Globe className="w-8 h-8 text-cherry mx-auto mb-2" />
                <h2 className="font-display text-3xl md:text-4xl text-coal mb-2">Todo desde delistars.com</h2>
                <p className="text-muted-foreground max-w-xl mx-auto">
                  Plataforma propia: tu empresa pide, hace seguimiento y gestiona su historial sin intermediarios.
                </p>
              </div>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {WEB_VENTAJAS.map((w) => (
                  <div key={w.title} className="bg-card border border-border rounded-2xl p-6 shadow-card text-center">
                    <w.icon className="w-8 h-8 text-primary mx-auto mb-3" />
                    <h3 className="font-display text-lg text-coal mb-1.5">{w.title}</h3>
                    <p className="text-muted-foreground text-sm leading-relaxed">{w.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── COBERTURA Y PAGOS ── */}
        {tab === "cobertura" && (
          <div className="animate-fade-in">
            <h2 className="font-display text-3xl md:text-4xl text-center text-coal mb-3">Cobertura y sedes</h2>
            <p className="text-center text-muted-foreground mb-10 max-w-2xl mx-auto">
              Atendemos empresas en <strong>Medellín y todo el Área Metropolitana del Valle de Aburrá</strong>:
              Bello, Itagüí, Envigado, Sabaneta, La Estrella, Copacabana, Girardota y Caldas.
            </p>
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
              Ambas sedes atienden pedidos corporativos. Para entregas fuera de Medellín coordinamos según tu ubicación y horario.
            </p>

            {/* Formas de pago */}
            <div className="mt-14 max-w-3xl mx-auto text-center">
              <h3 className="font-display text-2xl text-coal mb-4">Aceptamos todas las formas de pago</h3>
              <div className="flex flex-wrap justify-center gap-3">
                {PAGOS.map((pg) => (
                  <span key={pg.label} className="inline-flex items-center gap-2 bg-cream/70 rounded-full px-4 py-2 text-sm font-medium text-coal shadow-card">
                    <pg.icon className="w-4 h-4 text-cherry" /> {pg.label}
                  </span>
                ))}
              </div>
              <div className="mt-8 grid sm:grid-cols-2 gap-4 text-left">
                <div className="bg-card border border-border rounded-2xl p-5 flex gap-3">
                  <CalendarClock className="w-7 h-7 text-cherry shrink-0" />
                  <div>
                    <p className="font-display text-lg text-coal">4 días de anticipación</p>
                    <p className="text-sm text-muted-foreground">Los pedidos corporativos se programan con mínimo 4 días para garantizar producción y logística.</p>
                  </div>
                </div>
                <div className="bg-card border border-border rounded-2xl p-5 flex gap-3">
                  <ShieldCheck className="w-7 h-7 text-mint shrink-0" />
                  <div>
                    <p className="font-display text-lg text-coal">Manipulación de alimentos</p>
                    <p className="text-sm text-muted-foreground">Preparación con buenas prácticas de higiene y empaques que conservan la temperatura hasta la entrega.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── COTIZAR ── */}
        {tab === "cotizar" && <SeccionCotizar />}
      </div>

      {/* CTA final */}
      <section className="bg-gradient-to-br from-cherry to-tangelo py-12">
        <div className="container px-4 sm:px-6 text-center">
          <h2 className="font-display text-2xl md:text-3xl text-cream mb-3">¿Listo para alimentar a tu equipo?</h2>
          <div className="flex flex-wrap justify-center gap-3">
            <Button size="lg" onClick={irACotizar} className="bg-cream text-cherry hover:bg-cream/90 border-0 font-semibold">
              <Send className="w-4 h-4" /> Solicitar cotización
            </Button>
            <a href={BROCHURE_URL} download>
              <Button size="lg" className="bg-coal text-cream hover:bg-coal/90 border-0 font-semibold">
                <Download className="w-4 h-4" /> Descargar brochure
              </Button>
            </a>
          </div>
          <p className="text-cream/80 text-sm mt-5">{CORREO} · WhatsApp 312 227 5039</p>
        </div>
      </section>

      <Footer />
    </div>
  );
}

// ─── Área de cotización: el cliente elige formulario o WhatsApp ───────────────
function SeccionCotizar() {
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
    } catch {
      setError("No se pudo enviar. Intenta de nuevo o escríbenos por WhatsApp.");
    } finally {
      setSending(false);
    }
  };

  if (sent) {
    return (
      <div className="max-w-xl mx-auto bg-cream rounded-3xl p-8 text-center shadow-card animate-fade-in">
        <CheckCircle2 className="w-14 h-14 text-mint mx-auto mb-3" />
        <h3 className="font-display text-2xl text-coal mb-2">¡Solicitud enviada! 🎉</h3>
        <p className="text-muted-foreground mb-5">Te contactaremos muy pronto. Si es urgente, escríbenos por WhatsApp.</p>
        <a href={`https://wa.me/${WA_EMPRESAS}?text=${WA_TEXT}`} target="_blank" rel="noreferrer">
          <Button className="bg-[#25D366] hover:bg-[#1eb658] text-white border-0">Escribir por WhatsApp</Button>
        </a>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <h2 className="font-display text-3xl md:text-4xl text-center text-coal mb-3">Solicita tu cotización</h2>
      <p className="text-center text-muted-foreground mb-8 max-w-xl mx-auto">
        Elige cómo prefieres contactarnos: déjanos los datos y te buscamos, o escríbenos directo por WhatsApp.
      </p>

      {/* Opción rápida: WhatsApp */}
      <div className="max-w-2xl mx-auto mb-8 bg-[#25D366]/10 border border-[#25D366]/30 rounded-2xl p-5 flex flex-col sm:flex-row items-center gap-4">
        <MessageCircle className="w-9 h-9 text-[#25D366] shrink-0" />
        <div className="flex-1 text-center sm:text-left">
          <p className="font-display text-lg text-coal">¿Prefieres hablar ya?</p>
          <p className="text-sm text-muted-foreground">Escríbenos por WhatsApp y coordinamos tu cotización al instante.</p>
        </div>
        <a href={`https://wa.me/${WA_EMPRESAS}?text=${WA_TEXT}`} target="_blank" rel="noreferrer" className="shrink-0">
          <Button className="bg-[#25D366] hover:bg-[#1eb658] text-white border-0">WhatsApp empresas</Button>
        </a>
      </div>

      <p className="text-center text-sm text-muted-foreground mb-4">— o déjanos tus datos —</p>

      <form onSubmit={submit} className="max-w-2xl mx-auto bg-cream rounded-3xl p-6 sm:p-8 shadow-card space-y-4">
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
              {["Almuerzos de oficina", "Turno nocturno", "Evento / celebración", "Reunión / capacitación",
                "Fin de año / novena", "Cumpleaños del mes", "Pedido recurrente", "Otro"].map((o) => <option key={o}>{o}</option>)}
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
        <Button type="submit" disabled={sending} size="lg" className="w-full bg-gradient-hero text-primary-foreground border-0">
          <Send className="w-4 h-4" /> {sending ? "Enviando…" : "Enviar solicitud"}
        </Button>
        <p className="text-xs text-muted-foreground text-center">
          Pedidos corporativos con mínimo 4 días de anticipación · Factura electrónica · Todas las formas de pago
        </p>
      </form>
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
