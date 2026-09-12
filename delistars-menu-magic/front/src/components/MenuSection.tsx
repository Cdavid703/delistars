import { useState, useEffect } from "react";

import { ProductCard } from "@/components/ProductCard";
import { ProductDialog } from "@/components/ProductDialog";
import { apiService, type Category, type Product as ApiProduct } from "@/services/api";
import { SearchBar } from "@/components/SearchBar";
import { useCart } from "@/context/CartContext";
import { destacadosPrimero, normalizarNombre } from "@/lib/destacados";
import { vigente } from "@/lib/temporada";
import { ChevronDown } from "lucide-react";

// Emojis para cada categoría
const EMOJI_MAP: Record<string, string> = {
  "Hamburguesas": "🍔",
  "Perros": "🌭",
  "Salchipapas": "🍟",
  "Combos": "📦",
  "Adiciones": "✨",
  "Deli antojos": "😋",
};

export const MenuSection = () => {
  const { sede, reconcilePrices } = useCart();
  const [selected, setSelected] = useState<ApiProduct | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<ApiProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  // El pop-up de promoción pide abrir un producto por nombre. Puede llegar
  // antes de que carguen los productos, así que el nombre se guarda y se abre
  // en cuanto estén disponibles (ver el efecto más abajo, junto a las
  // categorías plegables, que también hay que abrir).
  const [pedido, setPedido] = useState<string | null>(null);
  useEffect(() => {
    const abrir = (e: Event) => setPedido((e as CustomEvent<string>).detail);
    window.addEventListener("ds:ver-producto", abrir);
    return () => window.removeEventListener("ds:ver-producto", abrir);
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [cats, prods] = await Promise.all([
          apiService.getCategories(),
          apiService.getProducts(),
        ]);
        
        setCategories(cats);
        setProducts(prods);
        // Un carrito restaurado de una sesión anterior puede traer precios
        // congelados: se re-cotiza contra el menú recién cargado.
        reconcilePrices(prods);

        console.log('✅ Categorías cargadas:', cats.length);
        console.log('✅ Productos cargados:', prods.length);
      } catch (error) {
        console.error('❌ Error fetching data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  // ── Categorías plegables ───────────────────────────────────────────────
  const idDeCategoria = (nombre: string) => nombre.toLowerCase().replace(/\s+/g, "-");

  const categorias = categories.filter((c) => c.id_categoria !== 5 && c.id_categoria !== 8);

  const productosDe = (idCategoria: number) =>
    destacadosPrimero(
      products.filter((p) => {
        if (p.id_categoria !== idCategoria) return false;
        // Los combos de temporada desaparecen solos al pasar su fecha.
        if (!vigente(p.nombre_producto)) return false;
        const isJugo =
          p.id_producto === 48 || p.nombre_producto.toLowerCase().includes("jugos de la casa");
        if (isJugo && Number(sede) !== 2) return false;
        return true;
      }),
    );

  const [abiertas, setAbiertas] = useState<Set<string>>(new Set());
  // La primera categoría se abre sola en cuanto cargan: así la página no
  // aparece "vacía" y el producto destacado queda a la vista.
  useEffect(() => {
    if (categorias.length === 0 || abiertas.size > 0) return;
    setAbiertas(new Set([idDeCategoria(categorias[0].nombre_categoria)]));
  }, [categorias.length]);

  const alternar = (id: string) =>
    setAbiertas((prev) => {
      const s = new Set(prev);
      s.has(id) ? s.delete(id) : s.add(id);
      return s;
    });

  /** Desde la barra fija: abre la categoría y baja hasta ella. */
  const irACategoria = (id: string) => {
    setAbiertas((prev) => new Set(prev).add(id));
    // El scroll espera al render para que la sección ya esté desplegada.
    requestAnimationFrame(() =>
      document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" }),
    );
  };

  // Atiende la petición del pop-up: abre la categoría del producto y su ficha.
  useEffect(() => {
    if (!pedido || products.length === 0 || categories.length === 0) return;
    const buscado = normalizarNombre(pedido);
    const p = products.find((x) => normalizarNombre(x.nombre_producto) === buscado);
    if (p) {
      const cat = categories.find((c) => c.id_categoria === p.id_categoria);
      if (cat) irACategoria(idDeCategoria(cat.nombre_categoria));
      setSelected(p);
    }
    setPedido(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pedido, products, categories]);

  const filteredProducts = products.filter((p) => {
    // Excluir adiciones (categoría 5) y salsas (categoría 8)
    if (p.id_categoria === 5 || p.id_categoria === 8) return false;

    // Un producto de temporada vencido tampoco debe salir en el buscador: si no,
    // se encuentra por nombre aunque ya no esté en su categoría.
    if (!vigente(p.nombre_producto)) return false;

    // Los jugos solo aparecen en la sede de Santa Teresita (sede === 2)
    const isJugo = p.id_producto === 48 || p.nombre_producto.toLowerCase().includes("jugos de la casa");
    if (isJugo && Number(sede) !== 2) return false;

    const query = searchQuery.toLowerCase().trim();
    if (!query) return true;
    return (
      p.nombre_producto.toLowerCase().includes(query) ||
      (p.descripcion_producto && p.descripcion_producto.toLowerCase().includes(query))
    );
  });

  return (
    <>
      {/* Barra FIJA: buscador + atajo a cada categoría.
          Antes el buscador vivía a 1.400 px del tope y no era fijo: llegando a
          Combos, veinte pantallas abajo, el cliente ya no podía buscar sin
          subir hasta arriba. Y no había ningún atajo a las categorías fuera
          del menú de hamburguesa. */}
      <div className="sticky top-[60px] md:top-[68px] z-30 bg-background/95 backdrop-blur-md border-b border-border">
        <div className="container px-3 sm:px-6 py-2.5 space-y-2">
          <SearchBar
            value={searchQuery}
            onChange={setSearchQuery}
            resultsCount={searchQuery.trim() ? filteredProducts.length : undefined}
          />
          {!searchQuery.trim() && categorias.length > 0 && (
            <div className="flex gap-2 overflow-x-auto scrollbar-none -mx-1 px-1">
              {categorias.map((cat) => {
                const id = idDeCategoria(cat.nombre_categoria);
                return (
                  <button
                    key={cat.id_categoria}
                    onClick={() => irACategoria(id)}
                    className="shrink-0 min-h-[44px] px-4 rounded-full bg-secondary/70 text-sm font-medium text-foreground hover:bg-primary hover:text-primary-foreground transition-smooth whitespace-nowrap"
                  >
                    {EMOJI_MAP[cat.nombre_categoria] || "🍽️"} {cat.nombre_categoria}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {loading ? (
        <div className="container py-20 text-center text-muted-foreground animate-pulse">
          Cargando el menú mágico...
        </div>
      ) : searchQuery.trim() ? (
        // Si hay una búsqueda activa
        <section className="py-10 min-h-[400px]">
          <div className="container">
            <div className="text-center mb-10 space-y-2">
              <span className="text-5xl inline-block animate-bounce-soft">🔍</span>
              <h2 className="text-4xl md:text-5xl font-display text-foreground">Resultados</h2>
              <p className="text-muted-foreground">Búsqueda para "{searchQuery}"</p>
              <div className="w-20 h-1 bg-gradient-hero rounded-full mx-auto mt-3" />
            </div>

            {filteredProducts.length > 0 ? (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredProducts.map((p) => (
                  <ProductCard key={p.id_producto} product={p} onClick={() => setSelected(p)} />
                ))}
              </div>
            ) : (
              <div className="text-center py-20 bg-card/40 rounded-3xl border border-dashed border-border max-w-lg mx-auto">
                <span className="text-5xl mb-4 inline-block">🍕🔍❓</span>
                <p className="text-xl font-display text-foreground mb-2">No encontramos nada</p>
                <p className="text-muted-foreground">Intenta buscar con otras palabras o ingredientes</p>
              </div>
            )}
          </div>
        </section>
      ) : (
        // Categorías PLEGABLES. Con todo desplegado el menú medía 39 pantallas
        // en celular y había que pasar 27 para llegar a las bebidas. Cerradas,
        // el cliente ve el menú completo de un vistazo y abre lo que le
        // interesa. La primera viene abierta para que la página no luzca vacía.
        categorias.map((cat) => {
          const categoryProducts = productosDe(cat.id_categoria);
          const emoji = EMOJI_MAP[cat.nombre_categoria] || "🍽️";
          const categoryId = idDeCategoria(cat.nombre_categoria);
          const abierta = abiertas.has(categoryId);

          return (
            <section key={cat.id_categoria} id={categoryId} className="scroll-mt-[132px] container py-2">
              <button
                onClick={() => alternar(categoryId)}
                aria-expanded={abierta}
                className="w-full min-h-[64px] flex items-center gap-3 px-4 py-3 rounded-2xl bg-card border border-border shadow-card hover:border-primary/50 transition-smooth text-left"
              >
                <span className="text-3xl md:text-4xl shrink-0">{emoji}</span>
                <span className="flex-1 min-w-0">
                  <span className="block font-display text-xl md:text-3xl text-foreground leading-tight">
                    {cat.nombre_categoria}
                  </span>
                  <span className="block text-xs md:text-sm text-muted-foreground">
                    {categoryProducts.length} {categoryProducts.length === 1 ? "producto" : "productos"}
                  </span>
                </span>
                <ChevronDown
                  className={`w-6 h-6 text-primary shrink-0 transition-transform ${abierta ? "rotate-180" : ""}`}
                />
              </button>

              {abierta && (
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 mt-6 mb-10 animate-fade-in">
                  {categoryProducts.length > 0 ? (
                    categoryProducts.map((p) => (
                      <ProductCard key={p.id_producto} product={p} onClick={() => setSelected(p)} />
                    ))
                  ) : (
                    <div className="col-span-full text-center py-8 text-muted-foreground">
                      No hay productos en esta categoría
                    </div>
                  )}
                </div>
              )}
            </section>
          );
        })
      )}

      <ProductDialog product={selected} onClose={() => setSelected(null)} />
    </>
  );
};
