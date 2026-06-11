export class CreateSedeDTO {
  nombre_sede: string;
  telefono_sede: string;
  direccion_sede: string;
  horario_lunes_jueves: string;
  horario_viernes: string;
  horario_sabado: string;
  horario_domingo: string;

  constructor(data: {
    nombre_sede: string;
    telefono_sede: string;
    direccion_sede: string;
    horario_lunes_jueves: string;
    horario_viernes: string;
    horario_sabado: string;
    horario_domingo: string;
  }) {
    this.nombre_sede = data.nombre_sede;
    this.telefono_sede = data.telefono_sede;
    this.direccion_sede = data.direccion_sede;
    this.horario_lunes_jueves = data.horario_lunes_jueves;
    this.horario_viernes = data.horario_viernes;
    this.horario_sabado = data.horario_sabado;
    this.horario_domingo = data.horario_domingo;
  }

  validate(): string[] {
    const errors: string[] = [];

    if (!this.nombre_sede || this.nombre_sede.trim() === '') {
      errors.push('El nombre de la sede es requerido');
    }
    if (!this.telefono_sede || this.telefono_sede.trim() === '') {
      errors.push('El teléfono es requerido');
    }
    if (!this.direccion_sede || this.direccion_sede.trim() === '') {
      errors.push('La dirección es requerida');
    }
    if (!this.horario_lunes_jueves || this.horario_lunes_jueves.trim() === '') {
      errors.push('El horario lunes-jueves es requerido');
    }
    if (!this.horario_viernes || this.horario_viernes.trim() === '') {
      errors.push('El horario viernes es requerido');
    }
    if (!this.horario_sabado || this.horario_sabado.trim() === '') {
      errors.push('El horario sábado es requerido');
    }
    if (!this.horario_domingo || this.horario_domingo.trim() === '') {
      errors.push('El horario domingo es requerido');
    }

    return errors;
  }
}
