/** Sedes (espejo de src/services/roles.js → SEDES). Pines verificados por Andrés. */
export const SEDES: Record<string, { id: string; nombre: string; coords: { lat: number; lng: number } }> = {
  santa_lucia:    { id: 'santa_lucia',    nombre: 'Santa Lucía',    coords: { lat: 6.260435, lng: -75.604912 } },
  santa_teresita: { id: 'santa_teresita', nombre: 'Santa Teresita', coords: { lat: 6.244691, lng: -75.613159 } },
};

/** Últimos 10 dígitos (igual que src/utils/recuperarPedido.js → normalizarTelefono). */
export function normalizarTelefono(tel: unknown): string {
  const d = String(tel || '').replace(/\D/g, '');
  return d.length >= 10 ? d.slice(-10) : '';
}

/** Medellín y alrededores: descarta coordenadas absurdas. */
export const coordsValidas = (c: unknown): c is { lat: number; lng: number } =>
  !!c && typeof c === 'object' &&
  Number.isFinite((c as { lat: number }).lat) && Number.isFinite((c as { lng: number }).lng) &&
  (c as { lat: number }).lat > 6.0 && (c as { lat: number }).lat < 6.5 &&
  (c as { lng: number }).lng > -75.8 && (c as { lng: number }).lng < -75.4;
