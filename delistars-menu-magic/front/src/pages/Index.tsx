import { CartProvider } from "@/context/CartContext";
import { SedeModal } from "@/components/SedeModal";
import { Navbar } from "@/components/Navbar";
import { Hero } from "@/components/Hero";
import { LoyaltySection } from "@/components/LoyaltySection";
import { MenuSection } from "@/components/MenuSection";
import { Encuentranos } from "@/components/Encuentranos";
import { Footer } from "@/components/Footer";
import { CartSheet } from "@/components/CartSheet";

const Index = () => {
  return (
    <CartProvider>
      <div className="min-h-screen">
        <SedeModal />
        <Navbar />
        <main>
          <Hero />
          <LoyaltySection />
          <MenuSection />
          <Encuentranos />
        </main>
        <Footer />
        <CartSheet />
      </div>
    </CartProvider>
  );
};

export default Index;
