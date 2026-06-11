/**
 * Auth Service
 * Contiene la lógica de negocio de autenticación
 */
export class AuthService {
  async login(email: string, password: string): Promise<any> {}

  async register(email: string, password: string, name: string): Promise<any> {}

  async validateToken(token: string): Promise<any> {}

  async refreshToken(refreshToken: string): Promise<any> {}
}
