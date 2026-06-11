/**
 * Auth Repository
 * Abstrae el acceso a datos de usuarios
 */
export class AuthRepository {
  async findByEmail(email: string): Promise<any> {}

  async create(userData: any): Promise<any> {}

  async findById(id: string): Promise<any> {}

  async update(id: string, userData: any): Promise<any> {}
}
