/**
 * Clase base para errores de aplicación
 */
export class AppError extends Error {
  constructor(
    public message: string,
    public status: number = 500,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

/**
 * Error de validación
 */
export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, 400);
    this.name = 'ValidationError';
  }
}

/**
 * Error de no encontrado
 */
export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(`${resource} not found`, 404);
    this.name = 'NotFoundError';
  }
}

/**
 * Error de no autorizado
 */
export class UnauthorizedError extends AppError {
  constructor(message: string = 'Unauthorized') {
    super(message, 401);
    this.name = 'UnauthorizedError';
  }
}

/**
 * Error de conflicto
 */
export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 409);
    this.name = 'ConflictError';
  }
}
