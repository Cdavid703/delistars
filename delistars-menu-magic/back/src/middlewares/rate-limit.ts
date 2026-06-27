import rateLimit from 'express-rate-limit';

// Limita intentos de login para frenar fuerza bruta: 10 intentos por IP cada 15 min.
export const loginRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Demasiados intentos de inicio de sesión. Intenta de nuevo en unos minutos.',
  },
});
