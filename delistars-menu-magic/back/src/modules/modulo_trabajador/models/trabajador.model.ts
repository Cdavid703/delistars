export interface Trabajador {
  id_trabajador: number;
  nombre_trabajador: string;
  apellido_trabajador: string;
  usuario: string;
  usuario_password: string; // Será almacenado cifrado en la BD
}

export interface CreateTrabajadorDTO {
  nombre_trabajador: string;
  apellido_trabajador: string;
  usuario: string;
  usuario_password: string; // Será cifrado antes de guardarse
}

export interface TrabajadorResponse {
  id_trabajador: number;
  nombre_trabajador: string;
  apellido_trabajador: string;
  usuario: string;
  // NO incluimos usuario_password en la respuesta
}
