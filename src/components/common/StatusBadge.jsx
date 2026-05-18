const STATUS_MAP = {
  pending:   { label: 'Pendiente',             cls: 'badge-pending' },
  assigned:  { label: 'Asignado',              cls: 'badge-assigned' },
  accepted:  { label: 'Aceptado',              cls: 'badge-accepted' },
  in_transit:{ label: 'En camino',             cls: 'badge-transit' },
  arrived:   { label: 'Llegó al destino',      cls: 'badge-arrived' },
  delivered_paid: { label: 'Entregado · Pagado', cls: 'badge-delivered' },
  delivered_cash: { label: 'Entregado · Efectivo', cls: 'badge-cash' },
  pending_cuadre: { label: 'Pdte. cuadre',     cls: 'badge-cuadre' },
  completed: { label: 'Completado',            cls: 'badge-completed' },
  rejected:  { label: 'Rechazado',             cls: 'badge-rejected' },
}

export default function StatusBadge({ status }) {
  const s = STATUS_MAP[status] || { label: status, cls: 'badge bg-smoked text-coal/60' }
  return <span className={s.cls}>{s.label}</span>
}
