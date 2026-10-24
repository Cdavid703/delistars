// Etiqueta de estado de la caja (sonido, impresora…): una línea, con su acción
// al lado. Solo se pone naranja cuando hay algo por resolver; lo que está bien
// queda verde y lo informativo, gris. Reemplaza las cajas grandes de aviso.
const TONO = {
  bien: 'bg-mint/10 text-mint',
  neutro: 'bg-coal/5 text-coal/60',
  atencion: 'bg-tangelo/15 text-coal',
}
const ICONO = { bien: 'text-mint', neutro: 'text-coal/45', atencion: 'text-tangelo' }

export default function ChipEstado({ tono = 'neutro', icono: Icono, texto, accion, titulo, children }) {
  return (
    <div className={`inline-flex max-w-full items-center gap-2 rounded-full py-1 pl-3 ${accion ? 'pr-1' : 'pr-3'} font-body text-xs font-semibold ${TONO[tono]}`} title={titulo}>
      {Icono && <Icono size={14} className={`flex-shrink-0 ${ICONO[tono]}`} aria-hidden="true" />}
      <span className="min-w-0 truncate">{texto}</span>
      {children}
      {accion && (
        <button onClick={accion.onClick} disabled={accion.disabled}
          className={`flex-shrink-0 rounded-full px-3 py-1 text-xs font-semibold transition-colors disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cherry/40 ${
            tono === 'atencion' ? 'bg-cherry text-cream hover:bg-cherry/90' : 'bg-white/80 text-coal/70 hover:bg-white'}`}>
          {accion.texto}
        </button>
      )}
    </div>
  )
}
