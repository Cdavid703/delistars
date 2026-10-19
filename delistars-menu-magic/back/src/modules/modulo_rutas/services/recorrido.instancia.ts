import { RecorridoService } from './recorrido.service';

/** Una sola instancia: el caché y el tope diario de Google se comparten entre módulos. */
export const recorrido = new RecorridoService();
