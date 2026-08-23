import perro1 from "@/assets/perro-1.jpg";
import perro2 from "@/assets/perro-2.jpg";
import perro3 from "@/assets/perro-3.jpg";
import burger1 from "@/assets/burger-1.jpg";
import burger2 from "@/assets/burger-2.jpg";
import burger3 from "@/assets/burger-3.jpg";
import side1 from "@/assets/side-1.jpg";
import drink1 from "@/assets/drink-1.jpg";

export type Product = {
  id: string;
  name: string;
  description: string;
  price: number;
  image: string;
  category: "perros" | "hamburguesas" | "acompanantes" | "bebidas";
};

export type Addon = {
  id: string;
  name: string;
  price: number;
};

export const SEDES = [
  {
    id: 1,
    // slug = llave de contrato con la app de domicilios (debe coincidir con SEDES en src/services/roles.js).
    // Es la ÚNICA fuente de verdad para identificar la sede al pasar el pedido a domicilios.
    slug: "santa_lucia",
    name: "Sede Santa Lucía",
    address: "Santa Lucía, Medellín",
    phone: "+57 300 123 4567",
    whatsappPhone: "573135065720",
    hours: "11:00 AM - 11:00 PM",
    mapsUrl: "https://www.google.com/maps?q=Delistars+Santa+Lucia+Medellin&output=embed",
  },
  {
    id: 2,
    slug: "santa_teresita",
    name: "Sede Santa Teresita",
    address: "Santa Teresita, Medellín",
    phone: "+57 300 765 4321",
    whatsappPhone: "573150634084",
    hours: "12:00 PM - 12:00 AM",
    mapsUrl: "https://www.google.com/maps?q=Delistars+Santa+Teresita+Medellin&output=embed",
  },
];
