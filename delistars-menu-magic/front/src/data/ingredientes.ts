// Ficha de ingredientes por producto.
//
// POR QUÉ NO SALE DE LA BASE DE DATOS: tbl_productos solo tiene
// `descripcion_producto`, que es texto de marketing ("Experimenta la intensidad
// de nuestro perro grande…"). No hay tabla ni campo de ingredientes. Los datos
// de ingredientes.json combinan lo que esas descripciones SÍ afirman de forma
// concreta (queso, tocineta, doble carne, salchicha americana, chicharrones,
// viruta de papa…) con la receta que confirmó la operación.
//
// La fuente es ingredientes.json y NO este archivo: el generador del PDF
// descargable (scripts/generar-ficha-ingredientes.py) lee el mismo JSON, así
// que la página y el PDF nunca se desincronizan.
//
// ⚠️ REGLA: aquí no se inventa nada. Un dato sin confirmar va en null y no se
// publica. Publicar ingredientes inventados es un problema real (alergias y
// publicidad engañosa), no un detalle de redacción.
import datos from './ingredientes.json'

export type Ficha = {
  /** Nombre exacto como está en tbl_productos. */
  nombre: string
  /** Lo que trae además de la base de su familia. */
  lleva: string[]
  nota?: string
}

export type Familia = {
  key: string
  emoji: string
  titulo: string
  /** Lo que comparten todos los productos de la familia (null = sin confirmar). */
  base: string[] | null
  nota?: string
  productos: Ficha[]
}

export const FAMILIAS: Familia[]                 = datos.familias as Familia[]
export const ENSALADA_DE_LA_CASA: string[] | null = datos.ensalada
export const ENSALADA_NOTA: string                = datos.ensaladaNota
export const SALSAS_CASA: string[]                = datos.salsas
export const CEBOLLAS: string[]                   = datos.cebollas
