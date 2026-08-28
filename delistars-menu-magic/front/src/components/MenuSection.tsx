import { useState, useEffect } from "react";

import { ProductCard } from "@/components/ProductCard";
import { ProductDialog } from "@/components/ProductDialog";
import { apiService, type Category, type Product as ApiProduct } from "@/services/api";
import { SearchBar } from "@/components/SearchBar";
import { useCart } from "@/context/CartContext";
import { destacadosPrimero, normalizarNombre } from "@/lib/destacados";

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
  // en cuanto estén disponibles.
  const [pedido, setPedido] = useState<string | null>(null);
  useEffect(() => {
    const abrir = (e: Event) => setPedido((e as CustomEvent<string>).detail);
    window.addEventListener("ds:ver-producto", abrir);
    return () => window.removeEventListener("ds:ver-producto", abrir);
  }, []);
  useEffect(() => {
    if (!pedido || products.length === 0) return;
    const buscado = normalizarNombre(pedido);
    const p = products.find((x) => normalizarNombre(x.nombre_producto) === buscado);
    if (p) setSelected(p);
    setPedido(null);
  }, [pedido, products]);

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

  const filteredProducts = products.filter((p) => {
    // Excluir adiciones (categoría 5) y salsas (categoría 8)
    if (p.id_categoria === 5 || p.id_categoria === 8) return false;

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
      {/* Sección del Buscador */}
      <div className="container py-8 -mt-8 mb-4">
        <SearchBar
          value={searchQuery}
          onChange={setSearchQuery}
          resultsCount={searchQuery.trim() ? filteredProducts.length : undefined}
        />
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
        // Si no hay búsqueda, renderizar las categorías normales
        categories
          .filter((cat) => cat.id_categoria !== 5 && cat.id_categoria !== 8) // Excluir Adiciones y Salsas
          .map((cat) => {
            const categoryProducts = destacadosPrimero(products.filter((p) => {
              if (p.id_categoria !== cat.id_categoria || p.id_categoria === 5 || p.id_categoria === 8) return false;
              const isJugo = p.id_producto === 48 || p.nombre_producto.toLowerCase().includes("jugos de la casa");
              if (isJugo && Number(sede) !== 2) return false;
              return true;
            }));

            const emoji = EMOJI_MAP[cat.nombre_categoria] || "🍽️";
            const categoryId = cat.nombre_categoria.toLowerCase().replace(/\s+/g, "-");

            return (
              <section key={cat.id_categoria} id={categoryId} className="py-16 md:py-20 scroll-mt-20">
                <div className="container">
                  <div className="text-center mb-10 space-y-2 animate-fade-in">
                    <span className="text-5xl inline-block animate-bounce-soft">{emoji}</span>
                    <h2 className="text-4xl md:text-5xl font-display text-foreground">{cat.nombre_categoria}</h2>
                    <p className="text-muted-foreground">Los mejores de nuestra categoría</p>
                    <div className="w-20 h-1 bg-gradient-hero rounded-full mx-auto mt-3" />
                  </div>
                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
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
                </div>
              </section>
            );
          })
      )}

      <ProductDialog product={selected} onClose={() => setSelected(null)} />
    </>
  );
};
