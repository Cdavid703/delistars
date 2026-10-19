/**
 * Arma el pedido a partir del catálogo (lógica pura, sin base de datos).
 * El precio SIEMPRE sale del catálogo del servidor: lo que mande el cliente
 * como precio se ignora. Las líneas quedan con el mismo formato que la caja ya
 * conoce (handoffItemLine), incluido "(= $X)" para verificar la suma.
 */
import { handoffItemLine } from '../../../shared/handoff';
import { CATEGORIA, COMBO_DRINKS, opcionesDe, esPromocion, sedePermitida } from './menu';

export interface ProductoCatalogo {
  id_producto: number;
  nombre_producto: string;
  precio_venta: number;
  id_categoria: number;
  disponible: boolean;
  presentations: { id_presentacion: number; sabor: string; tamano: string; base: string | null; precio_venta: number }[];
}

export interface ItemPedido {
  id_producto: number;
  cantidad: number;
  id_presentacion?: number;
  adiciones?: { id_producto: number; cantidad: number }[];
  salsas?: number[];
  cebollas?: number[];
  opcion?: string;
  bebida?: string;
  nota?: string;
}

export class ErrorPedido extends Error {
  constructor(public codigo: string, mensaje: string, public status = 422) { super(mensaje); }
}

const entero = (v: unknown, min: number, max: number) =>
  Number.isInteger(v) && (v as number) >= min && (v as number) <= max;

export function armarItems(items: unknown, catalogo: ProductoCatalogo[], sedeId: string) {
  if (!Array.isArray(items) || items.length === 0) throw new ErrorPedido('pedido_vacio', 'El pedido no tiene productos');
  if (items.length > 40) throw new ErrorPedido('pedido_grande', 'Máximo 40 líneas por pedido');
  const porId = new Map(catalogo.map((p) => [p.id_producto, p]));
  const lineasHandoff: Record<string, unknown>[] = [];
  let subtotal = 0;

  items.forEach((raw: ItemPedido, i: number) => {
    const donde = `Producto ${i + 1}`;
    const p = porId.get(raw?.id_producto);
    if (!p) throw new ErrorPedido('producto_no_existe', `${donde}: no existe en el menú`);
    if (!p.disponible) throw new ErrorPedido('agotado', `${p.nombre_producto} no está disponible`);
    if (p.id_categoria === CATEGORIA.adiciones || p.id_categoria === CATEGORIA.salsas)
      throw new ErrorPedido('no_se_vende_solo', `${p.nombre_producto} solo se agrega a otro producto`);
    if (esPromocion(p.nombre_producto))
      throw new ErrorPedido('promo_no_disponible', `${p.nombre_producto} todavía no se puede pedir desde la app`);
    if (!sedePermitida(p, sedeId)) throw new ErrorPedido('no_en_sede', `${p.nombre_producto} no se vende en esta sede`);
    if (!entero(raw.cantidad, 1, 20)) throw new ErrorPedido('cantidad', `${donde}: la cantidad debe ser de 1 a 20`);
    const nota = typeof raw.nota === 'string' ? raw.nota.trim() : '';
    if (nota.length > 250) throw new ErrorPedido('nota_larga', `${donde}: el comentario es muy largo`);

    // Precio base y nombre (presentación / bebida del combo / opción)
    let base = Number(p.precio_venta);
    let nombre = p.nombre_producto;
    if (p.presentations.length) {
      const pres = p.presentations.find((x) => x.id_presentacion === raw.id_presentacion);
      if (!pres) throw new ErrorPedido('presentacion', `${p.nombre_producto}: elige sabor y tamaño`);
      base = Number(pres.precio_venta);
      nombre = `${p.nombre_producto} (${pres.sabor}, ${pres.tamano}${pres.base ? `, ${pres.base}` : ''})`;
    } else if (p.id_categoria === CATEGORIA.combos) {
      if (!raw.bebida || !COMBO_DRINKS.includes(raw.bebida))
        throw new ErrorPedido('bebida', `${p.nombre_producto}: elige la bebida del combo`);
      nombre = `${p.nombre_producto} + ${raw.bebida}`;
    }
    const opciones = opcionesDe(p);
    if (opciones) {
      if (!raw.opcion || !opciones.includes(raw.opcion))
        throw new ErrorPedido('opcion', `${p.nombre_producto}: elige ${opciones.join(' o ')}`);
      nombre = p.id_categoria === CATEGORIA.combos ? `${nombre} (${raw.opcion})` : `${p.nombre_producto} (${raw.opcion})`;
    } else if (raw.opcion) throw new ErrorPedido('opcion', `${p.nombre_producto} no tiene opciones`);

    // Adiciones, salsas y cebolla (las bebidas no llevan)
    const esBebida = p.id_categoria === CATEGORIA.bebidas;
    const adiciones: string[] = [];
    for (const a of raw.adiciones ?? []) {
      const ad = porId.get(a?.id_producto);
      if (esBebida || !ad || ad.id_categoria !== CATEGORIA.adiciones || Number(ad.precio_venta) <= 0 || !ad.disponible)
        throw new ErrorPedido('adicion', `${p.nombre_producto}: adición no válida`);
      if (!entero(a.cantidad, 1, 5)) throw new ErrorPedido('adicion', `${p.nombre_producto}: máximo 5 de cada adición`);
      for (let k = 0; k < a.cantidad; k++) adiciones.push(`Adición + ${ad.nombre_producto}`);
      base += Number(ad.precio_venta) * a.cantidad;
    }
    const nombres = (ids: unknown, valido: (x: ProductoCatalogo) => boolean, tipo: string) =>
      (Array.isArray(ids) ? ids : []).map((id) => {
        const x = porId.get(id as number);
        if (esBebida || !x || !valido(x)) throw new ErrorPedido(tipo, `${p.nombre_producto}: ${tipo} no válida`);
        return x.nombre_producto;
      });
    const salsas = nombres(raw.salsas, (x) => x.id_categoria === CATEGORIA.salsas, 'salsa');
    const cebollas = nombres(raw.cebollas, (x) => x.id_categoria === CATEGORIA.adiciones && Number(x.precio_venta) === 0, 'cebolla');

    subtotal += base * raw.cantidad;
    lineasHandoff.push({ name: nombre, quantity: raw.cantidad, unitPrice: base, addons: adiciones, salsas, cebollas, notes: nota });
  });

  const lineas = lineasHandoff.map((it) => handoffItemLine(it));
  return { lineas, itemsTexto: lineas.join('\n'), subtotal };
}
