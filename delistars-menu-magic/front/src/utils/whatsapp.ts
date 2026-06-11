import type { CartItem } from "@/context/CartContext";

export interface CheckoutData {
  name: string;
  phone: string;
  mode: "domicilio" | "recoger";
  address?: string;
  sector?: string;
  sedeName: string;
  items: CartItem[];
  total: number;
}

/**
 * Genera un mensaje formateado para WhatsApp con los detalles del pedido
 */
export const generateWhatsAppMessage = (data: CheckoutData): string => {
  const { name, phone, mode, address, sector, sedeName, items, total } = data;

  // Encabezado
  let message = `*📋 PEDIDO DELISTARS*\n`;
  message += `━━━━━━━━━━━━━━━━━━━━━\n\n`;

  // Datos del cliente
  message += `*👤 Datos del Cliente:*\n`;
  message += `• Nombre: ${name}\n`;
  message += `• Teléfono: ${phone}\n`;
  message += `• Sede: ${sedeName}\n`;

  // Tipo de entrega
  message += `\n*🚚 Tipo de Entrega:*\n`;
  if (mode === "domicilio") {
    message += `• Domicilio\n`;
    message += `• Dirección: ${address}\n`;
    message += `• Barrio: ${sector}\n`;
  } else {
    message += `• Recoger en sede\n`;
  }

  // Productos
  message += `\n*🍔 Productos:*\n`;
  message += `━━━━━━━━━━━━━━━━━━━━━\n`;

  items.forEach((item, idx) => {
    const subtotal = item.unitPrice * item.quantity;
    const productPrice = parseFloat(item.product.precio_venta);
    message += `\n${idx + 1}. ${item.product.nombre_producto}\n`;
    message += `   Cantidad: ${item.quantity}\n`;
    message += `   Precio unitario: $${productPrice.toLocaleString("es-CO")}\n`;

    // Adiciones
    if (item.addons.length > 0) {
      message += `   \n   *Adiciones:*\n`;
      item.addons.forEach((addon) => {
        message += `   + ${addon.name}: $${addon.price.toLocaleString("es-CO")}\n`;
      });
    }

    // Notas especiales
    if (item.notes) {
      message += `   Notas: ${item.notes}\n`;
    }

    message += `   Subtotal: $${subtotal.toLocaleString("es-CO")}\n`;
  });

  // Total
  message += `\n━━━━━━━━━━━━━━━━━━━━━\n`;
  message += `*💰 TOTAL: $${total.toLocaleString("es-CO")}*\n`;

  message += `━━━━━━━━━━━━━━━━━━━━━\n`;
  message += `\n¡Gracias por tu pedido! 🙏\n`;

  return message;
};

/**
 * Genera el URL de WhatsApp Web con el mensaje preformato
 */
export const generateWhatsAppUrl = (whatsappPhone: string, message: string): string => {
  const encodedMessage = encodeURIComponent(message);
  return `https://wa.me/${whatsappPhone}?text=${encodedMessage}`;
};
