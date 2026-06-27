import { createContext, useContext, useState, ReactNode, useEffect } from "react";
import type { Addon, Product as ApiProduct } from "@/services/api";

export type CartItem = {
  uid: string;
  product: ApiProduct;
  quantity: number;
  addons: Addon[];
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

export const CartProvider = ({ children }: { children: ReactNode }) => {
  const [items, setItems] = useState<CartItem[]>([]);
  const [isOpen, setOpen] = useState(false);
  const [sede, setSedeState] = useState<number | null>(null);

  const setSede = (s: number | null) => {
    setSedeState(s);
  };

  const addItem: CartCtx["addItem"] = (i) => {
    const basePrice = i.presentation ? i.presentation.precio_venta : parseFloat(i.product.precio_venta);
    const unitPrice = basePrice + i.addons.reduce((s, a) => s + a.price, 0);
    const uid = `${i.product.id_producto}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setItems((prev) => [...prev, { ...i, uid, unitPrice }]);
    setOpen(true);
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
