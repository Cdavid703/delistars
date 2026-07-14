import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Minus, Plus, ChevronLeft, ChevronRight } from "lucide-react";
import { useCart, formatCOP } from "@/context/CartContext";
import { apiService, type Addon, type Salsa, type Cebolla, type Product as ApiProduct } from "@/services/api";
import { optimizeImage } from "@/lib/utils";
import { toast } from "sonner";

const COMBO_DRINKS = [
  "Manzana Postobón Pet 400 ml",
  "Uva Postobón Pet 400 ml",
  "Naranjada Postobón Pet 400 ml",
  "Colombiana Pet 400 ml",
  "Coca Cola Sabor Original Pet 400 ml",
  "Coca Cola Zero Pet 400 ml",
  "Agua Saborizada Manzana 400 ml",
  "Agua Saborizada Limón 400 ml"
];

const PRODUCT_OPTIONS = {
  hamburguesa_pollo: {
    title: "Elige un ingrediente",
    subtitle: "Selecciona una opción para tu hamburguesa (sin costo adicional)",
    items: ["Queso", "Tocineta"],
  },
  papastars: {
    title: "Elige tu proteína",
    subtitle: "Selecciona cómo deseas tu Papastars (sin costo adicional)",
    items: ["Chicharron", "Pollo"],
  }
};

const getProductCustomOptions = (product: ApiProduct | null) => {
  if (!product) return null;
  const name = product.nombre_producto.toLowerCase();
  
  const isHamburguesaPollo = 
    product.id_producto === 3 || 
    name === "hamburguesa de pollo" || 
    name === "hamburguesa de pollo con queso o tocineta" ||
    name === "hamburguesa de pollo con queso y tocineta";
    
  if (isHamburguesaPollo) {
    return PRODUCT_OPTIONS.hamburguesa_pollo;
  }
  
  const isPapastars = 
    product.id_producto === 20 || 
    name === "papastars";
    
  if (isPapastars) {
    return PRODUCT_OPTIONS.papastars;
  }
  
  return null;
};

export const ProductDialog = ({ product, onClose }: { product: ApiProduct | null; onClose: () => void }) => {
  const { addItem, setOpen } = useCart();
  const [qty, setQty] = useState(1);
  const [addonQtys, setAddonQtys] = useState<Record<number, number>>({});
  const [notes, setNotes] = useState("");
  const [addons, setAddons] = useState<Addon[]>([]);
  const [salsas, setSalsas] = useState<Salsa[]>([]);
  const [cebollas, setCebollas] = useState<Cebolla[]>([]);
  const [selectedSalsas, setSelectedSalsas] = useState<Set<number>>(new Set());
  const [selectedCebollas, setSelectedCebollas] = useState<Set<number>>(new Set());
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  // States for product presentations (e.g. juices)
  const [selectedSabor, setSelectedSabor] = useState<string>("");
  const [selectedTamano, setSelectedTamano] = useState<string>("");
  const [selectedBase, setSelectedBase] = useState<string>("");

  // States for combo drink selection
  const [selectedDrink, setSelectedDrink] = useState<string>("");

  // States for custom options (e.g. queso/tocineta or chicharron/pollo)
  const [selectedOption, setSelectedOption] = useState<string>("");

  const hasPresentations = !!(product?.presentations && product.presentations.length > 0);

  useEffect(() => {
    if (product) {
      setQty(1);
      setAddonQtys({});
      setSelectedSalsas(new Set());
      setSelectedCebollas(new Set());
      setNotes("");
      setCurrentImageIndex(0);

      if (hasPresentations && product.presentations) {
        // Find all unique flavors
        const uniqueSabores = Array.from(
          new Set(product.presentations.map((p) => p.sabor).filter(Boolean))
        ) as string[];
        const defaultSabor = uniqueSabores[0] || "";
        setSelectedSabor(defaultSabor);

        // Filter presentations by default flavor
        const matchingPres = product.presentations.filter((p) => p.sabor === defaultSabor);

        // Find default base for default flavor
        const uniqueBases = Array.from(
          new Set(matchingPres.map((p) => p.base).filter(Boolean))
        ) as string[];
        const defaultBase = uniqueBases[0] || "";
        setSelectedBase(defaultBase);

        // Find default size for default flavor and base
        const matchingSizePres = matchingPres.filter((p) => !p.base || p.base === defaultBase);
        const uniqueTamanos = Array.from(
          new Set(matchingSizePres.map((p) => p.tamano).filter(Boolean))
        ) as string[];
        setSelectedTamano(uniqueTamanos[0] || "");
      } else {
        setSelectedSabor("");
        setSelectedTamano("");
        setSelectedBase("");
      }

      if (product.id_categoria === 4) {
        setSelectedDrink(COMBO_DRINKS[0]);
      } else {
        setSelectedDrink("");
      }

      // Initialize selectedOption
      const customOptions = getProductCustomOptions(product);
      if (customOptions) {
        setSelectedOption(customOptions.items[0]);
      } else {
        setSelectedOption("");
      }
    }
  }, [product, hasPresentations]);

  useEffect(() => {
    const fetchOptions = async () => {
      try {
        const [apiAddons, apiSalsas, apiCebollas] = await Promise.all([
          apiService.getAddons(),
          apiService.getSalsas(),
          apiService.getCebollas(),
        ]);
        setAddons(apiAddons);
        setSalsas(apiSalsas);
        setCebollas(apiCebollas);
      } catch (error) {
        console.error('Error loading addons/salsas/cebollas:', error);
      }
    };

    fetchOptions();
  }, []);

  if (!product) return null;

  // Helpers to update options dynamically
  const handleSaborChange = (sabor: string) => {
    setSelectedSabor(sabor);
    if (!product.presentations) return;
    const matchingPres = product.presentations.filter((p) => p.sabor === sabor);

    // Find available bases
    const uniqueBases = Array.from(
      new Set(matchingPres.map((p) => p.base).filter(Boolean))
    ) as string[];
    const newBase = uniqueBases.includes(selectedBase) ? selectedBase : (uniqueBases[0] || "");
    setSelectedBase(newBase);

    // Find available sizes
    const matchingSizePres = matchingPres.filter((p) => !p.base || p.base === newBase);
    const uniqueTamanos = Array.from(
      new Set(matchingSizePres.map((p) => p.tamano).filter(Boolean))
    ) as string[];
    const newTamano = uniqueTamanos.includes(selectedTamano) ? selectedTamano : (uniqueTamanos[0] || "");
    setSelectedTamano(newTamano);
  };

  const handleBaseChange = (base: string) => {
    setSelectedBase(base);
    if (!product.presentations) return;
    const matchingPres = product.presentations.filter(
      (p) => p.sabor === selectedSabor && p.base === base
    );
    const uniqueTamanos = Array.from(
      new Set(matchingPres.map((p) => p.tamano).filter(Boolean))
    ) as string[];
    const newTamano = uniqueTamanos.includes(selectedTamano) ? selectedTamano : (uniqueTamanos[0] || "");
    setSelectedTamano(newTamano);
  };

  // Derived lists for presentation selection UI
  const uniqueSabores = hasPresentations && product.presentations
    ? (Array.from(new Set(product.presentations.map((p) => p.sabor).filter(Boolean))) as string[])
    : [];

  const currentFlavorPres = hasPresentations && product.presentations
    ? product.presentations.filter((p) => p.sabor === selectedSabor)
    : [];

  const uniqueBases = Array.from(
    new Set(currentFlavorPres.map((p) => p.base).filter(Boolean))
  ) as string[];

  const currentBasePres = currentFlavorPres.filter(
    (p) => !p.base || p.base === selectedBase
  );

  const uniqueTamanos = Array.from(
    new Set(currentBasePres.map((p) => p.tamano).filter(Boolean))
  ) as string[];

  // Find the selected presentation row
  const selectedPresentation = hasPresentations && product.presentations
    ? product.presentations.find(
      (p) =>
        p.sabor === selectedSabor &&
        p.tamano === selectedTamano &&
        (p.base === selectedBase || (!p.base && !selectedBase))
    )
    : null;

  // Obtener imágenes disponibles del producto
  const images = [product.image_url1, product.image_url2].filter(Boolean) as string[];
  const currentImage = images[currentImageIndex] || product.image_url1 || "";

  const handlePrevImage = () => {
    setCurrentImageIndex((prev) => (prev === 0 ? images.length - 1 : prev - 1));
  };

  const handleNextImage = () => {
    setCurrentImageIndex((prev) => (prev === images.length - 1 ? 0 : prev + 1));
  };

  const setAddonQty = (id: number, val: number) =>
    setAddonQtys((prev) => ({ ...prev, [id]: Math.max(0, val) }));

  const toggleSalsa = (id: number) =>
    setSelectedSalsas((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const toggleCebolla = (id: number) =>
    setSelectedCebollas((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  // Hide additions for category 7 (Bebidas)
  const isBebida = product.id_categoria === 7;

  const selectedAddons = isBebida
    ? []
    : addons.flatMap((a) => Array(addonQtys[a.id] ?? 0).fill(a));

  const basePrice = selectedPresentation ? selectedPresentation.precio_venta : parseFloat(product.precio_venta);
  const unit = basePrice + selectedAddons.reduce((s, a) => s + a.price, 0);
  const total = unit * qty;

  const chosenSalsas = isBebida ? [] : salsas.filter((s) => selectedSalsas.has(s.id));
  const chosenCebollas = isBebida ? [] : cebollas.filter((c) => selectedCebollas.has(c.id));

  const handleAdd = () => {
    if (notes.length > 250) {
      toast.error("El comentario es muy largo");
      return;
    }
    addItem({
      product,
      quantity: qty,
      addons: selectedAddons,
      salsas: chosenSalsas,
      cebollas: chosenCebollas,
      notes: notes.trim(),
      presentation: selectedPresentation || undefined,
      selectedDrink: product.id_categoria === 4 ? selectedDrink : undefined,
      selectedOption: getProductCustomOptions(product) ? selectedOption : undefined
    });
    toast.success(`${product.nombre_producto} agregado al carrito 🎉`, {
      action: { label: "Ver carrito 🛒", onClick: () => setOpen(true) },
    });
    onClose();
  };

  return (
    <Dialog open={!!product} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg w-full p-0 border-0 rounded-3xl shadow-glow overflow-hidden flex flex-col max-h-[95dvh]">

        {/* Imagen protagonista con overlay — altura fija para no comerse el viewport */}
        <div className="relative w-full h-48 sm:h-64 overflow-hidden bg-muted shrink-0 group">
          <img
            src={optimizeImage(
              currentImage,
              800,
              600,
              product.id_producto === 48 ? "g_south" : "g_auto"
            )}
            alt={product.nombre_producto}
            className="w-full h-full object-cover transition-smooth"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
          <div className="absolute bottom-0 inset-x-0 p-4 sm:p-5 space-y-0.5">
            <p className="font-display text-[10px] tracking-widest text-white/60">·Tasty & Cool·</p>
            <DialogTitle className="font-display text-2xl sm:text-3xl text-white leading-tight">
              {hasPresentations && selectedPresentation
                ? `${product.nombre_producto} (${selectedSabor})`
                : product.nombre_producto}
            </DialogTitle>
            <p className="font-display text-xl sm:text-2xl text-primary">{formatCOP(basePrice)}</p>
          </div>

          {/* Navegación de imágenes — visible solo si hay más de una imagen */}
          {images.length > 1 && (
            <>
              <button
                onClick={handlePrevImage}
                className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white p-2 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button
                onClick={handleNextImage}
                className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white p-2 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <ChevronRight className="w-5 h-5" />
              </button>

              {/* Puntos indicadores */}
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-1">
                {images.map((_, idx) => (
                  <button
                    key={idx}
                    onClick={() => setCurrentImageIndex(idx)}
                    className={`w-2 h-2 rounded-full transition-smooth ${idx === currentImageIndex ? "bg-primary" : "bg-white/50"
                      }`}
                  />
                ))}
              </div>
            </>
          )}
        </div>

        {/* Contenido scrollable — min-h-0 es clave para que flex funcione bien */}
        <div className="flex-1 overflow-y-auto min-h-0">
          <div className="p-5 space-y-6">

            <p className="text-base text-foreground/80 leading-relaxed">{product.descripcion_producto}</p>

            {/* SECCIÓN OPCIONES DE JUGOS (Solo si tiene presentaciones) */}
            {hasPresentations && (
              <div className="space-y-5 border-t border-border/60 pt-4">
                {/* 1. Selector de Sabores */}
                <div>
                  <p className="font-display text-base tracking-wide mb-1">Sabor</p>
                  <p className="text-xs text-muted-foreground mb-3">Elige tu sabor preferido</p>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {uniqueSabores.map((sabor) => (
                      <button
                        key={sabor}
                        onClick={() => handleSaborChange(sabor)}
                        className={`px-3 py-2 rounded-2xl text-xs font-semibold border transition-smooth text-center truncate ${selectedSabor === sabor
                          ? "bg-primary/10 text-primary border-primary/40 font-bold"
                          : "bg-muted/50 border-border text-foreground hover:bg-muted"
                          }`}
                      >
                        {sabor}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 2. Selector de Base (Agua / Leche) */}
                {uniqueBases.length > 0 && (
                  <div>
                    <p className="font-display text-base tracking-wide mb-1">Base del Jugo</p>
                    <p className="text-xs text-muted-foreground mb-3">Elige cómo deseas preparar tu jugo</p>
                    <div className="flex gap-3">
                      {uniqueBases.map((base) => (
                        <button
                          key={base}
                          onClick={() => handleBaseChange(base)}
                          className={`flex-1 py-2.5 rounded-2xl text-xs font-semibold border transition-smooth text-center ${selectedBase === base
                            ? "bg-primary/10 text-primary border-primary/40 font-bold"
                            : "bg-muted/50 border-border text-foreground hover:bg-muted"
                            }`}
                        >
                          Con {base}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* 3. Selector de Tamaño */}
                <div>
                  <p className="font-display text-base tracking-wide mb-1">Tamaño</p>
                  <p className="text-xs text-muted-foreground mb-3">Selecciona el tamaño de tu porción</p>
                  <div className="flex gap-3">
                    {uniqueTamanos.map((tamano) => {
                      const optPres = product.presentations?.find(
                        (p) =>
                          p.sabor === selectedSabor &&
                          p.tamano === tamano &&
                          (p.base === selectedBase || (!p.base && !selectedBase))
                      );
                      return (
                        <button
                          key={tamano}
                          onClick={() => setSelectedTamano(tamano)}
                          className={`flex-1 py-2 px-3 rounded-2xl text-xs font-semibold border transition-smooth flex flex-col items-center justify-center gap-0.5 min-h-[50px] ${selectedTamano === tamano
                            ? "bg-primary/10 text-primary border-primary/40 font-bold"
                            : "bg-muted/50 border-border text-foreground hover:bg-muted"
                            }`}
                        >
                          <span>{tamano}</span>
                          {optPres && (
                            <span className="text-[10px] opacity-80 font-normal">
                              {formatCOP(optPres.precio_venta)}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* SECCIÓN BEBIDA DEL COMBO (Solo si es combo) */}
            {product.id_categoria === 4 && (
              <div className="space-y-3 border-t border-border/60 pt-4">
                <div>
                  <p className="font-display text-base tracking-wide mb-1">Elige tu Bebida</p>
                  <p className="text-xs text-muted-foreground mb-3">Selecciona una gaseosa para tu combo (sin costo adicional)</p>
                  <div className="grid grid-cols-2 gap-2">
                    {COMBO_DRINKS.map((drink) => (
                      <button
                        key={drink}
                        type="button"
                        onClick={() => setSelectedDrink(drink)}
                        className={`px-3 py-2 rounded-2xl text-xs font-semibold border transition-smooth text-center leading-normal min-h-[48px] flex items-center justify-center ${selectedDrink === drink
                          ? "bg-primary/10 text-primary border-primary/40 font-bold"
                          : "bg-muted/50 border-border text-foreground hover:bg-muted"
                          }`}
                      >
                        {drink}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* SECCIÓN OPCIONES PERSONALIZABLES (Hamburguesa de pollo o Papastars) */}
            {getProductCustomOptions(product) && (
              <div className="space-y-3 border-t border-border/60 pt-4">
                <div>
                  <p className="font-display text-base tracking-wide mb-1">
                    {getProductCustomOptions(product)?.title}
                  </p>
                  <p className="text-xs text-muted-foreground mb-3">
                    {getProductCustomOptions(product)?.subtitle}
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {getProductCustomOptions(product)?.items.map((opt) => (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => setSelectedOption(opt)}
                        className={`px-3 py-2 rounded-2xl text-xs font-semibold border transition-smooth text-center leading-normal min-h-[48px] flex items-center justify-center ${selectedOption === opt
                          ? "bg-primary/10 text-primary border-primary/40 font-bold"
                          : "bg-muted/50 border-border text-foreground hover:bg-muted"
                          }`}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* SECCIÓN SALSAS (Ocultar para bebidas) */}
            {!isBebida && salsas.length > 0 && (
              <div className="border-t border-border/60 pt-4">
                <p className="font-display text-lg tracking-wide mb-1">Salsas</p>
                <p className="text-xs text-muted-foreground mb-3">Selecciona las salsas que deseas (sin costo adicional)</p>
                <div className="grid grid-cols-3 gap-2">
                  {salsas.map((s) => {
                    const selected = selectedSalsas.has(s.id);
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => toggleSalsa(s.id)}
                        className={`px-2 py-2 rounded-2xl text-xs font-semibold border transition-smooth text-center ${
                          selected
                            ? "bg-primary/10 text-primary border-primary/40 font-bold"
                            : "bg-muted/50 border-border text-foreground hover:bg-muted"
                        }`}
                      >
                        {s.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* SECCIÓN CEBOLLAS (Ocultar para bebidas) */}
            {!isBebida && cebollas.length > 0 && (
              <div className="border-t border-border/60 pt-4">
                <p className="font-display text-lg tracking-wide mb-1">Cebolla</p>
                <p className="text-xs text-muted-foreground mb-3">Selecciona el tipo de cebolla (sin costo adicional)</p>
                <div className="grid grid-cols-2 gap-2">
                  {cebollas.map((c) => {
                    const selected = selectedCebollas.has(c.id);
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => toggleCebolla(c.id)}
                        className={`px-3 py-2 rounded-2xl text-xs font-semibold border transition-smooth text-center ${
                          selected
                            ? "bg-primary/10 text-primary border-primary/40 font-bold"
                            : "bg-muted/50 border-border text-foreground hover:bg-muted"
                        }`}
                      >
                        {c.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* SECCIÓN ADICIONES (Ocultar para bebidas/gaseosas/jugos) */}
            {!isBebida && (
              <div className="border-t border-border/60 pt-4">
                <p className="font-display text-lg tracking-wide mb-1">Adiciones</p>
                <p className="text-xs text-muted-foreground mb-3">Personaliza tu pedido</p>
                <div className="space-y-2">
                  {addons.map((a) => {
                    const q = addonQtys[a.id] ?? 0;
                    return (
                      <div
                        key={a.id}
                        className={`flex items-center justify-between gap-3 p-3 rounded-xl transition-smooth ${q > 0 ? "bg-primary/10 border border-primary/30" : "bg-muted/50"}`}
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{a.name}</p>
                          <p className="text-xs text-primary font-semibold">+{formatCOP(a.price)}</p>
                        </div>
                        <div className="flex items-center gap-1 bg-background rounded-full p-0.5 border border-border shrink-0">
                          <button
                            onClick={() => setAddonQty(a.id, q - 1)}
                            disabled={q === 0}
                            className="h-7 w-7 rounded-full flex items-center justify-center text-foreground hover:bg-muted disabled:opacity-30 transition-smooth"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="font-display text-base w-6 text-center">{q}</span>
                          <button
                            onClick={() => setAddonQty(a.id, q + 1)}
                            className="h-7 w-7 rounded-full flex items-center justify-center bg-primary text-primary-foreground hover:bg-primary/90 transition-smooth"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* SECCIÓN COMENTARIOS (Ocultar solo para gaseosas simples de la cat 7, pero mostrar para jugos y comida) */}
            {(!isBebida || hasPresentations) && (
              <div className="border-t border-border/60 pt-4">
                <Label htmlFor="notes" className="font-display text-lg tracking-wide">Comentarios</Label>
                <Textarea
                  id="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value.slice(0, 250))}
                  placeholder={hasPresentations ? "Ej: sin azúcar, con hielo..." : "¿Algo especial? Ej: sin cebolla, salsa aparte..."}
                  className="mt-2 resize-none"
                  rows={2}
                />
                <p className="text-xs text-muted-foreground mt-1 text-right">{notes.length}/250</p>
              </div>
            )}
          </div>
        </div>

        {/* Footer siempre visible — shrink-0 para que nunca desaparezca */}
        <div className="shrink-0 bg-card border-t border-border px-5 py-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1 bg-muted rounded-full p-1">
              <Button size="icon" variant="ghost" className="h-9 w-9 rounded-full" onClick={() => setQty(Math.max(1, qty - 1))}>
                <Minus className="w-4 h-4" />
              </Button>
              <span className="font-display text-xl w-9 text-center">{qty}</span>
              <Button size="icon" variant="ghost" className="h-9 w-9 rounded-full" onClick={() => setQty(qty + 1)}>
                <Plus className="w-4 h-4" />
              </Button>
            </div>
            <span className="font-display text-2xl text-primary">{formatCOP(total)}</span>
          </div>
          <Button
            onClick={handleAdd}
            size="lg"
            className="w-full bg-gradient-hero text-primary-foreground border-0 shadow-soft hover:shadow-glow transition-smooth h-12 text-base"
          >
            Agregar al carrito
          </Button>
        </div>

      </DialogContent>
    </Dialog>
  );
};
