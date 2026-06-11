import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function optimizeImage(url: string, width: number = 800, height: number = 600): string {
  if (!url) return url;
  
  // Si la URL es de Cloudinary, le inyectamos Inteligencia Artificial para el recorte (g_auto centro automático en el objeto principal)
  if (url.includes('cloudinary.com') && url.includes('/upload/')) {
    const parts = url.split('/upload/');
    if (parts.length === 2) {
      // c_fill = rellenar espacio, g_auto = centrado automático AI, q_auto = optimizar peso, f_auto = convertir a webp
      return `${parts[0]}/upload/c_fill,g_auto,w_${width},h_${height},q_auto,f_auto/${parts[1]}`;
    }
  }
  
  return url;
}
