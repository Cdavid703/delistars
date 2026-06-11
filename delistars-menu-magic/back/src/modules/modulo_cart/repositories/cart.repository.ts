/**
 * Cart Repository
 */
export class CartRepository {
  async findByUserId(userId: string): Promise<any> {}

  async addItem(userId: string, item: any): Promise<any> {}

  async removeItem(userId: string, itemId: string): Promise<boolean> {
    return false;
  }

  async update(userId: string, cartData: any): Promise<any> {}

  async clear(userId: string): Promise<boolean> {
    return false;
  }
}
