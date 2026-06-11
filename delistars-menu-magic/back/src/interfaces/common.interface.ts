/**
 * Interfaz base para respuestas de la API
 */
export interface IApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  timestamp: Date;
}

/**
 * Interfaz base para entidades
 */
export interface IEntity {
  _id?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * Interfaz para paginación
 */
export interface IPaginationQuery {
  page: number;
  limit: number;
  sort?: string;
}

/**
 * Interfaz para respuesta paginada
 */
export interface IPaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
