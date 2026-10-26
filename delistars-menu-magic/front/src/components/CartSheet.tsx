import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useCart, formatCOP } from "@/context/CartContext";
import { SEDES } from "@/data/menu";
import { Minus, Plus, Trash2, ShoppingBag, Clock, ArrowLeft, Mail } from "lucide-react";
import { LogoGoogle, LogoMicrosoft } from "@/components/LogosMarca";
import { useStaffAuth } from "@/hooks/useStaffAuth";
import { usePlatformStatus } from "@/hooks/usePlatformStatus";
import { useSinDomicilio } from "@/components/AvisoSinDomicilio";
import { optimizeImage } from "@/lib/utils";
import { agotadoEnItem } from "@/lib/agotados";

export const CartSheet = () => {
  const { items, isOpen, setOpen, removeItem, updateQty, total, count, sede, agotados } = useCart();
  // Lo que se agotó en la sede mientras estaba en el carrito: se señala y hay
  // que quitarlo antes de pedir; no se borra solo (§7.2).
  const hayAgotados = items.some((it) => agotadoEnItem(it, agotados).length > 0);
  const { user, login, loginMs } = useStaffAuth();
  const { abierta: platformActive, texto: textoHorario } = usePlatformStatus();
  const sinDomicilio = useSinDomicilio();
  const [needsLogin, setNeedsLogin] = useState(false);
  const [busy, setBusy] = useState(false);

  // En celular el aviso "agregado al carrito" queda encima del botón
  // "Hacer pedido"; al abrir el carrito ya cumplió su función.
  useEffect(() => {
    if (isOpen) toast.dismiss();
  }, [isOpen]);

  // Guarda el carrito y continúa al formulario de pedido (en /domicilios/,
  // ya autenticado porque la sesión se comparte entre el menú y domicilios).
  const proceed = () => {
    const handoff = {
      items: items.map((it) => {
        let name = it.product.nombre_producto;
        if (it.presentation) {
          name = `${it.product.nombre_producto} (${it.presentation.sabor}, ${it.presentation.tamano}${it.presentation.base ? `, ${it.presentation.base}` : ''})`;
        } else if (it.selectedDrink) {
          name = `${it.product.nombre_producto} + ${it.selectedDrink}`;
        } else if (it.selectedOption) {
          name = `${it.product.nombre_producto} (${it.selectedOption})`;
        }
        return {
          name,
          quantity: it.quantity,
          unitPrice: it.unitPrice,
          addons: it.addons.map((a) => `Adición + ${a.name}`),
          salsas: it.salsas.map((s) => s.name),
          cebollas: it.cebollas.map((c) => c.name),
          notes: it.notes,
          // Combos de promo: una línea por hamburguesa/perro para la cocina.
          unidades: it.unidadesTexto?.length ? it.unidadesTexto : undefined,
        };
      }),
      total,
      // El slug de la sede es la única fuente de verdad (definido en data/menu.ts).
      sedeId: SEDES.find((s) => s.id === sede)?.slug ?? null,
      // Fecha de creación: domicilios descarta handoffs viejos (los precios de
      // un carrito de hace días ya no son confiables).
      savedAt: Date.now(),
    };
    localStorage.setItem("ds_cart_handoff", JSON.stringify(handoff));
    window.location.href = "/domicilios/";
  };

  // Plataforma cerrada: se puede navegar y armar el carrito, pero no enviar el
  // pedido. platformActive === null = aún cargando, no bloquear todavía.
  const closed = platformActive === false;

  const handleOrder = () => {
    if (closed) return;
    // Para pedir hay que tener cuenta (Fase 4). La sesión de invitado de antes
    // también: Google y Microsoft la enlazan sin perder nada.
    if (!user || user.isAnonymous) { setNeedsLogin(true); return; }
    proceed();
  };

  const loginThen = async (method: "google" | "microsoft") => {
    setBusy(true);
    try {
      if (method === "google") await login();
      else await loginMs();
      proceed();
    } catch {
      // popup cerrado o error: el cliente puede reintentar
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Sheet open={isOpen} onOpenChange={setOpen}>
        <SheetContent className="w-full sm:max-w-md flex flex-col p-0 bg-background">
          <SheetHeader className="p-6 border-b border-border">
            <SheetTitle className="font-display text-2xl flex items-center gap-2">
              <ShoppingBag className="text-primary" /> Tu carrito
              {count > 0 && <span className="text-sm text-muted-foreground font-normal">({count})</span>}
            </SheetTitle>
          </SheetHeader>

          {items.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
              <div className="text-6xl mb-3 animate-bounce-soft">🛒</div>
              <p className="text-muted-foreground">Tu carrito está vacío</p>
              <p className="text-sm text-muted-foreground mt-1">¡Añade algo delicioso del menú!</p>
              <Button onClick={() => setOpen(false)} size="lg"
                className="mt-6 bg-gradient-hero text-primary-foreground border-0 shadow-soft hover:shadow-glow transition-smooth">
                <ArrowLeft className="w-4 h-4" /> Ver el menú
              </Button>
            </div>
          ) : (
            <>
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {items.map((it) => (
                  <div key={it.uid} className="bg-card rounded-2xl p-3 flex gap-3 shadow-card animate-scale-in">
                    <img
                      src={optimizeImage(
                        it.product.image_url1 || "",
                        150,
                        150,
                        it.product.id_producto === 48 ? "g_south" : "g_auto"
                      )}
                      alt={it.product.nombre_producto}
                      className="w-20 h-20 rounded-xl object-cover"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <h4 className="font-display text-sm leading-tight">
                          {it.product.nombre_producto}
                          {it.presentation && (
                            <span className="block text-xs font-sans text-primary font-semibold mt-1">
                              {it.presentation.sabor} · {it.presentation.tamano} {it.presentation.base ? `(${it.presentation.base})` : ''}
                            </span>
                          )}
                          {it.selectedDrink && (
                            <span className="block text-xs font-sans text-primary font-semibold mt-1 animate-fade-in">
                              Bebida: {it.selectedDrink}
                            </span>
                          )}
                          {it.selectedOption && (
                            <span className="block text-xs font-sans text-primary font-semibold mt-1 animate-fade-in">
                              Opción: {it.selectedOption}
                            </span>
                          )}
                        </h4>
                        <button onClick={() => removeItem(it.uid)} className="text-muted-foreground hover:text-destructive transition-smooth">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                      {it.addons.length > 0 && (
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                          {it.addons.map((a) => `Adición + ${a.name}`).join(", ")}
                        </p>
                      )}
                      {it.salsas.length > 0 && (
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                          Salsas: {it.salsas.map((s) => s.name).join(", ")}
                        </p>
                      )}
                      {it.cebollas.length > 0 && (
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                          Cebolla: {it.cebollas.map((c) => c.name).join(", ")}
                        </p>
                      )}
                      {it.unidadesTexto?.map((t) => (
                        <p key={t} className="text-xs text-muted-foreground mt-0.5">{t}</p>
                      ))}
                      {it.notes && <p className="text-xs italic text-muted-foreground mt-1">"{it.notes}"</p>}
                      {agotadoEnItem(it, agotados).length > 0 && (
                        <p className="mt-1.5 rounded-lg bg-destructive/10 px-2 py-1 text-xs font-semibold text-destructive">
                          Se agotó en esta sede: {agotadoEnItem(it, agotados).join(", ")}. Quítalo o cámbialo para pedir.
                        </p>
                      )}
                      <div className="flex items-center justify-between mt-2">
                        <div className="flex items-center gap-1 bg-muted rounded-full">
                          <button onClick={() => updateQty(it.uid, it.quantity - 1)} className="p-1 hover:text-primary">
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="text-sm font-semibold w-6 text-center">{it.quantity}</span>
                          <button onClick={() => updateQty(it.uid, it.quantity + 1)} className="p-1 hover:text-primary">
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                        <span className="font-display text-primary text-sm">{formatCOP(it.unitPrice * it.quantity)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="p-6 border-t border-border bg-gradient-soft space-y-4">
                <div className="flex justify-between items-center">
                  <span className="font-display text-lg">Total</span>
                  <span className="font-display text-2xl text-primary">{formatCOP(total)}</span>
                </div>

                {/* Volver al menú para agregar más productos — el carrito se abre
                    solo al agregar, así que hace falta una salida clara y grande
                    (la X de arriba es pequeña y muchos clientes no la ven). */}
                <Button
                  onClick={() => setOpen(false)}
                  variant="outline"
                  size="lg"
                  className="w-full border-primary/40 text-primary hover:bg-primary/5"
                >
                  <ArrowLeft className="w-4 h-4" /> Seguir pidiendo
                </Button>

                {sinDomicilio && !closed && (
                  <p role="status" className="rounded-2xl bg-mustard/20 border border-mustard/50 p-3 text-xs text-foreground text-center leading-relaxed font-semibold">
                    {sinDomicilio.texto}
                  </p>
                )}

                {closed ? (
                  <div className="rounded-2xl bg-cherry/10 border border-cherry/30 p-4 text-center space-y-1">
                    <Clock className="w-6 h-6 text-cherry mx-auto" />
                    <p className="font-display text-base text-cherry">Esta sede no está recibiendo pedidos</p>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {textoHorario ? <strong>{textoHorario}.</strong> : null} Puedes ir armando tu
                      carrito y hacer el pedido cuando estemos abiertos.
                    </p>
                  </div>
                ) : hayAgotados ? (
                  <div className="rounded-2xl bg-destructive/10 border border-destructive/30 p-4 text-center">
                    <p className="font-display text-base text-destructive">Algo de tu carrito se agotó</p>
                    <p className="text-xs text-muted-foreground leading-relaxed mt-1">
                      Quita lo que está marcado o cámbialo por otro producto para hacer el pedido.
                    </p>
                  </div>
                ) : needsLogin && (!user || user.isAnonymous) ? (
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground text-center">
                      Inicia sesión para continuar con tu pedido
                    </p>
                    <Button onClick={() => loginThen("google")} disabled={busy} variant="outline" size="lg"
                      className="w-full bg-white text-foreground border-border hover:bg-secondary/40 gap-3">
                      <LogoGoogle /> {busy ? "Conectando…" : "Continuar con Google"}
                    </Button>
                    <Button onClick={() => loginThen("microsoft")} disabled={busy} variant="outline" size="lg"
                      className="w-full bg-white text-foreground border-border hover:bg-secondary/40 gap-3">
                      <LogoMicrosoft /> Continuar con Microsoft
                    </Button>
                    {/* Correo y contraseña: el carrito viaja y domicilios abre la ventana de ingreso. */}
                    <Button onClick={proceed} disabled={busy} variant="ghost" size="lg" className="w-full gap-2">
                      <Mail className="w-4 h-4" /> Con correo y contraseña
                    </Button>
                  </div>
                ) : (
                  <Button onClick={handleOrder} size="lg" className="w-full bg-gradient-hero text-primary-foreground border-0 shadow-soft hover:shadow-glow transition-smooth">
                    Hacer pedido
                  </Button>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
};
