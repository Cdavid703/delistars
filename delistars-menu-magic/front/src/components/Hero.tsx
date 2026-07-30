import heroFood from "@/assets/hero-food.jpg";
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";
import { Carousel, CarouselContent, CarouselItem, CarouselPrevious, CarouselNext } from "@/components/ui/carousel";
import Autoplay from "embla-carousel-autoplay";
import { useRef, useState, useEffect } from "react";
import { PRODUCTS } from "@/data/menu";
import { apiService, type Product as ApiProduct } from "@/services/api";
import { optimizeImage } from "@/lib/utils";

interface HeroSlide {
  image: string;
  name: string;
  tag: string;
  price?: string;
}

export const Hero = () => {
  const autoplay = useRef(Autoplay({ delay: 3000, stopOnInteraction: false, stopOnMouseEnter: true }));
  
  // Filtrar de los productos locales iniciales los que no sean hamburguesas de pollo
  const initialProducts = PRODUCTS.filter(
    (p) => !(p.name.toLowerCase().includes("hamburguesa") && p.name.toLowerCase().includes("pollo"))
  );

  const [slides, setSlides] = useState<HeroSlide[]>([
    { image: heroFood, name: "Perro DeliStar", tag: "El favorito de la casa" },
    ...initialProducts.slice(0, 5).map((p) => ({ image: p.image, name: p.name, tag: p.description, price: `$${p.price.toLocaleString()}` })),
  ]);

  useEffect(() => {
    const fetchProducts = async () => {
      try {
        const products = await apiService.getProducts();
        // Filtrar solo productos que NO sean adiciones (5) ni salsas (8)
        // y que NO sean hamburguesas de pollo
        const filteredProducts = products.filter((p: ApiProduct) => {
          if (p.id_categoria === 5 || p.id_categoria === 8) return false;
          
          const isHamburguesaDePollo = 
            p.nombre_producto.toLowerCase().includes("hamburguesa") && 
            p.nombre_producto.toLowerCase().includes("pollo");
            
          return !isHamburguesaDePollo;
        });
        
        if (filteredProducts.length > 0) {
          // Tomar los primeros 6 productos principales
          const heroSlides: HeroSlide[] = filteredProducts.slice(0, 6).map((p: ApiProduct) => ({
            image: p.image_url1 || p.image_url2 || heroFood,
            name: p.nombre_producto,
            tag: p.descripcion_producto,
            price: `$${parseFloat(p.precio_venta).toLocaleString('es-CO', { minimumFractionDigits: 0 })}`,
          }));
          setSlides(heroSlides);
        }
      } catch (error) {
        console.error('Error loading hero products:', error);
      }
    };

    fetchProducts();
  }, []);

  return (
    <section id="top" className="relative pt-28 pb-16 md:pt-36 md:pb-24 overflow-hidden">
      <div className="container grid md:grid-cols-2 gap-10 items-center">
        <div className="space-y-6 animate-fade-in">
          <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-secondary text-secondary-foreground text-sm font-medium shadow-card">
            <Sparkles className="w-4 h-4" /> Sabor que brilla
            <span className="w-px h-3.5 bg-foreground/20 mx-0.5" />
            <span className="font-display tracking-widest text-primary">·Tasty & Cool·</span>
          </span>
          <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-display leading-tight">
            <span className="text-foreground block">Perros, hamburguesas</span>
            <span className="text-foreground block mb-1">y mucho más</span>
            <span className="font-display text-primary text-5xl sm:text-6xl md:text-7xl block mt-1 tracking-wide">deliciosos</span>
          </h1>
          <p className="text-lg text-muted-foreground max-w-md">
            Hechos con ingredientes frescos, salsas de la casa y un toque de magia.
            Pide a domicilio o recógelos en sede. ¡A comer rico se ha dicho!
          </p>
          <div className="flex flex-wrap gap-3">
            <Button asChild size="lg" className="bg-gradient-hero text-primary-foreground border-0 shadow-soft hover:shadow-glow transition-smooth h-12 px-7 text-base">
              <a href="#perros">Ver el menú 🍔</a>
            </Button>
            <Button asChild size="lg" variant="outline" className="h-12 px-7 text-base border-2 border-primary text-primary hover:bg-primary hover:text-primary-foreground transition-smooth">
              <a href="#encuentranos">Encuéntranos</a>
            </Button>
          </div>
        </div>

        <div className="relative animate-scale-in">
          <div className="absolute -inset-4 bg-gradient-hero rounded-[2rem] blur-2xl opacity-30" />
          <Carousel
            opts={{ loop: true, align: "start" }}
            plugins={[autoplay.current]}
            className="relative"
          >
            <CarouselContent className="ml-0">
              {slides.map((slide, i) => (
                <CarouselItem key={i} className="pl-0">
                  <div className="relative">
                    <img
                      src={optimizeImage(slide.image, 800, 600)}
                      alt={slide.name}
                      width={1536}
                      height={1024}
                      className="rounded-[2rem] shadow-soft w-full h-auto object-cover aspect-[4/3]"
                    />
                    <div className="absolute inset-x-0 bottom-0 p-5 sm:p-6 rounded-b-[2rem] bg-gradient-to-t from-black/70 via-black/30 to-transparent">
                      <p className="font-display text-2xl sm:text-3xl text-white">{slide.name}</p>
                      <div className="flex justify-between items-start">
                        <p className="text-sm text-white/85 line-clamp-1 flex-1">{slide.tag}</p>
                        {slide.price && <p className="text-lg font-bold text-primary ml-2">{slide.price}</p>}
                      </div>
                    </div>
                  </div>
                </CarouselItem>
              ))}
            </CarouselContent>
            <CarouselPrevious className="left-3 sm:left-4 h-10 w-10 bg-card/90 hover:bg-card border-2 border-primary text-primary shadow-soft z-10" />
            <CarouselNext className="right-3 sm:right-4 h-10 w-10 bg-card/90 hover:bg-card border-2 border-primary text-primary shadow-soft z-10" />
          </Carousel>
          <div className="absolute -bottom-6 -left-6 bg-card rounded-2xl p-4 shadow-soft animate-bounce-soft hidden sm:block z-10">
            <p className="font-display text-2xl text-primary">+1.000</p>
            <p className="text-xs text-muted-foreground">clientes felices</p>
          </div>
        </div>
      </div>
    </section>
  );
};
