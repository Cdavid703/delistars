import { createContext, useContext, useState, ReactNode, useEffect } from "react";
import type { Addon, Salsa, Cebolla, Product as ApiProduct } from "@/services/api";

export type CartItem = {
  uid: string;
  product: ApiProduct;
  quantity: number;
  addons: Addon[];
  salsas: Salsa[];
  cebollas: Cebolla[];
  notes: string;
  unitPrice: number; // includes addons
  presentation?: {
    id_presentacion: number;
    sabor: string;
    tamano: string;
    base: string | null;
    precio_venta: number;
  };
  selectedDrink?: string;
  selectedOption?: string;
};

type CartCtx = {
  items: CartItem[];
  addItem: (item: Omit<CartItem, "uid" | "unitPrice">) => void;
  removeItem: (uid: string) => void;
  updateQty: (uid: string, qty: number) => void;
  clear: () => void;
  total: number;
  count: number;
  isOpen: boolean;
  setOpen: (v: boolean) => void;
  sede: number | null;
  setSede: (s: number | null) => void;
};

const Ctx = createContext<CartCtx | null>(null);

// El carrito se guarda en localStorage para que NO se pierda si la página
// recarga o el móvil descarta la pestaña (cambiar de app, pull-to-refresh,
// PWA). Antes vivía solo en memoria y el cliente perdía sus productos.
const CART_KEY = "ds_cart_items";
const CART_TTL = 12 * 60 * 60 * 1000; // 12 h — evita mostrar un carrito muy viejo

function loadCart(): CartItem[] {
  try {
    const raw = localStorage.getItem(CART_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.items)) return [];
    if (Date.now() - (parsed.savedAt || 0) > CART_TTL) {
      localStorage.removeItem(CART_KEY);
      return [];
    }
    return parsed.items as CartItem[];
  } catch {
    return [];
  }
}

export const CartProvider = ({ children }: { children: ReactNode }) => {
  const [items, setItems] = useState<CartItem[]>(loadCart);
  const [isOpen, setOpen] = useState(false);
  const [sede, setSedeState] = useState<number | null>(null);

  // Persiste el carrito ante cualquier cambio (agregar, quitar, cantidad).
  useEffect(() => {
    try {
      if (items.length === 0) localStorage.removeItem(CART_KEY);
      else localStorage.setItem(CART_KEY, JSON.stringify({ items, savedAt: Date.now() }));
    } catch {
      /* almacenamiento lleno o no disponible: el carrito sigue en memoria */
    }
  }, [items]);

  const setSede = (s: number | null) => {
    setSedeState(s);
  };

  const addItem: CartCtx["addItem"] = (i) => {
    const basePrice = i.presentation ? i.presentation.precio_venta : parseFloat(i.product.precio_venta);
    const unitPrice = basePrice + i.addons.reduce((s, a) => s + a.price, 0);
    const uid = `${i.product.id_producto}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setItems((prev) => [...prev, { ...i, uid, unitPrice }]);
    // NO se abre el carrito automáticamente: el cliente se queda en el menú y
    // puede seguir agregando productos sin interrupción. El aviso de "agregado"
    // y el acceso al carrito los da el toast (con acción "Ver carrito") + el
    // badge del navbar.
  };

  const removeItem = (uid: string) => setItems((p) => p.filter((x) => x.uid !== uid));
  const updateQty = (uid: string, qty: number) =>
    setItems((p) => p.map((x) => (x.uid === uid ? { ...x, quantity: Math.max(1, qty) } : x)));
  const clear = () => setItems([]);

  const total = items.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
  const count = items.reduce((s, i) => s + i.quantity, 0);

  return (
    <Ctx.Provider value={{ items, addItem, removeItem, updateQty, clear, total, count, isOpen, setOpen, sede, setSede }}>
      {children}
    </Ctx.Provider>
  );
};

export const useCart = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error("useCart must be inside CartProvider");
  return c;
};

export const formatCOP = (n: number) =>
  new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n);
