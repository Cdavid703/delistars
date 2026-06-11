import { useState } from "react";
import { CartProvider } from "@/context/CartContext";
import { SedeModal } from "@/components/SedeModal";
import { PromoModal } from "@/components/PromoModal";
import { Navbar } from "@/components/Navbar";
import { Hero } from "@/components/Hero";
import { MenuSection } from "@/components/MenuSection";
import { Encuentranos } from "@/components/Encuentranos";
import { Footer } from "@/components/Footer";
import { CartSheet } from "@/components/CartSheet";
import { ProductDialog } from "@/components/ProductDialog";
import type { Product as ApiProduct } from "@/services/api";

const Index = () => {
  const [promoProduct, setPromoProduct] = useState<ApiProduct | null>(null);

  return (
    <CartProvider>
      <div className="min-h-screen">
        <SedeModal />
        <PromoModal onOpenProduct={setPromoProduct} />
        <Navbar />
        <main>
          <Hero />
          <MenuSection />
          <Encuentranos />
        </main>
        <Footer />
        <CartSheet />
        <ProductDialog product={promoProduct} onClose={() => setPromoProduct(null)} />
      </div>
    </CartProvider>
  );
};

export default Index;
