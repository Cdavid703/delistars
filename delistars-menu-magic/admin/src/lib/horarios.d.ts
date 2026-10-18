// Tipos de horarios.js (copia exacta de src/utils/horarios.js; ver ese archivo).
export interface Turno { desde: string; hasta: string }
export interface Horario {
  semana: Record<string, Turno[]>
  excepciones: Record<string, Turno[]>
  manual: null | { modo: 'abierta' | 'cerrada'; hasta: string | null; por?: string }
}
export interface EstadoSede { abierta: boolean; motivo: 'manual' | 'horario' | 'excepcion'; hasta: number | null; proxima: number | null }
export const DIAS: string[]
export const NOMBRE_DIA: Record<string, string>
export const SEDES_HORARIO: string[]
export const HORARIO_POR_DEFECTO: Horario
export function enColombia(ms: number): { fecha: string; dia: string; minuto: number }
export function estadoSede(horario: Horario | null | undefined, ahora?: number): EstadoSede
export function algunaAbierta(horarios: Record<string, Horario> | null | undefined, ahora?: number): boolean
export function textoEstado(e: EstadoSede | null | undefined, ahora?: number): string
