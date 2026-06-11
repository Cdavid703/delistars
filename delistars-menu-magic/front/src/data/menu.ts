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

export const ADDONS: Addon[] = [
  { id: "salsa-rosada", name: "Salsa rosada extra", price: 1500 },
  { id: "queso-extra", name: "Queso fundido extra", price: 3000 },
  { id: "tocineta", name: "Tocineta crocante", price: 4000 },
  { id: "guacamole", name: "Guacamole", price: 3500 },
  { id: "jalapenos", name: "Jalapeños", price: 2000 },
  { id: "papas-extra", name: "Porción de papas", price: 5000 },
  { id: "huevo-frito", name: "Huevo frito", price: 2500 },
  { id: "piña", name: "Piña caramelizada", price: 2500 },
];

export const PRODUCTS: Product[] = [
  {
    id: "p1",
    name: "Perro DeliStar",
    description: "Salchicha premium, queso fundido, tocineta crocante, cebolla caramelizada y nuestra salsa estrella.",
    price: 14900,
    image: perro1,
    category: "perros",
  },
  {
    id: "p2",
    name: "Perro Clásico Americano",
    description: "Salchicha jugosa, mostaza, ketchup, pepinillos y cebolla blanca en pan suave.",
    price: 11900,
    image: perro2,
    category: "perros",
  },
  {
    id: "p3",
    name: "Perro Mexicano",
    description: "Guacamole fresco, pico de gallo, jalapeños y un toque picante. ¡Para los valientes!",
    price: 15900,
    image: perro3,
    category: "perros",
  },
  {
    id: "h1",
    name: "Hamburguesa Sencilla",
    description: "Carne de res, lechuga, tomate y nuestra salsa de la casa en pan suave.",
    price: 17000,
    image: burger1,
    category: "hamburguesas",
  },
  {
    id: "h2",
    name: "Hamburguesa con Queso",
    description: "Carne de res con queso fundido, lechuga, tomate y salsa de la casa.",
    price: 18500,
    image: burger2,
    category: "hamburguesas",
  },
  {
    id: "h3",
    name: "Hamburguesa con Tocineta",
    description: "Carne de res con tocineta crocante, lechuga, tomate y salsa de la casa.",
    price: 18500,
    image: burger3,
    category: "hamburguesas",
  },
  {
    id: "h4",
    name: "Hamburguesa Sencilla de Pollo",
    description: "Pechuga de pollo a la plancha, lechuga, tomate y salsa de la casa.",
    price: 19000,
    image: burger1,
    category: "hamburguesas",
  },
  {
    id: "h5",
    name: "Hamburguesa Especial",
    description: "Carne de res con ingredientes especiales de la casa, una combinación única.",
    price: 20000,
    image: burger2,
    category: "hamburguesas",
  },
  {
    id: "h6",
    name: "Hamburguesa de Pollo con Queso o Tocineta",
    description: "Pollo jugoso acompañado de queso fundido o tocineta crocante a tu elección.",
    price: 20000,
    image: burger3,
    category: "hamburguesas",
  },
  {
    id: "h7",
    name: "Hamburguesa Especial de Pollo",
    description: "Pollo especial de la casa con nuestra mezcla exclusiva de ingredientes.",
    price: 21000,
    image: burger1,
    category: "hamburguesas",
  },
  {
    id: "h8",
    name: "Hamburguesa Super",
    description: "Nuestra hamburguesa más completa de res, cargada de ingredientes premium.",
    price: 28000,
    image: burger2,
    category: "hamburguesas",
  },
  {
    id: "h9",
    name: "Hamburguesa Mixta",
    description: "La triple combinación: carne de res, pollo y tocineta en una sola hamburguesa.",
    price: 28500,
    image: burger3,
    category: "hamburguesas",
  },
  {
    id: "h10",
    name: "Hamburguesa Super de Pollo",
    description: "La versión suprema de pollo, con todos los ingredientes premium de la casa.",
    price: 29000,
    image: burger1,
    category: "hamburguesas",
  },
  {
    id: "a1",
    name: "Papas a la Francesa",
    description: "Crocantes por fuera, suaves por dentro. Acompañadas de ketchup y salsa de la casa.",
    price: 8900,
    image: side1,
    category: "acompanantes",
  },
  {
    id: "b1",
    name: "Limonada de la Casa",
    description: "Refrescante limonada natural con un toque especial. Sirve generosa.",
    price: 6900,
    image: drink1,
    category: "bebidas",
  },
];

export const SECTORES = [
  "Centro",
  "Norte",
  "Sur",
  "Occidente",
  "Oriente",
  "Laureles",
  "Poblado",
  "Envigado",
];

export const SEDES = [
  {
    id: 1,
    name: "Sede Santa Lucía",
    address: "Santa Lucía, Medellín",
    phone: "+57 300 123 4567",
    whatsappPhone: "573135065720",
    hours: "11:00 AM - 11:00 PM",
    mapsUrl: "https://www.google.com/maps?q=Delistars+Santa+Lucia+Medellin&output=embed",
  },
  {
    id: 2,
    name: "Sede Santa Teresita",
    address: "Santa Teresita, Medellín",
    phone: "+57 300 765 4321",
    whatsappPhone: "573150634084",
    hours: "12:00 PM - 12:00 AM",
    mapsUrl: "https://www.google.com/maps?q=Delistars+Santa+Teresita+Medellin&output=embed",
  },
];
